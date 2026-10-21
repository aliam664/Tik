import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Flag, RefreshCw, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { FormField, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "زمان‌بندی‌شده",
  active: "در جریان",
  finished: "پایان‌یافته",
};

export function AdminSeasonsPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [seasons, setSeasons] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listSeasons(token);
      setSeasons(Array.isArray(res) ? res : []);
      setError(null);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") onSessionExpired();
      else if (user.code === "ADMIN_FORBIDDEN") setError("سطح دسترسی «رقابتی» لازم است.");
      else setError(user.message);
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);
    if (!name.trim()) {
      showToast("نام فصل را وارد کنید.", "error");
      return;
    }
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      showToast("تاریخ پایان باید پس از تاریخ شروع باشد.", "error");
      return;
    }

    setBusy(true);
    try {
      await adminApi.createSeason(
        token,
        name.trim(),
        new Date(startsAt).toISOString(),
        new Date(endsAt).toISOString(),
      );
      showToast("فصل ساخته شد.", "success");
      setCreateOpen(false);
      setName("");
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

  const end = async (id: string) => {
    setBusy(true);
    try {
      const res = await adminApi.endSeason(token, id);
      showToast(`فصل پایان یافت — جوایز ${toFaDigits(res.players)} بازیکن پرداخت شد.`, "success");
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

  return (
    <section className="card">
      <div className="admin-panel-head">
        <h2 className="card__title" style={{ fontSize: "1.1rem" }}>
          <Flag size={18} aria-hidden="true" /> فصل‌های رقابتی
        </h2>
        <div className="admin-panel-head__actions">
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => void load()}>
            تازه‌سازی
          </Button>
          <Button size="sm" icon={<CalendarPlus size={14} />} onClick={() => setCreateOpen(true)}>
            فصل جدید
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner size={22} label="در حال بارگذاری فصل‌ها" />
      ) : error ? (
        <ErrorState title="فصل‌ها" description={error} onRetry={() => void load()} />
      ) : seasons.length === 0 ? (
        <p className="card__sub">هنوز فصلی ساخته نشده است. با «فصل جدید» اولین فصل را بسازید.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th scope="col">نام فصل</th>
                <th scope="col">تاریخ شروع</th>
                <th scope="col">تاریخ پایان</th>
                <th scope="col">وضعیت</th>
                <th scope="col">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={String(s.id)}>
                  <td>
                    <strong>{String(s.name)}</strong>
                  </td>
                  <td>{formatDateTime(String(s.starts_at))}</td>
                  <td>{formatDateTime(String(s.ends_at))}</td>
                  <td>{STATUS_LABELS[String(s.status)] ?? String(s.status)}</td>
                  <td>
                    {s.status !== "finished" ? (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<StopCircle size={13} />}
                        loading={busy}
                        onClick={() => void end(String(s.id))}
                      >
                        پایان فصل + جوایز + ریست نرم
                      </Button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        title="ساخت فصل جدید"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              انصراف
            </Button>
            <Button
              loading={busy}
              disabled={!name.trim() || !startsAt || !endsAt}
              onClick={() => void create()}
            >
              ساخت فصل
            </Button>
          </>
        }
      >
        <FormField label="نام فصل" htmlFor="season-name">
          <Input id="season-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="تاریخ شروع" htmlFor="season-start">
          <Input
            id="season-start"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="ltr"
          />
        </FormField>
        <FormField label="تاریخ پایان" htmlFor="season-end">
          <Input
            id="season-end"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="ltr"
          />
        </FormField>
      </Modal>
    </section>
  );
}
