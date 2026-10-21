import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { AuditRow } from "@/types/api";

export function AdminAuditPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [items, setItems] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.audit(token, 100, 0);
      setItems(res.items);
      setTotal(res.total);
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

  if (loading && !items) {
    return (
      <div className="room-loading">
        <LoadingSpinner size={24} label="دریافت گزارش عملیات" />
      </div>
    );
  }

  if (error && !items) {
    return (
      <ErrorState
        title="خطا در دریافت گزارش عملیات"
        description={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <section className="admin-panel" aria-label="گزارش عملیات مدیریتی">
      {error ? <p className="inline-warning" role="status">گزارش قدیمی نمایش داده می‌شود: {error}</p> : null}
      {items && items.length === 0 ? (
        <EmptyState title="گزارشی وجود ندارد" description="عملیات مدیریتی اینجا ثبت می‌شوند." />
      ) : items ? (
        <div className="table-wrap" role="region" aria-label="گزارش عملیات" tabIndex={0}>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">زمان</th>
                <th scope="col">عامل</th>
                <th scope="col">عملیات</th>
                <th scope="col">هدف</th>
                <th scope="col">نتیجه</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td className="ltr">{row.actor}</td>
                  <td className="ltr">{row.action}</td>
                  <td className="ltr num">{row.target ?? "—"}</td>
                  <td>
                    <span className={`status-pill ${row.result === "success" ? "status-pill--finished" : "status-pill--expired"}`}>
                      {row.result === "success" ? "موفق" : "ناموفق"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="admin-panel__meta">مجموع {toFaDigits(total)} رکورد — بدون ذخیره رمز یا توکن</p>
    </section>
  );
}
