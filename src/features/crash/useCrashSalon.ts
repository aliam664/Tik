/**
 * Shared live salon sync — ONE round / ONE chart for every client, any OS.
 *
 * Strategy:
 *  • Poll `crash_get_state` (adaptive cadence: fast while flying).
 *  • Subscribe to the `crash:salon` realtime broadcast for instant wake-ups
 *    (the server broadcasts on every phase change / bet / cash-out).
 *  • Keep a server-clock offset so the whole page — including the canvas —
 *    renders from the same shared timeline between polls.
 *  • Betting → flying flips locally at the exact shared `betting_ends_at`.
 *    The crash point itself only ever comes from the server (provably fair).
 *  • If the backend is missing or unreachable, fall back to the offline local
 *    salon so the game stays playable, with the link pill showing "local".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CrashSalon } from "@/games/crash/engine";
import { getSharedSalon } from "@/games/crash/salon";
import {
  crashCashOut,
  crashGetState,
  crashPlaceBet,
  type CrashServerState,
} from "@/lib/api/crash.api";
import { env } from "@/lib/env";
import { toUserError } from "@/lib/errors";
import { playerIdentity } from "@/lib/playerSession";
import { supabase } from "@/lib/supabase";
import {
  applyLocalTime,
  viewFromLocal,
  viewFromServer,
  type CrashLink,
  type CrashView,
} from "./crashView";

export interface UseCrashSalonOptions {
  /** Player wallet balance — seeds the offline fallback once. */
  coins?: number;
  /** Display name used for offline bets. */
  playerName?: string;
  /** Called after live bets so the global profile stays in sync. */
  onWalletChanged?: () => void;
}

