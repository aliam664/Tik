import { describe, expect, it } from "vitest";
import {
  DEFAULT_ELO,
  expectedScore,
  kFactor,
  tierForRating,
  tierLabel,
  updateRatings,
} from "@/lib/elo";

describe("elo core", () => {
  it("expected score is symmetric with equal ratings (neutral advantage)", () => {
    expect(expectedScore(1200, 1200, 0)).toBeCloseTo(0.5, 6);
  });

  it("first-move advantage shifts the expected score", () => {
    // equal players, X has +40 → X expects more than 0.5
    const ex = expectedScore(1200, 1200, DEFAULT_ELO.xAdvantage);
    expect(ex).toBeGreaterThan(0.5);
    expect(ex).toBeLessThan(0.7);
  });

  it("k-factor follows placement → new → mid → pro", () => {
    expect(kFactor(100, 3)).toBe(DEFAULT_ELO.kPlacement);
    expect(kFactor(5, 0)).toBe(DEFAULT_ELO.kNew);
    expect(kFactor(30, 0)).toBe(DEFAULT_ELO.kMid);
    expect(kFactor(80, 0)).toBe(DEFAULT_ELO.kPro);
  });

  it("winner gains, loser drops; draw is nearly neutral", () => {
    const win = updateRatings(1200, 1200, 1, 30, 30, 0, 0);
    expect(win.x).toBeGreaterThan(1200);
    expect(win.o).toBeLessThan(1200);
    // zero-sum-ish but floor/rounding may shift slightly
    expect(win.dx + win.do_).toBeLessThanOrEqual(1);
    expect(win.dx + win.do_).toBeGreaterThanOrEqual(-1);

    const draw = updateRatings(1200, 1200, 0.5, 30, 30, 0, 0);
    // with X advantage, a draw is slightly below expectation for X
    expect(draw.dx).toBeLessThan(0);
    expect(draw.do_).toBeGreaterThan(0);
  });

  it("rating floor is respected", () => {
    const r = updateRatings(100, 3000, 0, 100, 100, 0, 0);
    expect(r.x).toBeGreaterThanOrEqual(DEFAULT_ELO.floor);
  });

  it("placement games move ratings faster (K=40)", () => {
    const placed = updateRatings(1200, 1200, 1, 30, 30, 0, 0);
    const placing = updateRatings(1200, 1200, 1, 10, 30, 5, 0);
    expect(placing.dx).toBeGreaterThan(placed.dx);
  });
});

describe("tiers", () => {
  it("maps rating bands to tiers", () => {
    expect(tierForRating(900).tier).toBe("bronze");
    expect(tierForRating(1100).tier).toBe("silver");
    expect(tierForRating(1250).tier).toBe("gold");
    expect(tierForRating(1450).tier).toBe("platinum");
    expect(tierForRating(1650).tier).toBe("diamond");
    expect(tierForRating(1850).tier).toBe("master");
  });

  it("divisions go IV → I inside each tier", () => {
    expect(tierForRating(1000).division).toBe(4);
    expect(tierForRating(1050).division).toBe(3);
    expect(tierForRating(1100).division).toBe(2);
    expect(tierForRating(1150).division).toBe(1);
    expect(tierForRating(1800).division).toBe(1);
  });

  it("labels are Persian", () => {
    expect(tierLabel(tierForRating(1250))).toContain("طلا");
    expect(tierLabel(tierForRating(1850))).toBe("استاد");
  });
});
