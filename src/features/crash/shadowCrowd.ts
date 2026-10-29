/**
 * SHADOW CROWD — hidden virtual guests for the live Sheriff Blast salon.
 *
 * When the live salon has almost nobody else betting, plausible virtual
 * guests quietly join the round's bet feed (and the round counters) so the
 * hall always feels alive. Display-only: they never touch the wallet, the
 * HMAC round math, history, or any server state. The offline local salon
 * already simulates its own crowd, so this runs only in `live` mode.
 */

import { pickShadowPersona } from "@/lib/shadowOpponent";
import { MIN_BET, MAX_BET, payoutFor } from "@/games/crash/math";
import type { CrashBetView } from "./crashView";

export interface ShadowCrowdBet extends CrashBetView {
  /** Marks the row as virtual — kept internal, never rendered. */
  readonly shadow: true;
  /** Multiplier at which this guest cashes out (equals autoAt when auto). */
  readonly cashTarget: number;
}

/** Deterministic PRNG so a round's crowd never flickers between renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AUTO_TARGETS = [150, 200, 300, 500] as const;
/** Never build more than this many guests (callers slice by need). */
export const SHADOW_CROWD_POOL = 4;

/**
 * Build the deterministic virtual guest pool for a round. Callers show only
 * the first `need` entries so rows stay stable as real players arrive.
 */
export function buildShadowCrowd(roundIndex: number, need: number): ShadowCrowdBet[] {
  if (need <= 0) return [];
  const rng = mulberry32(roundIndex * 7919 + 104_729);
  const count = Math.min(SHADOW_CROWD_POOL, Math.max(0, need));
  const usedNames = new Set<string>();
  const guests: ShadowCrowdBet[] = [];

  for (let i = 0; i < count; i++) {
    let name = pickShadowPersona("sheriff_blast", rng);
    for (let tries = 0; tries < SHADOW_CROWD_POOL && usedNames.has(name); tries++) {
      name = pickShadowPersona("sheriff_blast", rng);
    }
    usedNames.add(name);

    const rawAmount = Math.round((MIN_BET + rng() * Math.min(190, MAX_BET - MIN_BET)) / 5) * 5;
    const amount = Math.min(MAX_BET, Math.max(MIN_BET, rawAmount));
    const useAuto = rng() < 0.6;
    const autoAt = useAuto
      ? AUTO_TARGETS[Math.floor(rng() * AUTO_TARGETS.length)] ?? null
      : null;
    // Cash-out targets are hundredths (e.g. 235 = 2.35×), same unit as live.
    const cashTarget = autoAt ?? Math.round((1.7 + rng() * 5.5) * 100);

    guests.push({
      id: `shadow_${roundIndex}_${i}`,
      slot: 0,
      name,
      amount,
      autoAt,
      cashedAt: null,
      payout: 0,
      isMe: false,
      createdAt: 0,
      shadow: true,
      cashTarget,
    });
  }
  return guests;
}

/** True once a guest's cash-out target has been crossed by the live multiplier. */
export function shadowGuestCashed(
  guest: ShadowCrowdBet,
  shown: number | null,
  phase: "betting" | "flying" | "crashed",
): boolean {
  if (shown === null || phase === "betting") return false;
  return guest.cashTarget <= shown;
}

/** Payout a guest claims after cashing out (same formula as the server). */
export function shadowGuestPayout(guest: ShadowCrowdBet): number {
  return payoutFor(guest.amount, guest.cashTarget);
}