export interface CrashSalonHandle {
  view: CrashView | null;
  link: CrashLink;
  /** True while a live bet/cash-out RPC is in flight. */
  busy: boolean;
  /** Shared clock: server time in live mode, local time in fallback. */
  serverNow: () => number;
  placeBet: (amount: number, autoAt: number | null, slot: 0 | 1) => Promise<void>;
  cashOut: (betId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const FLYING_POLL_MS = 600;
const IDLE_POLL_MS = 1300;
const RETRY_POLL_MS = 1500;
const FALLBACK_RETRY_MS = 8000;
const LOCAL_TICK_MS = 90;
const PHASE_TICK_MS = 200;
const FAILURES_BEFORE_FALLBACK = 3;

export function useCrashSalon({
  coins,
  playerName,
  onWalletChanged,
}: UseCrashSalonOptions): CrashSalonHandle {
  const [view, setView] = useState<CrashView | null>(null);
  const [link, setLink] = useState<CrashLink>(env.isConfigured ? "connecting" : "local");

  const viewRef = useRef<CrashView | null>(null);
  const offsetRef = useRef(0);
  const hasOffsetSampleRef = useRef(false);
  const modeRef = useRef<"live" | "local">(env.isConfigured ? "live" : "local");
  const subscribedRef = useRef(false);
  const salonRef = useRef<CrashSalon | null>(null);
  const coinsRef = useRef<number | undefined>(coins);
  const nameRef = useRef(playerName);
  const walletCbRef = useRef(onWalletChanged);
  const [busy, setBusy] = useState(false);

  /* Latest-value refs for the imperative loops below (never read stale props). */
  useEffect(() => {
    coinsRef.current = coins;
    nameRef.current = playerName;
    walletCbRef.current = onWalletChanged;
  });

  const publish = useCallback((next: CrashView) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const ensureLocal = useCallback((): CrashSalon => {
    if (!salonRef.current) {
      salonRef.current = getSharedSalon(coinsRef.current ?? 250);
      salonRef.current.seedBalance(coinsRef.current ?? 250);
    }
    return salonRef.current;
  }, []);

  const refreshLocal = useCallback(() => {
    const salon = salonRef.current;
    if (!salon) return;
    const now = Date.now();
    publish(viewFromLocal(salon.getState(now), salon.getTelemetry().recent));
  }, [publish]);

  const applyServer = useCallback(
    (s: CrashServerState, rttMid: number = Date.now()) => {
      const sample = Date.parse(s.round.server_now) - rttMid;
      if (Number.isFinite(sample)) {
        if (!hasOffsetSampleRef.current) {
          offsetRef.current = sample;
          hasOffsetSampleRef.current = true;
        } else {
          // Light smoothing absorbs single-sample jitter without lagging the clock.
          offsetRef.current = offsetRef.current * 0.55 + sample * 0.45;
        }
      }
      modeRef.current = "live";
      publish(applyLocalTime(viewFromServer(s), Date.now() + offsetRef.current));
      setLink(subscribedRef.current ? "live" : "polling");
    },
    [publish],
  );

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  /* ------------------------------------------------------------------ */
  /* Main loop: poll → apply → schedule; realtime + visibility wake-ups  */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    let localTimer: number | null = null;
    let phaseTimer: number | null = null;
    let inFlight = false;
    let missedWake = false;
    let failures = 0;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (ms: number) => {
      if (disposed) return;
      clearTimer();
      timer = window.setTimeout(() => void run(), ms);
    };

    const wake = () => {
      if (disposed || !env.isConfigured) return;
      if (inFlight) {
        missedWake = true;
        return;
      }
      schedule(120);
    };

    const startLocalTick = () => {
      if (disposed || localTimer !== null) return;
      ensureLocal();
      localTimer = window.setInterval(() => {
        if (disposed) return;
        if (modeRef.current === "local") refreshLocal();
      }, LOCAL_TICK_MS);
      refreshLocal();
    };

    const stopLocalTick = () => {
      if (localTimer !== null) {
        window.clearInterval(localTimer);
        localTimer = null;
      }
    };

    const run = async () => {
      if (disposed) return;
      if (!env.isConfigured) {
        modeRef.current = "local";
        setLink("local");
        startLocalTick();
        return;
      }
      if (inFlight) return;
      inFlight = true;
      const t0 = Date.now();
      try {
        const tok = playerIdentity.token();
        let s: CrashServerState;
        try {
          s = await crashGetState(tok);
        } catch (innerErr) {
          if (tok && toUserError(innerErr).code === "PLAYER_UNAUTHORIZED") {
            playerIdentity.clear();
            s = await crashGetState(null);
          } else {
            throw innerErr;
          }
        }
        if (disposed) return;
        failures = 0;
        stopLocalTick();
        applyServer(s, (t0 + Date.now()) / 2);
        const quick = missedWake;
        missedWake = false;
        schedule(quick ? 250 : s.round.phase === "flying" ? FLYING_POLL_MS : IDLE_POLL_MS);
      } catch {
        if (disposed) return;
        failures += 1;
        missedWake = false;
        if (modeRef.current === "live" && failures >= FAILURES_BEFORE_FALLBACK) {
          modeRef.current = "local";
          setLink("reconnecting");
          startLocalTick();
          schedule(FALLBACK_RETRY_MS);
        } else {
          if (modeRef.current === "live") setLink("reconnecting");
          schedule(RETRY_POLL_MS);
        }
      } finally {
        inFlight = false;
      }
    };

    // Keep the betting → flying flip on the exact shared timestamp even when
    // no new payload arrives (pure extrapolation, no extra RPCs).
    phaseTimer = window.setInterval(() => {
      if (disposed || modeRef.current !== "live") return;
      const current = viewRef.current;
      if (!current) return;
      const next = applyLocalTime(current, serverNow());
      if (next !== current) publish(next);
    }, PHASE_TICK_MS);

    let channel: RealtimeChannel | null = null;
    if (env.isConfigured) {
      channel = supabase.channel("crash:salon", { config: { broadcast: { self: false } } });
      channel
        .on("broadcast", { event: "state" }, () => wake())
        .subscribe((status) => {
          if (disposed) return;
          subscribedRef.current = status === "SUBSCRIBED";
          if (modeRef.current === "live") {
            setLink(status === "SUBSCRIBED" ? "live" : "polling");
          }
          if (status === "SUBSCRIBED") wake();
        });
    } else {
      modeRef.current = "local";
      setLink("local");
      startLocalTick();
    }

    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    void run();

    return () => {
      disposed = true;
      clearTimer();
      if (phaseTimer !== null) window.clearInterval(phaseTimer);
      stopLocalTick();
      document.removeEventListener("visibilitychange", onVisibility);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [applyServer, ensureLocal, publish, refreshLocal, serverNow]);

  /* Seed the offline wallet whenever the profile balance arrives. */
  useEffect(() => {
    if (coins === undefined) return;
    if (modeRef.current === "local" || salonRef.current) {
      salonRef.current?.seedBalance(coins);
    }
  }, [coins]);

  const placeBet = useCallback(
    async (amount: number, autoAt: number | null, slot: 0 | 1) => {
      if (modeRef.current === "live") {
        const token = playerIdentity.token();
        if (!token) throw new Error("PLAYER_UNAUTHORIZED");
        setBusy(true);
        try {
          const s = await crashPlaceBet(token, amount, autoAt, slot);
          applyServer(s);
        } finally {
          setBusy(false);
        }
        walletCbRef.current?.();
        return;
      }
      const salon = ensureLocal();
      salon.placeBet(amount, autoAt, nameRef.current ?? "شوالیه", Date.now(), slot);
      refreshLocal();
    },
    [applyServer, ensureLocal, refreshLocal],
  );

  const cashOut = useCallback(
    async (betId: string) => {
      if (modeRef.current === "live") {
        const token = playerIdentity.token();
        if (!token) throw new Error("PLAYER_UNAUTHORIZED");
        setBusy(true);
        try {
          const s = await crashCashOut(token, betId);
          applyServer(s);
        } finally {
          setBusy(false);
        }
        walletCbRef.current?.();
        return;
      }
      const salon = ensureLocal();
      salon.cashOut(betId);
      refreshLocal();
    },
    [applyServer, ensureLocal, refreshLocal],
  );

  const refresh = useCallback(async () => {
    if (!env.isConfigured) {
      refreshLocal();
      return;
    }
    try {
      const t0 = Date.now();
      const tok = playerIdentity.token();
      let s: CrashServerState;
      try {
        s = await crashGetState(tok);
      } catch (innerErr) {
        if (tok && toUserError(innerErr).code === "PLAYER_UNAUTHORIZED") {
          playerIdentity.clear();
          s = await crashGetState(null);
        } else {
          throw innerErr;
        }
      }
      applyServer(s, (t0 + Date.now()) / 2);
    } catch {
      if (modeRef.current === "live") setLink("reconnecting");
    }
  }, [applyServer, refreshLocal]);

  return { view, link, busy, serverNow, placeBet, cashOut, refresh };
}
