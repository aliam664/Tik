import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { AdminGameRow } from "@/types/api";

export function AdminGamesPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [items, setItems] = useState<AdminGameRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listGames(token, 50, 0);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
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
        <LoadingSpinner size={24} label="دریافت بازی‌ها" />
      </div>
    );
  }

  return (
    <section className="admin-panel" aria-label="بازی‌های تمام‌شده">
      {items && items.length === 0 ? (
        <EmptyState title="هنوز بازی‌ای تمام نشده" description="با شروع بازی کاربران، نتایج اینجا ثبت می‌شود." />
      ) : items ? (
        <div className="table-wrap" role="region" aria-label="فهرست بازی‌ها" tabIndex={0}>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">اتاق</th>
                <th scope="col">نتیجه</th>
                <th scope="col">بازیکنان</th>
                <th scope="col">حرکت‌ها</th>
                <th scope="col">شروع</th>
                <th scope="col">پایان</th>
              </tr>
            </thead>
            <tbody>
              {items.map((g) => (
                <tr key={`${g.room_code}-${g.finished_at}`}>
                  <td className="ltr num">{g.room_code}</td>
                  <td>
                    {g.is_draw ? "مساوی" : `برد ${g.winner === "X" ? "X" : "O"}`}
                    <span className="mini-list__meta"> — بازی {toFaDigits(g.game_number)}</span>
                  </td>
                  <td>
                    {g.players?.map((p) => `${p.symbol}: ${p.name}`).join(" — ") || "—"}
                  </td>
                  <td className="num">{toFaDigits(g.move_count)}</td>
                  <td>{formatDateTime(g.started_at)}</td>
                  <td>{formatDateTime(g.finished_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="admin-panel__meta">مجموع: {toFaDigits(total)} بازی</p>
    </section>
  );
}
