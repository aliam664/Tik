import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/features/wordGame/WordUiPrimitives";
import {
  codeBreakerAudio,
  formatClockTime,
  formatElapsedMs,
  normalizeFourDigitCode,
} from "@/games/codeBreaker/engine";
import type {
  CodeBreakerGuessRecord,
  CodeBreakerStateResponse,
  DigitFeedbackColor,
} from "@/types/codeBreaker";

export interface CodeBreakerArenaActions {
  onSetReady: (ready: boolean) => Promise<boolean | void> | boolean | void;
  onSubmitGuess: (guessCode: string) => Promise<boolean | void> | boolean | void;
  onRematch: () => Promise<boolean | void> | boolean | void;
  onLeave: () => Promise<void> | void;
}

interface CodeBreakerArenaViewProps {
  snapshot: CodeBreakerStateResponse;
  isSolo?: boolean;
  busy?: boolean;
  onCopyInvite?: () => void;
  actions: CodeBreakerArenaActions;
}

type ScratchMark = "neutral" | "ruled_out" | "confirmed";

const COLOR_LABEL_FA: Record<DigitFeedbackColor, string> = {
  green: "سبز: رقم و جایگاه دقیق",
  yellow: "زرد: رقم موجود در جایگاه دیگر",
  red: "قرمز: رقم ناموجود",
};

