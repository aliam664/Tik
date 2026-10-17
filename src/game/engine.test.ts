import { describe, expect, it } from "vitest";
import {
  applyMove,
  boardFromString,
  boardToString,
  countMarks,
  createInitialBoard,
  getAvailableMoves,
  getGameOutcome,
  getWinner,
  isBoardFull,
  OTHER_SYMBOL,
  turnForMoveNumber,
  validateMove,
} from "./engine";

const X = "X" as const;
const O = "O" as const;

function boardFrom(str: string) {
  return boardFromString(str);
}

describe("createInitialBoard", () => {
  it("creates an empty 9-cell board", () => {
    const b = createInitialBoard();
    expect(b).toHaveLength(9);
    expect(b.every((c) => c === null)).toBe(true);
    expect(getGameOutcome(b).kind).toBe("in_progress");
  });
});

describe("getWinner / getGameOutcome — wins", () => {
  const cases: Array<[string, "X" | "O", [number, number, number]]> = [
    ["XXX.O....", "X", [0, 1, 2]], // top row
    ["...XXX.O.", "X", [3, 4, 5]], // middle row
    ["O.....XXX", "X", [6, 7, 8]], // bottom row
    ["X.OX.OX..", "X", [0, 3, 6]], // left column
    ["OXO.XO.X.", "X", [1, 4, 7]], // middle column
    ["O.XO.X..X", "X", [2, 5, 8]], // right column
    ["XO.OX...X", "X", [0, 4, 8]], // main diagonal
    ["OOX.X.X..", "X", [2, 4, 6]], // anti diagonal
    ["OOOXX.X..", "O", [0, 1, 2]], // O wins
  ];

  it.each(cases)("detects %s win for %s on line %j", (str, symbol, line) => {
    const b = boardFrom(str);
    const outcome = getGameOutcome(b);
    expect(outcome).toEqual({ kind: "win", winner: symbol, line });
    expect(getWinner(b).winner).toBe(symbol);
  });

  it("detects the FIRST winning line when several are complete", () => {
    // X has both top row [0,1,2] and left column [0,3,6]
    const b = boardFrom("XXXOX.XO.");
    expect(getWinner(b)).toEqual({ winner: "X", line: [0, 1, 2] });
  });
});

describe("getGameOutcome — draw & progress", () => {
  it("detects a draw on a full board with no winner", () => {
    const b = boardFrom("XOXOXXOXO");
    expect(getGameOutcome(b)).toEqual({ kind: "draw" });
    expect(getWinner(b).winner).toBeNull();
  });

  it("detects a draw on the classic drawn position", () => {
    const b = boardFrom("XOXXOOOXX");
    expect(getGameOutcome(b).kind).toBe("draw");
  });

  it("is in_progress on a partially filled board", () => {
    expect(getGameOutcome(boardFrom("XO.......")).kind).toBe("in_progress");
    expect(getGameOutcome(boardFrom(".........")).kind).toBe("in_progress");
  });

  it("a full board WITH a winner is a win, not a draw", () => {
    const b = boardFrom("XXXOOOXXO");
    expect(getGameOutcome(b)).toMatchObject({ kind: "win", winner: "X" });
  });
});

describe("getAvailableMoves / isBoardFull", () => {
  it("returns all 9 cells for an empty board", () => {
    expect(getAvailableMoves(createInitialBoard())).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("returns only empty cells", () => {
    expect(getAvailableMoves(boardFrom("X.O.X...."))).toEqual([1, 3, 5, 6, 7, 8]);
  });

  it("returns [] and isBoardFull=true on a full board", () => {
    const b = boardFrom("XOXOXXOXO");
    expect(getAvailableMoves(b)).toEqual([]);
    expect(isBoardFull(b)).toBe(true);
  });

  it("isBoardFull=false mid-game", () => {
    expect(isBoardFull(boardFrom("X........"))).toBe(false);
  });
});

describe("validateMove", () => {
  const empty = createInitialBoard();
  const mid = boardFrom("X.O......");

  it("accepts a legal first move by X", () => {
    expect(validateMove(empty, 4, X, X, false)).toEqual({ valid: true });
  });

  it("rejects a move out of turn", () => {
    expect(validateMove(empty, 0, O, X, false)).toEqual({
      valid: false,
      reason: "not_your_turn",
    });
  });

  it("rejects an occupied cell", () => {
    expect(validateMove(mid, 0, O, O, false)).toEqual({
      valid: false,
      reason: "cell_occupied",
    });
  });

  it("rejects out-of-range cells", () => {
    expect(validateMove(empty, -1, X, X, false)).toEqual({
      valid: false,
      reason: "cell_out_of_range",
    });
    expect(validateMove(empty, 9, X, X, false)).toEqual({
      valid: false,
      reason: "cell_out_of_range",
    });
    expect(validateMove(empty, 1.5, X, X, false)).toEqual({
      valid: false,
      reason: "cell_out_of_range",
    });
  });

  it("rejects any move after the game ended", () => {
    const won = boardFrom("XXX.OO...");
    expect(validateMove(won, 8, O, O, true)).toEqual({
      valid: false,
      reason: "game_ended",
    });
  });

  it("rejects an invalid symbol", () => {
    // @ts-expect-error intentionally invalid input
    expect(validateMove(empty, 0, "Z", "Z", false)).toEqual({
      valid: false,
      reason: "invalid_symbol",
    });
  });
});

describe("applyMove", () => {
  it("returns a new board without mutating the input", () => {
    const b0 = createInitialBoard();
    const b1 = applyMove(b0, 4, X);
    expect(b0[4]).toBeNull();
    expect(b1[4]).toBe(X);
    expect(b1).not.toBe(b0);
  });

  it("supports a full alternating game until X wins", () => {
    let b = createInitialBoard();
    const moves: Array<[number, "X" | "O"]> = [
      [4, X],
      [0, O],
      [2, X],
      [1, O],
      [6, X],
    ];
    for (const [cell, sym] of moves) {
      expect(validateMove(b, cell, sym, turnForMoveNumber(countMarks(b, X) + countMarks(b, O)), false).valid).toBe(true);
      b = applyMove(b, cell, sym);
    }
    expect(getGameOutcome(b)).toEqual({ kind: "win", winner: X, line: [2, 4, 6] });
  });

  it("throws on illegal moves (double-bookkeeping guard)", () => {
    const b = boardFrom("X........");
    expect(() => applyMove(b, 0, O)).toThrow();
    expect(() => applyMove(b, 42, O)).toThrow();
  });
});

describe("wire format", () => {
  it("round-trips board <-> string", () => {
    const s = "XO.XO....";
    expect(boardToString(boardFromString(s))).toBe(s);
    expect(boardFromString(".........")).toEqual(createInitialBoard());
  });

  it("rejects malformed board strings", () => {
    expect(() => boardFromString("XXX")).toThrow();
    expect(() => boardFromString("XX!......")).toThrow();
  });
});

describe("turnForMoveNumber", () => {
  it("alternates starting from X", () => {
    expect(turnForMoveNumber(0)).toBe(X);
    expect(turnForMoveNumber(1)).toBe(O);
    expect(turnForMoveNumber(4)).toBe(X);
  });
});

describe("OTHER_SYMBOL", () => {
  it("maps to the opponent", () => {
    expect(OTHER_SYMBOL.X).toBe(O);
    expect(OTHER_SYMBOL.O).toBe(X);
  });
});
