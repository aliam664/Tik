import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  clearWordSession,
  loadWordSession,
  saveWordSession,
  type StoredWordRoomSession,
} from "@/games/wordGame/session";
import { SoloWordGameController } from "@/games/wordGame/soloEngine";
import { wordCipherAudio } from "@/games/wordGame/sound";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { wordGameApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useShadowOpponent } from "@/lib/shadowOpponent";
import { supabase } from "@/lib/supabase";
import type { WordRoomStateResponse } from "@/types/wordGame";
import { WordCipherArenaView } from "./WordCipherArenaView";
import { Badge, Card } from "./WordUiPrimitives";
import "@/styles/word-game.css";

function makeRequestId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 12)
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`;
}

export function WordCipherRoomPage() {
  const { roomCode: rawRoomCode } = useParams<{ roomCode: string }>();
  const roomCode = (rawRoomCode ?? "").trim().toUpperCase();
  useDocumentTitle(`اتاق ${roomCode} — رازواژه`);
  const navigate = useNavigate();
  const { showToast: show } = useToast();
  const { profile, token: profileToken } = useEconomyProfile();

  const [session, setSession] = useState<StoredWordRoomSession | null>(() =>
    roomCode ? loadWordSession(roomCode) : null,
  );
  const [snapshot, setSnapshot] = useState<WordRoomStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [directJoinName, setDirectJoinName] = useState(
    () => profile?.display_name ?? "",
  );
  useEffect(() => {
    if (profile?.display_name && !directJoinName) {
      setDirectJoinName(profile.display_name);
    }
  }, [profile?.display_name, directJoinName]);
  const [joiningDirect, setJoiningDirect] = useState(false);

  const inFlightActionRef = useRef(false);
  const latestVersionRef = useRef(0);
  const fetchGenRef = useRef(0);
  const playerToken = session?.playerToken ?? null;

  const fetchAuthenticatedState = useCallback(
    async (notify = false) => {
      if (!roomCode) return;
      const gen = ++fetchGenRef.current;
      try {
        const res = await wordGameApi.getRoomState(roomCode, playerToken, notify);
        if (gen !== fetchGenRef.current) return;
        latestVersionRef.current = res.state.version;
        setSnapshot(res);
        setErrorCode(null);
      } catch (err) {
        if (gen !== fetchGenRef.current) return;
        setErrorCode(getErrorMessage(err));
      } finally {
        if (gen === fetchGenRef.current) setLoading(false);
      }
    },
    [roomCode, playerToken],
  );

  // Initial state load + Realtime WebSocket subscription + reconnect/poll heartbeat
  useEffect(() => {
    if (!roomCode) {
      setLoading(false);
      setErrorCode("کد اتاق نامعتبر است.");
      return;
    }

    void fetchAuthenticatedState(true);

    let channelCleanup: (() => void) | null = null;
    try {
      const channel = supabase
        .channel(`wg_room:${roomCode}`)
        .on("broadcast", { event: "state" }, () => {
          void fetchAuthenticatedState(false);
        })
        .subscribe();

      channelCleanup = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // Realtime fallback handled by polling interval below
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchAuthenticatedState(true);
      }
    };
    const onOnline = () => void fetchAuthenticatedState(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    const pollId = window.setInterval(() => {
      if (!inFlightActionRef.current) {
        void fetchAuthenticatedState(false);
      }
    }, 4500);

    return () => {
      channelCleanup?.();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.clearInterval(pollId);
    };
  }, [roomCode, fetchAuthenticatedState]);

  /* ----------------------- hidden shadow opponent ----------------------- */
  // If the seated player waits alone, a human-like bot quietly takes seat 2
  // and a full two-player duel runs locally (presented as a live room match).
  const seatedAlone = Boolean(
    session?.playerToken &&
      snapshot &&
      snapshot.seat !== null &&
      snapshot.state.status === "waiting" &&
      snapshot.state.players.length < snapshot.state.max_players,
  );
  const shadow = useShadowOpponent({ game: "word_cipher", armed: seatedAlone });
  const [shadowCtrl, setShadowCtrl] = useState<SoloWordGameController | null>(null);
  const [shadowSnap, setShadowSnap] = useState<WordRoomStateResponse | null>(null);

  useEffect(() => {
    if (!shadow.active) {
      setShadowCtrl(null);
      setShadowSnap(null);
      return;
    }
    if (shadowCtrl) return;
    const ctrl = new SoloWordGameController(
      session?.displayName ?? directJoinName ?? "شما",
      { ...(snapshot?.state.rules ?? {}), roundTimerSeconds: 0 },
      { opponentName: shadow.name, roomCode },
    );
    setShadowCtrl(ctrl);
    setShadowSnap(ctrl.getPublicSnapshot());
  }, [
    shadow.active,
    shadow.name,
    shadowCtrl,
    session?.displayName,
    snapshot?.state.rules,
    directJoinName,
    roomCode,
  ]);

  const runAction = async (fn: () => Promise<WordRoomStateResponse>): Promise<boolean> => {
    if (inFlightActionRef.current) return false;
    inFlightActionRef.current = true;
    setBusy(true);
    try {
      const res = await fn();
      fetchGenRef.current += 1;
      latestVersionRef.current = res.state.version;
      if (res.evaluation?.outcome === "correct") {
        wordCipherAudio.play("guess_correct");
      } else if (res.evaluation?.outcome === "related") {
        wordCipherAudio.play("guess_related");
      } else if (res.evaluation?.outcome === "incorrect") {
        wordCipherAudio.play("guess_wrong");
      } else if (res.state.status === "finished") {
        wordCipherAudio.play("match_victory");
      }
      setSnapshot(res);
      return true;
    } catch (err) {
      show(getErrorMessage(err), "error");
      await fetchAuthenticatedState(false);
      return false;
    } finally {
      inFlightActionRef.current = false;
      setBusy(false);
    }
  };

  const handleDirectJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joiningDirect) return;
    const cleanName = (directJoinName.trim() || profile?.display_name || "بازیکن").slice(
      0,
      24,
    );
    if (cleanName.length < 2) {
      show("لطفاً نام نمایشی حداقل ۲ حرفی وارد کنید.", "error");
      return;
    }
    setJoiningDirect(true);
    try {
      const res = await wordGameApi.joinRoom(roomCode, cleanName, profileToken);
      const saved: StoredWordRoomSession = {
        roomCode: res.room_code,
        playerToken: res.player_token,
        seat: res.seat,
        displayName: cleanName,
        savedAt: new Date().toISOString(),
      };
      saveWordSession(saved);
      setSession(saved);
      setSnapshot({
        seat: res.seat,
        my_role: res.my_role,
        state: res.state,
      });
      wordCipherAudio.play("clue_sent");
    } catch (err) {
      show(getErrorMessage(err), "error");
    } finally {
      setJoiningDirect(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      show(`کد اتاق ${roomCode} کپی شد!`, "success");
    } catch {
      show(`کد اتاق: ${roomCode}`, "info");
    }
  };

  const copyInviteUrl = async () => {
    const url = `${window.location.origin}/games/word-cipher/room/${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      show("لینک مستقیم دعوت کپی شد! برای بازیکن دوم بفرستید.", "success");
    } catch {
      show(url, "info");
    }
  };

  const handleLeave = async () => {
    if (session?.playerToken) {
      try {
        await wordGameApi.leaveRoom(roomCode, session.playerToken);
      } catch {
        // Ignore network errors when leaving
      }
      clearWordSession(roomCode);
    }
    navigate("/games/word-cipher");
  };

  if (loading) {
    return (
              <div className="container" style={{ paddingBlock: "3rem", textAlign: "center" }}>
          <Card className="stack stack--sm">
            <h2>در حال اتصال امن به اتاق {roomCode}...</h2>
            <p className="muted">وضعیت لحظه‌ای راند در حال بازیابی از سرور است.</p>
          </Card>
        </div>
          );
  }

  if (errorCode || !snapshot) {
    return (
              <div className="container" style={{ paddingBlock: "3rem", textAlign: "center" }}>
          <Card className="stack stack--md">
            <h2>{errorCode ?? "امکان اتصال به این اتاق وجود ندارد."}</h2>
            <p className="muted">
              ممکن است کد اتاق اشتباه باشد یا مهلت زمانی اتاق به پایان رسیده باشد.
            </p>
            <div>
              <Button onClick={() => navigate("/games/word-cipher")}>
                بازگشت به لابی رازواژه
              </Button>
            </div>
          </Card>
        </div>
          );
  }

  const { state } = snapshot;

  if (state.status === "closed" || state.status === "expired") {
    return (
              <div className="container" style={{ paddingBlock: "3rem", textAlign: "center" }}>
          <Card className="stack stack--md">
            <Badge tone="danger">
              {state.status === "expired" ? "انقضای اتاق" : "خروج بازیکن"}
            </Badge>
            <h2>
              {state.status === "expired"
                ? "زمان فعالیت این اتاق به پایان رسیده است."
                : "یکی از بازیکنان اتاق را ترک کرد و این نشست بسته شد."}
            </h2>
            <div>
              <Button
                onClick={() => {
                  clearWordSession(roomCode);
                  navigate("/games/word-cipher");
                }}
              >
                ساخت یا ورود به اتاق جدید
              </Button>
            </div>
          </Card>
        </div>
          );
  }

  if (!session?.playerToken || snapshot.seat === null) {
    if (state.status === "waiting" && state.players.length < state.max_players) {
      return (
                  <div className="container" style={{ paddingBlock: "2.5rem", maxWidth: 540 }}>
            <Card className="stack stack--md">
              <Badge tone="gold">دعوت به مسابقه رازواژه · اتاق {roomCode}</Badge>
              <h2>
                {state.players[0]?.name ?? "میزبان"} منتظر ورود شماست!
              </h2>
              <p className="muted">
                نام نمایشی خود را وارد کنید تا بلافاصله راند اول از{" "}
                <strong>{state.total_rounds} راند</strong> آغاز شود.
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
                  پیوستن به اتاق و شروع بازی ←
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
            <h2>این مسابقه هم‌اکنون بین دو بازیکن در جریان است.</h2>
            <div>
              <Button onClick={() => navigate("/games/word-cipher")}>
                ساخت اتاق جدید در لابی رازواژه
              </Button>
            </div>
          </Card>
        </div>
          );
  }

  // Hidden shadow match: the bot has taken seat 2 — run the full duel locally,
  // presented exactly like the live room (real room code, human persona).
  if (shadow.active && shadowCtrl && shadowSnap) {
    return (
      <div className="container wg-arena" style={{ paddingBlock: "1.5rem" }}>
        <WordCipherArenaView
          snapshot={shadowSnap}
          isSolo={false}
          busy={busy}
          actions={{
            onSelectTarget: (wordId) => {
              try {
                setShadowSnap(shadowCtrl.selectTargetCard(wordId));
              } catch (err) {
                show(getErrorMessage(err), "error");
              }
            },
            onSubmitClue: (clueText, kind) => {
              try {
                const res = shadowCtrl.submitHumanClue(clueText, kind);
                if (res.evaluation?.outcome === "correct") {
                  wordCipherAudio.play("guess_correct");
                } else if (res.evaluation?.outcome === "related") {
                  wordCipherAudio.play("guess_related");
                } else {
                  wordCipherAudio.play("guess_wrong");
                }
                setShadowSnap(res);
              } catch (err) {
                show(getErrorMessage(err), "error");
              }
            },
            onRequestHint: () => {
              try {
                setShadowSnap(shadowCtrl.requestExtraHint());
              } catch (err) {
                show(getErrorMessage(err), "error");
              }
            },
            onSubmitGuess: (guessText) => {
              try {
                const res = shadowCtrl.submitHumanGuess(guessText);
                if (res.evaluation?.outcome === "correct") {
                  wordCipherAudio.play("guess_correct");
                } else if (res.evaluation?.outcome === "related") {
                  wordCipherAudio.play("guess_related");
                } else {
                  wordCipherAudio.play("guess_wrong");
                }
                setShadowSnap(res);
                return true;
              } catch (err) {
                show(getErrorMessage(err), "error");
                return false;
              }
            },
            onNextRound: () => {
              const res = shadowCtrl.nextRound();
              if (res.state.status === "finished") {
                wordCipherAudio.play("match_victory");
              }
              setShadowSnap(res);
            },
            onRematch: () => {
              wordCipherAudio.play("card_select");
              setShadowSnap(shadowCtrl.rematch());
            },
            onLeave: handleLeave,
            onTimerExpired: () => setShadowSnap(shadowCtrl.getPublicSnapshot()),
          }}
        />
      </div>
    );
  }

  if (state.status === "waiting") {
    return (
              <div className="container stack stack--lg" style={{ paddingBlock: "2rem", maxWidth: 740 }}>
          <Card className="stack stack--md">
            <div className="row row--between row--wrap">
              <Badge tone="gold">در انتظار بازیکن دوم (۱ از ۲ حاضر)</Badge>
              <Badge tone="info">{state.total_rounds} راند · چرخش نقش خودکار</Badge>
            </div>
            {shadow.searching ? (
              <p className="room-search-line" role="status">
                <span className="room-search-line__dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                در حال جستجوی حریف مناسب…
              </p>
            ) : null}

            <div style={{ textAlign: "center", paddingBlock: "1rem" }}>
              <span className="muted" style={{ display: "block", marginBottom: 8 }}>
                کد ۶ رقمی اتاق برای ورود از دستگاه دوم:
              </span>
              <div
                dir="ltr"
                style={{
                  fontSize: "clamp(2rem, 6vw, 3rem)",
                  fontWeight: 900,
                  letterSpacing: "0.28em",
                  color: "#f3be58",
                }}
              >
                {roomCode}
              </div>
              <div
                className="row row--sm row--wrap"
                style={{ justifyContent: "center", marginTop: "1rem" }}
              >
                <Button onClick={copyCode}>📋 کپی کد اتاق</Button>
                <Button variant="secondary" onClick={copyInviteUrl}>
                  🔗 کپی لینک مستقیم دعوت
                </Button>
              </div>
            </div>

            <div className="wg-config-grid">
              {state.players.map((p) => (
                <div key={p.seat} className="wg-seat-card wg-seat-card--me">
                  <div>
                    <span className="wg-presence-dot wg-presence-dot--online" />
                    <strong>
                      {p.name} {p.is_host ? "(میزبان)" : ""}
                    </strong>
                  </div>
                  <Badge tone="success">آماده</Badge>
                </div>
              ))}
              <div className="wg-seat-card">
                <span className="muted">صندلی ۲ — منتظر پیوستن بازیکن...</span>
                <Badge tone="neutral">خالی</Badge>
              </div>
            </div>

            <div className="row row--between row--wrap">
              <span className="muted" style={{ fontSize: "0.84rem" }}>
                به محض ورود بازیکن دوم با کد یا لینک بالا، صفحه به‌صورت خودکار وارد راند اول می‌شود.
              </span>
              <Button variant="ghost" size="sm" onClick={handleLeave}>
                بستن اتاق و بازگشت
              </Button>
            </div>
          </Card>
        </div>
          );
  }

  return (
          <div className="container wg-arena" style={{ paddingBlock: "1.5rem" }}>
        <WordCipherArenaView
          snapshot={snapshot}
          busy={busy}
          actions={{
            onSelectTarget: (wordId) =>
              runAction(() =>
                wordGameApi.selectTargetWord(roomCode, session.playerToken, wordId),
              ),
            onSubmitClue: (clueText, kind) =>
              runAction(() =>
                wordGameApi.submitClue(
                  roomCode,
                  session.playerToken,
                  clueText,
                  kind,
                  makeRequestId("clue"),
                ),
              ),
            onRequestHint: () =>
              runAction(() =>
                wordGameApi.requestHint(
                  roomCode,
                  session.playerToken,
                  makeRequestId("hint"),
                ),
              ),
            onSubmitGuess: (guessText) =>
              runAction(() =>
                wordGameApi.submitGuess(
                  roomCode,
                  session.playerToken,
                  guessText,
                  makeRequestId("guess"),
                ),
              ),
            onNextRound: (expectedRound) =>
              runAction(() =>
                wordGameApi.nextRound(roomCode, session.playerToken, expectedRound),
              ),
            onRematch: () =>
              runAction(() => wordGameApi.rematch(roomCode, session.playerToken)),
            onLeave: handleLeave,
            onTimerExpired: () => fetchAuthenticatedState(true),
          }}
        />
      </div>
      );
}
