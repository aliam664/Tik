import { useCallback, useEffect, useState } from "react";
import { Megaphone, Plus, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import type { PlatformSettings } from "@/types/api";

export function AdminSettingsPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [staff, setStaff] = useState<
    { id: string; username: string; role: string; is_active: boolean; created_at: string }[]
  >([]);
  const [saving, setSaving] = useState(false);

  const [ttlHours, setTtlHours] = useState("6");
  const [maxRooms, setMaxRooms] = useState("20");
  const [maxJoins, setMaxJoins] = useState("60");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");

  /* Announcement form */
  const [annBody, setAnnBody] = useState("");
  const [annLevel, setAnnLevel] = useState<"info" | "warn" | "event">("info");
  const [annHours, setAnnHours] = useState("24");

  const load = useCallback(async () => {
    try {
      const [s, admins] = await Promise.all([
        adminApi.getSettings(token),
        adminApi.listAdmins(token).catch(() => []),
      ]);
      setSettings(s);
      setStaff(admins);
      setTtlHours(String(s.room_ttl_hours));
      setMaxRooms(String(s.max_rooms_per_ip_per_hour));
      setMaxJoins(String(s.max_joins_per_ip_per_hour));
      setMaintenanceMode(s.maintenance_mode);
      setMaintenanceMessage(s.maintenance_message ?? "");
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
    }
  }, [onSessionExpired, showToast, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ttl = Number(ttlHours);
    const rooms = Number(maxRooms);
    const joins = Number(maxJoins);
    if (!Number.isFinite(ttl) || ttl < 1 || ttl > 72) {
      showToast("مدت انقضا باید بین ۱ تا ۷۲ ساعت باشد", "error");
      return;
    }
    if (!Number.isFinite(rooms) || rooms < 1 || rooms > 500) {
      showToast("سقف ساخت اتاق باید بین ۱ تا ۵۰۰ باشد", "error");
      return;
    }
    if (!Number.isFinite(joins) || joins < 1 || joins > 1000) {
      showToast("سقف ورود به اتاق باید بین ۱ تا ۱۰۰۰ باشد", "error");
      return;
    }
    setSaving(true);
    try {
      const next = await adminApi.updateSettings(token, {
        room_ttl_hours: ttl,
        max_rooms_per_ip_per_hour: rooms,
        max_joins_per_ip_per_hour: joins,
        maintenance_mode: maintenanceMode,
        maintenance_message: maintenanceMessage,
      });
      setSettings(next);
      showToast("تنظیمات ذخیره شد", "success");
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const publishAnnouncement = async () => {
    if (!annBody.trim()) return;
    setSaving(true);
    try {
      await adminApi.createAnnouncement(
        token,
        annBody.trim(),
        annLevel,
        Math.max(1, Number(annHours) || 24),
      );
      setAnnBody("");
      showToast("اطلاعیه سراسری منتشر شد.", "success");
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="room-loading">
        <LoadingSpinner size={24} label="دریافت تنظیمات" />
      </div>
    );
  }

  return (
    <section className="admin-panel" aria-label="تنظیمات سامانه">
      <form className="card settings-form" onSubmit={(e) => void submit(e)}>
        <h2 className="card__title">تنظیمات عملیاتی پلتفرم</h2>
        <p className="card__sub">تغییرات بلافاصله در سرور اعمال و در گزارش اقدامات ثبت می‌شود.</p>

        <div className="settings-grid">
          <FormField
            label="مدت اعتبار اتاق‌ها (ساعت)"
            htmlFor="ttl"
            hint="بین ۱ تا ۷۲ ساعت. پس از این مدت بدون فعالیت، اتاق منقضی می‌شود."
          >
            <Input
              id="ttl"
              type="number"
              min={1}
              max={72}
              dir="ltr"
              className="ltr num"
              value={ttlHours}
              onChange={(e) => setTtlHours(e.target.value)}
            />
          </FormField>

          <FormField
            label="حداکثر ساخت اتاق در ساعت (به ازای IP)"
            htmlFor="max-rooms"
            hint="محدودیت نرخ برای جلوگیری از اسپم (۱ تا ۵۰۰)."
          >
            <Input
              id="max-rooms"
              type="number"
              min={1}
              max={500}
              dir="ltr"
              className="ltr num"
              value={maxRooms}
              onChange={(e) => setMaxRooms(e.target.value)}
            />
          </FormField>

          <FormField
            label="حداکثر تلاش ورود در ساعت (به ازای IP)"
            htmlFor="max-joins"
            hint="محدودیت نرخ برای جلوگیری از حدس کد اتاق (۱ تا ۱۰۰۰)."
          >
            <Input
              id="max-joins"
              type="number"
              min={1}
              max={1000}
              dir="ltr"
              className="ltr num"
              value={maxJoins}
              onChange={(e) => setMaxJoins(e.target.value)}
            />
          </FormField>
        </div>

        <div className="settings-toggles">
          <label className="toggle-row toggle-row--warn">
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
            />
            <span>
              <strong>حالت نگهداری</strong>
              <small>ساخت و پیوستن به اتاق‌های جدید موقتاً غیرفعال می‌شود.</small>
            </span>
          </label>
        </div>

        <FormField
          label="پیام حالت نگهداری (اختیاری)"
          htmlFor="maint-msg"
          hint="در صورت فعال بودن حالت نگهداری نمایش داده می‌شود."
        >
          <Input
            id="maint-msg"
            maxLength={240}
            value={maintenanceMessage}
            onChange={(e) => setMaintenanceMessage(e.target.value)}
            placeholder="سامانه در حال به‌روزرسانی است…"
          />
        </FormField>

        <Button
          type="submit"
          loading={saving}
          icon={<Save size={16} aria-hidden="true" />}
        >
          ذخیره تنظیمات
        </Button>
      </form>

      {/* Announcements Broadcast */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="sys-card__title">
          <Megaphone size={17} aria-hidden="true" /> انتشار اطلاعیه سراسری در سایت
        </h3>
        <div className="admin-form-grid">
          <FormField label="متن اطلاعیه" htmlFor="ann-body">
            <Input
              id="ann-body"
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              placeholder="مثلاً: مسابقات فصل جدید با جوایز ویژه شریف‌کوین آغاز شد!"
            />
          </FormField>
          <FormField label="سطح اهمیت" htmlFor="ann-level">
            <select
              id="ann-level"
              className="admin-select"
              value={annLevel}
              onChange={(e) => setAnnLevel(e.target.value as "info" | "warn" | "event")}
            >
              <option value="info">اطلاع‌رسانی (Info)</option>
              <option value="event">رویداد / تورنمنت (Event)</option>
              <option value="warn">هشدار (Warn)</option>
            </select>
          </FormField>
          <FormField label="مدت نمایش (ساعت)" htmlFor="ann-hours">
            <Input
              id="ann-hours"
              value={annHours}
              onChange={(e) => setAnnHours(e.target.value)}
              className="ltr"
            />
          </FormField>
        </div>
        <div style={{ marginTop: 10 }}>
          <Button
            size="sm"
            loading={saving}
            icon={<Plus size={14} />}
            onClick={() => void publishAnnouncement()}
          >
            انتشار اطلاعیه
          </Button>
        </div>
      </div>

      {/* Staff / RBAC Overview */}
      {staff.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="sys-card__title">
            <ShieldCheck size={17} aria-hidden="true" /> مدیران و سطح دسترسی (RBAC)
          </h3>
          <div className="table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th scope="col">نام کاربری</th>
                  <th scope="col">نقش</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">تاریخ ایجاد</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((st) => (
                  <tr key={st.id}>
                    <td className="ltr mono">{st.username}</td>
                    <td className="ltr">{st.role}</td>
                    <td>{st.is_active ? "فعال" : "غیرفعال"}</td>
                    <td>{formatDateTime(st.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