function AttemptCard({
  guess,
  isMine,
  isLatest,
}: {
  guess: CodeBreakerGuessRecord;
  isMine: boolean;
  isLatest: boolean;
}) {
  return (
    <div
      data-testid={`guess-card-${guess.seat}-${guess.player_attempt_number}`}
      className={`cb-attempt-row ${isLatest ? "cb-attempt-row--latest" : ""} ${guess.is_winner ? "cb-attempt-row--winner" : ""}`}
    >
      {/* Left Meta: Attempt #, Owner, Server Timestamp, Elapsed Timer, Global Order & Status */}
      <div className="stack stack--xs" style={{ minWidth: 185 }}>
        <div className="row row--xs row--wrap">
          <Badge tone={isMine ? "success" : "info"}>
            {isMine ? "شما" : `رقیب (${guess.player_name})`} · تلاش #{guess.player_attempt_number}
          </Badge>
          <Badge tone={guess.is_winner ? "gold" : "neutral"}>
            {guess.is_winner ? "✓ کشف کد — برنده!" : "✕ ناموفق"}
          </Badge>
        </div>

        <div
          className="muted"
          style={{
            fontSize: "0.75rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.55rem",
            alignItems: "center",
          }}
        >
          <span title="زمان دقیق ثبت در سرور">
            🕒 ثبت: <strong style={{ color: "#e2e8f0" }}>{formatClockTime(guess.submitted_at)}</strong>
          </span>
          <span title="فاصله زمانی از لحظه شروع راند">
            ⏱ سپری‌شده: <strong style={{ color: "#f3be58" }}>+{formatElapsedMs(guess.elapsed_ms)}</strong>
          </span>
          <span title="ترتیب ثبت سراسری بین هر دو بازیکن روی سرور">
            ترتیب سرور: <strong>#{guess.global_attempt_order}</strong>
          </span>
        </div>

        <div className="cb-counts-bar" aria-label="خلاصه تعداد رنگ‌ها">
          <span className="cb-pill-g">{guess.green_count} سبز</span>
          <span className="cb-pill-y">{guess.yellow_count} زرد</span>
          <span className="cb-pill-r">{guess.red_count} قرمز</span>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: "0.8rem",
              color: "#94a3b8",
              marginLeft: 4,
            }}
          >
            [{guess.guess_code}]
          </span>
        </div>
      </div>

      {/* Right 4-Digit Per-Position Color Strip (Positions 1..4 Left-to-Right matching indices 0..3) */}
      <div className="cb-digit-strip" role="group" aria-label={`حدس ${guess.guess_code}`}>
        {guess.digits.map((cell) => (
          <div
            key={cell.position}
            className={`cb-digit-tile cb-digit-tile--${cell.color}`}
            title={`جایگاه ${cell.position + 1} (اندیس ${cell.position}): رقم ${cell.digit} — ${COLOR_LABEL_FA[cell.color]}`}
          >
            <span>{cell.digit}</span>
            <span className="cb-digit-tile__pos">P{cell.position + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CodeBreakerArenaView({
  snapshot,
  isSolo = false,
  busy = false,
  onCopyInvite,
  actions,
}: CodeBreakerArenaViewProps) {
  const { state, seat } = snapshot;
  const [dial, setDial] = useState<{
    slots: [string, string, string, string];
    cursor: number;
  }>({ slots: ["", "", "", ""], cursor: 0 });
  const slots = dial.slots;
  const activeSlot = dial.cursor;
  const [localError, setLocalError] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<"split" | "timeline">("split");
  const [scratch, setScratch] = useState<Record<string, ScratchMark>>({});
  const [muted, setMuted] = useState(() => codeBreakerAudio.isMuted());

  // Live synced round stopwatch anchored to authoritative server timestamps
  const [liveElapsedMs, setLiveElapsedMs] = useState<number>(state.elapsed_ms);

  useEffect(() => {
    setLiveElapsedMs(state.elapsed_ms);
    if (state.status !== "active" || !state.round_started_at || state.round_ended_at) {
      return;
    }
    const baseElapsed = state.elapsed_ms;
    const syncedClientPerf = performance.now();
    const timer = window.setInterval(() => {
      setLiveElapsedMs(baseElapsed + Math.max(0, Math.floor(performance.now() - syncedClientPerf)));
    }, 100);
    return () => window.clearInterval(timer);
  }, [state.status, state.round_started_at, state.round_ended_at, state.elapsed_ms]);

  // Reset input & scratchpad when a brand-new round starts
  useEffect(() => {
    setDial({ slots: ["", "", "", ""], cursor: 0 });
    setLocalError(null);
    setScratch({});
  }, [state.current_round]);

  // Trigger victory / reveal sound when round transitions to finished
  useEffect(() => {
    if (state.status === "finished") {
      if (state.winner_seat === seat) {
        codeBreakerAudio.play("crack_win");
      } else {
        codeBreakerAudio.play("opponent_win");
      }
    }
  }, [state.status, state.winner_seat, seat]);

  const toggleSound = () => {
    const next = !muted;
    codeBreakerAudio.setMuted(next);
    setMuted(next);
  };

  const mePlayer = useMemo(
    () => state.players.find((p) => p.seat === seat) ?? null,
    [state.players, seat],
  );
  const oppPlayer = useMemo(
    () => state.players.find((p) => p.seat !== seat) ?? null,
    [state.players, seat],
  );

  const setActiveSlot = useCallback((idx: number | ((prev: number) => number)) => {
    setDial((prev) => ({
      slots: prev.slots,
      cursor: typeof idx === "function" ? idx(prev.cursor) : idx,
    }));
  }, []);

  const pushDigit = useCallback(
    (d: string) => {
      if (state.status !== "active" || busy) return;
      codeBreakerAudio.play("key_tick");
      setLocalError(null);
      setDial((prev) => {
        const nextSlots: [string, string, string, string] = [...prev.slots];
        nextSlots[prev.cursor] = d;
        return {
          slots: nextSlots,
          cursor: Math.min(3, prev.cursor + 1),
        };
      });
    },
    [busy, state.status],
  );

  const handleBackspace = useCallback(() => {
    if (state.status !== "active" || busy) return;
    setLocalError(null);
    setDial((prev) => {
      const nextSlots: [string, string, string, string] = [...prev.slots];
      if (nextSlots[prev.cursor] !== "") {
        nextSlots[prev.cursor] = "";
        return { slots: nextSlots, cursor: prev.cursor };
      }
      if (prev.cursor > 0) {
        nextSlots[prev.cursor - 1] = "";
        return { slots: nextSlots, cursor: prev.cursor - 1 };
      }
      return prev;
    });
  }, [busy, state.status]);

  const handleClearSlots = useCallback(() => {
    setDial({ slots: ["", "", "", ""], cursor: 0 });
    setLocalError(null);
  }, []);

  const submitCurrentSlots = useCallback(async () => {
    if (busy || state.status !== "active") return;
    const rawJoined = dial.slots.join("");
    const normalized = normalizeFourDigitCode(rawJoined);
    if (!normalized) {
      setLocalError("لطفاً هر ۴ رقم کد (از ۰ تا ۹، مثل 0072 یا 9090) را کامل وارد کنید.");
      return;
    }
    setLocalError(null);
    codeBreakerAudio.play("submit");
    const ok = await actions.onSubmitGuess(normalized);
    if (ok !== false) {
      setDial({ slots: ["", "", "", ""], cursor: 0 });
    }
  }, [actions, busy, dial.slots, state.status]);

  // Full Physical Keyboard Support (ASCII 0-9 + Persian ۰-۹ + Arrows + Backspace + Enter)
  useEffect(() => {
    if (state.status !== "active") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const persianIdx = "۰۱۲۳۴۵۶۷۸۹".indexOf(e.key);
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        pushDigit(e.key);
      } else if (persianIdx >= 0) {
        e.preventDefault();
        pushDigit(String(persianIdx));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveSlot((s) => Math.max(0, s - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveSlot((s) => Math.min(3, s + 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        void submitCurrentSlots();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleBackspace, pushDigit, setActiveSlot, state.status, submitCurrentSlots]);

  const cycleScratch = (digit: string) => {
    setScratch((prev) => {
      const cur = prev[digit] ?? "neutral";
      const next: ScratchMark =
        cur === "neutral" ? "ruled_out" : cur === "ruled_out" ? "confirmed" : "neutral";
      return { ...prev, [digit]: next };
    });
  };

  // Display newest attempts at top while preserving full immutable history & exact attempt numbers
  const myReversed = useMemo(() => [...state.my_guesses].reverse(), [state.my_guesses]);
  const oppReversed = useMemo(() => [...state.opponent_guesses].reverse(), [state.opponent_guesses]);
  const allReversed = useMemo(() => [...state.all_guesses].reverse(), [state.all_guesses]);

  // =========================================================================
  // 1. LOBBY WAITING & DUAL READINESS GATE
  // =========================================================================
  if (state.status === "waiting") {
    const bothJoined = state.players.length === 2;
    return (
      <div className="stack stack--lg">
        <Card className="stack stack--md" style={{ borderColor: "rgba(243, 190, 88, 0.45)" }}>
          <div className="row row--between row--wrap" style={{ gap: "0.75rem" }}>
            <div className="stack stack--xs">
              <div className="row row--xs">
                <Badge tone="gold">لابی آماده‌سازی · راند {state.current_round}</Badge>
                <Badge tone="info">کد اتاق: {state.room_code}</Badge>
              </div>
              <h2 style={{ margin: 0 }}>
                {bothJoined
                  ? "هر دو بازیکن حضور دارند — برای تولید کد مخفی ۴ رقمی «آماده‌ام» را بزنید!"
                  : "در انتظار ورود بازیکن دوم به اتاق رمزگشا..."}
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                تولید کد مخفی ۴ رقمی روی سرور و شروع تایمر راند <strong>دقیقاً در لحظه‌ای</strong> انجام می‌شود که هر دو بازیکن آمادگی خود را تایید کنند.
              </p>
            </div>
            <div className="row row--xs row--wrap">
              {onCopyInvite && (
                <Button variant="secondary" onClick={onCopyInvite}>
                  📋 کپی لینک دعوت اتاق
                </Button>
              )}
              <Button variant="ghost" onClick={toggleSound}>
                {muted ? "🔇 بی‌صدا" : "🔊 صدا فعال"}
              </Button>
              <Button variant="ghost" onClick={() => actions.onLeave()}>
                خروج از اتاق
              </Button>
            </div>
          </div>

          {/* Two Seat Readiness Cards */}
          <div className="cb-history-columns">
            {[1, 2].map((s) => {
              const p = state.players.find((pl) => pl.seat === s);
              const isMe = s === seat;
              return (
                <div
                  key={s}
                  className={`cb-player-box ${isMe ? "cb-player-box--me" : ""}`}
                  style={{ minHeight: 88 }}
                >
                  <div className="stack stack--xs">
                    <div className="row row--xs">
                      <strong>
                        {p ? p.name : `صندلی ${s} — خالی`} {isMe ? "(شما)" : ""}
                      </strong>
                      {p && <Badge tone="neutral">{p.wins} برد</Badge>}
                    </div>
                    <span className="muted" style={{ fontSize: "0.82rem" }}>
                      {!p
                        ? "منتظر پیوستن بازیکن با کد اتاق..."
                        : p.is_ready
                          ? "✓ آماده شروع راند هم‌زمان"
                          : "⏳ در انتظار تایید آمادگی"}
                    </span>
                  </div>
                  <Badge tone={p?.is_ready ? "success" : "neutral"}>
                    {p?.is_ready ? "آماده ✓" : "غیرآماده"}
                  </Badge>
                </div>
              );
            })}
          </div>

          {/* Ready Action Button */}
          {mePlayer && (
            <div className="row row--between row--wrap" style={{ paddingTop: "0.5rem" }}>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                قانون محدودیت تلاش:{" "}
                <strong>
                  {state.max_attempts_per_player
                    ? `حداکثر ${state.max_attempts_per_player} حدس برای هر نفر`
                    : "بدون محدودیت تعداد حدس — اولین کشف دقیق برنده فوری است"}
                </strong>
              </div>
              <Button
                onClick={() => {
                  codeBreakerAudio.play("ready_chime");
                  void actions.onSetReady(!mePlayer.is_ready);
                }}
                loading={busy}
                variant={mePlayer.is_ready ? "secondary" : "primary"}
              >
                {mePlayer.is_ready ? "لغو وضعیت آمادگی" : "✓ آماده‌ام — قفل و شروع رقابت!"}
              </Button>
            </div>
          )}

          {/* Past Rounds Archive Preserved Across Rematches */}
          {state.past_rounds.length > 0 && (
            <div className="stack stack--xs" style={{ paddingTop: "0.5rem" }}>
              <h4 style={{ margin: 0 }}>آرشیو راندهای قبلی این نشست (دست‌نخورده و محفوظ):</h4>
              {state.past_rounds.map((pr) => (
                <div key={pr.round_number} className="cb-attempt-row">
                  <span>
                    <strong>راند {pr.round_number}</strong> · کد مخفی سرور:{" "}
                    <strong style={{ fontFamily: "monospace", color: "#f3be58" }}>
                      {pr.secret_code}
                    </strong>
                  </span>
                  <div className="row row--xs">
                    <Badge tone={pr.winner_seat ? "gold" : "neutral"}>
                      {pr.winner_name ? `🏆 برنده: ${pr.winner_name}` : "بدون برنده"}
                    </Badge>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      زمان: {formatElapsedMs(pr.duration_ms)} · مجموع حدس‌ها: {pr.total_guesses}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // =========================================================================
  // 2. ACTIVE RACE & FINISHED REVEAL VIEW (WITH FULL PERSISTENT DUAL HISTORY)
  // =========================================================================
  const isFinished = state.status === "finished";
  const didIWin = isFinished && state.winner_seat !== null && state.winner_seat === seat;

  return (
    <div className="stack stack--lg">
      {/* Top Simultaneous Race Scoreboard & Live Server Stopwatch */}
      <div className="cb-hud">
        <div
          className={`cb-player-box cb-player-box--me ${state.winner_seat === seat ? "cb-player-box--winner" : ""}`}
        >
          <div className="stack stack--xs">
            <div className="row row--xs">
              <span
                className={`wg-presence-dot ${mePlayer?.connected !== false ? "wg-presence-dot--online" : "wg-presence-dot--offline"}`}
              />
              <strong>{mePlayer?.name ?? "شما"} (شما)</strong>
              <Badge tone="gold">{mePlayer?.wins ?? 0} برد</Badge>
            </div>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              تلاش‌های ثبت‌شده شما: <strong>{state.my_guesses.length}</strong>
              {state.max_attempts_per_player ? ` / ${state.max_attempts_per_player}` : " (نامحدود)"}
            </span>
          </div>
          <Badge tone="success">صندلی {seat ?? 1}</Badge>
        </div>

        <div className="stack stack--xs" style={{ textAlign: "center" }}>
          <div className="row row--xs" style={{ justifyContent: "center" }}>
            <Badge tone={isFinished ? "gold" : "success"}>
              {isFinished ? `پایان راند ${state.current_round}` : `رقابت هم‌زمان زنده · راند ${state.current_round}`}
            </Badge>
            {!isSolo && <Badge tone="neutral">اتاق {state.room_code}</Badge>}
          </div>
          <div className="cb-clock" data-testid="round-elapsed-timer">
            {formatElapsedMs(liveElapsedMs)}
          </div>
          <div className="row row--xs" style={{ justifyContent: "center" }}>
            <Button size="sm" variant="ghost" onClick={toggleSound}>
              {muted ? "🔇 بی‌صدا" : "🔊 صدا"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => actions.onLeave()}>
              خروج
            </Button>
          </div>
        </div>

        <div
          className={`cb-player-box ${oppPlayer && state.winner_seat === oppPlayer.seat ? "cb-player-box--winner" : ""}`}
        >
          <div className="stack stack--xs">
            <div className="row row--xs">
              <span
                className={`wg-presence-dot ${oppPlayer?.connected ? "wg-presence-dot--online" : "wg-presence-dot--offline"}`}
              />
              <strong>{oppPlayer?.name ?? "رقیب"}</strong>
              <Badge tone="info">{oppPlayer?.wins ?? 0} برد</Badge>
            </div>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              تلاش‌های ثبت‌شده رقیب: <strong>{state.opponent_guesses.length}</strong>
              {state.max_attempts_per_player ? ` / ${state.max_attempts_per_player}` : " (نامحدود)"}
            </span>
          </div>
          <Badge tone="info">رقیب</Badge>
        </div>
      </div>

      {/* End-of-Round Secret Reveal Banner (Reveals exact 4-digit secret code while keeping full dual history below!) */}
      {isFinished && (
        <Card
          data-testid="round-result-banner"
          className="stack stack--md"
          style={{
            borderColor: didIWin ? "#10b981" : "#f59e0b",
            background: didIWin
              ? "radial-gradient(120% 120% at 100% 0%, rgba(16, 185, 129, 0.2), var(--surface-1) 62%)"
              : "radial-gradient(120% 120% at 100% 0%, rgba(245, 158, 11, 0.16), var(--surface-1) 62%)",
          }}
        >
          <div className="row row--between row--wrap" style={{ gap: "1rem" }}>
            <div className="stack stack--xs">
              <div className="row row--xs">
                <Badge tone={didIWin ? "success" : "gold"}>
                  {state.winner_seat === null
                    ? "پایان راند بدون کشف کد"
                    : didIWin
                      ? "🏆 پیروزی قاطع! شما زودتر کد مخفی را شکستید!"
                      : `⚡ ${state.winner_name ?? "رقیب"} زودتر کد مخفی را کشف کرد!`}
                </Badge>
                <Badge tone="info">زمان ثبت‌شده راند: {formatElapsedMs(state.elapsed_ms)}</Badge>
              </div>
              <h2 style={{ margin: 0 }}>
                کد مخفی ۴ رقمی سرور بازگشایی شد:{" "}
                <span
                  data-testid="revealed-secret-code"
                  style={{
                    fontFamily: "monospace",
                    letterSpacing: "0.2em",
                    color: "#f3be58",
                    direction: "ltr",
                    display: "inline-block",
                  }}
                >
                  {state.secret_code ?? "----"}
                </span>
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                تمام تاریخچه حدس‌ها، رنگ‌های هر جایگاه و زمان‌های دقیق ثبت هر دو بازیکن در پایین صفحه حفظ شده است تا بتوانید مسیر استنتاج را بررسی کنید.
              </p>
            </div>

            <div className="row row--sm row--wrap">
              <Button onClick={() => actions.onRematch()} loading={busy}>
                🔄 بازی مجدد (Rematch — کد مخفی جدید)
              </Button>
              <Button variant="ghost" onClick={() => actions.onLeave()}>
                بازگشت به لابی رمزگشا
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Main Tactical Layout: Left Vault Input Keypad + Right Live Dual Player Histories */}
      <div className="cb-console-grid">
        {/* Vault Code Input & Scratchpad Panel */}
        <Card className="stack stack--md">
          <div className="row row--between">
            <h3 style={{ margin: 0 }}>🔐 پنل ارسال کد ۴ رقمی</h3>
            <Badge tone={isFinished ? "neutral" : "success"}>
              {isFinished ? "قفل پایان راند" : "ارسال آزاد و هم‌زمان"}
            </Badge>
          </div>

          <p className="muted" style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.65 }}>
            نوبتی در کار نیست! هر زمان کد ۴ رقمی خود (شامل صفر ابتدایی مثل{" "}
            <code style={{ color: "#f3be58" }}>0072</code> یا ارقام تکراری مثل{" "}
            <code style={{ color: "#f3be58" }}>9090</code>) را وارد کنید، سرور بلافاصله آن را ارزیابی و ثبت می‌کند.
          </p>

          {/* 4 LTR Combination Reel Slots */}
          <div className="cb-slots" role="group" aria-label="ورودی کد ۴ رقمی">
            {slots.map((val, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isFinished}
                data-testid={`code-slot-${idx}`}
                onClick={() => setActiveSlot(idx)}
                className={`cb-slot ${!isFinished && activeSlot === idx ? "cb-slot--active" : ""}`}
              >
                {val !== "" ? val : "·"}
              </button>
            ))}
          </div>

          {localError && (
            <div style={{ color: "#fca5a5", fontSize: "0.84rem", fontWeight: 600 }}>
              ⚠ {localError}
            </div>
          )}

          {/* Tactile 0-9 Numeric Keypad */}
          <div className="cb-keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
              <button
                key={digit}
                type="button"
                data-testid={`keypad-${digit}`}
                disabled={isFinished || busy}
                onClick={() => pushDigit(digit)}
                className="cb-key"
              >
                {digit}
              </button>
            ))}
          </div>

          <div className="row row--sm">
            <Button
              type="button"
              data-testid="submit-guess-btn"
              onClick={() => void submitCurrentSlots()}
              disabled={isFinished || slots.some((s) => s === "")}
              loading={busy}
              style={{ flex: 1 }}
            >
              ثبت و بررسی فوری کد ↵
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isFinished || busy}
              onClick={handleBackspace}
            >
              ⌫ اصلاح
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isFinished || busy}
              onClick={handleClearSlots}
            >
              پاک
            </Button>
          </div>

          {/* Personal 0-9 Deduction Scratchpad */}
          <div className="stack stack--xs" style={{ paddingTop: "0.35rem" }}>
            <div className="row row--between">
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#cbd5e1" }}>
                یادداشت تحلیلی شخصی ارقام (فقط برای شما):
              </span>
              {Object.keys(scratch).length > 0 && (
                <button
                  type="button"
                  onClick={() => setScratch({})}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                  }}
                >
                  بازنشانی یادداشت
                </button>
              )}
            </div>
            <div className="cb-scratchpad">
              {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => {
                const st = scratch[d] ?? "neutral";
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => cycleScratch(d)}
                    className={`cb-scratch-btn ${st === "ruled_out" ? "cb-scratch-btn--ruled-out" : st === "confirmed" ? "cb-scratch-btn--confirmed" : ""}`}
                    title="کلیک اول: خط زدن (قرمز) · کلیک دوم: تایید وجود (سبز) · کلیک سوم: عادی"
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compact Color Legend */}
          <div
            className="stack stack--xs"
            style={{
              fontSize: "0.78rem",
              padding: "0.65rem 0.75rem",
              borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div>
              <strong style={{ color: "#6ee7b7" }}>🟢 سبز (P1..P4):</strong> رقم درست در جایگاه کاملاً درست.
            </div>
            <div>
              <strong style={{ color: "#fcd34d" }}>🟡 زرد (بدون شمارش مضاعف):</strong> رقم در کد مخفی هست ولی در جایگاه دیگری است.
            </div>
            <div>
              <strong style={{ color: "#fca5a5" }}>🔴 قرمز:</strong> این رقم (یا تکرار اضافی آن) در کد مخفی وجود ندارد.
            </div>
          </div>
        </Card>

        {/* Detailed Persistent Dual History Board */}
        <div className="stack stack--md">
          <div className="row row--between row--wrap" style={{ gap: "0.5rem" }}>
            <div className="stack stack--xs">
              <h3 style={{ margin: 0 }}>📊 تابلوی کامل تاریخچه تلاش‌های هر دو بازیکن</h3>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                مجموع حدس‌های ثبت‌شده در سرور: <strong>{state.all_guesses.length}</strong> تلاش (هیچ حدسی هرگز حذف یا بازنویسی نمی‌شود)
              </span>
            </div>

            <div className="row row--xs">
              <Button
                size="sm"
                variant={historyTab === "split" ? "primary" : "secondary"}
                onClick={() => setHistoryTab("split")}
              >
                تفکیک بازیکن‌ها ({state.my_guesses.length} | {state.opponent_guesses.length})
              </Button>
              <Button
                size="sm"
                variant={historyTab === "timeline" ? "primary" : "secondary"}
                onClick={() => setHistoryTab("timeline")}
              >
                ترتیب زمانی سرور ({state.all_guesses.length})
              </Button>
            </div>
          </div>

          {historyTab === "split" ? (
            <div className="cb-history-columns">
              {/* Column 1: My Complete Guess History */}
              <Card className="stack stack--sm" data-testid="my-history-panel">
                <div className="row row--between">
                  <strong style={{ color: "#6ee7b7" }}>
                    🟢 تاریخچه تلاش‌های شما ({mePlayer?.name ?? "شما"})
                  </strong>
                  <Badge tone="success">{state.my_guesses.length} تلاش</Badge>
                </div>

                {myReversed.length === 0 ? (
                  <p className="muted" style={{ fontSize: "0.85rem", paddingBlock: "1rem" }}>
                    هنوز حدسی ثبت نکرده‌اید. اولین کد ۴ رقمی خود را وارد کنید تا تحلیل دقیق جایگاه‌ها نمایش داده شود.
                  </p>
                ) : (
                  <div className="cb-history-list">
                    {myReversed.map((g, idx) => (
                      <AttemptCard key={g.id} guess={g} isMine={true} isLatest={idx === 0} />
                    ))}
                  </div>
                )}
              </Card>

              {/* Column 2: Opponent's Complete Synchronized Guess History */}
              <Card className="stack stack--sm" data-testid="opponent-history-panel">
                <div className="row row--between">
                  <strong style={{ color: "#93c5fd" }}>
                    🔵 تاریخچه تلاش‌های رقیب ({oppPlayer?.name ?? "رقیب"})
                  </strong>
                  <Badge tone="info">{state.opponent_guesses.length} تلاش</Badge>
                </div>

                {oppReversed.length === 0 ? (
                  <p className="muted" style={{ fontSize: "0.85rem", paddingBlock: "1rem" }}>
                    رقیب هنوز حدسی ارسال نکرده است؛ به‌محض ثبت هر تلاش، کد، رنگ هر جایگاه و زمان سرور اینجا ظاهر می‌شود.
                  </p>
                ) : (
                  <div className="cb-history-list">
                    {oppReversed.map((g, idx) => (
                      <AttemptCard key={g.id} guess={g} isMine={false} isLatest={idx === 0} />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <Card className="stack stack--sm" data-testid="timeline-history-panel">
              <div className="row row--between">
                <strong>⏱ جدول زمانی یکپارچه سرور (بر اساس ترتیب دقیق دریافت در سرور)</strong>
                <Badge tone="gold">{state.all_guesses.length} رویداد</Badge>
              </div>
              {allReversed.length === 0 ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  هنوز هیچ تلاشی توسط بازیکنان در این راند ثبت نشده است.
                </p>
              ) : (
                <div className="cb-history-list">
                  {allReversed.map((g, idx) => (
                    <AttemptCard
                      key={g.id}
                      guess={g}
                      isMine={g.seat === seat}
                      isLatest={idx === 0}
                    />
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
