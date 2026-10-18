import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Copy,
  Flame,
  History,
  KeyRound,
  LogOut,
  RefreshCw,
  ShoppingBag,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount, ShCoin, TierBadge } from "@/components/ui/Coin";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useCopy } from "@/hooks/useCopy";
import { api } from "@/lib/api";
import { tierForRating, tierLabel } from "@/lib/elo";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import { playerIdentity } from "@/lib/playerSession";
import type { MyProfileResponse } from "@/types/api";

const LEDGER_LABELS: Record<string, string> = {
  welcome: "بسته خوش‌آمد",
  win_reward: "پاداش برد",
  draw_reward: "پاداش مساوی",
  loss_reward: "پاداش مشارکت",
  daily_bonus: "ورود روزانه",
  first_win: "اولین برد امروز",
  streak_bonus: "رشته برد",
  achievement: "دستاورد",
  season_reward: "جایزه فصل",
  rescue_grant: "بسته نجات",
  event_reward: "پاداش رویداد",
  stake_lock: "قفل ورودی شرط",
  stake_payout: "برد شرط",
  stake_refund: "بازگشت ورودی",
  stake_loss: "باخت شرط",
  shop_purchase: "خرید فروشگاه",
  name_change: "تغییر نام",
  admin_adjust: "اصلاح مدیر",
  admin_clawback: "پس‌گیری مدیر",
};

