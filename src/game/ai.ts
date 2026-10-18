/**
 * DOZ ONLINE — Grandmaster Unbeatable AI Engine (Admin Exclusive).
 *
 * Uses full-depth Minimax with subtree trap/fork pressure analysis:
 *  1. Game-theoretic optimal score (Win = +1000 - depth*10, Draw = 0, Loss = -1000 + depth*10)
 *     guarantees the AI is 100% mathematically unbeatable from any legal board state.
 *  2. Among all game-theoretically optimal moves, tie-breaks by:
 *     • Immediate fork creation (2+ simultaneous winning threats)
 *     • Opponent blunder pressure (number of winning branches if opponent errs)
 *     • Strategic positional control (center / corners)
 *  3. Includes a natural human-like thinking delay generator so moves never
 *     look instantaneous or robotic.
 */

import {
  applyMove,
  getAvailableMoves,
  getGameOutcome,
  OTHER_SYMBOL,
  WINNING_LINES,
  type Board,
  type PlayerSymbol,
} from "./engine";

export type AiDelayPreset = "fast" | "natural" | "thoughtful";

export interface MoveEvaluation {
  cell: number;
  /** Game-theoretic minimax score (+900..+1000 win, 0 draw, -900..-1000 loss) */
  minimaxScore: number;
  /** Subtree pressure / trap potential against imperfect human play */
  pressureScore: number;
  /** Combined ranking score used to pick the strongest move */
  totalScore: number;
  /** Classification for UI display in Admin HUD */
  verdict: "winning" | "fork_trap" | "optimal_draw" | "losing";
  /** Persian explanation of why this move is strong */
  reasonFa: string;
}

export interface AdminAiSettings {
  enabled: boolean;
  showHints: boolean;
  delayPreset: AiDelayPreset;
  autoRematch: boolean;
}

const AI_SETTINGS_KEY = "doz:admin-ai-settings";

const DEFAULT_SETTINGS: AdminAiSettings = {
  enabled: true,
  showHints: true,
  delayPreset: "natural",
  autoRematch: false,
};

