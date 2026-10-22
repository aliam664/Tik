import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { validateClueText } from "@/games/wordGame/normalize";
import { wordCipherAudio } from "@/games/wordGame/sound";
import type {
  AnswerOutcome,
  RoundWordCard,
  WordDifficulty,
  WordRoomStateResponse,
} from "@/types/wordGame";
import { Badge, Card } from "./WordUiPrimitives";

export interface WordCipherArenaActions {
  onSelectTarget: (wordId: string) => Promise<boolean | void> | boolean | void;
  onSubmitClue: (
    clueText: string,
    kind: "association" | "category" | "narrowing",
  ) => Promise<boolean | void> | boolean | void;
  onRequestHint: () => Promise<boolean | void> | boolean | void;
  onSubmitGuess: (guessText: string) => Promise<boolean | void> | boolean | void;
  onNextRound: (expectedRound: number) => Promise<boolean | void> | boolean | void;
  onRematch: () => Promise<boolean | void> | boolean | void;
  onLeave: () => Promise<void> | void;
  onTimerExpired?: () => Promise<void> | void;
}

interface WordCipherArenaViewProps {
  snapshot: WordRoomStateResponse;
  isSolo?: boolean;
  busy?: boolean;
  actions: WordCipherArenaActions;
}

const DIFF_LABELS: Record<WordDifficulty, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "دشوار",
};

const OUTCOME_LABELS: Record<AnswerOutcome, { label: string; desc: string }> = {
  correct: {
    label: "پاسخ درست ✓",
    desc: "دقیقاً خودِ واژه هدف حدس زده شد!",
  },
  related: {
    label: "مرتبط با هدف ✦",
    desc: "نزدیک شدی! این واژه از نظر معنایی مرتبط است (+امتیاز تشویقی)، اما خودِ واژه مخفی نیست.",
  },
  incorrect: {
    label: "نادرست ✕",
    desc: "با واژه مخفی تطابق نداشت؛ از سرنخ بعدی برای محدودتر کردن گزینه‌ها کمک بگیر.",
  },
};

