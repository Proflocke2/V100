/**
 * GAME LOGIC HELPERS
 * shared game logic for tictactoe, connectfour, rps
 */

// ============================================================================
// TIC TAC TOE LOGIC
// ============================================================================

export type TTTCell = 'X' | 'O' | null;

export const TTTLogic = {
  makeGrid(): TTTCell[] {
    return Array(9).fill(null);
  },

  /**
   * Check if there's a winner or draw
   */
  checkWinner(grid: TTTCell[]): TTTCell | 'draw' | null {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
      [0, 4, 8], [2, 4, 6],            // diagonals
    ];
    for (const [a, b, c] of lines) {
      if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) return grid[a];
    }
    if (grid.every(c => c)) return 'draw';
    return null;
  },

  /**
   * Minimax algorithm for AI - O is maximizing player
   */
  minimax(grid: TTTCell[], isMax: boolean, depth = 0): number {
    const winner = this.checkWinner(grid);
    if (winner === 'O') return 10 - depth;
    if (winner === 'X') return depth - 10;
    if (winner === 'draw') return 0;

    if (isMax) {
      let best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (!grid[i]) {
          grid[i] = 'O';
          best = Math.max(best, this.minimax(grid, false, depth + 1));
          grid[i] = null;
        }
      }
      return best;
    } else {
      let best = Infinity;
      for (let i = 0; i < 9; i++) {
        if (!grid[i]) {
          grid[i] = 'X';
          best = Math.min(best, this.minimax(grid, true, depth + 1));
          grid[i] = null;
        }
      }
      return best;
    }
  },

  /**
   * Get the best move for AI
   */
  bestMove(grid: TTTCell[]): number {
    let best = -Infinity;
    let move = -1;
    for (let i = 0; i < 9; i++) {
      if (!grid[i]) {
        grid[i] = 'O';
        const val = this.minimax(grid, false);
        grid[i] = null;
        if (val > best) {
          best = val;
          move = i;
        }
      }
    }
    return move;
  },
};

// ============================================================================
// CONNECT FOUR LOGIC
// ============================================================================

export const C4_ROWS = 6;
export const C4_COLS = 7;
export const C4_EMPTY = '⬛';
export const C4_P1 = '🔴';
export const C4_P2 = '🟡';

export type C4Board = string[][];

export const C4Logic = {
  makeBoard(): C4Board {
    return Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(C4_EMPTY));
  },

  /**
   * Drop a piece in a column - returns row it landed at, or -1 if full
   */
  drop(board: C4Board, col: number, piece: string): number {
    for (let r = C4_ROWS - 1; r >= 0; r--) {
      if (board[r][col] === C4_EMPTY) {
        board[r][col] = piece;
        return r;
      }
    }
    return -1;
  },

  /**
   * Check if a piece has won (4 in a row)
   */
  checkWin(board: C4Board, piece: string): boolean {
    // horizontal
    for (let r = 0; r < C4_ROWS; r++) {
      for (let c = 0; c <= C4_COLS - 4; c++) {
        if ([0, 1, 2, 3].every(i => board[r][c + i] === piece)) return true;
      }
    }
    // vertical
    for (let c = 0; c < C4_COLS; c++) {
      for (let r = 0; r <= C4_ROWS - 4; r++) {
        if ([0, 1, 2, 3].every(i => board[r + i][c] === piece)) return true;
      }
    }
    // diagonal /
    for (let r = 3; r < C4_ROWS; r++) {
      for (let c = 0; c <= C4_COLS - 4; c++) {
        if ([0, 1, 2, 3].every(i => board[r - i][c + i] === piece)) return true;
      }
    }
    // diagonal \
    for (let r = 0; r <= C4_ROWS - 4; r++) {
      for (let c = 0; c <= C4_COLS - 4; c++) {
        if ([0, 1, 2, 3].every(i => board[r + i][c + i] === piece)) return true;
      }
    }
    return false;
  },

  /**
   * Check if board is full (draw)
   */
  isFull(board: C4Board): boolean {
    return board[0].every(c => c !== C4_EMPTY);
  },

  /**
   * Render the board as a string
   */
  renderBoard(board: C4Board): string {
    const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];
    return board.map(r => r.join('')).join('\n') + '\n' + nums.join('');
  },

  /**
   * Simple AI for Connect Four
   * 1. If can win, do it
   * 2. If opponent can win, block it
   * 3. Otherwise random valid column (with center bias)
   */
  aiMove(board: C4Board, aiPiece: string, opponentPiece: string): number {
    // try to win
    for (let c = 0; c < C4_COLS; c++) {
      const testBoard = board.map(row => [...row]);
      const r = this.drop(testBoard, c, aiPiece);
      if (r !== -1 && this.checkWin(testBoard, aiPiece)) return c;
    }
    // try to block
    for (let c = 0; c < C4_COLS; c++) {
      const testBoard = board.map(row => [...row]);
      const r = this.drop(testBoard, c, opponentPiece);
      if (r !== -1 && this.checkWin(testBoard, opponentPiece)) return c;
    }
    // prefer center columns for better positions
    const order = [3, 2, 4, 1, 5, 0, 6];
    for (const c of order) {
      if (board[0][c] === C4_EMPTY) return c;
    }
    return -1;
  },
};

// ============================================================================
// RPS LOGIC
// ============================================================================

export type RPSChoice = 'rock' | 'paper' | 'scissors';
export const RPS_CHOICES: RPSChoice[] = ['rock', 'paper', 'scissors'];
export const RPS_EMOJI: Record<RPSChoice, string> = {
  rock: '🪨',
  paper: '📄',
  scissors: '✂️',
};

export const RPSLogic = {
  /**
   * Get result of a single round
   */
  getResult(p1: RPSChoice, p2: RPSChoice): 'p1' | 'p2' | 'draw' {
    if (p1 === p2) return 'draw';
    if (
      (p1 === 'rock' && p2 === 'scissors') ||
      (p1 === 'paper' && p2 === 'rock') ||
      (p1 === 'scissors' && p2 === 'paper')
    ) {
      return 'p1';
    }
    return 'p2';
  },

  /**
   * Random AI choice
   */
  aiChoice(): RPSChoice {
    return RPS_CHOICES[Math.floor(Math.random() * 3)];
  },
};
