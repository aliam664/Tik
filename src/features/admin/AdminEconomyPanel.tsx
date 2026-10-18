import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/ui/Coin";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { FormField, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ActivityAreaChart, HorizontalBarChart } from "./components/AdminCharts";
import { adminApi, api } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { ShopItem } from "@/types/api";

const REASON_LABELS: Record<string, string> = {
  welcome: "بسته خوش‌آمد",
  signup_bonus: "هدیه ثبت‌نام",
  daily_bonus: "هدیه روزانه",
  win_reward: "پاداش برد رده‌بندی",
  draw_reward: "پاداش مساوی",
  loss_reward: "پاداش حضور",
  first_win: "اولین برد روزانه",
  streak_bonus: "پاداش رشته برد",
  rescue_grant: "بسته نجات",
  event_reward: "پاداش رویداد",
  stake_lock: "قفل شرط‌بندی",
  stake_payout: "جایزه شرط‌بندی",
  stake_refund: "بازگشت شرط",
  stake_loss: "باخت شرط",
  stake_rake: "کارمزد شرط‌بندی",
  achievement: "دستاورد",
  shop_purchase: "خرید فروشگاه",
  name_change: "تغییر نام",
  season_reward: "جایزه فصل",
  admin_adjust: "اعطا/اصلاح مدیر",
  admin_clawback: "کسر توسط مدیر",
  admin_grant: "اعطای مدیر",
  admin_deduct: "کسر مدیر",
};

