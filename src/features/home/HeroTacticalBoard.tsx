import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Cpu, Play, RotateCcw, Sparkles } from "lucide-react";
import { chooseBestMove } from "@/game/ai";
import {
  applyMove,
  createInitialBoard,
  getWinner,
  isBoardFull,
  type Board,
  type PlayerSymbol,
} from "@/game/engine";
import { toFaDigits } from "@/lib/format";

const COORDS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"] as const;

const CELL_LABELS_FA = [
  "بالا-راست",
  "بالا-وسط",
  "بالا-چپ",
  "وسط-راست",
  "مرکز",
  "وسط-چپ",
  "پایین-راست",
  "پایین-وسط",
  "پایین-چپ",
] as const;

/**
 * Choreographed autonomous tactical sequence shown before the visitor clicks a cell:
 * X claims center (B2), O takes corner (A3), X sets diagonal trap (A1),
 * O blocks/plays (C1), X seals diagonal (C3) -> Win strike [0, 4, 8].
 */
const DEMO_SCRIPT: readonly { cell: number; symbol: PlayerSymbol; note: string }[] = [
  { cell: 4, symbol: "X", note: "کنترل گره مرکزی B2" },
  { cell: 2, symbol: "O", note: "پاسخ گوشهٔ A3" },
  { cell: 0, symbol: "X", note: "تهدید قطری A1" },
  { cell: 6, symbol: "O", note: "دفاع جناح C1" },
  { cell: 8, symbol: "X", note: "ضربهٔ نهایی C3 — خط برنده" },
];

/** Center coordinates (in 0..300 SVG viewBox) for each cell 0..8 in RTL layout. */
function cellSvgPoint(index: number, isRtl = true): { x: number; y: number } {
  const row = Math.floor(index / 3);
  const col = index % 3;
  // In RTL CSS grid, col 0 renders on the right (x=250), col 2 on the left (x=50)
  const visualCol = isRtl ? 2 - col : col;
  return {
    x: visualCol * 100 + 50,
    y: row * 100 + 50,
  };
}

