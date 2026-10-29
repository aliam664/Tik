/**
 * Normalized client view of the Sheriff Blast salon.
 *
 * Both sources — the shared server salon (one round for every client on every
 * OS) and the offline local salon fallback — are mapped into the same shape so
 * the arena page renders identical UI from either source.
 */

import type { CrashFrame } from "@/games/crash/renderer";
import type { CrashSalonState } from "@/games/crash/engine";
import {
  BETTING_MS,
  CRASHED_MS,
  elapsedAt,
  formatMultiplier,
  multiplierAt,
} from "@/games/crash/math";
import type { CrashServerState } from "@/lib/api/crash.api";

export type CrashMode = "live" | "local";
/** live = realtime broadcast, polling = server ok without broadcast, etc. */
export type CrashLink = "connecting" | "live" | "polling" | "reconnecting" | "local";

export interface CrashBetView {
  id: string;
  slot: number;
  name: string;
  amount: number;
  autoAt: number | null;
  cashedAt: number | null;
  payout: number;
  isMe: boolean;
  createdAt: number;
}

export interface CrashHistoryRow {
  index: number;
  crashPoint: number;
  seedHash: string;
  seed: string;
  salt: string;
}

export interface CrashStatsView {
  wagered: number;
  paid: number;
  pnl: number;
  lossToday: number;
  lossCap: number;
}

export interface CrashView {
  mode: CrashMode;
  round: {
    index: number;
    phase: "betting" | "flying" | "crashed";
    bettingEndsAt: number;
    flyingStartedAt: number | null;
    crashedAt: number | null;
    nextAt: number | null;
    seedHash: string;
    seed: string | null;
    salt: string;
    crashPoint: number | null;
    bets: CrashBetView[];
    history: number[];
    historyRows: CrashHistoryRow[];
  };
  balance: number | null;
  stats: CrashStatsView;
  limits: { minBet: number; maxBet: number; maxSlots: number; houseEdgeBps: number };
}

function parseTs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Map the shared-server payload into the normalized view. */
export function viewFromServer(s: CrashServerState): CrashView {
  const r = s.round;
  const serverNow = parseTs(r.server_now) ?? Date.now();
  const history = (s.history ?? []).slice();
  const rows: CrashHistoryRow[] = history.map((h) => ({
    index: Number(h.index),
    crashPoint: Number(h.crash_point),
    seedHash: h.seed_hash,
    seed: h.seed,
    salt: h.salt,
  }));
  return {
    mode: "live",
    round: {
      index: Number(r.index),
      phase: r.phase,
      bettingEndsAt: parseTs(r.betting_ends_at) ?? serverNow + BETTING_MS,
      flyingStartedAt: parseTs(r.flying_started_at),
      crashedAt: parseTs(r.crashed_at),
      nextAt: parseTs(r.next_at),
      seedHash: r.seed_hash,
      seed: r.seed,
      salt: s.round.salt,
      crashPoint: r.crash_point ?? null,
      bets: (s.bets ?? []).map((b) => ({
        id: b.id,
        slot: Number(b.slot) || 0,
        name: b.name,
        amount: Number(b.amount),
        autoAt: b.auto_at ?? null,
        cashedAt: b.cashed_at ?? null,
        payout: Number(b.payout ?? 0),
        isMe: Boolean(b.is_me),
        createdAt: parseTs(b.created_at) ?? 0,
      })),
      // oldest → newest, same order as the local salon
      history: rows.map((h) => h.crashPoint),
      historyRows: rows,
    },
    // null until the player token has registered a wallet on this client
    balance: s.wallet?.balance ?? null,
    stats: {
      wagered: Number(s.stats?.wagered_today ?? 0),
      paid: Number(s.stats?.paid_today ?? 0),
      pnl: Number(s.stats?.pnl_today ?? 0),
      lossToday: Number(s.stats?.loss_today ?? 0),
      lossCap: Number(s.stats?.daily_loss_cap ?? 0),
    },
    limits: {
      minBet: Number(s.limits?.min_bet ?? 10),
      maxBet: Number(s.limits?.max_bet ?? 500),
      maxSlots: Number(s.limits?.max_slots ?? 2),
      houseEdgeBps: Number(s.limits?.house_edge_bps ?? 100),
    },
  };
}

