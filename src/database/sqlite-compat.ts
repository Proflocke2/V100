import { Database as WasmDatabase } from 'node-sqlite3-wasm';
import { existsSync, rmSync } from 'fs';

class CompatStatement {
  private finalized = false;

  constructor(private stmt: any) {}

  // CRITICAL FIX: node-sqlite3-wasm's raw Statement handles are native WASM
  // objects that are NOT garbage-collected by V8 — they must be explicitly
  // .finalize()d or they leak forever. This class previously never called
  // it, so every single db.prepare(...).get/all/run() call in the entire
  // codebase (the standard access pattern used everywhere, hundreds of call
  // sites) leaked one statement handle. Over the bot's uptime this grows
  // unbounded and was very likely the single largest source of RAM growth.
  //
  // Every call site in this codebase does prepare→execute→discard in one
  // chain (verified: no code stores a CompatStatement and calls it more
  // than once), so it's safe to finalize right after the single run/get/all
  // call finishes — including on error, via try/finally.
  private finalize(): void {
    if (this.finalized) return;
    this.finalized = true;
    try { this.stmt.finalize(); } catch { /* connection already closed — nothing to clean up */ }
  }

  run(...args: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] :
                   args.length === 0 ? [] : args;
    try {
      return this.stmt.run(params.length > 0 ? params : undefined);
    } finally {
      this.finalize();
    }
  }

  get(...args: any[]): any {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] :
                   args.length === 0 ? [] : args;
    try {
      return this.stmt.get(params.length > 0 ? params : undefined) ?? null;
    } finally {
      this.finalize();
    }
  }

  all(...args: any[]): any[] {
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] :
                   args.length === 0 ? [] : args;
    try {
      return this.stmt.all(params.length > 0 ? params : undefined);
    } finally {
      this.finalize();
    }
  }
}

export class CompatDatabase {
  private db: any;

  constructor(dbPath: string) {
    // Remove stale lock files
    const lockPath = `${dbPath}.lock`;
    if (existsSync(lockPath)) {
      try { rmSync(lockPath, { recursive: true, force: true }); } catch {}
    }
    this.db = new WasmDatabase(dbPath);
  }

  prepare(sql: string): CompatStatement {
    return new CompatStatement(this.db.prepare(sql));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(_pragma: string): any {
    // node-sqlite3-wasm doesn't support PRAGMA via exec in all cases
    try { this.db.exec(`PRAGMA ${_pragma}`); } catch { /* ignore */ }
  }

  transaction(fn: (...args: any[]) => any): (...args: any[]) => any {
    return (...args: any[]) => {
      this.exec('BEGIN');
      try {
        const result = fn(...args);
        this.exec('COMMIT');
        return result;
      } catch (e) {
        try { this.exec('ROLLBACK'); } catch {}
        throw e;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}
