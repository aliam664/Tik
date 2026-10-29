import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { boardFromString, type PlayerSymbol } from "@/game/engine";
import { api } from "@/lib/api";
import { ApiError, toUserError } from "@/lib/errors";
import { env } from "@/lib/env";
import { playerSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import type { RoomState } from "@/types/api";
import { useOnlineStatus } from "./useOnlineStatus";

export type ConnectionStatus = "connecting" | "online" | "offline";

const HEARTBEAT_MS = 15_000;

interface UseRoomSessionOptions {
  roomCode: string;
  /** called when the player explicitly leaves (after server confirm) */
  onLeft?: (action: string) => void;
}

function openRoomChannel(
  roomCode: string,
  handlers: {
    onState: (payload: unknown) => void;
    onReady: () => void;
    onDown: () => void;
  },
): RealtimeChannel {
  const channel = supabase.channel(`room:${roomCode}`, {
    config: { broadcast: { self: false } },
  });

  channel
    .on("broadcast", { event: "state" }, (msg) => handlers.onState(msg.payload))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") handlers.onReady();
      else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        handlers.onDown();
      }
    });

  return channel;
}

/**
 * Owns the entire room lifecycle:
 * initial fetch → realtime channel → heartbeat → actions (move/rematch/leave).
 * The database is the source of truth; broadcasts are change notifications and
 * every applied snapshot is version-checked to drop stale/out-of-order events.
 */
export function useRoomSession({ roomCode, onLeft }: UseRoomSessionOptions) {
  const browserOnline = useOnlineStatus();

  const [state, setState] = useState<RoomState | null>(null);
  const [role, setRole] = useState<PlayerSymbol | null>(null);
  // token lives in a ref for RPC calls, mirrored to state for render
  const [token, setToken] = useState<string | null>(() => playerSession.getToken(roomCode));
  const tokenRef = useRef<string | null>(token);

  const [fatalError, setFatalError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const [rematchPending, setRematchPending] = useState(false);

  const versionRef = useRef(-1);
  const aliveRef = useRef(true);

  const applyResponse = useCallback(
    (res: { role: string | null; state: RoomState }) => {
      if (!aliveRef.current) return;
      if (res.state.version < versionRef.current) return; // stale snapshot
      versionRef.current = res.state.version;
      setState(res.state);
      setRole((res.role as PlayerSymbol | null) ?? null);
      setConnection("online");
    },
    [],
  );

  const applyBroadcast = useCallback((payload: unknown) => {
    if (!aliveRef.current || !payload || typeof payload !== "object") return;
    const next = payload as RoomState;
    if (typeof next.version !== "number" || typeof next.room_code !== "string") return;
    if (next.version < versionRef.current) return; // out-of-order notification
    versionRef.current = next.version;
    setState(next);
    setConnection("online");
  }, []);

  /** authoritative refetch (also acts as heartbeat when a token exists) */
  const refresh = useCallback(
    async (notify = false) => {
      const latestToken = playerSession.getToken(roomCode);
      if (latestToken !== tokenRef.current) {
        tokenRef.current = latestToken;
        setToken(latestToken);
      }
      try {
        const res = await api.getRoomState(roomCode, latestToken, notify);
        applyResponse(res);
        setFatalError(null);
      } catch (err) {
        if (err instanceof ApiError && err.code === "ROOM_NOT_FOUND") {
          setFatalError("اتاقی با این کد پیدا نشد.");
        } else {
          setConnection("offline"); // transient — heartbeat retries
        }
      }
    },
    [applyResponse, roomCode],
  );

  /* -------------- initial load + realtime subscription -------------- */
  useEffect(() => {
    aliveRef.current = true;
    versionRef.current = -1;
    const storedToken = playerSession.getToken(roomCode);
    tokenRef.current = storedToken;
    setToken(storedToken);
    setState(null);
    setRole(null);
    setFatalError(null);
    setActionError(null);
    setInitialLoading(true);
    setRealtimeReady(false);

    void refresh(true).finally(() => {
      if (aliveRef.current) setInitialLoading(false);
    });

    const channel = env.isConfigured
      ? openRoomChannel(roomCode, {
          onState: applyBroadcast,
          onReady: () => {
            setRealtimeReady(true);
            void refresh(false); // resync to cover missed events
          },
          onDown: () => setRealtimeReady(false),
        })
      : null;

    return () => {
      aliveRef.current = false;
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  /* ------------------------------ heartbeat ------------------------------ */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false);
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [refresh]);

  /* ------------------ reconnect / visibility resync ------------------ */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    const onOnline = () => void refresh(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  useEffect(() => {
    if (!browserOnline) setConnection("offline");
  }, [browserOnline]);

  /* ------------------------------- actions ------------------------------- */

  const playMove = useCallback(
    async (cellIndex: number): Promise<boolean> => {
      if (!tokenRef.current) return false;
      setPendingCell(cellIndex);
      setActionError(null);
      try {
        const res = await api.makeMove(roomCode, tokenRef.current, cellIndex);
        applyResponse(res);
        return true;
      } catch (err) {
        const user = toUserError(err);
        setActionError(user.message);
        void refresh(false); // resync with truth
        return false;
      } finally {
        setPendingCell(null);
      }
    },
    [applyResponse, refresh, roomCode],
  );

  const requestRematch = useCallback(async (): Promise<boolean> => {
    if (!tokenRef.current) return false;
    setRematchPending(true);
    setActionError(null);
    try {
      const res = await api.requestRematch(roomCode, tokenRef.current);
      applyResponse(res);
      return true;
    } catch (err) {
      const user = toUserError(err);
      setActionError(user.message);
      void refresh(false);
      return false;
    } finally {
      setRematchPending(false);
    }
  }, [applyResponse, refresh, roomCode]);

  const leave = useCallback(async (): Promise<void> => {
    if (!tokenRef.current) return;
    try {
      const res = await api.leaveRoom(roomCode, tokenRef.current);
      playerSession.clear(roomCode);
      tokenRef.current = null;
      setToken(null);
      onLeft?.(res.action);
    } catch {
      // even on failure, drop local credentials and move on
      playerSession.clear(roomCode);
      tokenRef.current = null;
      setToken(null);
      onLeft?.("left");
    }
  }, [onLeft, roomCode]);

  const board = useMemo(
    () => (state ? boardFromString(state.board) : []),
    [state],
  );

  return {
    state,
    board,
    role,
    token,
    fatalError,
    initialLoading,
    connection,
    realtimeReady,
    actionError,
    pendingCell,
    rematchPending,
    clearActionError: () => setActionError(null),
    playMove,
    requestRematch,
    leave,
    refresh,
  };
}