export function HeroTacticalBoard() {
  const navigate = useNavigate();

  // "demo" = autonomous choreographed replay; "live" = visitor playing X vs tactical O
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [demoStep, setDemoStep] = useState<number>(3);
  const [liveBoard, setLiveBoard] = useState<Board>(() => createInitialBoard());
  const [liveTurn, setLiveTurn] = useState<PlayerSymbol>("X");
  const [score, setScore] = useState<{ me: number; draw: number; opp: number }>({
    me: 0,
    draw: 0,
    opp: 0,
  });

  const aiTimerRef = useRef<number | null>(null);
  const scoredRoundRef = useRef<boolean>(false);

  /* ---------------- Autonomous tactical replay when in demo mode ---------------- */
  useEffect(() => {
    if (mode !== "demo") return;
    const interval = window.setInterval(() => {
      setDemoStep((prev) => (prev >= DEMO_SCRIPT.length + 1 ? 1 : prev + 1));
    }, 1550);
    return () => window.clearInterval(interval);
  }, [mode]);

  /* ---------------- Derived board for current mode ---------------- */
  const activeBoard: Board = useMemo(() => {
    if (mode === "live") return liveBoard;
    const b = createInitialBoard();
    const upto = Math.min(demoStep, DEMO_SCRIPT.length);
    for (let i = 0; i < upto; i++) {
      const step = DEMO_SCRIPT[i];
      b[step.cell] = step.symbol;
    }
    return b;
  }, [mode, demoStep, liveBoard]);

  const winInfo = useMemo(() => getWinner(activeBoard), [activeBoard]);
  const isDraw = winInfo.winner === null && isBoardFull(activeBoard);
  const finished = winInfo.winner !== null || isDraw;

  /* ---------------- AI reply in live interactive mode ---------------- */
  useEffect(() => {
    if (mode !== "live") return;
    if (finished || liveTurn !== "O") return;

    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null;
      setLiveBoard((prev) => {
        const w = getWinner(prev);
        if (w.winner !== null || isBoardFull(prev)) return prev;
        const best = chooseBestMove(prev, "O");
        if (!best) return prev;
        const next = applyMove(prev, best.cell, "O");
        const nextWin = getWinner(next);
        if (nextWin.winner === "O" && !scoredRoundRef.current) {
          scoredRoundRef.current = true;
          setScore((s) => ({ ...s, opp: s.opp + 1 }));
        } else if (nextWin.winner === null && isBoardFull(next) && !scoredRoundRef.current) {
          scoredRoundRef.current = true;
          setScore((s) => ({ ...s, draw: s.draw + 1 }));
        }
        return next;
      });
      setLiveTurn("X");
    }, 460);

    return () => {
      if (aiTimerRef.current !== null) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [mode, finished, liveTurn]);

  /* ---------------- Click cell: seamlessly enter or continue live play ---------------- */
  const handleCellClick = (cellIndex: number) => {
    if (mode === "demo") {
      // Transition immediately from demo into a real playable game with the user's chosen opening!
      if (aiTimerRef.current !== null) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
      scoredRoundRef.current = false;
      const fresh = applyMove(createInitialBoard(), cellIndex, "X");
      setMode("live");
      setLiveBoard(fresh);
      setLiveTurn("O");
      return;
    }

    if (finished || liveTurn !== "X" || liveBoard[cellIndex] !== null) return;
    const next = applyMove(liveBoard, cellIndex, "X");
    const nextWin = getWinner(next);
    if (nextWin.winner === "X" && !scoredRoundRef.current) {
      scoredRoundRef.current = true;
      setScore((s) => ({ ...s, me: s.me + 1 }));
    } else if (nextWin.winner === null && isBoardFull(next) && !scoredRoundRef.current) {
      scoredRoundRef.current = true;
      setScore((s) => ({ ...s, draw: s.draw + 1 }));
    }
    setLiveBoard(next);
    setLiveTurn("O");
  };

  const resetLiveRound = () => {
    if (aiTimerRef.current !== null) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    scoredRoundRef.current = false;
    setMode("live");
    setLiveBoard(createInitialBoard());
    setLiveTurn("X");
  };

  /* ---------------- Subtle 3D machined instrument tilt (DOM CSS vars, 0 re-render) ---------------- */
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--deck-rx", `${(-py * 5).toFixed(2)}deg`);
    el.style.setProperty("--deck-ry", `${(px * 5).toFixed(2)}deg`);
    el.style.setProperty("--deck-gx", `${((px + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty("--deck-gy", `${((py + 0.5) * 100).toFixed(1)}%`);
  };

  const handlePointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.style.setProperty("--deck-rx", "0deg");
    el.style.setProperty("--deck-ry", "0deg");
  };

  /* ---------------- Tactical status & winning vector line ---------------- */
  const lastDemoMove =
    mode === "demo"
      ? DEMO_SCRIPT[Math.min(Math.max(demoStep - 1, 0), DEMO_SCRIPT.length - 1)]
      : null;

  const scanCell =
    mode === "demo" && demoStep < DEMO_SCRIPT.length ? DEMO_SCRIPT[demoStep].cell : null;

  const winLinePoints = useMemo(() => {
    if (!winInfo.line) return null;
    const p1 = cellSvgPoint(winInfo.line[0], true);
    const p2 = cellSvgPoint(winInfo.line[2], true);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }, [winInfo.line]);

  let statusText: string;
  if (mode === "demo") {
    statusText = winInfo.winner
      ? `شبیه‌سازی: خط برندهٔ ${winInfo.winner} قفل شد — روی هر خانه بزن تا خودت بازی کنی`
      : `${lastDemoMove?.note ?? "آماده"} · برای بازی زنده روی یک خانه کلیک کن`;
  } else if (winInfo.winner === "X") {
    statusText = "آفرین! خط برنده را بستی — آمادهٔ نبرد واقعی هستی.";
  } else if (winInfo.winner === "O") {
    statusText = "موتور تاکتیکی این دست را برد — یک دور دیگر امتحان کن!";
  } else if (isDraw) {
    statusText = "مساویِ تمام‌عیار در برابر موتور بی‌نقص! دست بعدی؟";
  } else if (liveTurn === "O") {
    statusText = "حریف در حال محاسبهٔ پاسخ…";
  } else {
    statusText = "نوبت شماست (X) — یک خانهٔ خالی را انتخاب کن";
  }

  return (
    <div
      className="hp-deck"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-label="میز تاکتیکی تعاملی دوز"
    >
      {/* Corner machined crosshairs */}
      <span className="hp-corner hp-corner--tr" aria-hidden="true">+</span>
      <span className="hp-corner hp-corner--tl" aria-hidden="true">+</span>
      <span className="hp-corner hp-corner--br" aria-hidden="true">+</span>
      <span className="hp-corner hp-corner--bl" aria-hidden="true">+</span>

      <div className="hp-deck__top">
        <div className="hp-deck__title-group">
          <span className={`hp-deck__mode-dot ${mode === "live" ? "hp-deck__mode-dot--live" : ""}`} aria-hidden="true" />
          <span className="hp-deck__title">
            {mode === "live" ? "میز آزمایشی زنده" : "پخش تاکتیکی زنده"}
          </span>
        </div>
        <div className="hp-deck__meta ltr">
          <span>GRID 3×3</span>
          <span className="hp-deck__sep">·</span>
          <span>{mode === "live" ? "LIVE DUEL" : "AUTO SIM"}</span>
        </div>
      </div>

      {/* Interactive 3x3 Board */}
      <div className="hp-board-stage">
        <div className="hp-board" role="group" aria-label="صفحه دوز آزمایشی">
          {COORDS.map((coord, idx) => {
            const val = activeBoard[idx];
            const isWinCell = winInfo.line?.includes(idx) ?? false;
            const isScanning = scanCell === idx;
            const playable = mode === "demo" || (!finished && liveTurn === "X" && val === null);

            return (
              <button
                key={coord}
                type="button"
                className={[
                  "hp-cell",
                  val === "X" ? "hp-cell--x" : "",
                  val === "O" ? "hp-cell--o" : "",
                  isWinCell ? "hp-cell--win" : "",
                  isScanning ? "hp-cell--scan" : "",
                  playable ? "hp-cell--playable" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleCellClick(idx)}
                disabled={mode === "live" && !playable}
                aria-label={`خانه ${CELL_LABELS_FA[idx]} (${coord})${
                  val === "X" ? " — ایکس" : val === "O" ? " — او" : " — خالی، کلیک برای بازی"
                }`}
              >
                <span className="hp-cell__coord ltr" aria-hidden="true">
                  {coord}
                </span>

                {val === "X" ? (
                  <svg viewBox="0 0 64 64" className="hp-mark hp-mark--x" aria-hidden="true">
                    <line x1="16" y1="16" x2="48" y2="48" pathLength={100} className="hp-mark__stroke" />
                    <line
                      x1="48"
                      y1="16"
                      x2="16"
                      y2="48"
                      pathLength={100}
                      className="hp-mark__stroke hp-mark__stroke--b"
                    />
                  </svg>
                ) : val === "O" ? (
                  <svg viewBox="0 0 64 64" className="hp-mark hp-mark--o" aria-hidden="true">
                    <circle cx="32" cy="32" r="17" pathLength={100} className="hp-mark__stroke" />
                  </svg>
                ) : (
                  <span className="hp-cell__reticle" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* Winning Strike Laser Overlay */}
        {winLinePoints ? (
          <svg
            viewBox="0 0 300 300"
            className="hp-win-laser"
            aria-hidden="true"
          >
            <line
              x1={winLinePoints.x1}
              y1={winLinePoints.y1}
              x2={winLinePoints.x2}
              y2={winLinePoints.y2}
              pathLength={100}
              className={`hp-win-laser__beam ${
                winInfo.winner === "O" ? "hp-win-laser__beam--o" : ""
              }`}
            />
          </svg>
        ) : null}
      </div>

      {/* Live readout & controls */}
      <div className="hp-deck__readout" aria-live="polite">
        <span className="hp-deck__prompt">
          {mode === "demo" ? (
            <Sparkles size={14} aria-hidden="true" />
          ) : (
            <Cpu size={14} aria-hidden="true" />
          )}
          <span>{statusText}</span>
        </span>
      </div>

      <div className="hp-deck__footer">
        {mode === "demo" ? (
          <>
            <div className="hp-deck__legend">
              <span>
                <i className="hp-dot hp-dot--x" /> نشانهٔ X
              </span>
              <span>
                <i className="hp-dot hp-dot--o" /> پاسخ O
              </span>
              <span>
                <i className="hp-dot hp-dot--scan" /> اسکن گره
              </span>
            </div>
            <button
              type="button"
              className="hp-deck__action"
              onClick={resetLiveRound}
            >
              <Play size={13} aria-hidden="true" />
              امتحان روی همین میز
            </button>
          </>
        ) : (
          <>
            <div className="hp-deck__score" aria-label="نتیجه دست‌های آزمایشی">
              <span>
                شما <strong>{toFaDigits(score.me)}</strong>
              </span>
              <span className="hp-deck__sep">/</span>
              <span>
                مساوی <strong>{toFaDigits(score.draw)}</strong>
              </span>
              <span className="hp-deck__sep">/</span>
              <span>
                حریف <strong>{toFaDigits(score.opp)}</strong>
              </span>
            </div>
            <div className="hp-deck__btn-pair">
              <button
                type="button"
                className="hp-deck__action"
                onClick={resetLiveRound}
              >
                <RotateCcw size={13} aria-hidden="true" />
                دور جدید
              </button>
              <button
                type="button"
                className="hp-deck__action hp-deck__action--gold"
                onClick={() => navigate("/play")}
              >
                اتاق کامل
                <ArrowLeft size={13} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
