import { memo } from "react";
import type { CellValue, PlayerSymbol } from "@/game/engine";

function MarkX({ animated }: { animated: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`mark mark--x ${animated ? "mark--draw" : ""}`} aria-hidden="true">
      <line x1="24" y1="24" x2="76" y2="76" pathLength={100} className="mark__stroke" style={{ "--dash": 100 } as React.CSSProperties} />
      <line x1="76" y1="24" x2="24" y2="76" pathLength={100} className="mark__stroke mark__stroke--late" style={{ "--dash": 100 } as React.CSSProperties} />
    </svg>
  );
}

function MarkO({ animated }: { animated: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`mark mark--o ${animated ? "mark--draw" : ""}`} aria-hidden="true">
      <circle cx="50" cy="50" r="27" pathLength={100} className="mark__stroke" style={{ "--dash": 100 } as React.CSSProperties} />
    </svg>
  );
}

export function Mark({ value, animated = true }: { value: Exclude<CellValue, null>; animated?: boolean }) {
  return value === "X" ? <MarkX animated={animated} /> : <MarkO animated={animated} />;
}

export interface GameBoardProps {
  board: CellValue[];
  winningCells: number[];
  mySymbol: PlayerSymbol | null;
  interactive: boolean;
  pendingCell: number | null;
  onPlay: (cellIndex: number) => void;
}

const CELL_NAMES = [
  "بالا-چپ", "بالا-وسط", "بالا-راست",
  "وسط-چپ", "مرکز", "وسط-راست",
  "پایین-چپ", "پایین-وسط", "پایین-راست",
];

function GameBoardInner({
  board,
  winningCells,
  mySymbol,
  interactive,
  pendingCell,
  onPlay,
}: GameBoardProps) {
  const winSet = new Set(winningCells);

  return (
    <div className="board" role="group" aria-label="صفحه بازی دوز">
      {board.map((value, index) => {
        const isWinner = winSet.has(index);
        const canPlay = interactive && value === null;
        const row = Math.floor(index / 3) + 1;
        const col = (index % 3) + 1;
        const label =
          value === null
            ? `خانه ${CELL_NAMES[index]} (ردیف ${row}، ستون ${col}) — خالی`
            : `خانه ${CELL_NAMES[index]} — ${value === "X" ? "ایکس" : "او"}`;

        return (
          <button
            key={index}
            type="button"
            className={[
              "board__cell",
              isWinner ? "board__cell--win" : "",
              canPlay ? "board__cell--playable" : "",
              pendingCell === index ? "board__cell--pending" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={!canPlay}
            aria-label={label}
            aria-disabled={!canPlay}
            onClick={() => onPlay(index)}
          >
            {value ? (
              <Mark value={value} />
            ) : canPlay && mySymbol ? (
              <span className="board__ghost" aria-hidden="true">
                <Mark value={mySymbol} animated={false} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export const GameBoard = memo(GameBoardInner);
