import { bytesToHex, hexToBytes, isHash, utf8 } from "@/games/crash/bytes";
import { hmacSha256 } from "@/games/crash/sha256";
import { hashSeed } from "@/games/crash/math";

export type DiceSide = "under" | "over";

export const DICE_MIN_TARGET = 200;
export const DICE_MAX_TARGET = 9800;
export const DICE_HOUSE_EDGE_BPS = 100;
export const DICE_BETTING_MS = 8000;
export const DICE_REVEAL_MS = 3500;

const TWO_POW_52 = 2n ** 52n;

/** Deterministic shared roll in [0, 9999], matching dice_roll_from_seed SQL. */
export function diceRoll(seed: string, salt: string): number {
  if (!isHash(seed)) throw new RangeError("seed must be 64 lowercase hex chars");
  const digest = bytesToHex(hmacSha256(hexToBytes(seed), utf8(salt)));
  const bits = BigInt(`0x${digest.slice(0, 13)}`);
  return Number((bits * 10_000n) / TWO_POW_52);
}

export function diceChanceBps(target: number, side: DiceSide): number {
  if (!Number.isInteger(target) || target < DICE_MIN_TARGET || target > DICE_MAX_TARGET) {
    throw new RangeError("target must be an integer in [200, 9800]");
  }
  return side === "under" ? target : 10_000 - target;
}

/** Integer hundredths payout multiplier at 99% theoretical RTP. */
export function diceMultiplier(target: number, side: DiceSide): number {
  return Math.floor(990_000 / diceChanceBps(target, side));
}

export function dicePayout(stake: number, multiplier: number): number {
  return Math.floor((stake * multiplier) / 100);
}

export function isDiceWin(roll: number, target: number, side: DiceSide): boolean {
  if (!Number.isInteger(roll) || roll < 0 || roll > 9999) throw new RangeError("invalid roll");
  return side === "under" ? roll < target : roll >= target;
}

export function formatDiceRoll(roll: number): string {
  return (roll / 100).toFixed(2);
}

export function formatDiceTarget(target: number): string {
  return (target / 100).toFixed(2);
}

export function verifyDiceRound(
  seed: string,
  salt: string,
  claimedRoll: number,
  claimedHash?: string,
): { ok: boolean; computedRoll: number; hashOk: boolean } {
  const computedRoll = diceRoll(seed, salt);
  const hashOk = claimedHash ? hashSeed(seed) === claimedHash : true;
  return { ok: computedRoll === claimedRoll && hashOk, computedRoll, hashOk };
}
