import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, SearchX, ShieldAlert, UserX, XCircle } from "lucide-react";
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
  const [queueError, setQueueError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [flagsResult, queueResult] = await Promise.allSettled([
        adminApi.listRiskFlags(token, "open", 50),
        adminApi.matchmakingStats(token),
      ]);
      if (flagsResult.status === "rejected") throw flagsResult.reason;
      setFlags(flagsResult.value.items);
      setError(null);
      if (queueResult.status === "fulfilled") {
        setQueue(queueResult.value);
        setQueueError(null);
      } else {
        const queueUserError = toUserError(queueResult.reason);
        if (queueUserError.code === "ADMIN_UNAUTHORIZED") {
          onSessionExpired();
          return;
        }
        setQueue(null);
        setQueueError(queueUserError.message);
      }
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
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const kickFromQueue = async (playerId: string, name: string) => {
    setBusy(true);
    try {
      await adminApi.kickPlayer(token, {
        playerId,
        reason: "اخراج از صف جست‌وجو توسط مدیر",
      });
      showToast(`${name} از صف خارج شد.`, "success");
      await load();
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
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
          <ShieldAlert size={18} aria-hidden="true" /> یکپارچگی، ضدتقلب و پایش صف
        </h2>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => void load()}>
          تازه‌سازی
        </Button>
      </div>

      {queueError ? <p className="inline-warning" role="status">وضعیت صف دریافت نشد: {queueError}</p> : null}
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
          <div className="econ-metric">
            <strong className="ltr">{toFaDigits(Number(queue.matches_24h ?? 0))}</strong>
            <span>جفت‌شدن‌های ۲۴ ساعت</span>
          </div>
        </div>
      ) : null}

      {flags.length === 0 ? (
        <p className="card__sub">
          <CheckCircle2 size={16} aria-hidden="true" /> هیچ پرچم بازی وجود ندارد — همه‌چیز تمیز است.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th scope="col">نوع تخلف</th>
                <th scope="col">بازیکن مظنون</th>
                <th scope="col">حساب مرتبط</th>
                <th scope="col">زمان ثبت</th>
                <th scope="col">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={String(f.id)}>
                  <td>{FLAG_LABELS[String(f.kind)] ?? String(f.kind)}</td>
                  <td>{String(f.subject_name ?? "—")}</td>
                  <td>{String(f.related_name ?? "—")}</td>
                  <td>{formatDateTime(String(f.created_at))}</td>
                  <td>
                    <div className="row-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<CheckCircle2 size={13} />}
                        loading={busy}
                        onClick={() => void resolve(String(f.id), "resolved")}
                      >
                        تأیید تخلف
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<XCircle size={13} />}
                        loading={busy}
                        onClick={() => void resolve(String(f.id), "dismissed")}
                      >
                        رد پرچم
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {queue && (queue.searching as unknown[])?.length ? (
        <>
          <h3 style={{ marginTop: 18 }}>
            <SearchX size={15} aria-hidden="true" /> بلیط‌های در انتظار صف
          </h3>
          <div className="admin-mini-list">
            {((queue.searching as Record<string, unknown>[]) ?? []).map((t, i) => (
              <div key={i} className="admin-mini-row">
                <span>
                  <strong>{String(t.display_name)}</strong>
                </span>
                <span className="ltr">
                  {String(t.mode)} {Number(t.stake) > 0 ? `(${toFaDigits(Number(t.stake))} sh)` : ""} · رنک{" "}
                  {toFaDigits(Number(t.rating))}
                </span>
                <span className="ltr">{toFaDigits(Number(t.wait_seconds))}s</span>
                {t.player_id ? (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy}
                    icon={<UserX size={13} />}
                    onClick={() => void kickFromQueue(String(t.player_id), String(t.display_name))}
                  >
                    اخراج از صف
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
