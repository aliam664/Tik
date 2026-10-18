import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DoorOpen, Home, Hourglass, Lock, RefreshCw, Timer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatus";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { FormField, Input } from "@/components/ui/Input";
import { RoomCodeDisplay } from "@/components/ui/RoomCode";
import { useToast } from "@/components/ui/Toast";
import { GameBoard } from "@/components/game/GameBoard";
import { GameResult } from "@/components/game/GameResult";
import { PlayerCard } from "@/components/game/PlayerCard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useRoomSession } from "@/hooks/useRoomSession";
import { api } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { displayNameError } from "@/lib/format";
import { normalizeRoomCode, playerSession } from "@/lib/session";
import { OTHER_SYMBOL, type PlayerSymbol } from "@/game/engine";

export function RoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = normalizeRoomCode(params.roomCode);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useDocumentTitle(roomCode ? `اتاق ${roomCode} | دوز آنلاین` : "اتاق | دوز آنلاین");

  const onLeft = useCallback(() => navigate("/", { replace: true }), [navigate]);

  const session = useRoomSession({ roomCode: roomCode ?? "", onLeft });

  if (!roomCode) {
    return (
      <RoomFrame>
        <ErrorState
          title="کد اتاق نامعتبر است"
          description="کد اتاق باید ۶ نویسه لاتین/عدد باشد."
        />
        <HomeButton />
      </RoomFrame>
    );
  }

  /* ------------------------------ fatal states ------------------------------ */
  if (session.fatalError) {
    return (
      <RoomFrame>
        <ErrorState title="اتاق در دسترس نیست" description={session.fatalError} onRetry={() => void session.refresh(true)} />
        <HomeButton />
      </RoomFrame>
    );
  }

  if (session.initialLoading) {
    return (
      <RoomFrame>
        <div className="room-loading">
          <LoadingSpinner size={30} label="در حال دریافت وضعیت اتاق" />
          <p>در حال دریافت وضعیت اتاق…</p>
        </div>
      </RoomFrame>
    );
  }

  const state = session.state;
  if (!state) {
    return (
      <RoomFrame>
        <ErrorState
          title="اتاق در دسترس نیست"
          description="اتاق منقضی شده یا حذف شده است."
          onRetry={() => void session.refresh(true)}
        />
        <HomeButton />
      </RoomFrame>
    );
  }

  /* --------------------------- terminal room states --------------------------- */
  if (state.status === "expired" || state.status === "closed") {
    const expired = state.status === "expired";
    return (
      <RoomFrame>
        <section className="card terminal-card" role="alert">
          <Timer size={30} aria-hidden="true" className="terminal-card__icon" />
          <h1 className="card__title">{expired ? "اتاق منقضی شده است" : "این اتاق بسته شده است"}</h1>
          <p className="card__sub">
            {expired
              ? "اتاق‌ها پس از مدت مشخصی از آخرین فعالیت منقضی می‌شوند تا داده‌های بی‌استفاده پاک بمانند."
              : "میزبان این اتاق را بسته یا مدیریت آن را مسدود کرده است."}
          </p>
          <Button size="lg" fullWidth icon={<Home size={18} aria-hidden="true" />} onClick={() => navigate("/")}>
            بازگشت به صفحه اصلی
          </Button>
        </section>
      </RoomFrame>
    );
  }

  /* ------------------------ no valid seat in this room ------------------------ */
  if (!session.role) {
    const hadToken = session.token !== null;
    return (
      <RoomFrame state={state} session={session}>
        {hadToken ? (
          <section className="card terminal-card" role="alert">
            <Lock size={28} aria-hidden="true" className="terminal-card__icon" />
            <h1 className="card__title">مجوز شما معتبر نیست</h1>
            <p className="card__sub">
              نشست قبلی شما در این اتاق معتبر نیست (مثلاً جای شما آزاد شده است). اگر جای خالی
              هست، دوباره وارد شوید.
            </p>
          </section>
        ) : (
          <section className="card">
            <h1 className="card__title">ورود به اتاق {state.room_code}</h1>
            <p className="card__sub">
              {state.status === "waiting"
                ? "این اتاق در انتظار بازیکن دوم است — نام خود را وارد کنید و بپیوندید."
                : "شما عضو این اتاق نیستید؛ برای تماشا یا ورود، ابتدا نام خود را وارد کنید."}
            </p>
            {state.status === "waiting" ? (
              <form
                noValidate
                onSubmit={async (e) => {
                  e.preventDefault();
                  const err = displayNameError(joinName);
                  setJoinError(err);
                  if (err) return;
                  setJoining(true);
                  try {
                    const res = await api.joinRoom(roomCode, joinName.trim());
                    playerSession.save(res.room_code, res.player_token, res.symbol);
                    await session.refresh(true);
                  } catch (joinErr) {
                    const user = toUserError(joinErr);
                    showToast(user.message, "error");
                    if (user.code === "INVALID_NAME") setJoinError(user.message);
                  } finally {
                    setJoining(false);
                  }
                }}
              >
                <FormField label="نام نمایشی" htmlFor="room-join-name" error={joinError}>
                  <Input
                    id="room-join-name"
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="نام شما"
                    maxLength={24}
                    autoComplete="off"
                    invalid={!!joinError}
                  />
                </FormField>
                <Button type="submit" size="lg" fullWidth loading={joining}>
                  ورود به بازی
                </Button>
              </form>
            ) : (
              <Button variant="secondary" fullWidth onClick={() => navigate("/")}>
                بازگشت به صفحه اصلی
              </Button>
            )}
          </section>
        )}
      </RoomFrame>
    );
  }

  const mySymbol = session.role;
  const opponentSymbol: PlayerSymbol = OTHER_SYMBOL[mySymbol];
  const find = (s: PlayerSymbol) => state.players.find((p) => p.symbol === s) ?? null;
  const me = find(mySymbol);
  const opponent = find(opponentSymbol);
  const isMyTurn = state.status === "active" && state.current_turn === mySymbol;
  const interactive = state.status === "active" && isMyTurn && session.connection !== "offline";

  return (
    <RoomFrame state={state} session={session}>
      {state.mode !== "friendly" ? (
        <div className="room-mode-line" aria-label="نوع بازی">
          <span className={`room-mode-chip room-mode-chip--${state.mode}`}>
            {state.mode === "stakes" ? `شرطی · ${state.stake} sh` : "رده‌بندی‌شده"}
          </span>
        </div>
      ) : null}
      <div className="players-row" aria-label="بازیکنان">
        <PlayerCard
          symbol={mySymbol}
          name={me?.name ?? null}
          connected={me?.connected ?? true}
          isMe
          isTheirTurn={isMyTurn}
          waitingForJoin={false}
        />
        <PlayerCard
          symbol={opponentSymbol}
          name={opponent?.name ?? null}
          connected={opponent?.connected ?? false}
          isMe={false}
          isTheirTurn={state.status === "active" && state.current_turn === opponentSymbol}
          waitingForJoin={!opponent}
        />
      </div>

      {state.status === "waiting" ? (
        <section className="card invite-card" aria-live="polite">
          <span className="invite-card__pulse" aria-hidden="true">
            <Hourglass size={26} />
          </span>
          <h2 className="invite-card__title">
            {opponent ? "در انتظار آماده‌شدن حریف…" : "در انتظار بازیکن دوم…"}
          </h2>
          <p className="invite-card__text">
            {opponent
              ? state.mode !== "friendly"
                ? "بازی به‌محض آماده‌شدن حریف شروع می‌شود."
                : "به‌محض آماده‌شدن حریف، بازی شروع می‌شود."
              : "این کد را برای دوستتان بفرستید. به‌محض ورود او، بازی شروع می‌شود."}
          </p>
          {opponent ? null : (
            <div className="invite-card__code">
              <RoomCodeDisplay code={state.room_code} size="lg" />
            </div>
          )}
        </section>
      ) : (
        <GameBoard
          board={session.board}
          winningCells={state.winning_cells ?? []}
          mySymbol={mySymbol}
          interactive={interactive}
          pendingCell={session.pendingCell}
          onPlay={(cell) => void session.playMove(cell)}
        />
      )}

      <div className="turn-line" aria-live="polite">
        {state.status === "waiting" ? (
          <span className="turn-line__text">در انتظار حریف برای شروع بازی…</span>
        ) : state.status === "active" ? (
          <span className={`turn-line__text ${isMyTurn ? "turn-line__text--me" : ""}`}>
            {isMyTurn ? "نوبت شماست — یک خانه خالی را انتخاب کنید" : "در انتظار حرکت حریف…"}
          </span>
        ) : null}
      </div>

      {state.status === "finished" ? (
        <GameResult
          state={state}
          mySymbol={mySymbol}
          rematchPending={session.rematchPending}
          onRequestRematch={() => void session.requestRematch()}
        />
      ) : null}

      <div className="room-controls">
        <Button
          variant="secondary"
          icon={<RefreshCw size={16} aria-hidden="true" />}
          onClick={() => void session.refresh(true)}
        >
          به‌روزرسانی
        </Button>
        <Button
          variant="danger"
          icon={<DoorOpen size={16} aria-hidden="true" />}
          onClick={() => setConfirmLeave(true)}
        >
          خروج از اتاق
        </Button>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="خروج از اتاق"
        description={
          state.status === "waiting" && mySymbol === "X"
            ? "شما میزبان این اتاق هستید؛ با خروج، اتاق برای همیشه بسته می‌شود. مطمئنید؟"
            : "از اتاق خارج می‌شوید و امکان بازگشت با همین نشست را از دست می‌دهید. مطمئنید؟"
        }
        confirmLabel="خروج"
        danger
        onConfirm={() => {
          setConfirmLeave(false);
          void session.leave();
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </RoomFrame>
  );
}

function HomeButton() {
  const navigate = useNavigate();
  return (
    <Button variant="secondary" icon={<Home size={16} aria-hidden="true" />} onClick={() => navigate("/")}>
      بازگشت به صفحه اصلی
    </Button>
  );
}

/** Shared page chrome for every room sub-state. */
function RoomFrame({
  children,
  state,
  session,
}: {
  children: React.ReactNode;
  state?: { room_code: string } | null;
  session?: ReturnType<typeof useRoomSession>;
}) {
  return (
    <div className="page page--room">
      <header className="room-head">
        <div className="room-head__code">
          {state ? (
            <RoomCodeDisplay code={state.room_code} size="md" />
          ) : (
            <span className="room-head__label">اتاق بازی</span>
          )}
        </div>
        {session ? <ConnectionStatusPill status={session.connection} /> : null}
      </header>

      {session && session.actionError ? (
        <div className="inline-error" role="alert">
          {session.actionError}
          <button type="button" className="inline-error__close" aria-label="بستن پیام خطا" onClick={session.clearActionError}>
            ×
          </button>
        </div>
      ) : null}
      {session && session.connection === "offline" ? (
        <div className="inline-warning" role="alert">
          اتصال اینترنت قطع است — تلاش برای اتصال مجدد…
        </div>
      ) : null}
      {session && session.connection === "online" && !session.realtimeReady ? (
        <div className="inline-info" role="status">
          همگام‌سازی زنده در حال برقراری است…
        </div>
      ) : null}

      {children}

      <p className="room-footnote">
        با خروج از این صفحه می‌توانید با refresh در همین مرتبه به اتاق برگردید —{" "}
        <Link className="link" to="/rules">
          قوانین بازی
        </Link>
      </p>
    </div>
  );
}
