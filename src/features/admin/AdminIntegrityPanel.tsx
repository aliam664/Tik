import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, SearchX, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";

const FLAG_LABELS: Record<string, string> = {
  frequent_pair: "بازی مکرر دو حساب",
  alternating_wins: "برد/باخت متناوب (مشکوک به تبانی)",
  shared_ip: "ثبت‌نام چندگانه از یک IP",
  suspicious_perfect_play: "بازی کامل غیرانسانی (ربات؟)",
  stake_loss_cap_hit: "رسیدن به سقف باخت روزانه",
  multi_account_cluster: "خوشه چندحسابی",
};

export function AdminIntegrityPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [flags, setFlags] = useState<Record<string, unknown>[]>([]);
  const [queue, setQueue] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, q] = await Promise.all([
        adminApi.listRiskFlags(token, "open", 50),
        adminApi.matchmakingStats(token).catch(() => null),
      ]);
      setFlags(f.items);
      setQueue(q);
      setError(null);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") onSessionExpired();
      else setError(user.message);
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (id: string, resolution: "resolved" | "dismissed") => {
    setBusy(true);
    try {
      await adminApi.resolveRiskFlag(token, id, resolution);
      showToast(resolution === "resolved" ? "پرچم تأیید شد." : "پرچم رد شد.", "success");
      await load();
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingSpinner size={24} label="در حال بارگذاری پرچم‌ها" />;
  if (error) return <ErrorState title="مرکز یکپارچگی" description={error} onRetry={() => void load()} />;

  return (
    <section className="card">
      <div className="admin-panel-head">
        <h2 className="card__title" style={{ fontSize: "1.1rem" }}>
          <ShieldAlert size={18} aria-hidden="true" /> یکپارچگی و ضدتقلب
        </h2>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => void load()}>
          تازه‌سازی
        </Button>
      </div>

      {queue ? (
        <div className="econ-metrics">
          <div className="econ-metric">
            <strong className="ltr">{toFaDigits(Number(queue.dodges_24h ?? 0))}</strong>
            <span>داج (۲۴ ساعت)</span>
          </div>
          <div className="econ-metric">
            <strong className="ltr">{toFaDigits(Number(queue.avg_wait_seconds ?? 0))}s</strong>
            <span>میانگین زمان انتظار</span>
          </div>
          <div className="econ-metric">
            <strong className="ltr">{toFaDigits(Number(queue.avg_rating_gap_24h ?? 0))}</strong>
            <span>میانگین اختلاف رنک بازی‌ها</span>
          </div>
        </div>
      ) : null}

      {flags.length === 0 ? (
        <p className="card__sub">
          <CheckCircle2 size={16} aria-hidden="true" /> هیچ پرچم بازی وجود ندارد — همه‌چیز تمیز است.
        </p>
      ) : (
        <div className="admin-table">
          <div className="admin-table__row admin-table__row--head">
            <span>نوع</span>
            <span>بازیکن</span>
            <span>مرتبط</span>
            <span>زمان</span>
            <span />
          </div>
          {flags.map((f) => (
            <div key={String(f.id)} className="admin-table__row">
              <span>{FLAG_LABELS[String(f.kind)] ?? String(f.kind)}</span>
              <span>{String(f.subject_name ?? "—")}</span>
              <span>{String(f.related_name ?? "—")}</span>
              <span>{formatDateTime(String(f.created_at))}</span>
              <span className="admin-table__actions">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<CheckCircle2 size={13} />}
                  loading={busy}
                  onClick={() => void resolve(String(f.id), "resolved")}
                >
                  تأیید
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<XCircle size={13} />}
                  loading={busy}
                  onClick={() => void resolve(String(f.id), "dismissed")}
                >
                  رد
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      {queue && (queue.searching as unknown[])?.length ? (
        <>
          <h3>
            <SearchX size={15} aria-hidden="true" /> بلیط‌های در انتظار صف
          </h3>
          <div className="admin-mini-list">
            {((queue.searching as Record<string, unknown>[]) ?? []).map((t, i) => (
              <div key={i} className="admin-mini-row">
                <span>{String(t.display_name)}</span>
                <span className="ltr">
                  {String(t.mode)} · {toFaDigits(Number(t.rating))}
                </span>
                <span className="ltr">{toFaDigits(Number(t.wait_seconds))}s</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
