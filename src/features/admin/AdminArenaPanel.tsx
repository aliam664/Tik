import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Coins,
  Crosshair,
  DoorOpen,
  Eye,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount, ShCoin, TierBadge } from "@/components/ui/Coin";
import { LoadingSpinner } from "@/components/ui/Feedback";
import { FormField, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  adminAiStorage,
  type AdminAiSettings,
  type AiDelayPreset,
} from "@/game/ai";
import { adminApi, api } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";
import { playerIdentity } from "@/lib/playerSession";
import { playerSession } from "@/lib/session";
import type {
  AdminRoomRow,
  GameMode,
  PlayerProfile,
  QueueTicket,
} from "@/types/api";

const STAKE_OPTIONS = [10, 25, 50, 100] as const;

const DELAY_OPTIONS: { id: AiDelayPreset; title: string; desc: string }[] = [
  { id: "fast", title: "سریع (۱ تا ۱.۸ ثانیه)", desc: "مکث کوتاه، مناسب بازی‌های سرعتی" },
  { id: "natural", title: "طبیعی و انسانی (۱.۸ تا ۳.۱ ثانیه)", desc: "پیشنهادی — کاملاً شبیه تفکر بازیکن حرفه‌ای" },
  { id: "thoughtful", title: "متفکر (۲.۵ تا ۴.۱ ثانیه)", desc: "مکث عمیق‌تر در حرکت‌های حساس" },
];