/** Map the offline local salon into the same normalized view. */
export function viewFromLocal(
  s: CrashSalonState,
  recent: { index: number; crashPoint: number; seedHash: string; seed: string; salt: string }[] = [],
): CrashView {
  const r = s.round;
  return {
    mode: "local",
    round: {
      index: r.index,
      phase: r.phase,
      bettingEndsAt: r.bettingEndsAt,
      flyingStartedAt: r.flyingStartedAt,
      crashedAt: r.crashedAt,
      nextAt: r.nextAt,
      seedHash: r.seedHash,
      seed: r.seed,
      salt: r.salt,
      crashPoint: r.crashPoint,
      bets: r.bets.map((b) => ({
        id: b.id,
        slot: b.slot,
        name: b.name,
        amount: b.amount,
        autoAt: b.autoAt,
        cashedAt: b.cashedAt,
        payout: b.payout,
        isMe: b.isMe,
        createdAt: 0,
      })),
      history: [...r.history],
      historyRows: recent
        .slice()
        .sort((a, b) => b.index - a.index)
        .slice(0, 18),
    },
    balance: s.balance,
    stats: {
      wagered: s.sessionWagered,
      paid: s.sessionWagered + s.sessionPnL,
      pnl: s.sessionPnL,
      lossToday: Math.max(0, -s.sessionPnL),
      lossCap: 0,
    },
    limits: { minBet: 10, maxBet: 500, maxSlots: 2, houseEdgeBps: 100 },
  };
}

/**
 * Extrapolate time-based phase changes between polls so every client flips
 * from betting → flying at the exact same shared timestamp. Crash still comes
 * only from the server (provably fair — nobody can predict it).
 */
export function applyLocalTime(view: CrashView, serverNow: number): CrashView {
  const r = view.round;
  if (r.phase === "betting" && serverNow >= r.bettingEndsAt) {
    return {
      ...view,
      round: { ...r, phase: "flying", flyingStartedAt: r.bettingEndsAt },
    };
  }
  return view;
}

/** Current multiplier (hundredths) at the shared clock, or null outside flight. */
export function liveMultiplier(view: CrashView, now: number): number | null {
  const r = view.round;
  if (r.phase === "flying" && r.flyingStartedAt !== null) {
    if (r.crashPoint !== null) return r.crashPoint;
    return multiplierAt(now - r.flyingStartedAt);
  }
  if (r.phase === "crashed") return r.crashPoint;
  return null;
}

export interface CrashChartMarker {
  at: number; // multiplier in hundredths
  label: string;
  mine: boolean;
}

/** Renderer frame from the normalized view (chart markers included). */
export function frameFromView(view: CrashView, now: number): CrashFrame {
  const r = view.round;
  const myBets = r.bets.filter((b) => b.isMe);
  const markers: CrashChartMarker[] = myBets
    .filter((b) => b.cashedAt !== null)
    .map((b) => ({
      at: b.cashedAt ?? 100,
      label: formatMultiplier(b.cashedAt ?? 100),
      mine: true,
    }));

  if (r.phase === "betting" && now < r.bettingEndsAt) {
    return {
      kind: "betting",
      closesInMs: r.bettingEndsAt - now,
      bettingMs: BETTING_MS,
      lastCrash: r.history.length > 0 ? r.history[r.history.length - 1] : null,
      players: r.bets.length,
    };
  }

  const targets: CrashChartMarker[] = myBets
    .filter((b) => b.cashedAt === null && b.autoAt !== null)
    .map((b) => ({ at: b.autoAt ?? 100, label: formatMultiplier(b.autoAt ?? 100), mine: true }));

  // Betting → flying flips on the shared timestamp even if the view is stale
  // by one poll; crash itself only ever arrives from the server.
  const flyingStart = r.flyingStartedAt ?? r.bettingEndsAt;
  if (r.phase !== "crashed") {
    return { kind: "flying", elapsedMs: Math.max(0, now - flyingStart), targets, markers };
  }

  const crashedAt = r.crashedAt ?? now;
  const elapsed = r.crashPoint !== null ? elapsedAt(r.crashPoint) : Math.max(0, crashedAt - (r.flyingStartedAt ?? crashedAt));
  return {
    kind: "crashed",
    elapsedMs: elapsed,
    crashPoint: r.crashPoint ?? 100,
    sinceCrashMs: Math.max(0, now - crashedAt),
    nextInMs: (r.nextAt ?? crashedAt + CRASHED_MS) - now,
    targets,
    markers,
  };
}
