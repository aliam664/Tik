import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Badge, Card } from "@/features/wordGame/WordUiPrimitives";
import {
  clearCodeBreakerSession,
  loadCodeBreakerSession,
  saveCodeBreakerSession,
} from "@/games/codeBreaker/engine";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { codeBreakerApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type { CodeBreakerStateResponse } from "@/types/codeBreaker";
import { CodeBreakerArenaView } from "./CodeBreakerArenaView";

export function CodeBreakerRoomPage() {
  const { roomCode: rawParam } = useParams<{ roomCode: string }>();
  const roomCode = (rawParam ?? "").trim().toUpperCase();
  const navigate = useNavigate();
  const { showToast: show } = useToast();
  const { profile, token: profileToken } = useEconomyProfile();

  useDocumentTitle(roomCode ? `رمزگشا · اتاق ${roomCode}` : "رمزگشا");

  const [session, setSession] = useState(() =>
    roomCode ? loadCodeBreakerSession(roomCode) : null,
  );
  const [snapshot, setSnapshot] = useState<CodeBreakerStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [directJoinName, setDirectJoinName] = useState(() => profile?.display_name ?? "");
  const [joiningDirect, setJoiningDirect] = useState(false);

  const inFlightRef = useRef(false);
  const playerToken = session?.playerToken ?? null;

  useEffect(() => {
    if (profile?.display_name && !directJoinName) {
      setDirectJoinName(profile.display_name);
    }
  }, [profile?.display_name, directJoinName]);

  const syncState = useCallback(
    async (notify = false) => {
      if (!roomCode) return;
      try {
        const res = await codeBreakerApi.getRoomState(roomCode, playerToken, notify);
        setSnapshot(res);
        setErrorMsg(null);
      } catch (err) {
        setErrorMsg(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [roomCode, playerToken],
  );

  // Real-time Supabase Broadcast subscription + resilient reconnect/poll fallback
  useEffect(() => {
    if (!roomCode) {
      setLoading(false);
      setErrorMsg("کد اتاق نامعتبر است.");
      return;
    }

    void syncState(true);

    let cleanupChannel: (() => void) | null = null;
    try {
      const channel = supabase
        .channel(`cb_room:${roomCode}`)
        .on("broadcast", { event: "state" }, () => {
          void syncState(false);
        })
        .subscribe();
      cleanupChannel = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      cleanupChannel = null;
    }

    const pollId = window.setInterval(() => {
      if (!inFlightRef.current) {
        void syncState(false);
      }
    }, 3000);

    const onFocusOrOnline = () => {
      void syncState(true);
    };
    window.addEventListener("online", onFocusOrOnline);
    window.addEventListener("focus", onFocusOrOnline);

    return () => {
      cleanupChannel?.();
      window.clearInterval(pollId);
      window.removeEventListener("online", onFocusOrOnline);
      window.removeEventListener("focus", onFocusOrOnline);
    };
  }, [roomCode, syncState]);

  const runAction = async (fn: () => Promise<CodeBreakerStateResponse>): Promise<boolean> => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const next = await fn();
      setSnapshot(next);
      return true;
    } catch (err) {
      show(getErrorMessage(err), "error");
      // Always resync state immediately (e.g., if opponent won microseconds earlier!)
      void syncState(false);
      return false;
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  const handleCopyInvite = async () => {
    const shareUrl = `${window.location.origin}/games/code-breaker/room/${roomCode}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      show(`لینک دعوت اتاق ${roomCode} کپی شد!`, "success");
    } catch {
      show(`کد اتاق: ${roomCode}`, "info");
    }
  };

  const handleDirectJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joiningDirect) return;
    const cleanName = (directJoinName.trim() || profile?.display_name || "مهمان").slice(0, 24);
    if (cleanName.length < 2) {
      show("نام نمایشی باید حداقل ۲ کاراکتر باشد.", "error");
      return;
    }
    setJoiningDirect(true);
    try {
      const res = await codeBreakerApi.joinRoom(roomCode, cleanName, profileToken);
      const saved = {
        roomCode: res.room_code,
        playerToken: res.player_token,
        seat: res.seat,
        displayName: cleanName,
        savedAt: new Date().toISOString(),
      };
      saveCodeBreakerSession(saved);
      setSession(saved);
      setSnapshot({
        room_code: res.room_code,
        seat: res.seat,
        state: res.state,
      });
      show("وارد لابی رمزگشا شدید — دکمه آماده‌ام را بزنید!", "success");
    } catch (err) {
      show(getErrorMessage(err), "error");
    } finally {
      setJoiningDirect(false);
    }
  };

  const handleLeave = async () => {
    if (session?.playerToken) {
      try {
        await codeBreakerApi.leaveRoom(roomCode, session.playerToken);
      } catch {
        // Proceed cleanly to lobby even on offline leave
      }
      clearCodeBreakerSession(roomCode);
    }
    navigate("/games/code-breaker");
  };

  if (loading) {
    return (
      <div className="container" style={{ paddingBlock: "3rem", textAlign: "center" }}>
        <Card className="stack stack--sm">
          <h2>در حال اتصال هم‌زمان به اتاق رمزگشا ({roomCode})...</h2>
          <p className="muted">وضعیت لحظه‌ای راند، تایمر سرور و تاریخچه حدس‌ها در حال بازیابی است.</p>
        </Card>
      </div>
    );
  }

  if (errorMsg || !snapshot) {
    return (
      <div className="container" style={{ paddingBlock: "3rem", textAlign: "center" }}>
        <Card className="stack stack--md">
          <h2>{errorMsg ?? "امکان اتصال به این اتاق وجود ندارد."}</h2>
          <div>
            <Button onClick={() => navigate("/games/code-breaker")}>
              بازگشت به لابی رمزگشا
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const { state } = snapshot;

  if (state.status === "abandoned" || state.status === "expired") {
    return (
      <div className="container" style={{ paddingBlock: "3rem", textAlign: "center" }}>
        <Card className="stack stack--md">
          <Badge tone="danger">
            {state.status === "expired" ? "انقضای اتاق" : "خروج یکی از بازیکنان"}
          </Badge>
          <h2>
            {state.status === "expired"
              ? "مهلت زمانی این اتاق به پایان رسیده است."
              : "یکی از بازیکنان اتاق را ترک کرد و مسابقه متوقف شد."}
          </h2>
          <div>
            <Button
              onClick={() => {
                clearCodeBreakerSession(roomCode);
                navigate("/games/code-breaker");
              }}
            >
              ساخت یا ورود به اتاق جدید
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Direct link visitor without seat token -> seamless 1-step join!
  if (!session?.playerToken || snapshot.seat === null) {
    if (state.players.length < state.max_players) {
      return (
        <div className="container" style={{ paddingBlock: "2.5rem", maxWidth: 540 }}>
          <Card className="stack stack--md">
            <Badge tone="gold">دعوت به نبرد کد ۴ رقمی · اتاق {roomCode}</Badge>
            <h2>{state.players[0]?.name ?? "میزبان"} منتظر ورود شماست!</h2>
            <p className="muted">
              نام نمایشی خود را وارد کنید تا وارد لابی شوید و پس از تایید آمادگی هر دو نفر، کد مخفی ۴ رقمی سرور تولید شود.
            </p>
            <form onSubmit={handleDirectJoin} className="stack stack--sm">
              <input
                className="input"
                type="text"
                maxLength={24}
                autoFocus
                placeholder="نام نمایشی شما..."
                value={directJoinName}
                onChange={(e) => setDirectJoinName(e.target.value)}
              />
              <Button type="submit" loading={joiningDirect}>
                ورود به اتاق {roomCode} ←
              </Button>
            </form>
          </Card>
        </div>
      );
    }

    return (
      <div className="container" style={{ paddingBlock: "3rem", textAlign: "center" }}>
        <Card className="stack stack--md">
          <Badge tone="neutral">ظرفیت تکمیل</Badge>
          <h2>هر دو صندلی این مسابقه پر شده است.</h2>
          <div>
            <Button onClick={() => navigate("/games/code-breaker")}>
              ساخت اتاق جدید رمزگشا
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: "1.5rem" }}>
      <CodeBreakerArenaView
        snapshot={snapshot}
        busy={busy}
        onCopyInvite={handleCopyInvite}
        actions={{
          onSetReady: (ready) =>
            runAction(() => codeBreakerApi.setReady(roomCode, session.playerToken, ready)),
          onSubmitGuess: (guessCode) =>
            runAction(() => codeBreakerApi.submitGuess(roomCode, session.playerToken, guessCode)),
          onRematch: () =>
            runAction(() => codeBreakerApi.rematch(roomCode, session.playerToken)),
          onLeave: handleLeave,
        }}
      />
    </div>
  );
}
