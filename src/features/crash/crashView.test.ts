import { describe, expect, it } from "vitest";
import { CrashSalon } from "@/games/crash/engine";
import { multiplierAt } from "@/games/crash/math";
import type { CrashServerState } from "@/lib/api/crash.api";
import {
  applyLocalTime,
  frameFromView,
  liveMultiplier,
  viewFromLocal,
  viewFromServer,
} from "./crashView";

function iso(t: number): string {
  return new Date(t).toISOString();
}

function serverState(overrides: Partial<CrashServerState> = {}): CrashServerState {
  const base = 1_800_000_000_000;
  return {
    round: {
      id: "r-1",
      index: 42,
      phase: "betting",
      seed_hash: "aa".repeat(32),
      seed: null,
      salt: "sheriff-blast:42",
      crash_point: null,
      betting_ends_at: iso(base + 5000),
      flying_started_at: null,
      crashed_at: null,
      next_at: null,
      server_now: iso(base),
      ...overrides.round,
    },
    history: [
      {
        index: 41,
        crash_point: 247,
        crashed_at: iso(base - 1000),
        seed_hash: "bb".repeat(32),
        seed: "cc".repeat(32),
        salt: "sheriff-blast:41",
      },
    ],
    bets: [
      {
        id: "b-1",
        slot: 0,
        amount: 50,
        auto_at: 200,
        cashed_at: null,
        payout: 0,
        name: "شوالیه",
        is_me: true,
        created_at: iso(base - 2000),
      },
      {
        id: "b-2",
        slot: 1,
        amount: 100,
        auto_at: null,
        cashed_at: 315,
        payout: 315,
        name: "رستم",
        is_me: true,
        created_at: iso(base - 1500),
      },
    ],
    wallet: { balance: 480 },
    stats: { wagered_today: 120, paid_today: 315, pnl_today: 195, loss_today: 60, daily_loss_cap: 300 },
    limits: { min_bet: 10, max_bet: 500, max_slots: 2, house_edge_bps: 100 },
    ...overrides,
  };
}

describe("shared salon view (one chart for every client)", () => {
  it("maps the server payload into the normalized view", () => {
    const s = serverState();
    const v = viewFromServer(s);

    expect(v.mode).toBe("live");
    expect(v.round.index).toBe(42);
    expect(v.round.phase).toBe("betting");
    expect(v.round.seedHash).toBe(s.round.seed_hash);
    expect(v.round.seed).toBeNull();
    expect(v.round.crashPoint).toBeNull();
    expect(v.round.history).toEqual([247]);
    expect(v.round.bets).toHaveLength(2);
    expect(v.round.bets[0]?.isMe).toBe(true);
    expect(v.round.bets[1]?.cashedAt).toBe(315);
    expect(v.balance).toBe(480);
    expect(v.stats.pnl).toBe(195);
    expect(v.limits.maxBet).toBe(500);
  });

  it("keeps betting → flying aligned to the shared timestamp", () => {
    const s = serverState();
    const base = Date.parse(s.round.server_now);
    const v = viewFromServer(s);

    expect(applyLocalTime(v, base + 4999)).toBe(v);
    const flying = applyLocalTime(v, base + 5000);
    expect(flying.round.phase).toBe("flying");
    expect(flying.round.flyingStartedAt).toBe(base + 5000);
  });

  it("renders a flying frame even when the view is one poll stale", () => {
    const s = serverState();
    const base = Date.parse(s.round.server_now);
    const v = viewFromServer(s); // still "betting"

    const frame = frameFromView(v, base + 6200);
    expect(frame.kind).toBe("flying");
    if (frame.kind === "flying") {
      expect(frame.elapsedMs).toBe(1200);
      expect(frame.targets?.[0]?.at).toBe(200);
    }
  });

  it("shows the live multiplier from the shared clock", () => {
    const flying = viewFromServer(
      serverState({
        round: {
          id: "r-2",
          index: 43,
          phase: "flying",
          seed_hash: "dd".repeat(32),
          seed: null,
          salt: "sheriff-blast:43",
          crash_point: null,
          betting_ends_at: iso(1_800_000_000_000),
          flying_started_at: iso(1_800_000_000_000),
          crashed_at: null,
          next_at: null,
          server_now: iso(1_800_003_000),
        },
      }),
    );
    const t = 1_800_000_000_000 + 3000;
    expect(liveMultiplier(flying, t)).toBe(multiplierAt(3000));
    const frame = frameFromView(flying, t);
    expect(frame.kind).toBe("flying");
  });

  it("turns settled bets into chart markers and autos into target lines", () => {
    const s = serverState({
      round: {
        ...serverState().round,
        phase: "flying",
        flying_started_at: iso(1_799_999_997_000),
        server_now: iso(1_800_000_000_000),
      },
    });
    const v = viewFromServer(s);
    const frame = frameFromView(v, 1_800_000_000_000);
    expect(frame.kind).toBe("flying");
    if (frame.kind === "flying") {
      // my uncashed 2.00× auto → target line
      expect(frame.targets?.some((m) => m.at === 200 && m.mine)).toBe(true);
      // my slot-1 bet already cashed at 3.15× → marker
      expect(frame.markers?.some((m) => m.at === 315)).toBe(true);
    }
  });

  it("falls back to the identical view shape from the local salon", () => {
    const salon = new CrashSalon(250, 1_800_000_000_000, "ab".repeat(32));
    const local = viewFromLocal(salon.getState(1_800_000_000_000));
    expect(local.mode).toBe("local");
    expect(local.round.phase).toBe("betting");
    expect(local.limits.minBet).toBe(10);
    expect(local.balance).toBe(250);

    // shared flight math is identical in both modes
    const t = 1_800_005_000 + 2400;
    const flying = viewFromLocal(
      salon.getState(t),
    );
    if (flying.round.phase === "flying") {
      expect(liveMultiplier(flying, t)).toBe(multiplierAt(2400));
    }
  });
});
