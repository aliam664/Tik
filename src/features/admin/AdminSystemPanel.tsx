import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  Play,
  RefreshCw,
  Server,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { ResourceGauge } from "./components/AdminCharts";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { AdminSystemMetrics } from "@/types/api";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${toFaDigits(days)} روز و ${toFaDigits(hours)} ساعت`;
  if (hours > 0) return `${toFaDigits(hours)} ساعت و ${toFaDigits(mins)} دقیقه`;
  return `${toFaDigits(mins)} دقیقه`;
}

export function AdminSystemPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<AdminSystemMetrics | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [browserRamMb, setBrowserRamMb] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t0 = performance.now();
    try {
      const res = await adminApi.systemMetrics(token);
      const rtt = Math.round(performance.now() - t0);
      setPingMs(rtt);
      setMetrics(res);
      setError(null);

      // Browser JS heap if supported
      const perf = performance as unknown as {
        memory?: { usedJSHeapSize: number };
      };
      if (perf.memory?.usedJSHeapSize) {
        setBrowserRamMb(Math.round((perf.memory.usedJSHeapSize / 1048576) * 10) / 10);
      }
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      setError(user.message);
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void load(), 6000);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  const runMaintenance = async (
    action: "cleanup" | "snapshot" | "matchmaking_tick" | "clear_stale_queue" | "close_expired_rooms",
    label: string,
  ) => {
    setActionBusy(action);
    try {
      const res = await adminApi.maintenanceAction(token, action);
      showToast(`${label} با موفقیت انجام شد (${toFaDigits(res.affected)} مورد).`, "success");
      await load();
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setActionBusy(null);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="room-loading">
        <LoadingSpinner size={26} label="در حال سنجش منابع سرور و دیتابیس" />
      </div>
    );
  }

  if (error && !metrics) {
    return <ErrorState title="خطا در دریافت وضعیت سرور" description={error} onRetry={() => void load()} />;
  }

  if (!metrics) return null;

  return (
    <section className="admin-panel" aria-label="مانیتورینگ منابع سرور">
      <div className="admin-panel-head">
        <div>
          <h2 className="card__title" style={{ fontSize: "1.15rem" }}>
            <Server size={19} aria-hidden="true" /> مانیتورینگ زنده سرور، CPU، رم و دیتابیس
          </h2>
          <p className="card__sub">
            موتور: <span className="ltr">{metrics.pg_version}</span> — آپتایم سرور:{" "}
            <strong>{formatUptime(metrics.uptime_seconds)}</strong>
          </p>
        </div>

        <div className="admin-panel-head__actions">
          <button
            type="button"
            className={`chip ${autoRefresh ? "chip--active" : ""}`}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            <Activity size={13} aria-hidden="true" />{" "}
            {autoRefresh ? "به‌روزرسانی خودکار (۶ ثانیه): روشن" : "به‌روزرسانی خودکار: خاموش"}
          </button>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} aria-hidden="true" />}
            onClick={() => void load()}
          >
            سنجش مجدد
          </Button>
        </div>
      </div>

      <div className="resource-gauges-grid">
        <ResourceGauge
          label="بار پردازنده (CPU / Workers)"
          sublabel="ظرفیت پردازشی فعال سرور"
          percent={metrics.cpu.usage_percent}
          detail={`فعال: ${metrics.cpu.active_workers} از ${metrics.cpu.max_workers} هسته/ورکر`}
        />
        <ResourceGauge
          label="اشغال رم و بافر (RAM)"
          sublabel="Shared Buffers + Work Memory"
          percent={metrics.ram.usage_percent}
          detail={`مصرف: ${metrics.ram.used_buffers_mb}MB + ${metrics.ram.work_mem_mb}MB`}
        />
        <ResourceGauge
          label="دیسک پایگاه داده (Storage)"
          sublabel="حجم کل دیتابیس از سهمیه"
          percent={metrics.storage.usage_percent}
          detail={`${metrics.storage.used_mb} MB / ${metrics.storage.quota_mb} MB`}
        />
        <ResourceGauge
          label="استخر اتصالات (Connections)"
          sublabel="نشست‌های همزمان دیتابیس"
          percent={metrics.connections.usage_percent}
          detail={`${metrics.connections.total} / ${metrics.connections.max_connections} (فعال: ${metrics.connections.active})`}
        />
      </div>

      <div className="sys-details-grid">
        <div className="card sys-card">
          <h3 className="sys-card__title">
            <Cpu size={16} aria-hidden="true" /> جزئیات حافظه رم و کش سرور
          </h3>
          <dl className="sys-kv-list">
            <div>
              <dt>Shared Buffers کل</dt>
              <dd className="ltr">{toFaDigits(metrics.ram.shared_buffers_mb)} MB</dd>
            </div>
            <div>
              <dt>بافرهای در حال استفاده</dt>
              <dd className="ltr">{toFaDigits(metrics.ram.used_buffers_mb)} MB</dd>
            </div>
            <div>
              <dt>بافرهای در انتظار نوشتن (Dirty)</dt>
              <dd className="ltr">{toFaDigits(metrics.ram.dirty_buffers_mb)} MB</dd>
            </div>
            <div>
              <dt>حافظه کاری نشست‌ها (Work Mem)</dt>
              <dd className="ltr">{toFaDigits(metrics.ram.work_mem_mb)} MB</dd>
            </div>
            <div>
              <dt>حافظه کش مؤثر سیستم‌عامل</dt>
              <dd className="ltr">{toFaDigits(metrics.ram.effective_cache_mb)} MB</dd>
            </div>
            <div>
              <dt>ضریب اصابت کش رم (Cache Hit Ratio)</dt>
              <dd className="ltr delta-pos">{toFaDigits(metrics.performance.cache_hit_ratio)}٪</dd>
            </div>
          </dl>
        </div>

        <div className="card sys-card">
          <h3 className="sys-card__title">
            <Wifi size={16} aria-hidden="true" /> شبکه، تاخیر و توان عملیاتی کوئری‌ها
          </h3>
          <dl className="sys-kv-list">
            <div>
              <dt>پینگ زنده تا سرور (RTT Latency)</dt>
              <dd className="ltr">
                {pingMs !== null ? `${toFaDigits(pingMs)} ms` : "—"}
              </dd>
            </div>
            <div>
              <dt>میانگین زمان اجرای کوئری در سرور</dt>
              <dd className="ltr">{toFaDigits(metrics.performance.query_avg_ms)} ms</dd>
            </div>
            <div>
              <dt>کل فراخوانی‌های SQL ثبت‌شده</dt>
              <dd className="ltr">{toFaDigits(metrics.performance.query_calls)}</dd>
            </div>
            <div>
              <dt>تراکنش‌های موفق (Commits)</dt>
              <dd className="ltr">{toFaDigits(metrics.performance.xact_commit)}</dd>
            </div>
            <div>
              <dt>تراکنش‌های بازگشتی / خطا (Rollbacks)</dt>
              <dd className="ltr">{toFaDigits(metrics.performance.xact_rollback)}</dd>
            </div>
            <div>
              <dt>رم مصرفی مرورگر شما (JS Heap)</dt>
              <dd className="ltr">
                {browserRamMb !== null ? `${toFaDigits(browserRamMb)} MB` : "بهینه"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="card sys-card" style={{ marginBottom: 18 }}>
        <h3 className="sys-card__title">
          <Zap size={16} aria-hidden="true" /> عملیات سریع نگهداری و بهینه‌سازی سرور
        </h3>
        <p className="card__sub" style={{ marginBottom: 12 }}>
          اجرای مستقیم وظایف پس‌زمینه روی دیتابیس بدون نیاز به دسترسی کنسول:
        </p>
        <div className="sys-actions-row">
          <Button
            variant="secondary"
            size="sm"
            loading={actionBusy === "cleanup"}
            icon={<Trash2 size={14} aria-hidden="true" />}
            onClick={() => void runMaintenance("cleanup", "پاک‌سازی داده‌های منقضی")}
          >
            پاک‌سازی اتاق‌ها و نشست‌های منقضی
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={actionBusy === "matchmaking_tick"}
            icon={<Play size={14} aria-hidden="true" />}
            onClick={() => void runMaintenance("matchmaking_tick", "اجرای موتور مچ‌میکینگ")}
          >
            اجرای فوری موتور صف (Matchmaking Tick)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={actionBusy === "snapshot"}
            icon={<Database size={14} aria-hidden="true" />}
            onClick={() => void runMaintenance("snapshot", "ثبت اسنپ‌شات اقتصادی")}
          >
            ثبت اسنپ‌شات اقتصاد روزانه
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={actionBusy === "clear_stale_queue"}
            icon={<Trash2 size={14} aria-hidden="true" />}
            onClick={() => void runMaintenance("clear_stale_queue", "پاک‌سازی صف‌های راکد")}
          >
            حذف بلیط‌های قدیمی صف
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={actionBusy === "close_expired_rooms"}
            icon={<HardDrive size={14} aria-hidden="true" />}
            onClick={() => void runMaintenance("close_expired_rooms", "بستن اتاق‌های منقضی")}
          >
            بستن تمام اتاق‌های منقضی
          </Button>
        </div>
      </div>

      <div className="card sys-card">
        <h3 className="sys-card__title">
          <HardDrive size={16} aria-hidden="true" /> تفکیک حجم جداول پایگاه داده
        </h3>
        <div className="table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th scope="col">نام جدول</th>
                <th scope="col">تخمین رکوردها</th>
                <th scope="col">حجم دیسک</th>
                <th scope="col">سهم از دیتابیس</th>
              </tr>
            </thead>
            <tbody>
              {metrics.tables.map((t) => {
                const pct =
                  metrics.storage.used_bytes > 0
                    ? Math.round((t.total_bytes / metrics.storage.used_bytes) * 1000) / 10
                    : 0;
                return (
                  <tr key={t.table_name}>
                    <td className="ltr mono">{t.table_name}</td>
                    <td className="ltr num">{toFaDigits(t.row_estimate)}</td>
                    <td className="ltr num">{t.size_pretty}</td>
                    <td>
                      <div className="table-share-bar">
                        <div className="table-share-bar__fill" style={{ width: `${Math.min(100, pct * 3)}%` }} />
                        <span className="ltr">{toFaDigits(pct)}٪</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="admin-panel__meta">
          زمان سرور: {formatDateTime(metrics.server_now)} — استارت دیتابیس: {formatDateTime(metrics.server_started_at)}
        </p>
      </div>
    </section>
  );
}
