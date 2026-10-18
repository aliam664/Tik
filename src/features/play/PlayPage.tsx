import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Crosshair,
  Loader2,
  LogOut,
  Search,
  ShieldAlert,
  Sparkles,
  Swords,
  Timer,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount, ShCoin, TierBadge } from "@/components/ui/Coin";
import { LoadingSpinner } from "@/components/ui/Feedback";
import { FormField, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { api } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { displayNameError, toFaDigits } from "@/lib/format";
import { playerIdentity } from "@/lib/playerSession";
import { playerSession } from "@/lib/session";
import type { GameMode, PlayerProfile, QueueTicket } from "@/types/api";

const STAKE_OPTIONS = [10, 25, 50, 100] as const;

type QueueView = "idle" | "searching" | "matched" | "joining";

export function PlayPage() {
  useDocumentTitle("بازی رقابتی | دوز آنلاین");
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  /* register / recover */
  const [regName, setRegName] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [recoverCode, setRecoverCode] = useState("");
  const [recoverBusy, setRecoverBusy] = useState(false);

  /* queue */
  const [mode, setMode] = useState<GameMode>("ranked");
  const [stake, setStake] = useState<number>(10);
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [opponent, setOpponent] = useState<{ name: string; rating: number } | null>(null);
  const [queueView, setQueueView] = useState<QueueView>("idle");
  const [joinBusy, setJoinBusy] = useState(false);
  const [acceptSeconds, setAcceptSeconds] = useState(0);
  const pollRef = useRef<number | null>(null);
  const acceptingRef = useRef(false);

  const loadProfile = useCallback(async () => {
    const token = playerIdentity.token();
    if (!token) {
      setLoadingProfile(false);
      return;
    }
    setLoadingProfile(true);
    try {
      const res = await api.getMyProfile(token);
      setProfile(res.profile);
      setProfileError(null);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "PLAYER_UNAUTHORIZED" || user.code === "PLAYER_BANNED") {
        playerIdentity.clear();
        setProfile(null);
        setProfileError(
          user.code === "PLAYER_BANNED"
            ? "حساب شما مسدود شده است."
            : "نشست شما نامعتبر است — دوباره وارد شوید.",
        );
      } else {
        setProfileError(user.message);
      }
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /* -------- queue polling -------- */
  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const enterRoom = useCallback(
    (roomCode: string, token: string, symbol: string) => {
      playerSession.save(roomCode, token, symbol);
      stopPolling();
      navigate(`/room/${roomCode}`);
    },
    [navigate, stopPolling],
  );

  const pollQueue = useCallback(async () => {
    const token = playerIdentity.token();
    if (!token) return;
    try {
      const res = await api.queueStatus(token);
      if (!res.ticket) {
        setTicket(null);
        setQueueView("idle");
        stopPolling();
        return;
      }
      setTicket(res.ticket);
      setOpponent(res.opponent ?? null);
      if (res.ticket.status === "searching") setQueueView("searching");
      else if (res.ticket.status === "matched" || res.ticket.status === "accepted")
        setQueueView("matched");
      setAcceptSeconds(
        res.ticket.accept_deadline
          ? Math.max(0, Math.ceil((new Date(res.ticket.accept_deadline).getTime() - Date.now()) / 1000))
          : 0,
      );
    } catch {
      /* transient — keep polling */
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = window.setInterval(() => void pollQueue(), 2000);
    void pollQueue();
  }, [pollQueue, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  /* -------- actions -------- */
  const register = async () => {
    const nameErr = displayNameError(regName);
    if (nameErr) {
      showToast(nameErr, "error");
      return;
    }
    setRegBusy(true);
    try {
      const res = await api.registerPlayer(regName.trim());
      playerIdentity.save({
        token: res.player_token,
        displayName: res.profile.display_name,
        recoveryCode: res.recovery_code,
        createdAt: res.profile.created_at ?? new Date().toISOString(),
      });
      setProfile(res.profile);
      showToast("پروفایل شما ساخته شد! کد بازیابی را حتماً ذخیره کنید.", "success");
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setRegBusy(false);
    }
  };

  const recover = async () => {
    setRecoverBusy(true);
    try {
      const res = await api.recoverPlayer(recoverCode.trim().toUpperCase());
      playerIdentity.save({
        token: res.player_token,
        displayName: res.profile.display_name,
        recoveryCode: recoverCode.trim().toUpperCase(),
        createdAt: res.profile.created_at ?? new Date().toISOString(),
      });
      setProfile(res.profile);
      showToast("حساب شما بازیابی شد! 🎉", "success");
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setRecoverBusy(false);
    }
  };

  const joinQueue = async () => {
    const token = playerIdentity.token();
    if (!token) return;
    setJoinBusy(true);
    try {
      const res = await api.queueJoin(token, mode === "stakes" ? "stakes" : "ranked", mode === "stakes" ? stake : 0);
      if (res.ticket) {
        setTicket(res.ticket);
        setQueueView(res.ticket.status === "searching" ? "searching" : "matched");
        startPolling();
      }
    } catch (err) {
      const user = toUserError(err);
      const messages: Record<string, string> = {
        STAKES_REQUIRE_GAMES: "برای بازی شرطی حداقل ۲۰ بازی رنکد لازم است.",
        STAKES_REQUIRE_TIER: "برای بازی شرطی باید به تیر نقره (۱۰۰۰+) برسید.",
        STAKE_TOO_HIGH: "سقف ورودی شرط برای تیر شما کمتر از این مقدار است.",
        INSUFFICIENT_FUNDS: "موجودی شریف‌کوین شما کافی نیست.",
        DAILY_LOSS_CAP: "به سقف باخت روزانه شرط رسیده‌اید — فردا دوباره تلاش کنید.",
        QUEUE_BANNED: "دسترسی شما به صف موقتاً مسدود است.",
        MODE_DISABLED: "این حالت فعلاً غیرفعال است.",
      };
      showToast(messages[user.code] ?? user.message, "error");
    } finally {
      setJoinBusy(false);
    }
  };

  const leaveQueue = async () => {
    const token = playerIdentity.token();
    if (!token) return;
    try {
      const res = await api.queueLeave(token);
      if (res.dodged) showToast("خروج پس از پیداشدن حریف — جریمه زمانی اعمال شد.", "error");
    } catch {
      /* noop */
    }
    stopPolling();
    setTicket(null);
    setQueueView("idle");
  };

  const acceptMatch = async () => {
    const token = playerIdentity.token();
    if (!token || acceptingRef.current) return;
    acceptingRef.current = true;
    setQueueView("joining");
    try {
      const res = await api.queueAccept(token);
      if (res.room_code && res.player_token && res.symbol) {
        enterRoom(res.room_code, res.player_token, res.symbol);
        return;
      }
      // first acceptor: wait for the opponent
      setQueueView("matched");
      startPolling();
      showToast("در انتظار تأیید حریف…", "info");
    } catch (err) {
      showToast(toUserError(err).message, "error");
      setQueueView("matched");
      startPolling();
    } finally {
      acceptingRef.current = false;
    }
  };

  /* ------------------------------ render ------------------------------ */

  if (loadingProfile) {
    return (
      <div className="page">
        <LoadingSpinner size={28} label="در حال بارگذاری" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <section className="card auth-card">
          <h1 className="card__title">ورود به بخش رقابتی</h1>
          <p className="card__sub">
            برای رنکینگ و شرط، به یک پروفایل پایدار نیاز دارید — بدون ایمیل، فقط با یک
            <strong> کد بازیابی</strong>.
          </p>
          <div className="auth-card__grid">
            <div>
              <h2 className="auth-card__subtitle">
                <UserPlus size={17} aria-hidden="true" /> ساخت پروفایل جدید
              </h2>
              <FormField label="نام نمایشی" htmlFor="reg-name" error={null}>
                <Input
                  id="reg-name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="مثلاً علی"
                  maxLength={24}
                />
              </FormField>
              <Button onClick={() => void register()} loading={regBusy} fullWidth>
                ساخت پروفایل
              </Button>
            </div>
            <div>
              <h2 className="auth-card__subtitle">
                <ShieldAlert size={17} aria-hidden="true" /> بازیابی حساب قبلی
              </h2>
              <FormField label="کد بازیابی ۱۲ رقمی" htmlFor="recover-code" error={null}>
                <Input
                  id="recover-code"
                  value={recoverCode}
                  onChange={(e) => setRecoverCode(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX"
                  className="ltr"
                  maxLength={14}
                />
              </FormField>
              <Button variant="secondary" onClick={() => void recover()} loading={recoverBusy} fullWidth>
                بازیابی
              </Button>
            </div>
          </div>
          {profileError ? <p className="form-error">{profileError}</p> : null}
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="card play-card">
        <div className="play-card__header">
          <div>
            <h1 className="card__title">بازی رقابتی</h1>
            <p className="card__sub">
              {profile.display_name} — بازی دوستانه رایگان است؛ این‌جا رنک و شریف‌کوین وسط است.
            </p>
          </div>
          <div className="play-card__wallet">
            <CoinAmount amount={profile.balance} size={20} />
            <TierBadge tier={profile.rating.tier} />
          </div>
        </div>

        {queueView === "idle" ? (
          <>
            <div className="mode-select">
              <button
                type="button"
                className={`mode-card ${mode === "ranked" ? "mode-card--active" : ""}`}
                onClick={() => setMode("ranked")}
              >
                <Swords size={22} aria-hidden="true" />
                <strong>رده‌بندی‌شده</strong>
                <span>پاداش سکه + امتیاز رنک</span>
                <span className="mode-card__meta">
                  برد <ShCoin size={13} /> ۲۵ · مساوی ۱۰ · باخت ۵
                </span>
              </button>
              <button
                type="button"
                className={`mode-card ${mode === "stakes" ? "mode-card--active" : ""}`}
                onClick={() => setMode("stakes")}
              >
                <Sparkles size={22} aria-hidden="true" />
                <strong>شرطی</strong>
                <span>ورودی واقعی سکه — برنده همه را می‌برد</span>
                <span className="mode-card__meta">حداقل ۲۰ بازی · تیر نقره به بالا</span>
              </button>
            </div>

            {mode === "stakes" ? (
              <div className="stake-select">
                <p className="stake-select__label">میزان ورودی (شریف‌کوین):</p>
                <div className="stake-select__row">
                  {STAKE_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`stake-chip ${stake === s ? "stake-chip--active" : ""}`}
                      onClick={() => setStake(s)}
                    >
                      <ShCoin size={15} />
                      {toFaDigits(s)}
                    </button>
                  ))}
                </div>
                <p className="stake-select__hint">
                  برنده ۹۰٪ قابضه را می‌گیرد (۱۰٪ کارمزد بازی)؛ مساوی = بازگشت ۹۵٪ ورودی.
                </p>
              </div>
            ) : null}

            <Button
              size="lg"
              fullWidth
              loading={joinBusy}
              icon={<Search size={18} aria-hidden="true" />}
              onClick={() => void joinQueue()}
            >
              جست‌وجوی حریف
            </Button>
          </>
        ) : queueView === "searching" ? (
          <div className="queue-status">
            <Loader2 size={30} className="spin" aria-hidden="true" />
            <h2>در حال جست‌وجوی حریف…</h2>
            <p>
              زمان انتظار: <span className="ltr">{toFaDigits(ticket?.wait_seconds ?? 0)}</span> ثانیه —
              پنجره رنک: <span className="ltr">±{toFaDigits(ticket?.search_window ?? 75)}</span>
            </p>
            <p className="queue-status__hint">
              هرچه بیشتر صبر کنید، بازه جست‌وجو بازتر می‌شود تا حریف پیدا شود.
            </p>
            <Button variant="danger" onClick={() => void leaveQueue()} icon={<LogOut size={16} />}>
              انصراف از صف
            </Button>
          </div>
        ) : (
          <div className="queue-status queue-status--matched">
            <Crosshair size={30} aria-hidden="true" />
            <h2>حریف پیدا شد!</h2>
            {opponent ? (
              <p>
                {opponent.name} — رنک <span className="ltr">{toFaDigits(opponent.rating)}</span>
              </p>
            ) : null}
            <p className="queue-status__hint">
              <Timer size={14} aria-hidden="true" /> تا مهلت تأیید:{" "}
              <span className="ltr">{toFaDigits(acceptSeconds)}</span> ثانیه
            </p>
            <div className="queue-status__actions">
              <Button
                size="lg"
                onClick={() => void acceptMatch()}
                loading={queueView === "joining"}
                icon={<Swords size={18} aria-hidden="true" />}
              >
                آماده‌ام — شروع کن
              </Button>
              <Button variant="danger" onClick={() => void leaveQueue()}>
                انصراف (جریمه)
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