export function WordCipherArenaView({
  snapshot,
  isSolo = false,
  busy = false,
  actions,
}: WordCipherArenaViewProps) {
  const { seat, my_role, state, evaluation } = snapshot;
  const round = state.round;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [clueInput, setClueInput] = useState("");
  const [clueKind, setClueKind] = useState<"association" | "category" | "narrowing">("association");
  const [guessInput, setGuessInput] = useState("");
  const [localHintError, setLocalHintError] = useState<string | null>(null);
  const [muted, setMuted] = useState(wordCipherAudio.muted);
  const [countdown, setCountdown] = useState<number | null>(
    round?.remaining_seconds ?? null,
  );

  const onTimerExpiredRef = useRef(actions.onTimerExpired);
  useEffect(() => {
    onTimerExpiredRef.current = actions.onTimerExpired;
  }, [actions.onTimerExpired]);
  const firedTimeoutKeyRef = useRef<string | null>(null);

  // Sync live countdown second-by-second from server remaining_seconds + monotonic clock
  const serverRemaining = round?.remaining_seconds ?? null;
  const roundDeadlineKey = `${state.game_number}:${state.current_round}:${round?.deadline_at ?? "none"}`;

  useEffect(() => {
    setCountdown(serverRemaining);
    if (
      serverRemaining === null ||
      round?.phase === "round_result" ||
      state.status === "finished"
    ) {
      return;
    }
    if (serverRemaining <= 0) {
      if (firedTimeoutKeyRef.current !== roundDeadlineKey) {
        firedTimeoutKeyRef.current = roundDeadlineKey;
        void onTimerExpiredRef.current?.();
      }
      return;
    }
    const anchorPerf = performance.now();
    const timer = window.setInterval(() => {
      const elapsedSec = Math.floor((performance.now() - anchorPerf) / 1000);
      const rem = Math.max(0, serverRemaining - elapsedSec);
      setCountdown(rem);
      if (rem === 0 && firedTimeoutKeyRef.current !== roundDeadlineKey) {
        firedTimeoutKeyRef.current = roundDeadlineKey;
        void onTimerExpiredRef.current?.();
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [serverRemaining, roundDeadlineKey, round?.phase, state.status]);

  // Reset local selection when round changes
  useEffect(() => {
    setSelectedCardId(null);
    setClueInput("");
    setGuessInput("");
    setLocalHintError(null);
  }, [state.game_number, state.current_round]);

  // Group board cards into their 4 categories whenever visible
  const boardCards = round?.board_cards;
  const groupedCategories = useMemo(() => {
    if (!boardCards) return [];
    const map = new Map<
      string,
      {
        id: string;
        titleFa: string;
        titleEn: string;
        color: string;
        cards: RoundWordCard[];
      }
    >();
    for (const card of boardCards) {
      const existing = map.get(card.categoryId);
      if (existing) {
        existing.cards.push(card);
      } else {
        map.set(card.categoryId, {
          id: card.categoryId,
          titleFa: card.categoryTitleFa,
          titleEn: card.categoryTitleEn,
          color: card.categoryColor,
          cards: [card],
        });
      }
    }
    return Array.from(map.values());
  }, [boardCards]);

  const handleConfirmTarget = async () => {
    if (!selectedCardId || busy) return;
    wordCipherAudio.play("card_select");
    await actions.onSelectTarget(selectedCardId);
  };

  const handleSendClue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !clueInput.trim()) return;
    if (round?.target_word) {
      const check = validateClueText(clueInput, round.target_word, [
        round.target_word_en ?? "",
      ]);
      if (!check.valid) {
        setLocalHintError(
          check.code === "CLUE_CONTAINS_TARGET"
            ? "خودِ کلمه هدف یا معادل مستقیم آن نباید داخل سرنخ نوشته شود!"
            : "لطفاً یک سرنخ کوتاه و معتبر (۲ تا ۶۰ کاراکتر) وارد کنید.",
        );
        return;
      }
    }
    setLocalHintError(null);
    wordCipherAudio.play("clue_sent");
    const ok = await actions.onSubmitClue(clueInput, clueKind);
    if (ok !== false) {
      setClueInput("");
    }
  };

  const handleSendGuess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !guessInput.trim()) return;
    const ok = await actions.onSubmitGuess(guessInput);
    if (ok !== false) {
      setGuessInput("");
    }
  };

  const toggleSound = () => {
    wordCipherAudio.muted = !muted;
    setMuted(wordCipherAudio.muted);
  };

  const canRequestExtraHint = Boolean(
    round &&
      round.phase !== "selecting_word" &&
      round.phase !== "round_result" &&
      round.clues.length < state.rules.maxCluesPerRound &&
      round.system_hints_used < 2 &&
      (state.rules.extraClueMode !== "clue_giver_only" || my_role === "clue_giver"),
  );

  // =========================================================================
  // Match Finished Summary View
  // =========================================================================
  if (state.status === "finished") {
    const winnerPlayer = state.players.find((p) => p.seat === state.winner_seat);
    return (
      <div className="wg-arena stack stack--lg">
        <Card framed className="stack stack--md">
          <div className="row row--between row--wrap">
            <div className="stack stack--xs">
              <span className="g-kicker">MATCH REPORT</span>
              <Badge tone="gold">پایان مسابقه رازواژه · بازی #{state.game_number}</Badge>
              <h2>
                {state.is_draw
                  ? "مسابقه با نتیجه مساوی به پایان رسید!"
                  : `قهرمان مسابقه: ${winnerPlayer?.name ?? "بازیکن"} 🏆`}
              </h2>
              <p className="muted">
                مجموع {state.history.length} راند تداعی و حدس کلمات با چرخش کامل نقش‌ها برگزار شد.
              </p>
            </div>
            {state.settlement?.settled && (
              <div className="wg-secret-banner">
                <div>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    پاداش کیف‌پول Sheriff Coin
                  </div>
                  <strong style={{ color: "#f3be58", fontSize: "1.1rem" }}>
                    برنده +{state.settlement.win_reward_sh ?? 35} SH · مشارکت +
                    {state.settlement.play_reward_sh ?? 15} SH
                  </strong>
                </div>
              </div>
            )}
          </div>

          <div className="wg-config-grid">
            {state.players.map((p) => (
              <div
                key={p.seat}
                className={`wg-seat-card ${p.seat === state.winner_seat ? "wg-seat-card--active" : ""}`}
              >
                <div>
                  <strong>
                    {p.name} {p.seat === seat ? "(شما)" : ""}
                  </strong>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    حدس درست: {p.correct_guesses} · پاسخ مرتبط: {p.related_guesses} · راهنمایی موفق:{" "}
                    {p.successful_clues}
                  </div>
                </div>
                <span className="wg-score-pill">{p.score} امتیاز</span>
              </div>
            ))}
          </div>

          {state.history.length > 0 && (
            <div className="stack stack--sm">
              <h3>مرور راندهای بازی</h3>
              <div className="wg-guess-list">
                {state.history.map((h) => (
                  <div key={h.round_number} className="wg-guess-item">
                    <div>
                      <strong>
                        راند {h.round_number}: {h.target_word}
                      </strong>{" "}
                      <span className="muted">
                        ({h.category_title_fa} · {h.target_word_en})
                      </span>
                    </div>
                    <div className="row row--sm">
                      <Badge tone={h.outcome === "correct" ? "success" : "neutral"}>
                        {h.outcome === "correct"
                          ? `کشف شد با ${h.clues_used} سرنخ`
                          : "کشف نشد"}
                      </Badge>
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
                        حدس‌زننده +{h.guesser_points} | راهنما +{h.clue_giver_points}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="row row--sm row--wrap">
            <Button onClick={() => actions.onRematch()} loading={busy}>
              شروع مسابقه جدید (Rematch)
            </Button>
            <Button variant="ghost" onClick={() => actions.onLeave()}>
              خروج به لابی رازواژه
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // =========================================================================
  // Active Round Arena View
  // =========================================================================
  const p1 = state.players[0];
  const p2 = state.players[1];
  const activeTurnSeat =
    !round || round.phase === "round_result"
      ? null
      : round.phase === "guessing"
        ? round.guesser_seat
        : round.clue_giver_seat;

  const timerRatio =
    countdown !== null && state.rules.roundTimerSeconds > 0
      ? Math.max(0, Math.min(1, countdown / state.rules.roundTimerSeconds))
      : null;

  return (
    <div className="wg-arena stack stack--lg">
      {/* Top Scoreboard & Live Role HUD */}
      <div className="wg-hud g-frame">
        <span className="g-frame__c g-frame__c--tl" aria-hidden="true" />
        <span className="g-frame__c g-frame__c--tr" aria-hidden="true" />
        <span className="g-frame__c g-frame__c--bl" aria-hidden="true" />
        <span className="g-frame__c g-frame__c--br" aria-hidden="true" />
        {p1 && (
          <div
            className={`wg-seat-card ${activeTurnSeat === p1.seat ? "wg-seat-card--active" : ""} ${p1.seat === seat ? "wg-seat-card--me" : ""}`}
          >
            <div>
              <div>
                <span
                  className={`wg-presence-dot ${p1.connected ? "wg-presence-dot--online" : "wg-presence-dot--offline"}`}
                />
                <strong>
                  {p1.name} {p1.seat === seat ? "(شما)" : ""}
                </strong>
              </div>
              <div className="row row--xs" style={{ marginTop: 4 }}>
                <Badge tone={round?.clue_giver_seat === p1.seat ? "gold" : "info"}>
                  {round?.clue_giver_seat === p1.seat ? "🎴 راهنما (انتخاب و سرنخ)" : "🔍 حدس‌زننده"}
                </Badge>
              </div>
            </div>
            <span className="wg-score-pill">{p1.score}</span>
          </div>
        )}

        <div className="wg-hud-center">
          <span className="g-vs" aria-hidden="true">VS</span>
          <Badge tone="gold">
            راند {state.current_round} از {state.total_rounds}
          </Badge>
          {countdown !== null && round?.phase !== "round_result" && (
            <>
              <span className={`wg-timer ${countdown <= 20 ? "wg-timer--urgent" : ""}`}>
                ⏱ {Math.floor(countdown / 60)}:
                {String(countdown % 60).padStart(2, "0")}
              </span>
              {timerRatio !== null && (
                <div className="wg-timer-track" aria-hidden="true">
                  <div
                    className={`wg-timer-fill ${countdown <= 20 ? "wg-timer-fill--urgent" : ""}`}
                    style={{ width: `${timerRatio * 100}%` }}
                  />
                </div>
              )}
            </>
          )}
          <div className="row row--xs">
            <Button size="sm" variant="ghost" onClick={toggleSound}>
              {muted ? "🔇 بی‌صدا" : "🔊 صدا فعال"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => actions.onLeave()}>
              خروج
            </Button>
          </div>
        </div>

        {p2 && (
          <div
            className={`wg-seat-card ${activeTurnSeat === p2.seat ? "wg-seat-card--active" : ""} ${p2.seat === seat ? "wg-seat-card--me" : ""}`}
          >
            <div>
              <div>
                <span
                  className={`wg-presence-dot ${p2.connected ? "wg-presence-dot--online" : "wg-presence-dot--offline"}`}
                />
                <strong>
                  {p2.name} {p2.seat === seat ? "(شما)" : ""}
                </strong>
              </div>
              <div className="row row--xs" style={{ marginTop: 4 }}>
                <Badge tone={round?.clue_giver_seat === p2.seat ? "gold" : "info"}>
                  {round?.clue_giver_seat === p2.seat ? "🎴 راهنما (انتخاب و سرنخ)" : "🔍 حدس‌زننده"}
                </Badge>
              </div>
            </div>
            <span className="wg-score-pill">{p2.score}</span>
          </div>
        )}
      </div>

      {/* Live Evaluation Banner after Guess */}
      {evaluation && round?.phase !== "selecting_word" && (
        <div
          className={`wg-guess-item wg-eval-banner wg-outcome-${evaluation.outcome}`}
          role="status"
          aria-live="polite"
        >
          <div>
            <strong>{OUTCOME_LABELS[evaluation.outcome].label}</strong>{" "}
            <span>— {OUTCOME_LABELS[evaluation.outcome].desc}</span>
          </div>
          {evaluation.points_awarded > 0 && (
            <Badge tone="gold">+{evaluation.points_awarded} امتیاز</Badge>
          )}
        </div>
      )}

      {/* =====================================================================
          PHASE 1: Clue-Giver Selects Secret Word from 4x4 (16 Cards)
          ===================================================================== */}
      {round?.phase === "selecting_word" && my_role === "clue_giver" && (
        <Card framed className="stack stack--md">
          <div className="row row--between row--wrap">
            <div className="stack stack--xs">
              <span className="g-kicker">16-CARD TABLE</span>
              <Badge tone="gold">نوبت شما — نقش راهنما</Badge>
              <h2>یکی از ۱۶ واژه زیر را به‌عنوان «واژه مخفی» انتخاب کنید</h2>
              <p className="muted">
                واژه انتخابی شما تا پایان راند کاملاً از دید بازیکن حدس‌زننده پنهان می‌ماند. واژه‌های دشوارتر امتیاز ویژه بیشتری دارند!
              </p>
            </div>
            <Button
              disabled={!selectedCardId || busy}
              loading={busy}
              onClick={handleConfirmTarget}
            >
              قفل کردن واژه مخفی و ثبت سرنخ ←
            </Button>
          </div>

          <div className="wg-categories-grid">
            {groupedCategories.map((cat) => (
              <div
                key={cat.id}
                className="wg-cat-box"
                style={{ ["--cat-color" as string]: cat.color }}
              >
                <div className="wg-cat-header">
                  <span>{cat.titleFa}</span>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    {cat.titleEn}
                  </span>
                </div>
                <div className="wg-cards-subgrid">
                  {cat.cards.map((card) => {
                    const isSelected = selectedCardId === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        className={`wg-word-card ${isSelected ? "wg-word-card--selected" : ""}`}
                        onClick={() => {
                          setSelectedCardId(card.id);
                          wordCipherAudio.play("card_select");
                        }}
                      >
                        <span className="wg-word-card__fa">{card.word}</span>
                        <span className="wg-word-card__meta">
                          <span>{card.wordEn}</span>
                          <span className={`wg-diff wg-diff--${card.difficulty}`}>
                            {DIFF_LABELS[card.difficulty]}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Waiting Screen for Guesser while Clue-Giver Selects from 16 Cards */}
      {round?.phase === "selecting_word" && my_role !== "clue_giver" && (
        <Card className="stack stack--sm wg-waiting">
          <div className="wg-waiting__orb" aria-hidden="true" />
          <div>
            <Badge tone="info">نوبت شما در این راند: حدس‌زننده 🔍</Badge>
          </div>
          <h2>بازیکن راهنما در حال انتخاب واژه مخفی از میان ۱۶ کارت است...</h2>
          <p className="muted">
            برای حفظ یکپارچگی کامل بازی، کارت‌ها و واژه هدف هرگز به مرورگر شما ارسال نمی‌شوند تا پایان راند. به محض ثبت اولین سرنخ، صفحه به‌صورت خودکار به‌روزرسانی می‌شود.
          </p>
        </Card>
      )}

      {/* =====================================================================
          PHASES 2 & 3: Active Clue-Giving & Guessing Workspace
          ===================================================================== */}
      {round && (round.phase === "giving_clue" || round.phase === "guessing") && (
        <div className="wg-columns">
          {/* Left/Right Column 1: Clues & Active Turn Composer */}
          <Card className="stack stack--md">
            {my_role === "clue_giver" && round.target_word && (
              <div className="wg-secret-banner">
                <div>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    واژه مخفی انتخابی شما (مخفی از دید حریف):
                  </span>
                  <div style={{ fontSize: "1.35rem", fontWeight: 900, color: "#f3be58" }}>
                    {round.target_word}{" "}
                    <span className="muted" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                      ({round.target_word_en} · {round.target_category_fa})
                    </span>
                  </div>
                </div>
                {round.target_difficulty && (
                  <span className={`wg-diff wg-diff--${round.target_difficulty}`}>
                    {DIFF_LABELS[round.target_difficulty]}
                  </span>
                )}
              </div>
            )}

            <div className="row row--between row--wrap">
              <h3>
                سرنخ‌های این راند ({round.clues.length} از {state.rules.maxCluesPerRound})
              </h3>
              {canRequestExtraHint && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() => {
                    wordCipherAudio.play("hint_unlock");
                    void actions.onRequestHint();
                  }}
                >
                  ✨ افزودن واژه کمکی محدودکننده ({2 - round.system_hints_used} باقی‌مانده)
                </Button>
              )}
            </div>

            {round.clues.length === 0 ? (
              <p className="muted">هنوز سرنخی ثبت نشده است؛ اولین سرنخ تداعی را بنویسید.</p>
            ) : (
              <div className="wg-clue-list">
                {round.clues.map((c) => (
                  <div key={c.index} className="wg-clue-item">
                    <div>
                      <span className="muted" style={{ fontSize: "0.78rem", display: "block" }}>
                        سرنخ #{c.index} ·{" "}
                        {c.source === "system_hint" ? "واژه راهنمای کمکی" : "بازیکن راهنما"}
                      </span>
                      <span className="wg-clue-item__text">{c.text}</span>
                    </div>
                    <Badge tone={c.source === "system_hint" ? "gold" : "info"}>
                      {c.index === 1
                        ? "امتیاز کامل"
                        : c.index === 2
                          ? "محدودکننده ۱"
                          : "محدودکننده ۲"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Clue-Giver Form */}
            {my_role === "clue_giver" && round.phase === "giving_clue" && (
              <form onSubmit={handleSendClue} className="stack stack--sm wg-composer">
                <label className="stack stack--xs">
                  <span style={{ fontWeight: 700 }}>
                    {round.clues.length === 0
                      ? "سرنخ اول را بنویسید (بدون نوشتن خودِ کلمه هدف):"
                      : `سرنخ کمکی شماره ${round.clues.length + 1} برای نزدیک‌تر کردن هم‌تیمی/حریف:`}
                  </span>
                  <div className="row row--xs">
                    <input
                      className="input"
                      type="text"
                      maxLength={60}
                      placeholder="مثلاً: فوران گدازه، یا یک تداعی هوشمند..."
                      value={clueInput}
                      onChange={(e) => {
                        setClueInput(e.target.value);
                        if (localHintError) setLocalHintError(null);
                      }}
                    />
                    <select
                      className="input"
                      style={{ maxWidth: 155 }}
                      value={clueKind}
                      onChange={(e) =>
                        setClueKind(e.target.value as "association" | "category" | "narrowing")
                      }
                    >
                      <option value="association">تداعی معنایی</option>
                      <option value="category">اشاره دسته‌ای</option>
                      <option value="narrowing">محدودکننده</option>
                    </select>
                  </div>
                </label>

                {round.suggested_hints && round.suggested_hints.length > 0 && (
                  <div>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>
                      پیشنهادهای سریع از بانک واژگان (کلیک برای درج در کادر):
                    </span>
                    <div className="wg-hint-chips">
                      {round.suggested_hints.map((h) => (
                        <Button
                          key={h}
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setClueInput(h)}
                        >
                          + {h}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {localHintError && (
                  <p style={{ color: "#f87171", fontSize: "0.88rem", margin: 0 }}>
                    {localHintError}
                  </p>
                )}

                <Button type="submit" loading={busy} disabled={!clueInput.trim() || busy}>
                  ارسال سرنخ به حدس‌زننده ←
                </Button>
              </form>
            )}

            {my_role === "clue_giver" && round.phase === "guessing" && (
              <p className="muted">
                سرنخ ارسال شد! منتظر ثبت حدس توسط بازیکن حدس‌زننده باشید...
              </p>
            )}

            {/* Guesser Input Form */}
            {my_role === "guesser" && round.phase === "guessing" && (
              <form onSubmit={handleSendGuess} className="stack stack--sm wg-composer">
                <label className="stack stack--xs">
                  <span style={{ fontWeight: 700 }}>
                    حدس شما چیست؟ (تلاش {round.guesses.length + 1} از{" "}
                    {state.rules.maxGuessesPerRound})
                  </span>
                  <input
                    className="input"
                    type="text"
                    maxLength={60}
                    autoFocus
                    placeholder="واژه مورد نظر را به فارسی یا انگلیسی بنویسید..."
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                  />
                </label>
                <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
                  پشتیبانی خودکار از «ی/ي»، «ک/ك»، نیم‌فاصله، مترادف‌ها و خطای تایپی جزئی.
                </p>
                <Button type="submit" loading={busy} disabled={!guessInput.trim() || busy}>
                  ثبت و بررسی حدس 🔍
                </Button>
              </form>
            )}

            {my_role === "guesser" && round.phase === "giving_clue" && (
              <p className="muted">
                بازیکن راهنما در حال نوشتن سرنخ بعدی برای محدودتر کردن گزینه‌هاست...
              </p>
            )}
          </Card>

          {/* Column 2: Previous Attempts + Optional Visible Categories / Clue-Giver Board */}
          <Card className="stack stack--md">
            <h3>
              تاریخچه حدس‌های این راند ({round.guesses.length} از{" "}
              {state.rules.maxGuessesPerRound})
            </h3>
            {round.guesses.length === 0 ? (
              <p className="muted">هنوز حدسی در این راند ثبت نشده است.</p>
            ) : (
              <div className="wg-guess-list">
                {round.guesses.map((g) => (
                  <div
                    key={g.index}
                    className={`wg-guess-item wg-outcome-${g.outcome}`}
                  >
                    <div>
                      <strong>{g.guess_text}</strong>
                      <span className="muted" style={{ fontSize: "0.8rem", display: "block" }}>
                        توسط {g.player_name} · پس از سرنخ #{g.clue_count_when_guessed}
                      </span>
                    </div>
                    <Badge
                      tone={
                        g.outcome === "correct"
                          ? "success"
                          : g.outcome === "related"
                            ? "gold"
                            : "danger"
                      }
                    >
                      {OUTCOME_LABELS[g.outcome].label}
                      {g.points_awarded > 0 ? ` (+${g.points_awarded})` : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {round.visible_categories.length > 0 && !round.board_cards && (
              <div className="stack stack--xs">
                <span className="muted" style={{ fontSize: "0.84rem" }}>
                  ۴ دسته‌بندی فعال این راند:
                </span>
                <div className="row row--xs row--wrap">
                  {round.visible_categories.map((c) => (
                    <Badge key={c.id} tone="neutral">
                      {c.titleFa} ({c.titleEn})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {groupedCategories.length > 0 && (
              <div className="stack stack--sm">
                <span className="muted" style={{ fontSize: "0.84rem" }}>
                  {my_role === "clue_giver"
                    ? "نمای ۱۶ کارت این راند (فقط قابل مشاهده برای شما):"
                    : "۱۶ کارت این راند (طبق تنظیمات اتاق):"}
                </span>
                <div className="wg-categories-grid">
                  {groupedCategories.map((cat) => (
                    <div
                      key={cat.id}
                      className="wg-cat-box"
                      style={{ ["--cat-color" as string]: cat.color }}
                    >
                      <div className="wg-cat-header">
                        <span>{cat.titleFa}</span>
                      </div>
                      <div className="wg-cards-subgrid">
                        {cat.cards.map((card) => (
                          <div
                            key={card.id}
                            className={`wg-word-card ${round.target_word_id === card.id ? "wg-word-card--target" : ""}`}
                          >
                            <span className="wg-word-card__fa">{card.word}</span>
                            <span className="wg-word-card__meta">
                              <span>{card.wordEn}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* =====================================================================
          PHASE 4: Round Result Reveal & Role Rotation Trigger
          ===================================================================== */}
      {round?.phase === "round_result" && (
        <Card className="stack stack--md">
          <div className="wg-secret-banner">
            <div className="stack stack--xs">
              <Badge
                tone={
                  round.round_result_summary?.outcome === "correct"
                    ? "success"
                    : "gold"
                }
              >
                {round.round_result_summary?.outcome === "correct"
                  ? "واژه مخفی با موفقیت کشف شد! 🎉"
                  : "پایان راند — رونمایی از واژه مخفی"}
              </Badge>
              <h2 style={{ margin: 0 }}>
                واژه مخفی: <span style={{ color: "#f3be58" }}>{round.target_word}</span>{" "}
                <span className="muted" style={{ fontSize: "1rem" }}>
                  ({round.target_word_en} · دسته «{round.target_category_fa}»)
                </span>
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                امتیاز حدس‌زننده در این راند:{" "}
                <strong>+{round.round_result_summary?.guesser_points ?? 0}</strong> · امتیاز
                بازیکن راهنما:{" "}
                <strong>+{round.round_result_summary?.clue_giver_points ?? 0}</strong>
              </p>
            </div>

            <Button
              loading={busy}
              onClick={() => {
                wordCipherAudio.play("round_next");
                void actions.onNextRound(round.round_number);
              }}
            >
              {state.current_round >= state.total_rounds
                ? "مشاهده نتیجه نهایی مسابقه 🏆"
                : `شروع راند ${state.current_round + 1} و جابه‌جایی نقش‌ها ←`}
            </Button>
          </div>

          {groupedCategories.length > 0 && (
            <div className="stack stack--sm">
              <h3>هر ۱۶ کارت حاضر در این راند (کارت طلایی = واژه هدف)</h3>
              <div className="wg-categories-grid">
                {groupedCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="wg-cat-box"
                    style={{ ["--cat-color" as string]: cat.color }}
                  >
                    <div className="wg-cat-header">
                      <span>{cat.titleFa}</span>
                      <span className="muted" style={{ fontSize: "0.78rem" }}>
                        {cat.titleEn}
                      </span>
                    </div>
                    <div className="wg-cards-subgrid">
                      {cat.cards.map((card) => (
                        <div
                          key={card.id}
                          className={`wg-word-card ${round.target_word_id === card.id ? "wg-word-card--target" : ""}`}
                        >
                          <span className="wg-word-card__fa">{card.word}</span>
                          <span className="wg-word-card__meta">
                            <span>{card.wordEn}</span>
                            <span className={`wg-diff wg-diff--${card.difficulty}`}>
                              {DIFF_LABELS[card.difficulty]}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isSolo && (
            <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
              حالت تمرین تک‌نفره: در راند بعدی نقش شما و هوش مصنوعی رازواژه جابه‌جا می‌شود!
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
