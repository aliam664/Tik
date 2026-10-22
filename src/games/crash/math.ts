/**
 * Crash-point and multiplier curve — adapted from KuliyevMerdan/crash
 * (integer hundredths, 1% house edge, exponential display curve).
 */

import { bytesToHex, hexToBytes, isHash, utf8 } from "./bytes";
import { hmacSha256, sha256 } from "./sha256";

/** 1.00× stored as hundredths. */
export const MIN_CRASH_POINT = 100;
/** 1,000,000.00× ceiling. */
export const MAX_CRASH_POINT = 100_000_000;
export const HOUSE_EDGE_BPS = 100;
export const GROWTH_RATE_PER_SECOND = 0.06;
export const BETTING_MS = 5000;
export const CRASHED_MS = 2800;
export const MIN_BET = 10;
export const MAX_BET = 500;
export const SALT_PREFIX = "sheriff-blast";
export const MAX_SLOTS = 2;

const TWO_POW_52 = 2n ** 52n;

export function randomSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function hashSeed(seed: string): string {
  return bytesToHex(sha256(hexToBytes(seed)));
}

export function crashPoint(seed: string, salt: string, houseEdgeBps = HOUSE_EDGE_BPS): number {
  if (!isHash(seed)) throw new RangeError("seed must be 64 lowercase hex chars");
  const hmac = bytesToHex(hmacSha256(hexToBytes(seed), utf8(salt)));
  const r = BigInt(`0x${hmac.slice(0, 13)}`);
  return crashPointFromBits(r, houseEdgeBps);
}

export function crashPointFromBits(r: bigint, houseEdgeBps: number): number {
  if (r < 0n || r >= TWO_POW_52) throw new RangeError(`r must be in [0, 2^52): ${r}`);
  if (!Number.isInteger(houseEdgeBps) || houseEdgeBps < 0 || houseEdgeBps >= 10_000) {
    throw new RangeError("houseEdgeBps must be an integer in [0, 10000)");
  }
  const raw = (BigInt(10_000 - houseEdgeBps) * TWO_POW_52) / (100n * (TWO_POW_52 - r));
  if (raw >= BigInt(MAX_CRASH_POINT)) return MAX_CRASH_POINT;
  return Math.max(MIN_CRASH_POINT, Number(raw));
}

export function multiplierAt(elapsedMs: number, k = GROWTH_RATE_PER_SECOND): number {
  if (elapsedMs <= 0) return MIN_CRASH_POINT;
  const value = Math.floor(100 * Math.exp((k * elapsedMs) / 1000));
  return Math.min(MAX_CRASH_POINT, Math.max(MIN_CRASH_POINT, value));
}

export function smoothMultiplierAt(elapsedMs: number, k = GROWTH_RATE_PER_SECOND): number {
  if (elapsedMs <= 0) return MIN_CRASH_POINT;
  return Math.min(MAX_CRASH_POINT, 100 * Math.exp((k * elapsedMs) / 1000));
}

export function elapsedAt(multiplier: number, k = GROWTH_RATE_PER_SECOND): number {
  if (!Number.isInteger(multiplier) || multiplier < MIN_CRASH_POINT || multiplier > MAX_CRASH_POINT) {
    throw new RangeError("not a multiplier in hundredths");
  }
  let ms = Math.max(0, Math.ceil((1000 * Math.log(multiplier / 100)) / k));
  while (multiplierAt(ms, k) < multiplier) ms += 1;
  while (ms > 0 && multiplierAt(ms - 1, k) >= multiplier) ms -= 1;
  return ms;
}

export function formatMultiplier(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return `${whole}.${String(frac).padStart(2, "0")}×`;
}

export function payoutFor(stake: number, hundredths: number): number {
  return Math.floor((stake * hundredths) / 100);
}

export function verifyFair(
  seed: string,
  salt: string,
  claimed: number,
): { ok: boolean; computed: number } {
  const computed = crashPoint(seed, salt);
  return { ok: computed === claimed, computed };
}
