import { useCallback, useEffect, useState } from "react";
import { Check, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount, ShCoin } from "@/components/ui/Coin";
import { EmptyState, ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { getActiveGames } from "@/games/registry";
import { api } from "@/lib/api";
import { toUserError, type UserError } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";
import { playerIdentity } from "@/lib/playerSession";
import type { InventoryItem, ShopItem } from "@/types/api";

const RARITY_LABELS: Record<string, string> = {
  common: "معمولی",
  rare: "کمیاب",
  epic: "حماسی",
  legendary: "افسانه‌ای",
};

const KIND_LABELS: Record<string, string> = {
  board_theme: "تم صفحه",
  mark: "علامت بازی",
  frame: "قاب پروفایل",
  title: "عنوان",
  sound: "صدا",
};

export function ShopPage() {
  useDocumentTitle("فروشگاه | دوز آنلاین");
  const { showToast } = useToast();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserError | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const token = playerIdentity.token();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listShopItems();
      setItems(Array.isArray(list) ? list : []);
      if (token) {
        const me = await api.getMyProfile(token);
        setBalance(me.profile.balance);
        setInventory(me.inventory ?? []);
      } else {
        setInventory([]);
      }
      setError(null);
    } catch (err) {
      setError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = async (item: ShopItem) => {
    if (!token) {
      showToast("برای خرید ابتدا پروفایل بسازید (بخش بازی رقابتی).", "error");
      return;
    }
    setBusyItem(item.id);
    try {
      const res = await api.purchaseItem(token, item.id);
      const me = await api.getMyProfile(token);
      setBalance(res.balance);
      setInventory(me.inventory ?? []);
      showToast(`«${res.item}» خریداری شد؛ اکنون می‌توانید آن را تجهیز کنید.`, "success");
    } catch (err) {
      const user = toUserError(err);
      const messages: Record<string, string> = {
        INSUFFICIENT_FUNDS: "موجودی شریف‌کوین کافی نیست.",
        ITEM_OWNED: "این آیتم را قبلاً خریده‌اید.",
        ITEM_NOT_FOUND: "آیتم در دسترس نیست.",
      };
      showToast(messages[user.code] ?? user.message, "error");
    } finally {
      setBusyItem(null);
    }
  };

  const equip = async (item: ShopItem) => {
    if (!token) return;
    setBusyItem(item.id);
    try {
      await api.equipShopItem(token, item.id);
      const me = await api.getMyProfile(token);
      setInventory(me.inventory ?? []);
      showToast(`«${item.name}» برای حساب شما فعال شد.`, "success");
    } catch (err) {
      const user = toUserError(err);
      showToast(user.code === "ITEM_NOT_OWNED" ? "ابتدا این آیتم را بخرید." : user.message, "error");
    } finally {
      setBusyItem(null);
    }
  };

  const inventoryById = new Map(inventory.map((item) => [item.id, item]));

  return (
    <div className="page">
      <section className="card">
        <div className="lb-head">
          <div>
            <h1 className="card__title">
              <ShoppingBag size={22} aria-hidden="true" /> فروشگاه و خزانه Sheriff Coin
            </h1>
            <p className="card__sub">
              موجودی کیف پول رسمی شما با نام <strong>Sheriff Coin</strong> در تمام بازی‌های فعال پلتفرم (
              {getActiveGames().map((g, idx) => (
                <span key={g.id}>
                  {idx > 0 ? " · " : ""}
                  <strong>{g.title}</strong>
                </span>
              ))}
              ) یکپارچه است.
            </p>
          </div>
          {balance !== null ? <CoinAmount amount={balance} size={22} /> : null}
        </div>

        {loading ? (
          <LoadingSpinner size={26} label="در حال بارگذاری فروشگاه" />
        ) : error ? (
          <ErrorState title="خطا در فروشگاه" details={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="فروشگاه فعلاً خالی است"
            description="به‌زودی آیتم‌های آرایشی با شریف‌کوین اضافه می‌شود."
          />
        ) : (
          <div className="shop-grid">
            {items.map((item) => {
              const owned = inventoryById.get(item.id);
              return (
                <div
                  key={item.id}
                  className={`shop-item shop-item--${item.rarity} ${owned?.equipped ? "shop-item--equipped" : ""}`}
                >
                  <div className="shop-item__icon">
                    {owned?.equipped ? <Check size={22} aria-hidden="true" /> : <Sparkles size={22} aria-hidden="true" />}
                  </div>
                  <strong>{item.name}</strong>
                  <span className="shop-item__kind">{KIND_LABELS[item.kind] ?? item.kind}</span>
                  <span className="shop-item__rarity">{RARITY_LABELS[item.rarity] ?? item.rarity}</span>
                  <div className="shop-item__buy">
                    <span className="shop-item__price">
                      <ShCoin size={16} />
                      <span className="ltr">{toFaDigits(item.price)}</span>
                    </span>
                    {owned?.equipped ? (
                      <Button size="sm" variant="secondary" disabled icon={<Check size={14} />}>
                        فعال
                      </Button>
                    ) : owned ? (
                      <Button size="sm" loading={busyItem === item.id} onClick={() => void equip(item)}>
                        تجهیز
                      </Button>
                    ) : (
                      <Button size="sm" loading={busyItem === item.id} onClick={() => void buy(item)}>
                        خرید
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
