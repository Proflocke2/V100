/**
 * SLOTS ENGINE
 * ──────────────────────────────────────────────────────────────────────────
 * Reine Spiellogik – kein discord.js, keine DB-Aufrufe.
 * The 3×3 grid is filled with weighted RNG.
 * Wins are summed across all 5 paylines.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { EconomyConfig, SlotSymbol } from '../config/EconomyConfig';

// ============================================================================
// TYPES
// ============================================================================

export interface SlotLine {
  indices: number[];           // [a, b, c] – Positionen im Grid
  symbols: SlotSymbol[];       // symbols at these positions
  isWin: boolean;
  payout: number;              // winnings in points (already multiplied by the stake)
  multiplier: number;          // symbol multiplier (0 if no win)
}

export interface SlotsResult {
  grid: SlotSymbol[];          // 9 Felder (row-major: links→rechts, oben→unten)
  lines: SlotLine[];           // Auswertung jeder Gewinnlinie
  totalPayout: number;         // Netto-Gewinn (positiv = Gewinn, negativ = Verlust)
  netResult: number;           // totalPayout − Einsatz
  isJackpot: boolean;
  winningSymbol: string | null; // First winning symbol name (for the embed)
}

// ============================================================================
// SLOTS ENGINE CLASS
// ============================================================================

export class SlotsEngine {

  // ── RNG: Gewichtetes Zufallssymbol ziehen ─────────────────────────────────

  private static pickSymbol(): SlotSymbol {
    const symbols = EconomyConfig.SLOT_SYMBOLS;
    const total   = symbols.reduce((s, sym) => s + sym.weight, 0);
    let   rand    = Math.random() * total;

    for (const sym of symbols) {
      rand -= sym.weight;
      if (rand <= 0) return sym;
    }
    return symbols[symbols.length - 1]; // Fallback
  }

  // ── Grid generieren ────────────────────────────────────────────────────────

  private static generateGrid(): SlotSymbol[] {
    return Array.from({ length: 9 }, () => this.pickSymbol());
  }

  // ── Einzelne Gewinnlinie auswerten ─────────────────────────────────────────

  private static evaluateLine(grid: SlotSymbol[], indices: number[], bet: number): SlotLine {
    const symbols    = indices.map(i => grid[i]);
    const [a, b, c]  = symbols;
    const isWin      = a.name === b.name && b.name === c.name;
    const multiplier = isWin ? a.payout : 0;
    const payout     = isWin ? Math.floor(bet * multiplier) : 0;

    return { indices, symbols, isWin, payout, multiplier };
  }

  // ── Main method: execute spin ─────────────────────────────────────────

  static spin(bet: number): SlotsResult {
    const grid      = this.generateGrid();
    const lines     = EconomyConfig.SLOT_LINES.map(indices =>
      this.evaluateLine(grid, indices, bet)
    );

    // Gewinne aller Linien addieren
    const totalPayout = lines.reduce((s, l) => s + l.payout, 0);

    // Jackpot = Seven-Linie trifft
    const isJackpot = lines.some(
      l => l.isWin && l.symbols[0].name === 'Seven'
    );

    // Netto-Ergebnis (Gewinn minus Einsatz)
    const netResult = totalPayout - bet;

    // First winning symbol name for the embed
    const winningLine   = lines.find(l => l.isWin);
    const winningSymbol = winningLine ? winningLine.symbols[0].name : null;

    return { grid, lines, totalPayout, netResult, isJackpot, winningSymbol };
  }

  // ── Grid als lesbaren String rendern ──────────────────────────────────────

  static renderGrid(grid: SlotSymbol[]): string {
    const rows: string[] = [];
    for (let row = 0; row < 3; row++) {
      const cells = grid.slice(row * 3, row * 3 + 3).map(s => s.emoji);
      rows.push(cells.join(' │ '));
    }
    return rows.join('\n');
  }

  /** Gewinn-Zusammenfassung als mehrzeiliger String */
  static summarizeLines(lines: SlotLine[]): string {
    const wins = lines.filter(l => l.isWin);
    if (wins.length === 0) return '❌ Keine Gewinnlinie';

    return wins.map(l => {
      const name = l.symbols[0].name;
      return `✅ ${name} ×${l.multiplier} → +${l.payout.toLocaleString('de-DE')}`;
    }).join('\n');
  }
}
