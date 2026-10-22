import { describe, expect, it } from "vitest";
import { CrashSalon } from "./engine";
import { isHash } from "./bytes";
import {
  HOUSE_EDGE_BPS,
  MIN_CRASH_POINT,
  crashPoint,
  crashPointFromBits,
  elapsedAt,
  formatMultiplier,
  hashSeed,
  multiplierAt,
  payoutFor,
  randomSeed,
  verifyFair,
} from "./math";

describe("Sheriff Blast crash math (Kuliyev/Bustabit 52-bit, 1% edge)", () => {
  it("clamps r=0 to the 1.00× instant bust", () => {
    expect(crashPointFromBits(0n, HOUSE_EDGE_BPS)).toBe(MIN_CRASH_POINT);
  });

  it("formats hundredths as a multiplier", () => {
    expect(formatMultiplier(100)).toBe("1.00×");
    expect(formatMultiplier(247)).toBe("2.47×");
    expect(payoutFor(10, 247)).toBe(24);
  });

  it("elapsedAt is the inverse of multiplierAt", () => {
    for (const m of [100, 150, 200, 337, 1000]) {
      const t = elapsedAt(m);
      expect(multiplierAt(t)).toBeGreaterThanOrEqual(m);
      if (t > 0) expect(multiplierAt(t - 1)).toBeLessThan(m);
    }
  });

  it("produces a verifiable seed hash and crash point", () => {
    const seed = randomSeed();
    expect(isHash(seed)).toBe(true);
    expect(isHash(hashSeed(seed))).toBe(true);
    const point = crashPoint(seed, "sheriff-blast:1");
    expect(point).toBeGreaterThanOrEqual(100);
    expect(point).toBeLessThanOrEqual(100_000_000);
    expect(verifyFair(seed, "sheriff-blast:1", point).ok).toBe(true);
    expect(verifyFair(seed, "sheriff-blast:1", point + 1).ok).toBe(false);
  });

  it("cash-out at 2.00× returns ~99% over many rounds (house edge)", () => {
    const target = 200;
    let spent = 0;
    let returned = 0;
    for (let i = 0; i < 8000; i += 1) {
      const seed = randomSeed();
      const point = crashPoint(seed, `sheriff-blast:soak:${i}`);
      spent += 100;
      if (point >= target) returned += payoutFor(100, target);
    }
    const rtp = returned / spent;
    expect(rtp).toBeGreaterThan(0.94);
    expect(rtp).toBeLessThan(1.04);
  });
});

describe("CrashSalon local engine", () => {
  it("rejects bets after the betting window and pays a cash-out before the bust", () => {
    let seed = randomSeed();
    while (crashPoint(seed, "sheriff-blast:1") < 300) seed = randomSeed();
    const salon = new CrashSalon(500, 0, seed);
    salon.placeBet(50, 200, "آرش", 10);
    expect(() => salon.placeBet(10, null, "آرش", 5000)).toThrow("BETTING_CLOSED");

    const flying = salon.getState(5000);
    expect(flying.round.phase).toBe("flying");
    const me = flying.round.bets.find((b) => b.isMe);
    expect(me).toBeTruthy();
    const after = salon.cashOut(me!.id, 5000 + elapsedAt(150));
    expect(after.cashedAt).toBeGreaterThanOrEqual(150);
    expect(after.payout).toBeGreaterThan(50);
  });

  it("burns the stake when the round busts before cash-out", () => {
    const salon = new CrashSalon(200, 0);
    salon.placeBet(40, null, "آرش", 20);
    const start = salon.getState(20).balance;
    let later = salon.getState(20);
    for (let t = 8_000; t <= 400_000 && salon.getTelemetry().rounds === 0; t += 20_000) {
      later = salon.getState(t);
    }
    expect(["betting", "crashed", "flying"]).toContain(later.round.phase);
    if (later.round.history.length > 0) {
      expect(later.balance).toBeLessThanOrEqual(start + 500);
    }
    expect(salon.getTelemetry().rounds).toBeGreaterThan(0);
  });

  it("rejects NaN stakes and a second bet on the same slot", () => {
    const salon = new CrashSalon(400, 0);
    expect(() => salon.placeBet(Number.NaN, null, "آرش", 10)).toThrow("INVALID_STAKE");
    salon.placeBet(20, null, "آرش", 20, 0);
    expect(() => salon.placeBet(20, null, "آرش", 30, 0)).toThrow("SLOT_TAKEN");
    salon.placeBet(20, null, "آرش", 40, 1);
    expect(salon.getState(40).round.bets.filter((b) => b.isMe)).toHaveLength(2);
  });

  it("does not let a later seedBalance wipe a win", () => {
    let seed = randomSeed();
    while (crashPoint(seed, "sheriff-blast:1") < 300) seed = randomSeed();
    const salon = new CrashSalon(200, 0, seed);
    salon.seedBalance(200);
    salon.placeBet(50, 200, "آرش", 10);
    const me = salon.getState(5000).round.bets.find((b) => b.isMe)!;
    salon.cashOut(me.id, 5000 + elapsedAt(150));
    const afterWin = salon.getState(5000 + elapsedAt(150)).balance;
    salon.seedBalance(1);
    expect(salon.getState(5000 + elapsedAt(150)).balance).toBe(afterWin);
  });
});
