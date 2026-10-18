import { describe, expect, it } from "vitest";
import { chooseBestMove, computeHumanDelayMs, evaluateAllMoves } from "./ai";
import {
  applyMove,
  createInitialBoard,
  getAvailableMoves,
  getGameOutcome,
  OTHER_SYMBOL,
  type Board,
  type PlayerSymbol,
} from "./engine";

describe("Grandmaster Unbeatable AI (src/game/ai.ts)", () => {
  it("takes an immediate winning move when available", () => {
    // X has 0 and 1, cell 2 wins immediately
    const board: Board = ["X", "X", null, "O", "O", null, null, null, null];
    const best = chooseBestMove(board, "X");
    expect(best?.cell).toBe(2);
    expect(best?.verdict).toBe("winning");
  });

  it("blocks an opponent's immediate winning threat", () => {
    // O has 0 and 4 (diagonal threat at 8)
    const board: Board = ["O", null, "X", null, "O", null, "X", null, null];
    const best = chooseBestMove(board, "X");
    expect(best?.cell).toBe(8);
  });

  it("defends the classic opposite-corner trap as O (plays center then edge)", () => {
    // Move 1: X plays corner 0 -> O must play center 4
    const afterX1: Board = ["X", null, null, null, null, null, null, null, null];
    const oMove1 = chooseBestMove(afterX1, "O");
    expect(oMove1?.cell).toBe(4);

    // Move 3: X plays opposite corner 8 -> O must play an edge (1, 3, 5, or 7), NOT a corner!
    const afterX2: Board = ["X", null, null, null, "O", null, null, null, "X"];
    const oMove2 = chooseBestMove(afterX2, "O");
    expect([1, 3, 5, 7]).toContain(oMove2?.cell);
  });

  it("is 100% mathematically unbeatable as X against every possible O response", () => {
    function verifyNeverLoses(board: Board, turn: PlayerSymbol, aiSymbol: PlayerSymbol): void {
      const outcome = getGameOutcome(board);
      if (outcome.kind === "win") {
        expect(outcome.winner).toBe(aiSymbol);
        return;
      }
      if (outcome.kind === "draw") return;

      if (turn === aiSymbol) {
        const best = chooseBestMove(board, aiSymbol);
        expect(best).not.toBeNull();
        verifyNeverLoses(applyMove(board, best!.cell, aiSymbol), OTHER_SYMBOL[turn], aiSymbol);
      } else {
        for (const move of getAvailableMoves(board)) {
          verifyNeverLoses(applyMove(board, move, turn), OTHER_SYMBOL[turn], aiSymbol);
        }
      }
    }

    verifyNeverLoses(createInitialBoard(), "X", "X");
  });

  it("is 100% mathematically unbeatable as O against every possible X opening and continuation", () => {
    function verifyNeverLoses(board: Board, turn: PlayerSymbol, aiSymbol: PlayerSymbol): void {
      const outcome = getGameOutcome(board);
      if (outcome.kind === "win") {
        expect(outcome.winner).toBe(aiSymbol);
        return;
      }
      if (outcome.kind === "draw") return;

      if (turn === aiSymbol) {
        const best = chooseBestMove(board, aiSymbol);
        expect(best).not.toBeNull();
        verifyNeverLoses(applyMove(board, best!.cell, aiSymbol), OTHER_SYMBOL[turn], aiSymbol);
      } else {
        for (const move of getAvailableMoves(board)) {
          verifyNeverLoses(applyMove(board, move, turn), OTHER_SYMBOL[turn], aiSymbol);
        }
      }
    }

    verifyNeverLoses(createInitialBoard(), "X", "O");
  });

  it("ranks all legal moves and computes human-like delays within natural bounds", () => {
    const evals = evaluateAllMoves(createInitialBoard(), "X");
    expect(evals).toHaveLength(9);
    const delay = computeHumanDelayMs(createInitialBoard(), "natural");
    expect(delay).toBeGreaterThanOrEqual(1200);
    expect(delay).toBeLessThanOrEqual(3600);
  });
});
