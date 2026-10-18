import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Save, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount, ShCoin } from "@/components/ui/Coin";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { FormField, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";

interface EconomyRow {
  key: string;
  value: string;
  updated_at: string | null;
  updated_by: string;
}

export function AdminEconomyPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getEconomy(token);
      setData(res);
      setError(null);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") onSessionExpired();
      else if (user.code === "ADMIN_FORBIDDEN") setError("سطح دسترسی شما (اقتصاد) لازم است.");
      else setError(user.message);
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async () => {
    if (!editKey) return;
    setBusy(true);
    try {
      await adminApi.updateEconomyConfig(token, editKey, editValue.trim(), editReason.trim());
      showToast("پارامتر ذخیره شد.", "success");
      setEditKey(null);
      setEditValue("");
      setEditReason("");
      await load();
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") onSessionExpired();
      else if (user.code === "REASON_REQUIRED") showToast("دلیل تغییر الزامی است.", "error");
      else showToast(user.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingSpinner size={24} label="در حال بارگذاری اقتصاد" />;
  if (error || !data)
    return <ErrorState title="مرکز اقتصاد" description={error ?? "خطا"} onRetry={() => void load()} />;

  const faucet = (data.faucets_7d as { reason: string; total: number; cnt: number }[]) ?? [];
  const sink = (data.sinks_7d as { reason: string; total: number; cnt: number }[]) ?? [];
  const config = (data.config as EconomyRow[]) ?? [];
  const issued = Number(data.issued_7d ?? 0);
  const burned = Number(data.burned_7d ?? 0);
  const coverage = issued > 0 ? Math.round((burned / issued) * 100) : 0;
  const gini = Number(data.gini ?? 0);

  return (
    <section className="card">
      <div className="admin-panel-head">
        <h2 className="card__title" style={{ fontSize: "1.1rem" }}>
          <ShCoin size={18} /> مرکز اقتصاد شریف‌کوین
        </h2>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => void load()}>
          تازه‌سازی
        </Button>
      </div>

      <div className="econ-metrics">
        <Metric label="عرضه کل در گردش" value={toFaDigits(Number(data.total_supply ?? 0))} />
        <Metric label="تولید (۷ روز)" value={toFaDigits(issued)} tone="pos" />
        <Metric label="مصرف (۷ روز)" value={toFaDigits(burned)} tone="neg" />
        <Metric label="پوشش مصرف" value={`${toFaDigits(coverage)}٪`} warn={coverage < 80} />
        <Metric label="ضریب جینی" value={toFaDigits(Math.round(gini * 100) / 100)} warn={gini > 0.6} />
        <Metric label="ریک جمع‌شده (۷ روز)" value={toFaDigits(Number(data.rake_7d ?? 0))} />
        <Metric label="کیف پول‌ها" value={toFaDigits(Number(data.wallets ?? 0))} />
        <Metric label="میانه موجودی" value={toFaDigits(Number(data.median_balance ?? 0))} />
      </div>

      {coverage < 80 ? (
        <p className="econ-alert">
          <AlertTriangle size={15} aria-hidden="true" /> پوشش مصرف کمتر از ۸۰٪ است — خطر تورم!
        </p>
      ) : null}

      <div className="econ-columns">
        <div>
          <h3>
            <TrendingUp size={15} aria-hidden="true" /> بزرگ‌ترین منابع درآمد (۷ روز)
          </h3>
          <div className="admin-mini-list">
            {faucet.map((f, i) => (
              <div key={i} className="admin-mini-row">
                <span>{f.reason}</span>
                <CoinAmount amount={Number(f.total)} size={13} />
                <span className="ltr">{toFaDigits(f.cnt)} بار</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3>
            <TrendingDown size={15} aria-hidden="true" /> بزرگ‌ترین مصرف‌ها (۷ روز)
          </h3>
          <div className="admin-mini-list">
            {sink.map((s, i) => (
              <div key={i} className="admin-mini-row">
                <span>{s.reason}</span>
                <CoinAmount amount={Number(s.total)} size={13} />
                <span className="ltr">{toFaDigits(s.cnt)} بار</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3>پارامترهای زنده اقتصاد (قابل تغییر بدون انتشار نسخه)</h3>
      <div className="admin-table">
        <div className="admin-table__row admin-table__row--head">
          <span>کلید</span>
          <span>مقدار</span>
          <span>آخرین تغییر</span>
          <span />
        </div>
        {config.map((c) => (
          <div key={c.key} className="admin-table__row">
            <span className="ltr">{c.key}</span>
            <span className="ltr">{c.value}</span>
            <span className="ltr">
              {c.updated_by}
            </span>
            <span>
              <Button
                variant="ghost"
                size="sm"
                icon={<Save size={13} />}
                onClick={() => {
                  setEditKey(c.key);
                  setEditValue(c.value);
                  setEditReason("");
                }}
              >
                ویرایش
              </Button>
            </span>
          </div>
        ))}
      </div>

      <Modal
        open={editKey !== null}
        title={`ویرایش پارامتر: ${editKey ?? ""}`}
        onClose={() => setEditKey(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditKey(null)}>
              انصراف
            </Button>
            <Button loading={busy} disabled={!editReason.trim() || !editValue.trim()} onClick={() => void saveConfig()}>
              ذخیره تغییر
            </Button>
          </>
        }
      >
        <FormField label="مقدار جدید (عدد صحیح)" htmlFor="econ-value">
          <Input id="econ-value" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="ltr" />
        </FormField>
        <FormField label="دلیل تغییر (الزامی — در Audit ثبت می‌شود)" htmlFor="econ-reason">
          <Input id="econ-reason" value={editReason} onChange={(e) => setEditReason(e.target.value)} />
        </FormField>
      </Modal>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
  warn,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  warn?: boolean;
}) {
  return (
    <div className={`econ-metric ${tone ? `econ-metric--${tone}` : ""} ${warn ? "econ-metric--warn" : ""}`}>
      <strong className="ltr">{value}</strong>
      <span>{label}</span>
    </div>
  );
}
