import { useCallback, useEffect, useState } from "react";
import { Activity, Clock, DoorOpen, Swords, Users, XCircle } from "lucide-react";
import { LoadingSpinner, Skeleton } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { AdminOverview } from "@/types/api";

export function AdminOverviewPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await adminApi.overview(token));
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      setError(user.message);
      showToast(user.message, "error");
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired, showToast, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !overview) {
    return (
      <div className="room-loading">
        <LoadingSpinner size={26} label="دریافت آمار" />
      </div>
    );
  }

  if (error && !overview) {
    return <div className="state-card state-card--error" role="alert"><p>{error}</p></div>;
  }

  const cards = overview
    ? [
        { label: "اتاق‌های در انتظار", value: overview.rooms_waiting, icon: <DoorOpen size={18} aria-hidden="true" /> },
        { label: "بازی‌های زنده", value: overview.rooms_active, icon: <Activity size={18} aria-hidden="true" /> },
        { label: "بازی‌های تمام‌شده", value: overview.games_finished, icon: <Swords size={18} aria-hidden="true" /> },
        { label: "اتاق‌های منقضی", value: overview.rooms_expired, icon: <XCircle size={18} aria-hidden="true" /> },
        { label: "بازی در ۲۴ ساعت گذشته", value: overview.games_last_24h, icon: <Clock size={18} aria-hidden="true" /> },
        { label: "حرکت در ۲۴ ساعت گذشته", value: overview.moves_last_24h, icon: <Swords size={18} aria-hidden="true" /> },
        { label: "بازیکنان آنلاین", value: overview.players_online, icon: <Users size={18} aria-hidden="true" /> },
        { label: "اتاق‌های بسته‌شده", value: overview.rooms_closed, icon: <XCircle size={18} aria-hidden="true" /> },
      ]
    : [];

  return (
    <section className="admin-panel" aria-label="نمای کلی">
      {overview?.maintenance_mode ? (
        <div className="inline-warning" role="alert">
          حالت نگهداری فعال است — ساخت و ورود اتاق برای کاربران مسدود است.
        </div>
      ) : null}
      <div className="stat-grid">
        {cards.map((card) => (
          <div className="stat-card" key={card.label}>
            <span className="stat-card__icon">{card.icon}</span>
            <span className="stat-card__value num">{toFaDigits(card.value)}</span>
            <span className="stat-card__label">{card.label}</span>
          </div>
        ))}
      </div>
      {overview ? (
        <p className="admin-panel__meta">
          آخرین به‌روزرسانی: {formatDateTime(overview.server_now)} — همه اعداد از پایگاه‌داده واقعی خوانده می‌شوند.
        </p>
      ) : null}
      {loading && overview ? <Skeleton className="admin-panel__refresh-skeleton" /> : null}
    </section>
  );
}
