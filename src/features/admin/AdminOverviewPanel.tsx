import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  Coins,
  DoorOpen,
  Flame,
  RefreshCw,
  ShieldAlert,
  Swords,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import {
  ActivityAreaChart,
  DonutChart,
  HorizontalBarChart,
  ResourceGauge,
} from "./components/AdminCharts";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { AdminDashboardData, AdminSystemMetrics } from "@/types/api";

export function AdminOverviewPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [dash, setDash] = useState<AdminDashboardData | null>(null);
  const [sys, setSys] = useState<AdminSystemMetrics | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [dashboardResult, systemResult] = await Promise.allSettled([
        adminApi.dashboard(token),
        adminApi.systemMetrics(token),
      ]);
      if (dashboardResult.status === "rejected") throw dashboardResult.reason;
      setDash(dashboardResult.value);
      if (systemResult.status === "fulfilled") {
        setSys(systemResult.value);
        setSystemError(null);
      } else {
        const user = toUserError(systemResult.reason);
        if (user.code === "ADMIN_UNAUTHORIZED") {
          onSessionExpired();
          return;
        }
        setSys(null);
        setSystemError(user.message);
      }
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

  if (loading && !dash) {
    return (
      <div className="room-loading">
        <LoadingSpinner size={26} label="دریافت داشبورد و نمودارها" />
      </div>
    );
  }

  if (error && !dash) {
    return <ErrorState title="خطا در بارگذاری داشبورد" description={error} onRetry={() => void load()} />;
  }

  if (!dash) return null;

  const cards = [
    { label: "کل بازیکنان ثبت‌شده", value: dash.players_total, icon: <Users size={18} /> },
    { label: "فعال در ۲۴ ساعت", value: dash.players_active_24h, icon: <Activity size={18} /> },
    { label: "آنلاین در اتاق‌ها", value: dash.players_online, icon: <Flame size={18} /> },
    { label: "اتاق‌های باز (فعال/انتظار)", value: dash.rooms_active, icon: <DoorOpen size={18} /> },
    { label: "در صف جست‌وجو", value: dash.queue_searching + dash.queue_matched, icon: <Swords size={18} /> },
    { label: "بازی‌های ۲۴ ساعت", value: dash.games_24h, icon: <Trophy size={18} /> },
    { label: "حرکت‌های ۲۴ ساعت", value: dash.moves_24h, icon: <Activity size={18} /> },
    { label: "بازی شرطی (۲۴ ساعت)", value: dash.stakes_24h, icon: <Coins size={18} /> },
    { label: "کل عرضه شریف‌کوین", value: dash.total_supply, icon: <Coins size={18} /> },
    { label: "سکه تولیدی (۲۴ ساعت)", value: dash.issued_24h, icon: <Coins size={18} /> },
    { label: "پرچم‌های ضدتقلب باز", value: dash.open_risk_flags, icon: <ShieldAlert size={18} /> },
    { label: "مسدودیت‌های فعال", value: dash.active_bans ?? 0, icon: <Ban size={18} /> },
  ];

  const activityTrend = (dash.daily_activity ?? []).map((pt) => ({
    label: pt.day.slice(5),
    primary: Number(pt.moves ?? 0),
    secondary: Number(pt.games ?? 0),
  }));

  const economyTrend = (dash.daily_activity ?? []).map((pt) => ({
    label: pt.day.slice(5),
    primary: Number(pt.issued ?? 0),
    secondary: Number(pt.burned ?? 0),
  }));

  const modeSlices = [
    { label: "دوستانه", value: Number(dash.mode_breakdown?.friendly ?? 0), color: "#7c6cff" },
    { label: "رده‌بندی‌شده", value: Number(dash.mode_breakdown?.ranked ?? 0), color: "#39c98a" },
    { label: "شرطی (Stakes)", value: Number(dash.mode_breakdown?.stakes ?? 0), color: "#f2b85b" },
  ];

  const outcomeSlices = [
    { label: "برد X", value: Number(dash.outcome_breakdown?.x_wins ?? 0), color: "#7c6cff" },
    { label: "برد O", value: Number(dash.outcome_breakdown?.o_wins ?? 0), color: "#39c98a" },
    { label: "مساوی", value: Number(dash.outcome_breakdown?.draws ?? 0), color: "#56b6c2" },
    { label: "باخت فنی / اخراج", value: Number(dash.outcome_breakdown?.forfeits ?? 0), color: "#ff6577" },
  ];

  const tierItems = [
    { label: "برنز (< ۱۰۰۰)", value: Number(dash.tier_distribution?.bronze ?? 0), color: "#cd7f32" },
    { label: "نقره (۱۰۰۰–۱۱۹۹)", value: Number(dash.tier_distribution?.silver ?? 0), color: "#b8c4d0" },
    { label: "طلا (۱۲۰۰–۱۳۹۹)", value: Number(dash.tier_distribution?.gold ?? 0), color: "#f2b85b" },
    { label: "پلاتین (۱۴۰۰–۱۵۹۹)", value: Number(dash.tier_distribution?.platinum ?? 0), color: "#4fd1c5" },
    { label: "الماس (۱۶۰۰–۱۷۹۹)", value: Number(dash.tier_distribution?.diamond ?? 0), color: "#7c6cff" },
    { label: "استاد (۱۸۰۰+)", value: Number(dash.tier_distribution?.master ?? 0), color: "#ff6577" },
  ];

  return (
    <section className="admin-panel" aria-label="نمای کلی و نمودارها">
      <div className="admin-panel-head">
        <div>
          <h2 className="card__title" style={{ fontSize: "1.15rem" }}>
            مرکز فرماندهی و آمار زنده پلتفرم
          </h2>
          <p className="card__sub">
            آخرین همگام‌سازی با سرور: {formatDateTime(dash.server_now)}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={loading}
          icon={<RefreshCw size={14} aria-hidden="true" />}
          onClick={() => void load()}
        >
          به‌روزرسانی زنده
        </Button>
      </div>

      {dash.maintenance_mode ? (
        <div className="inline-warning" role="alert">
          <AlertTriangle size={16} aria-hidden="true" /> حالت نگهداری فعال است — ساخت و ورود اتاق برای کاربران مسدود است.
        </div>
      ) : null}

      {sys ? (
        <div className="resource-gauges-grid" aria-label="وضعیت منابع سرور">
          <ResourceGauge
            label="پردازنده سرور (CPU)"
            sublabel="بار پردازشی ورکرها و کوئری‌ها"
            percent={sys.cpu.usage_percent}
            detail={`${sys.cpu.active_workers} / ${sys.cpu.max_workers} Workers`}
          />
          <ResourceGauge
            label="حافظه رم و بافر (RAM)"
            sublabel="Shared Buffers + Work Mem"
            percent={sys.ram.usage_percent}
            detail={`${sys.ram.used_buffers_mb} / ${sys.ram.shared_buffers_mb} MB`}
          />
          <ResourceGauge
            label="فضای پایگاه داده (Disk)"
            sublabel="حجم کل جداول و ایندکس‌ها"
            percent={sys.storage.usage_percent}
            detail={`${sys.storage.used_mb} / ${sys.storage.quota_mb} MB`}
          />
          <ResourceGauge
            label="استخر اتصالات (Pool)"
            sublabel="نشست‌های باز روی دیتابیس"
            percent={sys.connections.usage_percent}
            detail={`${sys.connections.total} / ${sys.connections.max_connections} Conn`}
          />
        </div>
      ) : systemError ? (
        <p className="inline-warning" role="status">داده‌های منابع سرور دریافت نشد: {systemError}</p>
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

      <div className="charts-grid-2">
        <ActivityAreaChart
          title="نمودار فعالیت ۷ روز اخیر"
          subtitle="تعداد حرکت‌ها و بازی‌های ثبت‌شده در هر روز"
          primaryLabel="حرکت‌ها"
          secondaryLabel="بازی‌ها"
          primaryColor="#7c6cff"
          secondaryColor="#39c98a"
          data={activityTrend}
        />
        <ActivityAreaChart
          title="نمودار جریان شریف‌کوین (۷ روز اخیر)"
          subtitle="مقایسه سکه تولیدشده (Faucet) و سکه مصرف‌شده (Sink)"
          primaryLabel="تولید سکه"
          secondaryLabel="مصرف سکه"
          primaryColor="#f2b85b"
          secondaryColor="#ff6577"
          data={economyTrend}
        />
      </div>

      <div className="charts-grid-3">
        <DonutChart
          title="تفکیک حالت‌های بازی"
          centerLabel="کل بازی‌ها"
          slices={modeSlices}
        />
        <DonutChart
          title="تفکیک نتایج بازی‌ها"
          centerLabel="پایان‌یافته"
          slices={outcomeSlices}
        />
        <HorizontalBarChart
          title="توزیع تیر و سطح بازیکنان"
          subtitle="بر اساس امتیاز Elo فعلی"
          items={tierItems}
        />
      </div>

      <div className="admin-quick-summary">
        <span>
          <XCircle size={14} aria-hidden="true" /> اتاق‌های منقضی: {toFaDigits(dash.rooms_expired)}
        </span>
        <span>
          اتاق‌های بسته‌شده: {toFaDigits(dash.rooms_closed)}
        </span>
        <span>
          بازی‌های پایان‌یافته: {toFaDigits(dash.games_finished)}
        </span>
      </div>
    </section>
  );
}