export function AdminEconomyPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editReason, setEditReason] = useState("");
  const [busy, setBusy] = useState(false);

  /* Shop item creation form */
  const [showAddShop, setShowAddShop] = useState(false);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("frame");
  const [rarity, setRarity] = useState("rare");
  const [price, setPrice] = useState("250");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, items] = await Promise.all([
        adminApi.getEconomy(token),
        api.listShopItems().catch(() => [] as ShopItem[]),
      ]);
      setData(res);
      setShopItems(items);
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

  const saveConfig = async () => {
    if (!editKey) return;
    setBusy(true);
    try {
      await adminApi.updateEconomyConfig(token, editKey, editVal, editReason);
      showToast("پارامتر اقتصادی ذخیره شد.", "success");
      setEditKey(null);
      setEditReason("");
      await load();
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (historyId: number) => {
    setBusy(true);
    try {
      await adminApi.rollbackEconomyConfig(token, historyId, "بازگردانی از پنل");
      showToast("مقدار قبلی بازگردانی شد.", "success");
      await load();
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateShopItem = async () => {
    if (!sku.trim() || !name.trim()) return;
    setBusy(true);
    try {
      await adminApi.createShopItem(token, {
        sku: sku.trim().toLowerCase(),
        name: name.trim(),
        kind,
        price: Math.max(0, Number(price) || 100),
        rarity,
      });
      showToast("آیتم جدید در فروشگاه ثبت شد.", "success");
      setSku("");
      setName("");
      setShowAddShop(false);
      await load();
    } catch (err) {
      showToast(toUserError(err).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingSpinner size={24} label="در حال بارگذاری مرکز اقتصاد" />;
  if (error || !data) return <ErrorState title="دریافت اطلاعات اقتصادی ناموفق بود" description={error ?? ""} onRetry={() => void load()} />;

  const config = (data.config as Record<string, unknown>[]) ?? [];
  const history = (data.config_history as Record<string, unknown>[]) ?? [];
  const byReason = (data.by_reason as Record<string, unknown>[]) ?? [];
  const topHolders = (data.top_holders as Record<string, unknown>[]) ?? [];
  const snapshots = (data.snapshots as Record<string, unknown>[]) ?? [];

  const snapshotSeries = [...snapshots].reverse().map((s) => ({
    label: String(s.day ?? "").slice(5),
    primary: Number(s.issued_today ?? 0),
    secondary: Number(s.burned_today ?? 0),
  }));

  const reasonBars = byReason.slice(0, 8).map((r) => ({
    label: REASON_LABELS[String(r.reason)] ?? String(r.reason),
    value: Math.abs(Number(r.total ?? 0)),
    color: Number(r.total ?? 0) >= 0 ? "#39c98a" : "#ff6577",
  }));

  return (
    <section className="admin-panel" aria-label="مدیریت اقتصاد و شریف‌کوین">
      <div className="card">
        <div className="admin-panel-head">
          <h2>مرکز فرماندهی اقتصاد شریف‌کوین</h2>
          <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} onClick={() => void load()}>
            تازه‌سازی
          </Button>
        </div>

        {Boolean(data.inflation_alert) ? (
          <div className="econ-alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>هشدار تورم: خالص تزریق سکه در ۲۴ ساعت اخیر بیش از ۲۰٪ عرضه کل است.</span>
          </div>
        ) : null}

        <div className="econ-metrics">
          <div className="econ-metric">
            <CoinAmount amount={Number(data.total_supply)} size={20} />
            <span>کل عرضه در گردش</span>
          </div>
          <div className="econ-metric econ-metric--pos">
            <CoinAmount amount={Number(data.issued_24h)} signed size={20} />
            <span>تزریق ۲۴ ساعت (Faucet)</span>
          </div>
          <div className="econ-metric econ-metric--neg">
            <CoinAmount amount={-Number(data.burned_24h)} signed size={20} />
            <span>سوزاندن ۲۴ ساعت (Sink)</span>
          </div>
          <div className="econ-metric">
            <CoinAmount amount={Number(data.net_24h)} signed size={20} />
            <span>خالص ۲۴ ساعت</span>
          </div>
          <div className="econ-metric">
            <strong className="ltr">{toFaDigits(String(data.velocity_24h))}x</strong>
            <span>سرعت گردش (Velocity)</span>
          </div>
        </div>

        <div className="charts-grid-2">
          <ActivityAreaChart
            title="روند اسنپ‌شات‌های روزانه اقتصاد"
            subtitle="مقایسه سکه تزریق‌شده و سوزانده‌شده"
            primaryLabel="تولید سکه"
            secondaryLabel="مصرف سکه"
            primaryColor="#39c98a"
            secondaryColor="#ff6577"
            data={snapshotSeries}
          />
          <HorizontalBarChart
            title="حجم گردش مالی بر اساس علت (۷ روز)"
            subtitle="مجموع قدرمطلق تراکنش‌های دفتر کل"
            items={reasonBars}
          />
        </div>

        <div className="econ-columns">
          <div>
            <h3>
              <TrendingUp size={16} aria-hidden="true" /> تفکیک منابع و مصارف (۷ روز)
            </h3>
            <div className="admin-mini-list">
              {byReason.map((r, i) => (
                <div key={i} className="admin-mini-row">
                  <span>{REASON_LABELS[String(r.reason)] ?? String(r.reason)}</span>
                  <span className="ltr">{toFaDigits(Number(r.tx_count))} تراکنش</span>
                  <CoinAmount amount={Number(r.total)} signed size={14} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3>ثروتمندترین حساب‌ها</h3>
            <div className="admin-mini-list">
              {topHolders.map((h, i) => (
                <div key={i} className="admin-mini-row">
                  <span>
                    #{toFaDigits(i + 1)} {String(h.display_name)}
                  </span>
                  <CoinAmount amount={Number(h.balance)} size={14} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <h3>تنظیم زنده پارامترهای اقتصادی (بدون نیاز به دیپلوی)</h3>
        <div className="admin-mini-list">
          {config.map((c) => {
            const k = String(c.key);
            const isEditing = editKey === k;
            return (
              <div key={k} className="admin-mini-row">
                <div>
                  <strong className="ltr">{k}</strong>
                  <div style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>{String(c.description)}</div>
                </div>
                {isEditing ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Input
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      className="ltr"
                      placeholder="مقدار جدید"
                    />
                    <Input
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="علت تغییر (الزامی)"
                    />
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={editReason.trim().length < 3}
                      icon={<Save size={14} />}
                      onClick={() => void saveConfig()}
                    >
                      ذخیره
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditKey(null)}>
                      انصراف
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <code className="ltr">{JSON.stringify(c.value)}</code>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditKey(k);
                        setEditVal(String(c.value));
                      }}
                    >
                      ویرایش
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {history.length > 0 ? (
          <>
            <h3 style={{ marginTop: 18 }}>تاریخچه تغییرات و بازگردانی (Rollback)</h3>
            <div className="admin-mini-list">
              {history.slice(0, 10).map((h) => (
                <div key={Number(h.id)} className="admin-mini-row">
                  <span className="ltr">{String(h.key)}</span>
                  <span className="ltr">
                    {JSON.stringify(h.old_value)} → {JSON.stringify(h.new_value)}
                  </span>
                  <span>{String(h.reason ?? "")}</span>
                  <span>{formatDateTime(String(h.created_at))}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw size={13} />}
                    disabled={busy}
                    onClick={() => void rollback(Number(h.id))}
                  >
                    بازگردانی
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Shop Items Management */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="admin-panel-head">
          <h2>
            <ShoppingBag size={18} aria-hidden="true" /> مدیریت آیتم‌های فروشگاه ({toFaDigits(shopItems.length)})
          </h2>
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={() => setShowAddShop((v) => !v)}
          >
            افزودن / ویرایش آیتم فروشگاه
          </Button>
        </div>

        {showAddShop ? (
          <div className="admin-player-actions" style={{ marginBottom: 14 }}>
            <div className="admin-form-grid">
              <FormField label="شناسه کالا (SKU)" htmlFor="shop-sku">
                <Input
                  id="shop-sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="ltr"
                  placeholder="frame-diamond"
                />
              </FormField>
              <FormField label="نام فارسی کالا" htmlFor="shop-name">
                <Input
                  id="shop-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="قاب الماس درخشان"
                />
              </FormField>
              <FormField label="دسته" htmlFor="shop-kind">
                <select
                  id="shop-kind"
                  className="admin-select"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="frame">قاب پروفایل (frame)</option>
                  <option value="board_theme">تم صفحه (board_theme)</option>
                  <option value="mark">علامت بازی (mark)</option>
                  <option value="title">عنوان افتخاری (title)</option>
                  <option value="sound">افکت صوتی (sound)</option>
                </select>
              </FormField>
              <FormField label="کمیابی" htmlFor="shop-rarity">
                <select
                  id="shop-rarity"
                  className="admin-select"
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value)}
                >
                  <option value="common">معمولی (common)</option>
                  <option value="rare">کمیاب (rare)</option>
                  <option value="epic">حماسی (epic)</option>
                  <option value="legendary">افسانه‌ای (legendary)</option>
                </select>
              </FormField>
              <FormField label="قیمت (sh)" htmlFor="shop-price">
                <Input
                  id="shop-price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="ltr"
                />
              </FormField>
            </div>
            <div style={{ marginTop: 10 }}>
              <Button size="sm" loading={busy} onClick={() => void handleCreateShopItem()}>
                ذخیره آیتم در فروشگاه
              </Button>
            </div>
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">نام آیتم</th>
                <th scope="col">دسته</th>
                <th scope="col">کمیابی</th>
                <th scope="col">قیمت</th>
              </tr>
            </thead>
            <tbody>
              {shopItems.map((it) => (
                <tr key={it.id}>
                  <td className="ltr mono">{it.sku}</td>
                  <td>
                    <strong>{it.name}</strong>
                  </td>
                  <td>{it.kind}</td>
                  <td className="ltr">{it.rarity}</td>
                  <td>
                    <CoinAmount amount={it.price} size={14} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
