/**
 * DOZ ONLINE — pure Tic-Tac-Toe game engine.
 *
 * Framework-free, side-effect-free module used by both the UI and the tests.
 * NOTE: the PostgreSQL backend re-implements the same rules (server-side is the
 * single source of truth for the final result); this module is the client-side
 * mirror used for optimistic UI and validation before sending a move.
 */

export type PlayerSymbol = "X" | "O";
export type CellValue = PlayerSymbol | null;
export type Board = CellValue[]; // always length 9

export type GameOutcome =
  | { kind: "in_progress" }
  | { kind: "win"; winner: PlayerSymbol; line: [number, number, number] }
  | { kind: "draw" };

export type MoveValidationError =
  | "game_ended"
  | "cell_out_of_range"
  | "cell_occupied"
  | "not_your_turn"
  | "invalid_symbol";

export const WINNING_LINES: readonly [number, number, number][] = [
  [0, 1, 2], // top row
  [3, 4, 5], // middle row
  [6, 7, 8], // bottom row
  [0, 3, 6], // left column
  [1, 4, 7], // middle column
  [2, 5, 8], // right column
  [0, 4, 8], // main diagonal
  [2, 4, 6], // anti diagonal
];

export const OTHER_SYMBOL: Record<PlayerSymbol, PlayerSymbol> = {
  X: "O",
  O: "X",
};

/** Create a fresh empty board. */
export function createInitialBoard(): Board {
  return Array<CellValue>(9).fill(null);
}

/** Determine the winner (if any) and the winning line. */
export function getWinner(board: Board): {
  winner: PlayerSymbol | null;
  line: [number, number, number] | null;
} {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) {
      return { winner: v, line };
    }
  }
  return { winner: null, line: null };
}

/** All still-empty cell indexes. */
export function getAvailableMoves(board: Board): number[] {
  const moves: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) moves.push(i);
  }
  return moves;
}

/** True when every cell is filled. */
export function isBoardFull(board: Board): boolean {
  return board.every((cell) => cell !== null);
}

/** Full game outcome for a board. */
export function getGameOutcome(board: Board): GameOutcome {
  const { winner, line } = getWinner(board);
  if (winner && line) return { kind: "win", winner, line };
  if (isBoardFull(board)) return { kind: "draw" };
  return { kind: "in_progress" };
}

/**
 * Validate a move against the current game state.
 * Pure — performs no mutation. Call `applyMove` afterwards.
 */
export function validateMove(
  board: Board,
  cellIndex: number,
  symbol: PlayerSymbol,
  currentTurn: PlayerSymbol,
  gameEnded: boolean,
): { valid: true } | { valid: false; reason: MoveValidationError } {
  if (gameEnded) return { valid: false, reason: "game_ended" };
  if (symbol !== "X" && symbol !== "O") {
    return { valid: false, reason: "invalid_symbol" };
  }
  if (symbol !== currentTurn) return { valid: false, reason: "not_your_turn" };
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) {
    return { valid: false, reason: "cell_out_of_range" };
  }
  if (board[cellIndex] !== null) return { valid: false, reason: "cell_occupied" };
  return { valid: true };
}

/**
 * Apply a move and return a NEW board.
 * Throws when the move is invalid — validate first (or treat throw as a bug).
 */
export function applyMove(
  board: Board,
  cellIndex: number,
  symbol: PlayerSymbol,
): Board {
  const check = validateMove(board, cellIndex, symbol, symbol, false);
  if (!check.valid || (cellIndex < 0 || cellIndex > 8)) {
    throw new Error(`invalid_move:${check.valid ? "cell_out_of_range" : check.reason}`);
  }
  const next = board.slice();
  next[cellIndex] = symbol;
  return next;
}

/** Number of marks a player has on the board (sanity helper). */
export function countMarks(board: Board, symbol: PlayerSymbol): number {
  return board.reduce((n, cell) => (cell === symbol ? n + 1 : n), 0);
}

/* ---------- wire format helpers (board as 9-char string, e.g. "XO.......") ---------- */

export function boardToString(board: Board): string {
  return board.map((c) => (c === null ? "." : c)).join("");
}

export function boardFromString(s: string): Board {
  if (typeof s !== "string" || s.length !== 9 || /[^XO.]/.test(s)) {
    throw new Error("invalid_board_string");
  }
  return s.split("").map((c) => (c === "." ? null : (c as PlayerSymbol)));
}

/** Whose turn it is given the number of moves played (X always opens a game). */
export function turnForMoveNumber(moveCount: number): PlayerSymbol {
  return moveCount % 2 === 0 ? "X" : "O";
}
