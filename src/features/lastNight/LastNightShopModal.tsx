import { useState } from "react";
import {
  MAGIC_BOOKS,
  MAX_EQUIPPED_SPELLBOOKS,
  MEDIEVAL_SHOP_ITEMS,
  MEDIEVAL_WEAPONS,
  SHERIFF_COIN_NAME,
} from "@/games/lastNight/catalog";
import type {
  LnRoomPlayer,
  MagicBookId,
  MedievalShopItemId,
  MedievalWeaponId,
} from "@/types/lastNight";

interface LastNightShopModalProps {
  open: boolean;
  onClose: () => void;
  teamSheriffCoins: number;
  me: LnRoomPlayer;
  busyId: string | null;
  onBuyWeapon: (weaponId: MedievalWeaponId) => Promise<void>;
  onEquipWeapon: (weaponId: MedievalWeaponId) => Promise<void>;
  onBuySpellbook: (bookId: MagicBookId) => Promise<void>;
  onToggleEquipSpellbook: (bookId: MagicBookId) => Promise<void>;
  onBuyItem: (itemId: MedievalShopItemId) => Promise<void>;
  onUseItem: (itemId: MedievalShopItemId) => Promise<void>;
}

export function LastNightShopModal({
  open,
  onClose,
  teamSheriffCoins,
  me,
  busyId,
  onBuyWeapon,
  onEquipWeapon,
  onBuySpellbook,
  onToggleEquipSpellbook,
  onBuyItem,
  onUseItem,
}: LastNightShopModalProps) {
  const [tab, setTab] = useState<"weapons" | "magic" | "items">("weapons");

  if (!open) return null;

  return (
    <div className="ln-modal-backdrop" role="dialog" aria-modal="true">
      <div className="ln-modal-card">
        <div className="ln-modal-header">
          <div>
            <span className="ln-badge-gold">آهنگری و دکان جادوگر دهکده</span>
            <h2 className="ln-modal-title">
              فروشگاه بقا و تجهیز جادو ({SHERIFF_COIN_NAME})
            </h2>
          </div>
          <div className="ln-modal-wallet">
            <span className="ln-coin-icon">🪙</span>
            <div>
              <div className="ln-wallet-label">خزانه مشترک تیم</div>
              <strong className="ln-wallet-amount">
                {teamSheriffCoins.toLocaleString("en-US")} {SHERIFF_COIN_NAME}
              </strong>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
              بستن [B]
            </button>
          </div>
        </div>

        <div className="ln-shop-banner-wrap">
          <img
            src="/assets/last-night/shop-banner.png"
            alt="Blacksmith Forge & Witch Apothecary Shop"
            className="ln-shop-banner-img"
          />
        </div>

        <div className="ln-shop-tabs">
          <button
            type="button"
            className={`ln-shop-tab ${tab === "weapons" ? "ln-shop-tab--active" : ""}`}
            onClick={() => setTab("weapons")}
          >
            ⚔️ سلاح‌های قرون‌وسطایی (۶)
          </button>
          <button
            type="button"
            className={`ln-shop-tab ${tab === "magic" ? "ln-shop-tab--active" : ""}`}
            onClick={() => setTab("magic")}
          >
            📖 کتاب‌های جادو ({me.equipped_spells.length}/{MAX_EQUIPPED_SPELLBOOKS} تجهیزشده)
          </button>
          <button
            type="button"
            className={`ln-shop-tab ${tab === "items" ? "ln-shop-tab--active" : ""}`}
            onClick={() => setTab("items")}
          >
            🧪 معجون‌ها، مهمات و ابزار (۱۱)
          </button>
        </div>

        {tab === "weapons" && (
          <div className="ln-shop-grid">
            {MEDIEVAL_WEAPONS.map((w) => {
              const owned = me.owned_weapons.includes(w.id);
              const equipped = me.equipped_weapon === w.id;
              const canAfford = teamSheriffCoins >= w.price;
              return (
                <div
                  key={w.id}
                  className={`ln-shop-item-card ${equipped ? "ln-shop-item-card--equipped" : ""}`}
                >
                  <div className="ln-shop-item-head">
                    <div>
                      <h4>{w.nameEn}</h4>
                      <span className="ln-sub">{w.nameFa}</span>
                    </div>
                    <span className="ln-price-pill">
                      {w.price === 0
                        ? "Free / رایگان"
                        : `${w.price} ${SHERIFF_COIN_NAME}`}
                    </span>
                  </div>
                  <p className="ln-item-desc">{w.descriptionFa}</p>
                  <div className="ln-stat-chips">
                    <span className="ln-chip">آسیب پایه: {w.damage}</span>
                    {w.kind === "firearm" && (
                      <span className="ln-chip ln-chip--warn">
                        تک‌تیر (نیازمند بارگذاری مجدد {w.reloadSec} ثانیه)
                      </span>
                    )}
                    {w.kind === "bow" && (
                      <span className="ln-chip">مصرف: ۱ تیر کمان در هر شلیک</span>
                    )}
                    {w.kind === "melee" && me.whetstone_stacks > 0 && (
                      <span className="ln-chip ln-chip--good">
                        سنگ چاقوتیزکن: +{me.whetstone_stacks * 10} آسیب دائمی
                      </span>
                    )}
                  </div>
                  <div className="ln-shop-item-foot">
                    {equipped ? (
                      <span className="ln-status-equipped">✓ در دست شوالیه</span>
                    ) : owned ? (
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={busyId === w.id}
                        onClick={() => void onEquipWeapon(w.id)}
                      >
                        تجهیز سلاح
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={!canAfford || busyId === w.id}
                        onClick={() => void onBuyWeapon(w.id)}
                      >
                        خرید با {w.price} {SHERIFF_COIN_NAME}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "magic" && (
          <div>
            <div className="ln-magic-rule-banner">
              <strong>قانون جادوی قرون‌وسطایی:</strong> هر بازیکن می‌تواند حداکثر{" "}
              <strong>{MAX_EQUIPPED_SPELLBOOKS} کتاب جادو</strong> را هم‌زمان تجهیز کند
              (کلیدهای <code>[Q]</code> و <code>[F]</code>). هر کتاب هزینه مانا و زمان
              استراحت (Cooldown) مستقل دارد و سرور آن را اعتبارسنجی می‌کند.
            </div>
            <div className="ln-shop-grid">
              {MAGIC_BOOKS.map((book) => {
                const owned = me.owned_spells.includes(book.id);
                const slotIdx = me.equipped_spells.indexOf(book.id);
                const equipped = slotIdx !== -1;
                const canAfford = teamSheriffCoins >= book.price;
                const slotsFull =
                  !equipped && me.equipped_spells.length >= MAX_EQUIPPED_SPELLBOOKS;

                return (
                  <div
                    key={book.id}
                    className={`ln-shop-item-card ${equipped ? "ln-shop-item-card--equipped" : ""}`}
                  >
                    <div className="ln-shop-item-head">
                      <div>
                        <h4>{book.nameEn}</h4>
                        <span className="ln-sub">{book.nameFa}</span>
                      </div>
                      <span className="ln-price-pill">
                        {book.price.toLocaleString("en-US")} {SHERIFF_COIN_NAME}
                      </span>
                    </div>
                    <p className="ln-item-desc">{book.descriptionFa}</p>
                    <div className="ln-stat-chips">
                      <span className="ln-chip">مانا: {book.manaCost}</span>
                      <span className="ln-chip">کول‌داون: {book.cooldownSec} ثانیه</span>
                      {book.directDamage > 0 && (
                        <span className="ln-chip">آسیب: {book.directDamage}</span>
                      )}
                    </div>
                    <div className="ln-shop-item-foot">
                      {!owned ? (
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={!canAfford || busyId === book.id}
                          onClick={() => void onBuySpellbook(book.id)}
                        >
                          خرید با {book.price.toLocaleString("en-US")} {SHERIFF_COIN_NAME}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`btn btn--sm ${equipped ? "btn--ghost" : "btn--secondary"}`}
                          disabled={slotsFull || busyId === book.id}
                          onClick={() => void onToggleEquipSpellbook(book.id)}
                        >
                          {equipped
                            ? `✓ تجهیزشده در اسلات ${slotIdx === 0 ? "[Q]" : "[F]"} (برداشتن)`
                            : slotsFull
                              ? "حداکثر ۲ کتاب تجهیز شده است"
                              : "تجهیز در اسلات جادو"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "items" && (
          <div className="ln-shop-grid">
            {MEDIEVAL_SHOP_ITEMS.map((item) => {
              const canAfford = teamSheriffCoins >= item.price;
              const invCount = Number(me.inventory?.[item.id] ?? 0);
              const isOwnedPassive = item.id === "lantern" && me.has_lantern;
              const isUsableConsumable =
                item.kind === "consumable" || item.kind === "trap";

              return (
                <div key={item.id} className="ln-shop-item-card">
                  <div className="ln-shop-item-head">
                    <div>
                      <h4>{item.nameEn}</h4>
                      <span className="ln-sub">{item.nameFa}</span>
                    </div>
                    <span className="ln-price-pill">
                      {item.price} {SHERIFF_COIN_NAME}
                    </span>
                  </div>
                  <p className="ln-item-desc">{item.descriptionFa}</p>
                  <div className="ln-stat-chips">
                    {item.id === "arrow_bundle" && (
                      <span className="ln-chip">موجودی تیر کمان: {me.arrows}</span>
                    )}
                    {item.id === "gunpowder_bullet" && (
                      <span className="ln-chip">موجودی باروت و گلوله: {me.bullets}</span>
                    )}
                    {item.id === "rusty_key" && (
                      <span className="ln-chip">کلیدهای زنگ‌زده شما: {me.rusty_keys}</span>
                    )}
                    {item.id === "whetstone" && (
                      <span className="ln-chip">
                        سطح فعلی سنگ چاقوتیزکن: {me.whetstone_stacks}/5
                      </span>
                    )}
                    {isUsableConsumable && (
                      <span className="ln-chip">در کوله‌پشتی: {invCount}</span>
                    )}
                  </div>
                  <div className="ln-shop-item-foot">
                    {isOwnedPassive ? (
                      <span className="ln-status-equipped">✓ فانوس روشن است</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={!canAfford || busyId === item.id}
                        onClick={() => void onBuyItem(item.id)}
                      >
                        خرید ({item.price} {SHERIFF_COIN_NAME})
                      </button>
                    )}
                    {isUsableConsumable && invCount > 0 && (
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={busyId === `use_${item.id}`}
                        onClick={() => void onUseItem(item.id)}
                      >
                        مصرف فوری ({invCount})
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
