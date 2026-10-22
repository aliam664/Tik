import { describe, expect, it } from "vitest";
import {
  DICE_MAX_TARGET,
  DICE_MIN_BET,
  DICE_MIN_TARGET,
  diceChanceBps,
  diceEffectiveRtp,
  diceMultiplier,
  dicePayout,
  diceRoll,
  formatDiceRoll,
  isDiceWin,
  verifyDiceRound,
} from "./math";

const ZERO_SEED = "00".repeat(32);
const ZERO_SEED_HASH = "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925";

describe("Sheriff Dice provably-fair math", () => {
  it("matches the fixed HMAC-SHA256 52-bit vector used by SQL", () => {
    expect(diceRoll(ZERO_SEED, "sheriff-dice:1")).toBe(4975);
    expect(diceRoll(ZERO_SEED, "sheriff-dice:42")).toBe(5603);
    expect(verifyDiceRound(ZERO_SEED, "sheriff-dice:1", 4975, ZERO_SEED_HASH).ok).toBe(true);
    expect(verifyDiceRound(ZERO_SEED, "sheriff-dice:1", 4976, ZERO_SEED_HASH).ok).toBe(false);
  });

  it("computes UNDER and OVER chances from the same target", () => {
    expect(diceChanceBps(2500, "under")).toBe(2500);
    expect(diceChanceBps(2500, "over")).toBe(7500);
    expect(diceChanceBps(5000, "under")).toBe(5000);
    expect(diceChanceBps(5000, "over")).toBe(5000);
  });

  it("prices every target at no more than 99% theoretical RTP", () => {
    for (const side of ["under", "over"] as const) {
      for (let target = DICE_MIN_TARGET; target <= DICE_MAX_TARGET; target += 50) {
        const chance = diceChanceBps(target, side) / 10_000;
        const multiplier = diceMultiplier(target, side) / 100;
        expect(chance * multiplier).toBeLessThanOrEqual(0.9900000001);
        expect(chance * multiplier).toBeGreaterThan(0.981);
      }
    }
  });

  it("keeps actual RTP above 98.17% at the payout-precise minimum wager", () => {
    for (const side of ["under", "over"] as const) {
      for (let target = DICE_MIN_TARGET; target <= DICE_MAX_TARGET; target += 50) {
        const rtp = diceEffectiveRtp(DICE_MIN_BET, target, side);
        expect(rtp).toBeGreaterThanOrEqual(0.9817);
        expect(rtp).toBeLessThanOrEqual(0.9900000001);
      }
    }
  });

  it("uses exact boundary semantics and integer payouts", () => {
    expect(isDiceWin(4999, 5000, "under")).toBe(true);
    expect(isDiceWin(5000, 5000, "under")).toBe(false);
    expect(isDiceWin(5000, 5000, "over")).toBe(true);
    expect(isDiceWin(4999, 5000, "over")).toBe(false);
    expect(diceMultiplier(5000, "under")).toBe(198);
    expect(dicePayout(25, 198)).toBe(49);
  });

  it("formats the full roll range as two decimals", () => {
    expect(formatDiceRoll(0)).toBe("0.00");
    expect(formatDiceRoll(7)).toBe("0.07");
    expect(formatDiceRoll(9999)).toBe("99.99");
  });
});