export const adminAiStorage = {
  load(): AdminAiSettings {
    try {
      const raw = localStorage.getItem(AI_SETTINGS_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw) as Partial<AdminAiSettings>;
      return {
        enabled: parsed.enabled ?? DEFAULT_SETTINGS.enabled,
        showHints: parsed.showHints ?? DEFAULT_SETTINGS.showHints,
        delayPreset: parsed.delayPreset ?? DEFAULT_SETTINGS.delayPreset,
        autoRematch: parsed.autoRematch ?? DEFAULT_SETTINGS.autoRematch,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  save(settings: AdminAiSettings): void {
    try {
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore storage errors */
    }
  },
};

const POSITIONAL_WEIGHTS = [3, 1, 3, 1, 4, 1, 3, 1, 3];

/** Count how many lines have 2 of `symbol` and 1 empty cell (immediate winning threats). */
export function countImmediateThreats(board: Board, symbol: PlayerSymbol): number {
  let threats = 0;
  for (const [a, b, c] of WINNING_LINES) {
    const line = [board[a], board[b], board[c]];
    const symCount = line.filter((v) => v === symbol).length;
    const emptyCount = line.filter((v) => v === null).length;
    if (symCount === 2 && emptyCount === 1) {
      threats++;
    }
  }
  return threats;
}

interface NodeResult {
  minimax: number;
  /** Weighted sum of winning continuations when opponent plays randomly */
  expectedPressure: number;
}

function boardKey(board: Board, turn: PlayerSymbol): string {
  return board.map((c) => c ?? ".").join("") + ":" + turn;
}

/**
 * Full-depth Minimax + expected value against imperfect play.
 */
function analyzeNode(
  board: Board,
  turn: PlayerSymbol,
  aiSymbol: PlayerSymbol,
  depth: number,
  memo: Map<string, NodeResult>,
): NodeResult {
  const outcome = getGameOutcome(board);
  if (outcome.kind === "win") {
    const score = outcome.winner === aiSymbol ? 1000 - depth * 10 : -1000 + depth * 10;
    return { minimax: score, expectedPressure: score };
  }
  if (outcome.kind === "draw") {
    return { minimax: 0, expectedPressure: 0 };
  }

  const key = boardKey(board, turn);
  const cached = memo.get(key);
  if (cached) return cached;

  const moves = getAvailableMoves(board);
  const isAiTurn = turn === aiSymbol;
  const nextTurn = OTHER_SYMBOL[turn];

  let bestMinimax = isAiTurn ? -Infinity : Infinity;
  let sumPressure = 0;
  let bestAiPressure = -Infinity;

  for (const cell of moves) {
    const nextBoard = applyMove(board, cell, turn);
    const child = analyzeNode(nextBoard, nextTurn, aiSymbol, depth + 1, memo);

    if (isAiTurn) {
      if (
        child.minimax > bestMinimax ||
        (child.minimax === bestMinimax && child.expectedPressure > bestAiPressure)
      ) {
        bestMinimax = child.minimax;
        bestAiPressure = child.expectedPressure;
      }
    } else {
      if (child.minimax < bestMinimax) {
        bestMinimax = child.minimax;
      }
      sumPressure += child.expectedPressure;
    }
  }

  const result: NodeResult = {
    minimax: bestMinimax,
    expectedPressure: isAiTurn
      ? bestAiPressure
      : sumPressure / Math.max(1, moves.length),
  };

  memo.set(key, result);
  return result;
}

/**
 * Evaluate every available legal move on `board` for `aiSymbol`, sorted best-first.
 */
export function evaluateAllMoves(board: Board, aiSymbol: PlayerSymbol): MoveEvaluation[] {
  const outcome = getGameOutcome(board);
  if (outcome.kind !== "in_progress") return [];

  const available = getAvailableMoves(board);
  const opponent = OTHER_SYMBOL[aiSymbol];
  const memo = new Map<string, NodeResult>();

  const evaluations: MoveEvaluation[] = available.map((cell) => {
    const nextBoard = applyMove(board, cell, aiSymbol);
    const immediateOutcome = getGameOutcome(nextBoard);

    if (immediateOutcome.kind === "win") {
      return {
        cell,
        minimaxScore: 1000,
        pressureScore: 1000,
        totalScore: 1_000_000 + POSITIONAL_WEIGHTS[cell],
        verdict: "winning",
        reasonFa: "حرکت برنده قطعی در همین نوبت",
      };
    }

    const node = analyzeNode(nextBoard, opponent, aiSymbol, 1, memo);
    const myThreats = countImmediateThreats(nextBoard, aiSymbol);
    const blocksOpponentThreat = countImmediateThreats(board, opponent) > countImmediateThreats(nextBoard, opponent);
    const posBonus = POSITIONAL_WEIGHTS[cell];

    const pressure = Math.round(node.expectedPressure + myThreats * 45 + posBonus * 4);
    const totalScore = node.minimax * 1000 + pressure;

    let verdict: MoveEvaluation["verdict"] = "optimal_draw";
    let reasonFa = "بهترین حرکت استراتژیک (غیرقابل نفوذ)";

    if (node.minimax > 0) {
      verdict = "winning";
      reasonFa = myThreats >= 2 ? "تله دوگانه (برد قطعی)" : "مسیر برد قطعی";
    } else if (node.minimax < 0) {
      verdict = "losing";
      reasonFa = "حرکت ضعیف";
    } else if (myThreats >= 2) {
      verdict = "fork_trap";
      reasonFa = "ایجاد تله دوگانه روی حریف";
    } else if (blocksOpponentThreat) {
      verdict = "optimal_draw";
      reasonFa = "دفاع کامل و خنثی‌سازی تهدید حریف";
    } else if (myThreats === 1) {
      verdict = "fork_trap";
      reasonFa = "ایجاد تهدید مستقیم + فشار حداکثری";
    } else if (cell === 4) {
      reasonFa = "کنترل مرکز صفحه";
    } else if (POSITIONAL_WEIGHTS[cell] === 3) {
      reasonFa = "تصرف گوشه استراتژیک برای تله";
    }

    return {
      cell,
      minimaxScore: node.minimax,
      pressureScore: pressure,
      totalScore,
      verdict,
      reasonFa,
    };
  });

  evaluations.sort((a, b) => b.totalScore - a.totalScore);
  return evaluations;
}

/**
 * Pick the single strongest move for `aiSymbol`.
 * Returns the cell index (0..8) or null if the game is already over.
 */
export function chooseBestMove(board: Board, aiSymbol: PlayerSymbol): MoveEvaluation | null {
  const ranked = evaluateAllMoves(board, aiSymbol);
  return ranked[0] ?? null;
}

/**
 * Compute a realistic, human-like delay in milliseconds before playing a move.
 * Avoids instant robotic clicks while keeping gameplay smooth.
 */
export function computeHumanDelayMs(
  board: Board,
  preset: AiDelayPreset = "natural",
): number {
  const moveNumber = board.filter((c) => c !== null).length;

  const ranges: Record<AiDelayPreset, [number, number]> = {
    fast: [1050, 1750],
    natural: [1800, 3100],
    thoughtful: [2500, 4100],
  };

  const [minMs, maxMs] = ranges[preset];

  // First move or last forced cell is slightly faster, mid-game tactical turns take longer
  const complexityFactor =
    moveNumber === 0 ? 0.78 : moveNumber === 8 ? 0.65 : moveNumber >= 2 && moveNumber <= 5 ? 1.08 : 0.92;

  const jitter = Math.random();
  const base = minMs + jitter * (maxMs - minMs);
  return Math.round(base * complexityFactor);
}
