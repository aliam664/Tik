import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Eye, Play, ShieldAlert, Sparkles, Timer, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  adminAiStorage,
  chooseBestMove,
  computeHumanDelayMs,
  evaluateAllMoves,
  type AdminAiSettings,
  type AiDelayPreset,
} from "@/game/ai";
import { OTHER_SYMBOL, type Board, type PlayerSymbol } from "@/game/engine";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";
import { adminSession } from "@/lib/session";
import type { RoomState } from "@/types/api";

export interface AdminAiHudProps {
  roomCode: string;
  state: RoomState;
  board: Board;
  mySymbol: PlayerSymbol;
  pendingCell: number | null;
  onPlayMove: (cell: number) => Promise<boolean>;
  onRequestRematch: () => Promise<boolean>;
  onRefresh: () => Promise<void>;
}

const DELAY_LABELS: Record<AiDelayPreset, string> = {
  fast: "سریع (۱ تا ۱.۸ ثانیه)",
  natural: "طبیعی (۱.۸ تا ۳.۱ ثانیه)",
  thoughtful: "متفکر (۲.۵ تا ۴.۱ ثانیه)",
};

export function AdminAiHud({
  roomCode,
  state,
  board,
  mySymbol,
  pendingCell,
  onPlayMove,
  onRequestRematch,
  onRefresh,
}: AdminAiHudProps) {
  const { showToast } = useToast();
  const session = adminSession.load();
  const [settings, setSettings] = useState<AdminAiSettings>(() => adminAiStorage.load());
  const [thinkingLeftMs, setThinkingLeftMs] = useState<number | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const scheduledMoveVersionRef = useRef<number>(-1);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const updateSettings = (patch: Partial<AdminAiSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      adminAiStorage.save(next);
      return next;
    });
  };

  const evaluations = useMemo(
    () => (state.status === "active" ? evaluateAllMoves(board, mySymbol) : []),
    [board, mySymbol, state.status],
  );

  const bestMove = useMemo(
    () => (state.status === "active" ? chooseBestMove(board, mySymbol) : null),
    [board, mySymbol, state.status],
  );

  const isMyTurn = state.status === "active" && state.current_turn === mySymbol;

  /* ---------------- Human-like delayed auto-play ---------------- */
  useEffect(() => {
    const clearTimers = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (countdownRef.current !== null) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setThinkingLeftMs(null);
    };

    if (!session || !settings.enabled || !isMyTurn || pendingCell !== null || !bestMove) {
      clearTimers();
      return;
    }

    if (scheduledMoveVersionRef.current === state.version) {
      return;
    }

    const delayMs = computeHumanDelayMs(board, settings.delayPreset);
    const targetCell = bestMove.cell;
    const startedAt = Date.now();
    setThinkingLeftMs(delayMs);

    countdownRef.current = window.setInterval(() => {
      const rem = Math.max(0, delayMs - (Date.now() - startedAt));
      setThinkingLeftMs(rem);
    }, 100);

    timerRef.current = window.setTimeout(() => {
      clearTimers();
      scheduledMoveVersionRef.current = state.version;
      void onPlayMove(targetCell);
    }, delayMs);

    return clearTimers;
  }, [
    bestMove,
    board,
    isMyTurn,
    onPlayMove,
    pendingCell,
    session,
    settings.delayPreset,
    settings.enabled,
    state.version,
  ]);

  /* ---------------- Optional auto-rematch ---------------- */
  useEffect(() => {
    if (
      session &&
      settings.autoRematch &&
      state.status === "finished" &&
      state.rematch_requested_by !== mySymbol
    ) {
      const id = window.setTimeout(() => {
        void onRequestRematch();
      }, 2000);
      return () => window.clearTimeout(id);
    }
  }, [
    mySymbol,
    onRequestRematch,
    session,
    settings.autoRematch,
    state.rematch_requested_by,
    state.status,
  ]);

  if (!session) return null;

  const opponentSymbol = OTHER_SYMBOL[mySymbol];

  const forceWinByKick = async () => {
    setAdminBusy(true);
    try {
      await adminApi.kickPlayer(session.token, {
        roomCode,
        symbol: opponentSymbol,
        reason: "اخراج حریف توسط مدیر در اتاق بازی",
      });
      showToast("حریف اخراج شد و برد فنی برای شما ثبت گردید.", "success");
      await onRefresh();
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <aside className="admin-ai-hud" aria-label="دستیار هوش مصنوعی ادمین">
      <div className="admin-ai-hud__top">
        <div className="admin-ai-hud__brand">
          <span className="admin-ai-hud__badge">
            <Bot size={16} aria-hidden="true" />
            AI شکست‌ناپذیر ادمین
          </span>
          <span className="admin-ai-hud__status">
            {settings.enabled ? "خلبان خودکار فعال" : "حالت دستی (پیشنهادگر)"}
          </span>
        </div>

        <div className="admin-ai-hud__toggles">
          <button
            type="button"
            className={`ai-pill-btn ${settings.enabled ? "ai-pill-btn--on" : ""}`}
            onClick={() => updateSettings({ enabled: !settings.enabled })}
          >
            <Zap size={13} aria-hidden="true" />
            {settings.enabled ? "بازی خودکار: روشن" : "بازی خودکار: خاموش"}
          </button>
          <button
            type="button"
            className={`ai-pill-btn ${settings.showHints ? "ai-pill-btn--on" : ""}`}
            onClick={() => updateSettings({ showHints: !settings.showHints })}
          >
            <Eye size={13} aria-hidden="true" />
            تحلیل خانه‌ها
          </button>
        </div>
      </div>

      <div className="admin-ai-hud__controls">
        <div className="admin-ai-hud__delays" role="group" aria-label="مکث طبیعی حرکت">
          <span className="admin-ai-hud__label">
            <Timer size={13} aria-hidden="true" /> مکث طبیعی:
          </span>
          {(["fast", "natural", "thoughtful"] as AiDelayPreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className={`ai-delay-chip ${settings.delayPreset === preset ? "ai-delay-chip--active" : ""}`}
              onClick={() => updateSettings({ delayPreset: preset })}
            >
              {DELAY_LABELS[preset]}
            </button>
          ))}
        </div>
      </div>

      {state.status === "active" && bestMove ? (
        <div className="admin-ai-hud__intel">
          <div className="admin-ai-hud__verdict">
            <Sparkles size={15} aria-hidden="true" />
            <div>
              <strong>
                پیشنهاد اول: خانه {toFaDigits(bestMove.cell + 1)} — {bestMove.reasonFa}
              </strong>
              <p>
                {thinkingLeftMs !== null ? (
                  <span className="ai-thinking-indicator">
                    در حال شبیه‌سازی مکث انسان… اجرای خودکار تا{" "}
                    <strong className="ltr">{toFaDigits((thinkingLeftMs / 1000).toFixed(1))}s</strong>
                  </span>
                ) : isMyTurn ? (
                  "نوبت شماست — آماده اجرای حرکت بهینه"
                ) : (
                  "در انتظار حرکت حریف (پاسخ ضدحمله آماده است)"
                )}
              </p>
            </div>
          </div>

          <div className="admin-ai-hud__actions">
            {isMyTurn ? (
              <Button
                size="sm"
                icon={<Play size={14} aria-hidden="true" />}
                disabled={pendingCell !== null}
                onClick={() => {
                  scheduledMoveVersionRef.current = state.version;
                  void onPlayMove(bestMove.cell);
                }}
              >
                اجرای فوری خانه {toFaDigits(bestMove.cell + 1)}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="danger"
              loading={adminBusy}
              icon={<ShieldAlert size={14} aria-hidden="true" />}
              onClick={() => void forceWinByKick()}
            >
              اخراج حریف (برد فنی)
            </Button>
          </div>
        </div>
      ) : null}

      {settings.showHints && state.status === "active" && evaluations.length > 0 ? (
        <div className="ai-eval-grid" dir="ltr" aria-label="امتیاز استراتژیک خانه‌ها">
          {board.map((cellVal, idx) => {
            const ev = evaluations.find((e) => e.cell === idx);
            const isBest = bestMove?.cell === idx;
            return (
              <div
                key={idx}
                className={`ai-eval-cell ${
                  cellVal
                    ? "ai-eval-cell--taken"
                    : isBest
                      ? "ai-eval-cell--best"
                      : ev && ev.minimaxScore < 0
                        ? "ai-eval-cell--bad"
                        : "ai-eval-cell--ok"
                }`}
              >
                <span className="ai-eval-cell__num">#{idx + 1}</span>
                <strong className="ai-eval-cell__val">
                  {cellVal
                    ? cellVal
                    : isBest
                      ? "★ بهترین"
                      : ev
                        ? ev.minimaxScore > 0
                          ? "برد"
                          : ev.minimaxScore === 0
                            ? "امن"
                            : "خطر"
                        : "—"}
                </strong>
              </div>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