export function ProfilePage() {
  useDocumentTitle("پروفایل من | دوز آنلاین");
  const { showToast } = useToast();
  const copy = useCopy();
  const [data, setData] = useState<MyProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  const token = playerIdentity.token();

  const load = useCallback(async () => {
    if (!token) {
      setError("ابتدا در بخش «بازی رقابتی» یک پروفایل بسازید.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.getMyProfile(token);
      setData(res);
      setError(null);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "PLAYER_UNAUTHORIZED") {
        playerIdentity.clear();
        setError("نشست شما نامعتبر است. دوباره در بخش «بازی رقابتی» وارد شوید.");
      } else {
        setError(user.message);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="page">
        <LoadingSpinner size={28} label="در حال بارگذاری پروفایل" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <ErrorState
          title="پروفایل در دسترس نیست"
          description={error ?? "خطای ناشناخته"}
          onRetry={() => void load()}
        />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <Link to="/play">
            <Button variant="secondary">ساخت / ورود به پروفایل</Button>
          </Link>
        </div>
      </div>
    );
  }

  const p = data.profile;
  const s = p.stats;
  const winRate = s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0;
  const stored = playerIdentity.load();

  return (
    <div className="page">
      <section className="card profile-head">
        <div className="profile-head__main">
          <h1 className="card__title">{p.display_name}</h1>
          <div className="profile-head__badges">
            <TierBadge tier={p.rating.tier} />
            <span className="profile-head__rating ltr">
              <Trophy size={14} aria-hidden="true" /> {toFaDigits(p.rating.rating)}
            </span>
            {p.rating.placement_left > 0 ? (
              <span className="profile-head__placement">
                آشناسازی: {toFaDigits(p.rating.placement_left)} بازی مانده
              </span>
            ) : null}
          </div>
          <p className="profile-head__sub">
            تیر فعلی: {tierLabel(tierForRating(p.rating.rating))} — اوج امتیاز:{" "}
            <span className="ltr">{toFaDigits(p.rating.peak_rating)}</span>
          </p>
        </div>
        <div className="profile-head__wallet">
          <div className="wallet-chip">
            <ShCoin size={30} />
            <div>
              <strong className="ltr">{toFaDigits(p.balance)} sh</strong>
              <span>موجودی شریف‌کوین</span>
            </div>
          </div>
          <Link to="/shop">
            <Button variant="secondary" size="sm" icon={<ShoppingBag size={15} />}>
              فروشگاه
            </Button>
          </Link>
        </div>
      </section>

      <section className="stats-grid">
        <StatBox label="کل بازی‌ها" value={s.games} />
        <StatBox label="برد" value={s.wins} tone="pos" />
        <StatBox label="باخت" value={s.losses} tone="neg" />
        <StatBox label="مساوی" value={s.draws} />
        <StatBox label="درصد برد" value={`${toFaDigits(winRate)}٪`} />
        <StatBox label="بهترین رشته برد" value={s.best_win_streak} icon={<Flame size={15} />} />
        <StatBox label="بازی شرطی" value={s.stakes_played} />
        <StatBox label="برد شرطی" value={s.stakes_won} tone="pos" />
      </section>

      <section className="card recovery-card">
        <h2 className="card__title" style={{ fontSize: "1.05rem" }}>
          <KeyRound size={17} aria-hidden="true" /> کد بازیابی
        </h2>
        <p className="card__sub">
          این کد تنها راه بازگرداندن حساب روی دستگاه جدید است. جایی امن نگه دارید!
        </p>
        {showRecovery && stored ? (
          <div className="recovery-code-row">
            <code className="recovery-code ltr">{stored.recoveryCode}</code>
            <Button
              variant="secondary"
              size="sm"
              icon={<Copy size={14} />}
              onClick={() => {
                void copy.copy(stored.recoveryCode);
                showToast("کپی شد", "success");
              }}
            >
              کپی
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setShowRecovery(true)}>
            نمایش کد بازیابی
          </Button>
        )}
      </section>

      <section className="card">
        <h2 className="card__title" style={{ fontSize: "1.05rem" }}>
          <History size={17} aria-hidden="true" /> آخرین بازی‌ها
        </h2>
        {data.recent_matches.length === 0 ? (
          <p className="card__sub">هنوز بازی رسمی انجام نداده‌اید.</p>
        ) : (
          <div className="match-list">
            {data.recent_matches.map((m, i) => {
              const iWon = !m.is_draw && m.winner_symbol === m.my_symbol;
              const delta =
                m.my_rating_before !== null && m.my_rating_after !== null
                  ? m.my_rating_after - m.my_rating_before
                  : null;
              return (
                <div key={i} className={`match-row ${iWon ? "match-row--win" : m.is_draw ? "" : "match-row--loss"}`}>
                  <span className="match-row__result">
                    {m.is_draw ? "مساوی" : iWon ? "برد" : "باخت"}
                    {m.forfeit ? " (فنی)" : ""}
                  </span>
                  <span className="match-row__opp">
                    حریف: {m.opponent_name ?? "—"} · {m.mode === "stakes" ? `شرط ${toFaDigits(m.stake)}` : "رنکد"}
                  </span>
                  {delta !== null ? (
                    <span className={`match-row__delta ltr ${delta >= 0 ? "delta-pos" : "delta-neg"}`}>
                      {delta >= 0 ? "+" : "−"}
                      {Math.abs(delta)}
                    </span>
                  ) : null}
                  {m.my_coins !== null ? (
                    <CoinAmount amount={m.my_coins} signed size={14} />
                  ) : null}
                  <span className="match-row__time">{formatDateTime(m.finished_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card__title" style={{ fontSize: "1.05rem" }}>
          <ShCoin size={17} /> تاریخچه شریف‌کوین
        </h2>
        <div className="ledger-list">
          {data.recent_ledger.map((l, i) => (
            <div key={i} className="ledger-row">
              <span className="ledger-row__reason">{LEDGER_LABELS[l.reason] ?? l.reason}</span>
              <CoinAmount amount={l.amount} signed size={14} />
              <span className="ledger-row__balance ltr">موجودی: {toFaDigits(l.balance_after)}</span>
              <span className="match-row__time">{formatDateTime(l.created_at)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card__title" style={{ fontSize: "1.05rem" }}>
          <Trophy size={17} aria-hidden="true" /> دستاوردها
        </h2>
        <div className="ach-grid">
          {data.achievements.map((a) => (
            <div key={a.code} className={`ach ${a.achieved ? "ach--done" : ""}`}>
              <strong>{a.title}</strong>
              <span>{a.description}</span>
              <span className="ach__reward">
                <CoinAmount amount={a.reward_coins} size={13} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="profile-actions">
        <Button
          variant="ghost"
          icon={<RefreshCw size={15} />}
          onClick={() => {
            playerIdentity.clear();
            window.location.href = "/play";
          }}
        >
          <LogOut size={15} aria-hidden="true" /> خروج از حساب (پاک‌شدن نشست)
        </Button>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  tone?: "pos" | "neg";
  icon?: React.ReactNode;
}) {
  return (
    <div className={`stat-box ${tone ? `stat-box--${tone}` : ""}`}>
      <span className="stat-box__value ltr">
        {icon}
        {typeof value === "number" ? toFaDigits(value) : value}
      </span>
      <span className="stat-box__label">{label}</span>
    </div>
  );
}
