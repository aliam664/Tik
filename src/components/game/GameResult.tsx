import { Handshake, RotateCcw, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import type { PlayerSymbol, RoomState } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { CoinAmount, TierBadge } from "@/components/ui/Coin";
import { tierForRating } from "@/lib/elo";
import { toFaDigits } from "@/lib/format";

export interface GameResultProps {
  state: RoomState;
  mySymbol: PlayerSymbol | null;
  rematchPending: boolean;
  onRequestRematch: () => void;
}

/** Outcome card shown after a game ends (win / loss / draw) with reward summary + rematch flow. */
export function GameResult({
  state,
  mySymbol,
  rematchPending,
  onRequestRematch,
}: GameResultProps) {
  const iWon = state.winner !== null && state.winner === mySymbol;
  const iLost = state.winner !== null && state.winner !== mySymbol;
  const settlement = state.settlement && state.settlement.settled ? state.settlement : null;

  const headline = !mySymbol
    ? state.is_draw
      ? "بازی مساوی تمام شد"
      : `برد بازیکن ${state.winner === "X" ? "ایکس" : "او"}`
    : iWon
      ? state.forfeit
        ? "برد شما (باخت حریف)! 🎉"
        : "برد شما! 🎉"
      : iLost
        ? state.forfeit
          ? "باخت (خروج از بازی)"
          : "باخت"
        : "مساوی";

  const opponentRequested =
    state.rematch_requested_by !== null && state.rematch_requested_by !== mySymbol;
  const iRequested = state.rematch_requested_by === mySymbol;

  /* reward summary for competitive modes */
  const myCoins =
    settlement && mySymbol
      ? mySymbol === "X"
        ? settlement.coins_x ?? 0
        : settlement.coins_o ?? 0
      : null;
  const myRating =
    settlement && mySymbol
      ? mySymbol === "X"
        ? settlement.rating_x
        : settlement.rating_o
      : null;
  const isCompetitive = state.mode !== "friendly";

  return (
    <section className="result-card" aria-live="polite">
      <span className={`result-card__icon ${iWon ? "result-card__icon--win" : ""}`}>
        {state.is_draw ? <Handshake size={30} aria-hidden="true" /> : <Trophy size={30} aria-hidden="true" />}
      </span>
      <h2 className="result-card__title">{headline}</h2>
      <p className="result-card__sub">
        {state.forfeit
          ? "یکی از بازیکنان از بازی خارج شد — نتیجه باخت فنی ثبت شد."
          : state.is_draw
            ? "هیچ‌کس برنده نشد — بازی را تکرار کنید!"
            : `بازیکن ${state.winner === "X" ? "ایکس" : "او"} سه علامت در یک خط ساخت.`}
      </p>

      {isCompetitive && (myCoins !== null || myRating) ? (
        <div className="result-rewards">
          {myRating ? (
            <div className="result-rewards__row">
              <span className="result-rewards__label">امتیاز رنک</span>
              <span
                className={`result-rewards__delta ${
                  myRating.after - myRating.before >= 0 ? "delta-pos" : "delta-neg"
                }`}
              >
                {(myRating.after - myRating.before) >= 0 ? (
                  <TrendingUp size={15} aria-hidden="true" />
                ) : (
                  <TrendingDown size={15} aria-hidden="true" />
                )}
                <span className="ltr">
                  {myRating.after - myRating.before >= 0 ? "+" : "−"}
                  {Math.abs(myRating.after - myRating.before)}
                </span>
                <span className="result-rewards__muted ltr">
                  ({toFaDigits(myRating.before)} ← {toFaDigits(myRating.after)})
                </span>
              </span>
            </div>
          ) : null}
          {myRating ? (
            <div className="result-rewards__row">
              <span className="result-rewards__label">تیر جدید</span>
              <TierBadge tier={tierForRating(myRating.after)} />
            </div>
          ) : null}
          {myCoins !== null ? (
            <div className="result-rewards__row">
              <span className="result-rewards__label">
                {state.mode === "stakes" ? "نتیجه شرط" : "پاداش شریف‌کوین"}
              </span>
              <CoinAmount amount={myCoins} signed size={17} />
            </div>
          ) : null}
          {settlement && (settlement.rake ?? 0) > 0 ? (
            <p className="result-rewards__note">
              کارمزد بازی: <CoinAmount amount={settlement.rake ?? 0} size={14} />
            </p>
          ) : null}
        </div>
      ) : null}

      {!mySymbol ? null : iRequested ? (
        <Button variant="secondary" size="lg" loading disabled fullWidth>
          در انتظار موافقت حریف…
        </Button>
      ) : opponentRequested ? (
        <Button variant="primary" size="lg" onClick={onRequestRematch} loading={rematchPending} fullWidth>
          حریف بازی مجدد خواست — شروع کن
        </Button>
      ) : (
        <Button
          variant="primary"
          size="lg"
          onClick={onRequestRematch}
          loading={rematchPending}
          icon={<RotateCcw size={17} aria-hidden="true" />}
          fullWidth
        >
          بازی مجدد
        </Button>
      )}
      <p className="result-card__note">
        {state.mode === "stakes"
          ? "در بازی شرطی، ورودی بازی مجدد دوباره قفل می‌شود؛ مطمئن شوید موجودی کافی دارید."
          : "بازی مجدد وقتی شروع می‌شود که هر دو بازیکن آن را تأیید کنند. نوبت شروع بین بازی‌ها عوض می‌شود."}
      </p>
    </section>
  );
}