export function AdminArenaPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [displayName, setDisplayName] = useState(() => playerIdentity.load()?.displayName ?? "Admin_Master");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSetupRequired, setProfileSetupRequired] = useState(false);
  const [legacyPlayerToken, setLegacyPlayerToken] = useState("");
  const [legacyRecoveryCode, setLegacyRecoveryCode] = useState("");

  /* AI configuration */
  const [aiSettings, setAiSettings] = useState<AdminAiSettings>(() => adminAiStorage.load());
  const [autoAccept, setAutoAccept] = useState(true);

  /* Matchmaking queue state */
  const [mode, setMode] = useState<GameMode>("ranked");
  const [stake, setStake] = useState<number>(25);
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [opponent, setOpponent] = useState<{ name: string; rating: number } | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [acceptSeconds, setAcceptSeconds] = useState(0);

  /* Waiting rooms for instant 1-click join */
  const [waitingRooms, setWaitingRooms] = useState<AdminRoomRow[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  const pollRef = useRef<number | null>(null);
  const acceptingRef = useRef(false);
  const profileSyncInFlightRef = useRef(false);

  const updateAi = (patch: Partial<AdminAiSettings>) => {
    setAiSettings((prev) => {
      const next = { ...prev, ...patch };
      adminAiStorage.save(next);
      return next;
    });
  };

  /* ---------------- Load or initialize Admin Champion Profile ---------------- */
  const syncAdminProfile = useCallback(
    async (
      customName?: string,
      legacyCredentials?: { token: string; recoveryCode: string },
    ) => {
      if (profileSyncInFlightRef.current) return;
      profileSyncInFlightRef.current = true;
      setProfileBusy(true);
      try {
        const stored = playerIdentity.load();
        const res = await adminApi.ensureProfile(
          token,
          customName?.trim() || stored?.displayName || displayName,
          legacyCredentials?.token ?? stored?.token ?? null,
          legacyCredentials?.recoveryCode ?? stored?.recoveryCode ?? null,
        );
        playerIdentity.save({
          token: res.player_token,
          displayName: res.profile.display_name,
          recoveryCode:
            res.recovery_code ??
            (legacyCredentials?.token.trim()
              ? stored?.recoveryCode ?? ""
              : legacyCredentials?.recoveryCode ?? stored?.recoveryCode ?? ""),
          createdAt: res.profile.created_at ?? new Date().toISOString(),
        });
        setProfile(res.profile);
        setDisplayName(res.profile.display_name);
        setProfileSetupRequired(false);
        setLegacyPlayerToken("");
        setLegacyRecoveryCode("");
      } catch (err) {
        const user = toUserError(err);
        if (user.code === "ADMIN_UNAUTHORIZED") {
          onSessionExpired();
          return;
        }
        if (
          user.code === "ADMIN_PROFILE_SETUP_REQUIRED" ||
          user.code === "INVALID_RECOVERY_CODE"
        ) {
          setProfile(null);
          setProfileSetupRequired(true);
          if (!legacyCredentials) {
            const stored = playerIdentity.load();
            setLegacyPlayerToken(stored?.token ?? "");
            setLegacyRecoveryCode(stored?.recoveryCode ?? "");
          }
        } else if (user.code === "PLAYER_BANNED" || user.code === "WALLET_FROZEN") {
          setProfile(null);
          setProfileSetupRequired(false);
        }
        showToast(user.message, "error");
      } finally {
        profileSyncInFlightRef.current = false;
        setLoadingProfile(false);
        setProfileBusy(false);
      }
    },
    [displayName, onSessionExpired, showToast, token],
  );

  const loadWaitingRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const res = await adminApi.listRooms(token, { status: "waiting", limit: 20 });
      setWaitingRooms(res.items);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
      } else {
        showToast(user.message, "error");
      }
    } finally {
      setRoomsLoading(false);
    }
  }, [onSessionExpired, showToast, token]);

  useEffect(() => {
    void syncAdminProfile();
    void loadWaitingRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Queue Polling & Auto-Accept ---------------- */
  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const enterRoom = useCallback(
    (roomCode: string, seatToken: string, symbol: string) => {
      playerSession.save(roomCode, seatToken, symbol);
      stopPolling();
      // Ensure AI is enabled when launching from Arena
      adminAiStorage.save({ ...aiSettings, enabled: true });
      navigate(`/room/${roomCode}`);
    },
    [aiSettings, navigate, stopPolling],
  );

  const acceptMatch = useCallback(async () => {
    const pToken = playerIdentity.token();
    if (!pToken || acceptingRef.current) return;
    acceptingRef.current = true;
    try {
      const res = await api.queueAccept(pToken);
      if (res.room_code && res.player_token && res.symbol && res.both_accepted) {
        enterRoom(res.room_code, res.player_token, res.symbol);
        return;
      }
      if (res.room_code && res.player_token && res.symbol) {
        // Save seat credentials immediately; enter room where waiting state updates live via Realtime!
        enterRoom(res.room_code, res.player_token, res.symbol);
        return;
      }
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      acceptingRef.current = false;
    }
  }, [enterRoom, showToast]);

  const pollQueue = useCallback(async () => {
    const pToken = playerIdentity.token();
    if (!pToken) return;
    try {
      const res = await api.queueStatus(pToken);
      if (!res.ticket) {
        setTicket(null);
        setOpponent(null);
        stopPolling();
        return;
      }
      setTicket(res.ticket);
      setOpponent(res.opponent ?? null);
      setAcceptSeconds(
        res.ticket.accept_deadline
          ? Math.max(0, Math.ceil((new Date(res.ticket.accept_deadline).getTime() - Date.now()) / 1000))
          : 0,
      );

      if (res.ticket.status === "matched" && autoAccept) {
        void acceptMatch();
      }
    } catch {
      /* transient */
    }
  }, [acceptMatch, autoAccept, stopPolling]);

  const startQueue = async () => {
    if (!profile) {
      if (!profileSetupRequired) await syncAdminProfile();
      return;
    }
    const pToken = playerIdentity.token();
    if (!pToken) {
      await syncAdminProfile();
    }
    const activeToken = playerIdentity.token();
    if (!activeToken) return;

    setQueueBusy(true);
    try {
      const res = await adminApi.adminQueueJoin(
        token,
        activeToken,
        mode === "stakes" ? "stakes" : "ranked",
        mode === "stakes" ? stake : 0,
      );
      if (res.ticket) {
        setTicket(res.ticket);
        stopPolling();
        pollRef.current = window.setInterval(() => void pollQueue(), 1800);
        void pollQueue();
      }
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
    } finally {
      setQueueBusy(false);
    }
  };

  const cancelQueue = async () => {
    const pToken = playerIdentity.token();
    if (!pToken) return;
    try {
      await api.queueLeave(pToken);
    } catch {
      /* ignore */
    }
    stopPolling();
    setTicket(null);
    setOpponent(null);
  };

  const joinWaitingRoomWithAi = async (roomCode: string) => {
    setQueueBusy(true);
    try {
      const res = await api.joinRoom(roomCode, displayName.trim() || "Admin");
      enterRoom(res.room_code, res.player_token, res.symbol);
    } catch (err) {
      showToast(toUserError(err).message, "error");
      void loadWaitingRooms();
    } finally {
      setQueueBusy(false);
    }
  };

  const createAiRoom = async () => {
    setQueueBusy(true);
    try {
      const res = await api.createRoom(displayName.trim() || "Admin");
      enterRoom(res.room_code, res.player_token, res.symbol);
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setQueueBusy(false);
    }
  };

  const quickBoostSelf = async (coinsDelta: number, ratingDelta: number, setExact?: number) => {
    if (!profile) return;
    setProfileBusy(true);
    try {
      if (coinsDelta !== 0) {
        await adminApi.adjustCoins(token, profile.id, coinsDelta, "شارژ سریع حساب ادمین");
      }
      if (ratingDelta !== 0 || setExact !== undefined) {
        await adminApi.adjustRating(token, profile.id, {
          delta: ratingDelta,
          setExact: setExact ?? null,
          addGames: 10,
          addWins: 10,
          note: "ارتقای سریع رنک ادمین",
        });
      }
      await syncAdminProfile();
      showToast("حساب بازی ادمین ارتقا یافت.", "success");
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
    } finally {
      setProfileBusy(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="room-loading">
        <LoadingSpinner size={26} label="آماده‌سازی میدان نبرد هوش مصنوعی ادمین" />
      </div>
    );
  }

  return (
    <section className="admin-panel" aria-label="میدان نبرد هوش مصنوعی ادمین">
      {/* 1. Admin Champion Profile Banner */}
      <div className="card arena-hero-card">
        <div className="arena-hero__top">
          <div>
            <span className="admin-ai-hud__badge">
              <Bot size={16} aria-hidden="true" /> سیستم اختصاصی ادمین — غیرقابل باخت (Minimax + Fork Engine)
            </span>
            <h2 className="card__title" style={{ marginTop: 8 }}>
              ورود به مسابقه با هوش مصنوعی شکست‌ناپذیر
            </h2>
            <p className="card__sub">
              در این بخش می‌توانید مثل یک بازیکن عادی وارد صف مسابقه یا هر اتاق منتظری شوید؛ هوش مصنوعی با{" "}
              <strong>مکث طبیعی انسان‌گونه</strong> جای شما بازی می‌کند و از نظر ریاضی شکست‌ناپذیر است.
            </p>
          </div>

          {profile ? (
            <div className="arena-profile-box">
              <div className="arena-profile-box__head">
                <strong>{profile.display_name}</strong>
                <TierBadge tier={profile.rating.tier} />
              </div>
              <div className="arena-profile-box__stats">
                <CoinAmount amount={profile.balance} size={18} />
                <span className="ltr">
                  <Trophy size={14} aria-hidden="true" /> {toFaDigits(profile.rating.rating)} XP
                </span>
                <span>
                  {toFaDigits(profile.stats.wins)} برد / {toFaDigits(profile.stats.games)} بازی
                </span>
              </div>
              <div className="arena-profile-box__boosts">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={profileBusy}
                  icon={<Coins size={13} />}
                  onClick={() => void quickBoostSelf(5000, 0)}
                >
                  +۵۰۰۰ سکه
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={profileBusy}
                  icon={<Trophy size={13} />}
                  onClick={() => void quickBoostSelf(0, 200)}
                >
                  +۲۰۰ XP
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={profileBusy}
                  icon={<Sparkles size={13} />}
                  onClick={() => void quickBoostSelf(0, 0, 1850)}
                >
                  تیر استاد (۱۸۵۰)
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {profileSetupRequired ? (
          <div className="arena-name-bar" role="group" aria-label="پیوند امن پروفایل قدیمی ادمین">
            <p className="card__sub" role="alert" style={{ flexBasis: "100%", margin: 0 }}>
              برای جلوگیری از ساخت پروفایل جایگزین و دورزدن محدودیت‌های حساب، پیوند اولیه پروفایل قدیمی فقط با توکن و کد بازیابی همان حساب انجام می‌شود. اگر پروفایل قبلاً پیوند خورده و توکن این دستگاه را ندارید، کد بازیابی به‌تنهایی توکن تازه صادر می‌کند. حساب مسدود یا کیف پول قفل‌شده از هیچ‌یک از این مسیرها عبور نمی‌کند.
            </p>
            <FormField
              label="توکن پروفایل قدیمی"
              htmlFor="admin-legacy-player-token"
              hint="برای پیوند اولیه الزامی است؛ اگر پروفایل قبلاً به این ادمین متصل شده، برای بازیابی توکن می‌توانید آن را خالی بگذارید."
            >
              <Input
                id="admin-legacy-player-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={legacyPlayerToken}
                onChange={(event) => setLegacyPlayerToken(event.target.value)}
                placeholder="توکن بازیکن"
              />
            </FormField>
            <FormField label="کد بازیابی ۱۲ نویسه‌ای" htmlFor="admin-legacy-recovery-code">
              <Input
                id="admin-legacy-recovery-code"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                value={legacyRecoveryCode}
                onChange={(event) => setLegacyRecoveryCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))}
                placeholder="مثلاً ABCD2345EFGH"
              />
            </FormField>
            <Button
              variant="secondary"
              loading={profileBusy}
              disabled={!legacyPlayerToken.trim() && legacyRecoveryCode.length !== 12}
              onClick={() =>
                void syncAdminProfile(displayName, {
                  token: legacyPlayerToken.trim(),
                  recoveryCode: legacyRecoveryCode,
                })
              }
            >
              پیوند امن پروفایل قدیمی
            </Button>
          </div>
        ) : null}

        <div className="arena-name-bar">
          <FormField label="نام نمایشی شما در بازی" htmlFor="arena-display-name">
            <Input
              id="arena-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={24}
              placeholder="نام نمایشی در مچ"
            />
          </FormField>
          <Button
            variant="secondary"
            loading={profileBusy}
            onClick={() => void syncAdminProfile(displayName)}
          >
            ذخیره نام نمایشی
          </Button>
        </div>
      </div>

      {/* 2. AI Engine Configuration */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="sys-card__title">
          <Zap size={17} aria-hidden="true" /> تنظیمات موتور هوش مصنوعی و مکث انسان‌گونه
        </h3>
        <div className="arena-ai-options">
          <label className="arena-toggle-card">
            <input
              type="checkbox"
              checked={aiSettings.enabled}
              onChange={(e) => updateAi({ enabled: e.target.checked })}
            />
            <div>
              <strong>اجرای خودکار حرکت‌ها (Auto-Pilot)</strong>
              <span>هوش مصنوعی در نوبت شما پس از مکث طبیعی بهترین خانه را علامت می‌زند.</span>
            </div>
          </label>

          <label className="arena-toggle-card">
            <input
              type="checkbox"
              checked={aiSettings.showHints}
              onChange={(e) => updateAi({ showHints: e.target.checked })}
            />
            <div>
              <strong>نمایش رادار تحلیل خانه‌ها روی صفحه</strong>
              <span>نمایش تله‌های دوگانه و امتیاز هر خانه در اتاق بازی فقط برای شما.</span>
            </div>
          </label>

          <label className="arena-toggle-card">
            <input
              type="checkbox"
              checked={autoAccept}
              onChange={(e) => setAutoAccept(e.target.checked)}
            />
            <div>
              <strong>پذیرش خودکار مسابقه پس از پیدا شدن حریف</strong>
              <span>به‌محض پیدا شدن حریف در صف، بدون نیاز به کلیک وارد اتاق بازی شوید.</span>
            </div>
          </label>
        </div>

        <p className="stake-select__label" style={{ marginTop: 14 }}>
          <Timer size={14} aria-hidden="true" /> زمان مکث طبیعی قبل از هر حرکت (برای طبیعی دیده‌شدن بازی):
        </p>
        <div className="arena-delay-grid">
          {DELAY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`mode-card ${aiSettings.delayPreset === opt.id ? "mode-card--active" : ""}`}
              onClick={() => updateAi({ delayPreset: opt.id })}
            >
              <strong>{opt.title}</strong>
              <span>{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Matchmaking Queue & Direct Room Entry */}
      <div className="sys-details-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <h3 className="sys-card__title">
            <Swords size={17} aria-hidden="true" /> ۱. ورود به صف جست‌وجوی حریف (مثل کاربران عادی)
          </h3>

          {!ticket ? (
            <>
              <div className="mode-select" style={{ margin: "12px 0" }}>
                <button
                  type="button"
                  className={`mode-card ${mode === "ranked" ? "mode-card--active" : ""}`}
                  onClick={() => setMode("ranked")}
                >
                  <Swords size={20} aria-hidden="true" />
                  <strong>رده‌بندی‌شده (Ranked)</strong>
                  <span>امتیاز Elo + پاداش شریف‌کوین</span>
                </button>
                <button
                  type="button"
                  className={`mode-card ${mode === "stakes" ? "mode-card--active" : ""}`}
                  onClick={() => setMode("stakes")}
                >
                  <Sparkles size={20} aria-hidden="true" />
                  <strong>شرطی (Stakes)</strong>
                  <span>با رعایت حد شرط، شرایط صف و موجودی حساب متصل ادمین</span>
                </button>
              </div>

              {mode === "stakes" ? (
                <div className="stake-select">
                  <p className="stake-select__label">ورودی شرط (شریف‌کوین):</p>
                  <div className="stake-select__row">
                    {STAKE_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`stake-chip ${stake === s ? "stake-chip--active" : ""}`}
                        onClick={() => setStake(s)}
                      >
                        <ShCoin size={14} /> {toFaDigits(s)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <Button
                size="lg"
                fullWidth
                loading={queueBusy}
                disabled={!profile || profileBusy}
                icon={<Search size={18} aria-hidden="true" />}
                onClick={() => void startQueue()}
              >
                شروع جست‌وجوی حریف با هوش مصنوعی
              </Button>
            </>
          ) : ticket.status === "searching" ? (
            <div className="queue-status">
              <Loader2 size={28} className="spin" aria-hidden="true" />
              <h2>در حال جست‌وجوی حریف در صف…</h2>
              <p>
                زمان انتظار: <span className="ltr">{toFaDigits(ticket.wait_seconds)}s</span> — بازه رنک:{" "}
                <span className="ltr">±{toFaDigits(ticket.search_window ?? 100)}</span>
              </p>
              <Button variant="danger" icon={<LogOut size={15} />} onClick={() => void cancelQueue()}>
                خروج از صف
              </Button>
            </div>
          ) : (
            <div className="queue-status queue-status--matched">
              <Crosshair size={28} aria-hidden="true" />
              <h2>حریف پیدا شد!</h2>
              {opponent ? (
                <p>
                  حریف: <strong>{opponent.name}</strong> (رنک {toFaDigits(opponent.rating)})
                </p>
              ) : null}
              <p className="queue-status__hint">
                مهلت پذیرش: {toFaDigits(acceptSeconds)} ثانیه
              </p>
              <div className="queue-status__actions">
                <Button size="lg" icon={<Swords size={17} />} onClick={() => void acceptMatch()}>
                  ورود به بازی با AI
                </Button>
                <Button variant="danger" onClick={() => void cancelQueue()}>
                  انصراف
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="admin-panel-head">
            <h3 className="sys-card__title" style={{ margin: 0 }}>
              <DoorOpen size={17} aria-hidden="true" /> ۲. ورود فوری به اتاق‌های منتظر حریف
            </h3>
            <div style={{ display: "flex", gap: 6 }}>
              <Button
                size="sm"
                variant="ghost"
                loading={roomsLoading}
                icon={<RefreshCw size={13} />}
                onClick={() => void loadWaitingRooms()}
              >
                تازه‌سازی
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={queueBusy}
                icon={<Plus size={13} />}
                onClick={() => void createAiRoom()}
              >
                ساخت اتاق با AI
              </Button>
            </div>
          </div>

          {waitingRooms.length === 0 ? (
            <p className="card__sub" style={{ marginTop: 12 }}>
              در حال حاضر اتاقی در وضعیت «در انتظار بازیکن دوم» نیست. می‌توانید با دکمه بالا اتاق بسازید یا وارد صف شوید.
            </p>
          ) : (
            <div className="admin-mini-list" style={{ marginTop: 10 }}>
              {waitingRooms.map((r) => (
                <div key={r.room_code} className="admin-mini-row">
                  <div>
                    <strong className="ltr mono">{r.room_code}</strong>{" "}
                    <span className="mini-list__meta">
                      میزبان: {r.players?.[0]?.name ?? "ناشناس"}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    loading={queueBusy}
                    icon={<Bot size={14} />}
                    onClick={() => void joinWaitingRoomWithAi(r.room_code)}
                  >
                    ورود با AI
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="arena-tip-box">
            <Eye size={15} aria-hidden="true" />
            <span>
              نکته: هر زمان با نشست ادمین وارد هر اتاقی (`/room/:code`) شوید، پنل هوش مصنوعی شکست‌ناپذیر در بالای کنترل‌های اتاق برای شما فعال است.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
