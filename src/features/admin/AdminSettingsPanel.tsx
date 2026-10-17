import { useCallback, useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
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
  const [ttl, setTtl] = useState("");
  const [maxRooms, setMaxRooms] = useState("");
  const [maxJoins, setMaxJoins] = useState("");
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await adminApi.getSettings(token);
      setSettings(s);
      setTtl(String(s.room_ttl_hours));
      setMaxRooms(String(s.max_rooms_per_ip_per_hour));
      setMaxJoins(String(s.max_joins_per_ip_per_hour));
      setMaintenance(s.maintenance_mode);
      setMaintenanceMsg(s.maintenance_message);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") onSessionExpired();
      else showToast(user.message, "error");
    }
  }, [onSessionExpired, showToast, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const ttlNum = Number(ttl);
    const roomsNum = Number(maxRooms);
    const joinsNum = Number(maxJoins);
    if (!Number.isInteger(ttlNum) || ttlNum < 1 || ttlNum > 48) {
      showToast("مدت اعتبار اتاق باید عدد صحیح بین ۱ تا ۴۸ باشد.", "error");
      return;
    }
    if (!Number.isInteger(roomsNum) || roomsNum < 1 || roomsNum > 200) {
      showToast("محدودیت ساخت اتاق باید بین ۱ تا ۲۰۰ باشد.", "error");
      return;
    }
    if (!Number.isInteger(joinsNum) || joinsNum < 1 || joinsNum > 600) {
      showToast("محدودیت ورود باید بین ۱ تا ۶۰۰ باشد.", "error");
      return;
    }
    setSaving(true);
    try {
      const updated = await adminApi.updateSettings(token, {
        room_ttl_hours: ttlNum,
        max_rooms_per_ip_per_hour: roomsNum,
        max_joins_per_ip_per_hour: joinsNum,
        maintenance_mode: maintenance,
        maintenance_message: maintenanceMsg,
      });
      setSettings(updated);
      showToast("تنظیمات با موفقیت ثبت شد", "success");
    } catch (err) {
      const user = toUserError(err);
      showToast(user.message, "error");
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
    <section className="admin-panel" aria-label="تنظیمات پلتفرم">
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <div className="settings-grid">
          <FormField label="مدت اعتبار اتاق (ساعت)" htmlFor="set-ttl" hint="۱ تا ۴۸ ساعت">
            <Input id="set-ttl" value={ttl} onChange={(e) => setTtl(e.target.value)} inputMode="numeric" className="num" />
          </FormField>
          <FormField label="حداکثر ساخت اتاق در ساعت (هر IP)" htmlFor="set-rooms">
            <Input id="set-rooms" value={maxRooms} onChange={(e) => setMaxRooms(e.target.value)} inputMode="numeric" className="num" />
          </FormField>
          <FormField label="حداکثر ورود به اتاق در ساعت (هر IP)" htmlFor="set-joins">
            <Input id="set-joins" value={maxJoins} onChange={(e) => setMaxJoins(e.target.value)} inputMode="numeric" className="num" />
          </FormField>
        </div>

        <div className="settings-maintenance">
          <label className="switch-row" htmlFor="set-maintenance">
            <input
              id="set-maintenance"
              type="checkbox"
              checked={maintenance}
              onChange={(e) => setMaintenance(e.target.checked)}
            />
            <span>
              <strong>حالت نگهداری سرویس</strong>
              <span className="mini-list__meta">
                با فعال‌شدن، ساخت و ورود اتاق برای کاربران مسدود می‌شود.
              </span>
            </span>
          </label>
          <FormField label="پیام نگهداری" htmlFor="set-maint-msg" hint="حداکثر ۲۰۰ کاراکتر">
            <Input
              id="set-maint-msg"
              value={maintenanceMsg}
              onChange={(e) => setMaintenanceMsg(e.target.value.slice(0, 200))}
              placeholder="مثلاً: تا یک ساعت بعد برمی‌گردیم"
              maxLength={200}
            />
          </FormField>
        </div>

        <div className="settings-actions">
          <Button type="submit" loading={saving}>
            ذخیره تنظیمات
          </Button>
          <span className="mini-list__meta">
            آخرین تغییر: {new Date(settings.updated_at).toLocaleString("fa-IR")}
          </span>
        </div>
      </form>
    </section>
  );
}
