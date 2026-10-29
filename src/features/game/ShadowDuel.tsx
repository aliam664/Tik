/**
 * SHADOW DUEL — a full local two-player Doz match against a hidden bot
 * opponent, used when nobody joins the room. Runs the exact same board,
 * winner and result components as the online game so the experience is
 * indistinguishable from a real duel (same PlayerCards, GameBoard, GameResult).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GameBoard } from "@/components/game/GameBoard";
import { GameResult } from "@/components/game/GameResult";
import { PlayerCard } from "@/components/game/PlayerCard";
import { chooseBestMove, computeHumanDelayMs } from "@/game/ai";
import {
  applyMove,
  boardToString,
  createInitialBoard,
  getWinner,
  isBoardFull,
  OTHER_SYMBOL,
  type Board,
  type PlayerSymbol,
} from "@/game/engine";
import type { RoomState } from "@/types/room";

export interface ShadowDuelProps {
  roomCode: string;
  mySymbol: PlayerSymbol;
  myName: string;
  opponentName: string;
  onLeaveRoom: () => void;
}

interface DuelState {
  board: Board;
  turn: PlayerSymbol;
  gameNumber: number;
  finishedIso: string;
}

function initialDuel(gameNumber = 1): DuelState {
  const startingTurn: PlayerSymbol = gameNumber % 2 === 1 ? "X" : "O";
  return {
    board: createInitialBoard(),
    turn: startingTurn,
    gameNumber,
    finishedIso: new Date().toISOString(),
  };
}

export function ShadowDuel({
  roomCode,
  mySymbol,
  myName,
  opponentName,
  onLeaveRoom,
}: ShadowDuelProps) {
  const botSymbol = OTHER_SYMBOL[mySymbol];
  const [duel, setDuel] = useState<DuelState>(() => initialDuel(1));
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const thinkingTimeout = useRef<number | null>(null);

  const win = useMemo(() => getWinner(duel.board), [duel.board]);
  const isDraw = win.winner === null && isBoardFull(duel.board);
  const finished = win.winner !== null || isDraw;
  const winningCells = useMemo(() => (win.line ? [...win.line] : []), [win.line]);

  const myTurn = !finished && duel.turn === mySymbol;
  const botThinking = !finished && duel.turn === botSymbol;

  /* ----------------------------- human moves ----------------------------- */
  const handlePlay = (cell: number) => {
    if (!myTurn || duel.board[cell] !== null) return;
    const next = applyMove(duel.board, cell, mySymbol);
    setDuel((prev) => ({
      ...prev,
      board: next,
      turn: OTHER_SYMBOL[mySymbol],
      finishedIso: new Date().toISOString(),
    }));
  };

  /* ------------------- hidden bot thinking with human delay --------------- */
  useEffect(() => {
    if (finished || duel.turn !== botSymbol) return;
    const delay = computeHumanDelayMs(duel.board, "natural");
    thinkingTimeout.current = window.setTimeout(() => {
      thinkingTimeout.current = null;
      setDuel((prev) => {
        if (prev.turn !== botSymbol) return prev;
        const move = chooseBestMove(prev.board, botSymbol);
        if (!move) return prev;
        return {
          ...prev,
          board: applyMove(prev.board, move.cell, botSymbol),
          turn: OTHER_SYMBOL[botSymbol],
          finishedIso: new Date().toISOString(),
        };
      });
    }, delay);
    return () => {
      if (thinkingTimeout.current !== null) {
        window.clearTimeout(thinkingTimeout.current);
        thinkingTimeout.current = null;
      }
    };
  }, [duel.board, duel.turn, botSymbol, finished]);

  /* ---------------------- synthetic finished RoomState -------------------- */
  const finishedState: RoomState = useMemo(
    () => ({
      room_code: roomCode,
      status: "finished",
      mode: "friendly",
      stake: 0,
      board: boardToString(duel.board),
      current_turn: OTHER_SYMBOL[duel.turn],
      winner: win.winner,
      is_draw: isDraw,
      winning_cells: winningCells,
      move_count: duel.board.filter((c) => c !== null).length,
      game_number: duel.gameNumber,
      rematch_requested_by: null,
      version: duel.gameNumber,
      settlement: null,
      forfeit: false,
      players: [
        { symbol: mySymbol, name: myName, connected: true },
        { symbol: botSymbol, name: opponentName, connected: true },
      ],
      created_at: null,
      started_at: null,
      finished_at: duel.finishedIso,
      expires_in_seconds: 0,
      server_now: duel.finishedIso,
    }),
    [
      roomCode,
      duel.board,
      duel.turn,
      duel.gameNumber,
      duel.finishedIso,
      win.winner,
      isDraw,
      winningCells,
      mySymbol,
      myName,
      botSymbol,
      opponentName,
    ],
  );

  const rematch = () => {
    setDuel((prev) => initialDuel(prev.gameNumber + 1));
    setPendingCell(null);
  };

  return (
    <>
      <div className="players-row" aria-label="بازیکنان">
        <PlayerCard
          symbol={mySymbol}
          name={myName}
          connected
          isMe
          isTheirTurn={myTurn}
          waitingForJoin={false}
        />
        <PlayerCard
          symbol={botSymbol}
          name={opponentName}
          connected
          isMe={false}
          isTheirTurn={botThinking}
          waitingForJoin={false}
        />
      </div>

      <GameBoard
        board={duel.board}
        winningCells={winningCells}
        mySymbol={mySymbol}
        interactive={myTurn && pendingCell === null}
        pendingCell={pendingCell}
        onPlay={handlePlay}
      />

      <div className="turn-line" aria-live="polite">
        {finished ? (
          <span className="turn-line__text">
            {win.winner === null
              ? "بازی مساوی تمام شد — دوباره بجنگید!"
              : win.winner === mySymbol
                ? "پیروزی شما! 🎉"
                : `${opponentName} برنده شد — یک دست دیگر بازی کنید!`}
          </span>
        ) : myTurn ? (
          <span className="turn-line__text turn-line__text--me">
            نوبت شماست — یک خانه خالی را انتخاب کنید
          </span>
        ) : (
          <span className="turn-line__text">
            {opponentName} دارد فکر می‌کند…
          </span>
        )}
      </div>

      {finished ? (
        <GameResult
          state={finishedState}
          mySymbol={mySymbol}
          rematchPending={false}
          onRequestRematch={rematch}
        />
      ) : null}

      <div className="room-controls">
        <Button
          variant="danger"
          icon={<DoorOpen size={16} aria-hidden="true" />}
          onClick={onLeaveRoom}
        >
          خروج از اتاق
        </Button>
      </div>
    </>
  );
}
