import { Handshake, RotateCcw, Trophy } from "lucide-react";
import type { PlayerSymbol, RoomState } from "@/types/api";
import { Button } from "@/components/ui/Button";

export interface GameResultProps {
  state: RoomState;
  mySymbol: PlayerSymbol | null;
  rematchPending: boolean;
  onRequestRematch: () => void;
}

/** Outcome card shown after a game ends (win / loss / draw) with rematch flow. */
export function GameResult({
  state,
  mySymbol,
  rematchPending,
  onRequestRematch,
}: GameResultProps) {
  const iWon = state.winner !== null && state.winner === mySymbol;
  const iLost = state.winner !== null && state.winner !== mySymbol;

  const headline = !mySymbol
    ? state.is_draw
      ? "بازی مساوی تمام شد"
      : `برد بازیکن ${state.winner === "X" ? "ایکس" : "او"}`
    : iWon
      ? "برد شما! 🎉"
      : iLost
        ? "باخت"
        : "مساوی";

  const opponentRequested =
    state.rematch_requested_by !== null && state.rematch_requested_by !== mySymbol;
  const iRequested = state.rematch_requested_by === mySymbol;

  return (
    <section className="result-card" aria-live="polite">
      <span className={`result-card__icon ${iWon ? "result-card__icon--win" : ""}`}>
        {state.is_draw ? <Handshake size={30} aria-hidden="true" /> : <Trophy size={30} aria-hidden="true" />}
      </span>
      <h2 className="result-card__title">{headline}</h2>
      <p className="result-card__sub">
        {state.is_draw
          ? "هیچ‌کس برنده نشد — بازی را تکرار کنید!"
          : `بازیکن ${state.winner === "X" ? "ایکس" : "او"} سه علامت در یک خط ساخت.`}
      </p>

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
        بازی مجدد وقتی شروع می‌شود که هر دو بازیکن آن را تأیید کنند. نوبت شروع بین بازی‌ها عوض می‌شود.
      </p>
    </section>
  );
}
