import type { PlayerSymbol } from "@/game/engine";
import { Mark } from "./GameBoard";

export interface PlayerCardProps {
  symbol: PlayerSymbol;
  name: string | null;
  connected: boolean;
  isMe: boolean;
  isTheirTurn: boolean;
  waitingForJoin: boolean;
}

export function PlayerCard({
  symbol,
  name,
  connected,
  isMe,
  isTheirTurn,
  waitingForJoin,
}: PlayerCardProps) {
  return (
    <div
      className={[
        "player-card",
        `player-card--${symbol.toLowerCase()}`,
        isTheirTurn ? "player-card--turn" : "",
        !connected && !waitingForJoin ? "player-card--away" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--player-color": symbol === "X" ? "var(--x-color)" : "var(--o-color)" } as React.CSSProperties}
      aria-label={`بازیکن ${symbol === "X" ? "ایکس" : "او"}: ${waitingForJoin ? "در انتظار بازیکن" : name ?? ""}${isTheirTurn ? " — نوبت او" : ""}`}
    >
      <span className="player-card__badge">
        <Mark value={symbol} animated={false} />
      </span>
      <span className="player-card__info">
        <span className="player-card__name">
          {waitingForJoin ? <span className="player-card__placeholder">در انتظار بازیکن…</span> : name}
          {isMe ? <span className="player-card__you">شما</span> : null}
        </span>
        <span className="player-card__meta">
          <span
            className={`presence-dot ${connected ? "presence-dot--on" : "presence-dot--off"}`}
            aria-hidden="true"
          />
          {!connected && !waitingForJoin ? "قطع شده" : connected ? "آنلاین" : "—"}
        </span>
      </span>
      {isTheirTurn && !waitingForJoin ? (
        <span className="player-card__turn-chip" aria-hidden="true">
          نوبت
        </span>
      ) : null}
    </div>
  );
}
