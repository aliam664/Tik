import { useCallback, useEffect, useState } from "react";
import { ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount, ShCoin } from "@/components/ui/Coin";
import { EmptyState, ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { api } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";
import { playerIdentity } from "@/lib/playerSession";
import type { ShopItem } from "@/types/api";

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
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  const token = playerIdentity.token();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listShopItems();
      setItems(Array.isArray(list) ? list : []);
      if (token) {
        const me = await api.getMyProfile(token);
        setBalance(me.profile.balance);
      }
      setError(null);
    } catch (err) {
      setError(toUserError(err).message);
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
    setBuying(item.id);
    try {
      const res = await api.purchaseItem(token, item.id);
      setBalance(res.balance);
      showToast(`«${res.item}» خریداری شد!`, "success");
    } catch (err) {
      const user = toUserError(err);
      const messages: Record<string, string> = {
        INSUFFICIENT_FUNDS: "موجودی شریف‌کوین کافی نیست.",
        ITEM_OWNED: "این آیتم را قبلاً خریده‌اید.",
        ITEM_NOT_FOUND: "آیتم در دسترس نیست.",
      };
      showToast(messages[user.code] ?? user.message, "error");
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <div className="lb-head">
          <div>
            <h1 className="card__title">
              <ShoppingBag size={22} aria-hidden="true" /> فروشگاه آرایشی
            </h1>
            <p className="card__sub">
              همه آیتم‌ها فقط جنبه ظاهری دارند و هیچ برتری در بازی ایجاد نمی‌کنند.
            </p>
          </div>
          {balance !== null ? <CoinAmount amount={balance} size={22} /> : null}
        </div>

        {loading ? (
          <LoadingSpinner size={26} label="در حال بارگذاری فروشگاه" />
        ) : error ? (
          <ErrorState title="خطا در فروشگاه" description={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="فروشگاه فعلاً خالی است"
            description="به‌زودی آیتم‌های آرایشی با شریف‌کوین اضافه می‌شود."
          />
        ) : (
          <div className="shop-grid">
            {items.map((item) => (
              <div key={item.id} className={`shop-item shop-item--${item.rarity}`}>
                <div className="shop-item__icon">
                  <Sparkles size={22} aria-hidden="true" />
                </div>
                <strong>{item.name}</strong>
                <span className="shop-item__kind">{KIND_LABELS[item.kind] ?? item.kind}</span>
                <span className="shop-item__rarity">{RARITY_LABELS[item.rarity] ?? item.rarity}</span>
                <div className="shop-item__buy">
                  <span className="shop-item__price">
                    <ShCoin size={16} />
                    <span className="ltr">{toFaDigits(item.price)}</span>
                  </span>
                  <Button size="sm" loading={buying === item.id} onClick={() => void buy(item)}>
                    خرید
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
