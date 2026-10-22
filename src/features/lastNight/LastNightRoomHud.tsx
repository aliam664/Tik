import type { Dispatch, SetStateAction } from "react";
import { Link } from "react-router-dom";
import {
  getMagicBookSpec,
  getWeaponSpec,
  MAX_EQUIPPED_SPELLBOOKS,
  SHERIFF_COIN_NAME,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@/games/lastNight/catalog";
import { medievalAudio } from "@/games/lastNight/sound";
import type { LnRoomPlayer, LnRoomStateResponse, MagicBookId, MedievalShopItemId, MedievalWeaponId } from "@/types/lastNight";
import { LastNightShopModal } from "./LastNightShopModal";

const QUICK_BELT_ITEMS: { id: MedievalShopItemId; key: string; shortFa: string }[] = [
  { id: "small_heal_potion", key: "1", shortFa: "معجون کوچک (+30 HP)" },
  { id: "large_heal_potion", key: "2", shortFa: "معجون بزرگ (+70 HP)" },
  { id: "mana_potion", key: "3", shortFa: "معجون مانا (+40 MP)" },
  { id: "fire_oil", key: "4", shortFa: "روغن آتشین (۲۰s)" },
  { id: "protective_charm", key: "5", shortFa: "طلسم محافظ (۱۰s)" },
  { id: "thorn_trap", key: "6", shortFa: "تله خاردار" },
];

export type LnHudSnapshot = {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  arrows: number;
  bullets: number;
  rustyKeys: number;
  downed: boolean;
  loadedFirearm: boolean;
  reloadRemainingSec: number;
  spellCooldowns: Record<string, number>;
  fireOilSec: number;
  protectionSec: number;
  charmSec: number;
  shadowsSec: number;
  spiritSec: number;
  enemiesRemaining: number;
  nearestPromptFa: string | null;
  activeBoss: {
    nameFa: string;
    nameEn: string;
    hp: number;
    maxHp: number;
    phase: 1 | 2 | 3;
    portraitUrl: string;
  } | null;
};

type AimSim = {
  aimX: number;
  aimY: number;
  mouseDown: boolean;
  touchMoveX: number;
  touchMoveY: number;
};

export interface LastNightRoomHudProps {
  theaterMode: boolean;
  setTheaterMode: Dispatch<SetStateAction<boolean>>;
  normalizedCode: string;
  currentMapSpec: { nameFa: string };
  currentWeaponSpec: ReturnType<typeof getWeaponSpec>;
  state: LnRoomStateResponse["state"] | undefined;
  me: LnRoomPlayer | null;
  ally: LnRoomPlayer | null;
  shopOpen: boolean;
  setShopOpen: Dispatch<SetStateAction<boolean>>;
  autoAimEnabled: boolean;
  setAutoAimEnabled: Dispatch<SetStateAction<boolean>>;
  soundMuted: boolean;
  setSoundMuted: Dispatch<SetStateAction<boolean>>;
  errorBanner: string | null;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
  toastBanner: string | null;
  isFinished: boolean;
  isPrepOrWaiting: boolean;
  joinName: string;
  setJoinName: Dispatch<SetStateAction<string>>;
  joining: boolean;
  handleJoinRoom: () => void | Promise<void>;
  hudSnapshot: LnHudSnapshot;
  simRef: { current: AimSim };
  setCanvasElement: Dispatch<SetStateAction<HTMLCanvasElement | null>>;
  busyId: string | null;
  handleStartCampaign: () => void | Promise<void>;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  handleUseItem: (id: MedievalShopItemId) => Promise<void>;
  setTouchVector: (vx: number, vy: number) => void;
  triggerPrimaryAttack: () => void;
  handleCastSpellSlot: (slot: 0 | 1) => void | Promise<void>;
  handleInteractNearest: () => void | Promise<void>;
  handleReloadOrRevive: () => void | Promise<void>;
  handleBuyWeapon: (id: MedievalWeaponId) => Promise<void>;
  handleEquipWeapon: (id: MedievalWeaponId) => Promise<void>;
  handleBuySpellbook: (id: MagicBookId) => Promise<void>;
  handleToggleEquipSpellbook: (id: MagicBookId) => Promise<void>;
  handleBuyItem: (id: MedievalShopItemId) => Promise<void>;
}

export function LastNightRoomHud({
  theaterMode,
  setTheaterMode,
  normalizedCode,
  currentMapSpec,
  currentWeaponSpec,
  state,
  me,
  ally,
  shopOpen,
  setShopOpen,
  autoAimEnabled,
  setAutoAimEnabled,
  soundMuted,
  setSoundMuted,
  errorBanner,
  setErrorBanner,
  toastBanner,
  isFinished,
  isPrepOrWaiting,
  joinName,
  setJoinName,
  joining,
  handleJoinRoom,
  hudSnapshot,
  simRef,
  setCanvasElement,
  busyId,
  handleStartCampaign,
  navigate,
  handleUseItem,
  setTouchVector,
  triggerPrimaryAttack,
  handleCastSpellSlot,
  handleInteractNearest,
  handleReloadOrRevive,
  handleBuyWeapon,
  handleEquipWeapon,
  handleBuySpellbook,
  handleToggleEquipSpellbook,
  handleBuyItem,
}: LastNightRoomHudProps) {
  return (
    <section
      className={`page-container ln-room-page ${theaterMode ? "ln-room-page--theater" : ""}`}
    >
      <div className="ln-top-bar">
        <div className="ln-top-bar__left">
          <Link to="/games/last-night" className="btn btn--ghost btn--sm">
            ← لابی Last Night
          </Link>
          <span className="ln-room-code-badge" dir="ltr">
            ROOM: {normalizedCode}
          </span>
          <span className="ln-map-pill">
            🗺️ {currentMapSpec.nameFa} — موج{" "}
            <strong>{state?.wave ?? 1}</strong> از <strong>10</strong>
          </span>
        </div>

        <div className="ln-top-bar__right">
          <div
            className="ln-sheriff-wallet"
            title={`خزانه مشترک تیم (${SHERIFF_COIN_NAME})`}
          >
            <span className="ln-coin-icon">🪙</span>
            <div>
              <small>خزانه تیم ({SHERIFF_COIN_NAME})</small>
              <strong>
                {(state?.sheriff_coins ?? 0).toLocaleString("en-US")}{" "}
                {SHERIFF_COIN_NAME}
              </strong>
            </div>
          </div>

          {me && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setShopOpen(true)}
            >
              ⚒️ آهنگری و کتاب‌های جادو [B]
            </button>
          )}

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setAutoAimEnabled((v) => !v)}
          >
            {autoAimEnabled ? "🎯 هدف‌گیری خودکار: روشن" : "🎯 هدف‌گیری دستی"}
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setTheaterMode((v) => !v)}
          >
            {theaterMode ? "🗗 نمای استاندارد" : "⛶ بزرگ‌نمایی میدان"}
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              medievalAudio.muted = !soundMuted;
              setSoundMuted(!soundMuted);
            }}
          >
            {soundMuted ? "🔇 صدا خاموش" : "🔊 صدای قرون‌وسطایی"}
          </button>
        </div>
      </div>

      {errorBanner && (
        <div className="alert alert--error" style={{ marginBottom: "0.75rem" }}>
          <span>{errorBanner}</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setErrorBanner(null)}
          >
            بستن
          </button>
        </div>
      )}

      {toastBanner && <div className="ln-toast-banner">{toastBanner}</div>}

      {!me && state && !isFinished && (
        <div className="ln-join-prompt-card">
          <div>
            <h3>پیوستن به اتاق دونفره آنلاین ({normalizedCode})</h3>
            <p>
              شوالیه دوم می‌تواند از دستگاه مجزا وارد این کمپین ۱۰ موجی شود و در خزانه{" "}
              <strong>{SHERIFF_COIN_NAME}</strong> شریک گردد.
            </p>
          </div>
          <div className="ln-join-prompt-actions">
            <input
              type="text"
              className="input"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="نام شوالیه شما..."
              maxLength={24}
            />
            <button
              type="button"
              className="btn btn--primary"
              disabled={joining}
              onClick={() => void handleJoinRoom()}
            >
              {joining ? "در حال ورود..." : "ورود به کمپین به عنوان هم‌تیمی"}
            </button>
          </div>
        </div>
      )}

      {hudSnapshot.activeBoss && (
        <div className="ln-boss-hud-banner">
          <img
            src={hudSnapshot.activeBoss.portraitUrl}
            alt={hudSnapshot.activeBoss.nameEn}
            className="ln-boss-hud-portrait"
          />
          <div className="ln-boss-hud-body">
            <div className="ln-boss-hud-head">
              <strong>
                👑 {hudSnapshot.activeBoss.nameFa} ({hudSnapshot.activeBoss.nameEn})
              </strong>
              <span className="ln-boss-phase-tag">
                فاز نبرد {hudSnapshot.activeBoss.phase} از ۳
              </span>
              <span>
                HP: {hudSnapshot.activeBoss.hp} / {hudSnapshot.activeBoss.maxHp}
              </span>
            </div>
            <div className="ln-progress-track ln-progress-track--boss">
              <div
                className="ln-progress-fill ln-progress-fill--boss"
                style={{
                  width: `${Math.max(0, Math.min(100, (hudSnapshot.activeBoss.hp / Math.max(1, hudSnapshot.activeBoss.maxHp)) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="ln-main-grid">
        <div className="ln-arena-column">
          <div
            className="ln-canvas-wrapper"
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                simRef.current.aimX =
                  ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH;
                simRef.current.aimY =
                  ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
              }
            }}
            onPointerDown={(e) => {
              const target = e.target;
              if (
                e.button !== 0 ||
                (target instanceof Element &&
                  target.closest("button, a, input, select, textarea, .ln-canvas-overlay"))
              ) {
                return;
              }
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                simRef.current.aimX =
                  ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH;
                simRef.current.aimY =
                  ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
              }
              simRef.current.mouseDown = true;
              triggerPrimaryAttack();
            }}
            onPointerUp={(e) => {
              simRef.current.mouseDown = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onPointerCancel={() => {
              simRef.current.mouseDown = false;
            }}
            onLostPointerCapture={() => {
              simRef.current.mouseDown = false;
            }}
          >
            <canvas
              ref={setCanvasElement}
              width={WORLD_WIDTH}
              height={WORLD_HEIGHT}
              className="ln-canvas-stage"
              aria-label="Last Night — Medieval Survival 2D Pixel Art Arena"
            />

            {isPrepOrWaiting && (
              <div className="ln-canvas-overlay">
                <div className="ln-overlay-box">
                  <span className="ln-badge-gold">
                    {currentMapSpec.nameFa} — آماده آغاز موج {state?.wave ?? 1}
                  </span>
                  <h3>اتاق کمپین قرون‌وسطایی ({normalizedCode})</h3>
                  <p>
                    بازیکنان حاضر در اتاق:{" "}
                    <strong>
                      {state?.players.length ?? 1} / {state?.max_players ?? 2}
                    </strong>
                  </p>
                  <p className="ln-overlay-hint">
                    می‌توانید کد اتاق <code>{normalizedCode}</code> را برای بازیکن دوم در
                    دستگاه دیگر بفرستید، از فروشگاه با{" "}
                    <strong>{SHERIFF_COIN_NAME}</strong> خرید کنید و موج{" "}
                    {state?.wave ?? 1} را آغاز نمایید.
                  </p>
                  {me && (
                    <div className="ln-overlay-actions">
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={busyId === "start_wave"}
                        onClick={() => void handleStartCampaign()}
                      >
                        ⚔️ آغاز موج {state?.wave ?? 1} در {currentMapSpec.nameFa}
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => setShopOpen(true)}
                      >
                        ⚒️ فروشگاه و تجهیز جادو ({SHERIFF_COIN_NAME})
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isFinished && state && (
              <div className="ln-canvas-overlay">
                <div className="ln-overlay-box">
                  <span className="ln-badge-gold">
                    {state.status === "victory"
                      ? "🏆 پیروزی در هر ۱۰ موج!"
                      : "💀 سقوط شوالیه‌ها در تاریکی"}
                  </span>
                  <h3>
                    {state.status === "victory"
                      ? "پادشاه نفرین‌شده (Cursed King) شکست خورد!"
                      : "کمپین Last Night به پایان رسید"}
                  </h3>
                  <p>
                    موج نهایی: <strong>{state.wave} از 10</strong> | کل{" "}
                    <strong>{SHERIFF_COIN_NAME}</strong> کسب‌شده:{" "}
                    <strong>{state.total_coins_earned.toLocaleString("en-US")}</strong>
                  </p>
                  <div className="ln-results-table">
                    {state.players.map((p) => (
                      <div key={p.seat} className="ln-results-row">
                        <span>
                          شوالیه {p.seat}: <strong>{p.name}</strong>
                        </span>
                        <span>شکار هیولا: {p.kills}</span>
                        <span>احیا: {p.revives_performed}</span>
                      </div>
                    ))}
                  </div>
                  <div className="ln-overlay-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => navigate("/games/last-night")}
                    >
                      بازگشت به لابی Last Night
                    </button>
                    <Link to="/shop" className="btn btn--secondary">
                      کیف پول و فروشگاه ({SHERIFF_COIN_NAME})
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tappable Quick-Use Consumables Belt (Works on Mobile & Desktop) */}
          {me && (
            <div className="ln-quick-belt" aria-label="کمربند مصرف سریع آیتم‌ها">
              {QUICK_BELT_ITEMS.map((item) => {
                const count = Number(me.inventory?.[item.id] ?? 0);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`ln-belt-btn ${count > 0 ? "ln-belt-btn--ready" : ""}`}
                    disabled={count <= 0 || busyId === `use_${item.id}`}
                    onClick={() => void handleUseItem(item.id)}
                  >
                    <span className="ln-spell-key">[{item.key}]</span>
                    <span className="ln-belt-label">{item.shortFa}</span>
                    <strong className="ln-belt-count">×{count}</strong>
                  </button>
                );
              })}
            </div>
          )}

          {/* Responsive Touch / Mobile & Tablet Gamepad Controls */}
          <div className="ln-touch-controls" aria-label="کنترلر لمسی موبایل و تبلت">
            <div className="ln-dpad-grid">
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--up-left"
                onPointerDown={() => setTouchVector(-1, -1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت بالا چپ"
              >
                ↖
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--up"
                onPointerDown={() => setTouchVector(0, -1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت بالا"
              >
                ▲
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--up-right"
                onPointerDown={() => setTouchVector(1, -1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت بالا راست"
              >
                ↗
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--left"
                onPointerDown={() => setTouchVector(-1, 0)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت چپ"
              >
                ◀
              </button>
              <span className="ln-dpad-center">حرکت</span>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--right"
                onPointerDown={() => setTouchVector(1, 0)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت راست"
              >
                ▶
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--down-left"
                onPointerDown={() => setTouchVector(-1, 1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت پایین چپ"
              >
                ↙
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--down"
                onPointerDown={() => setTouchVector(0, 1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت پایین"
              >
                ▼
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--down-right"
                onPointerDown={() => setTouchVector(1, 1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت پایین راست"
              >
                ↘
              </button>
            </div>

            <div className="ln-touch-actions">
              <button
                type="button"
                className="ln-touch-btn ln-touch-btn--attack"
                onPointerDown={() => {
                  simRef.current.mouseDown = true;
                  triggerPrimaryAttack();
                }}
                onPointerUp={() => {
                  simRef.current.mouseDown = false;
                }}
                onPointerLeave={() => {
                  simRef.current.mouseDown = false;
                }}
              >
                ⚔️ ضربه / شلیک
              </button>
              <button
                type="button"
                className="ln-touch-btn ln-touch-btn--spell"
                onClick={() => void handleCastSpellSlot(0)}
              >
                📖 جادوی ۱ [Q]
              </button>
              <button
                type="button"
                className="ln-touch-btn ln-touch-btn--spell"
                onClick={() => void handleCastSpellSlot(1)}
              >
                📖 جادوی ۲ [F]
              </button>
              <button
                type="button"
                className={`ln-touch-btn ${hudSnapshot.nearestPromptFa ? "ln-touch-btn--highlight" : ""}`}
                onClick={() => void handleInteractNearest()}
              >
                🕯️ {hudSnapshot.nearestPromptFa ? `تعامل [E]` : "مشعل/صندوق [E]"}
              </button>
              <button
                type="button"
                className="ln-touch-btn"
                onClick={() => void handleReloadOrRevive()}
              >
                🔄 خشاب / احیا [R]
              </button>
              <button
                type="button"
                className="ln-touch-btn"
                onClick={() => setShopOpen(true)}
              >
                ⚒️ فروشگاه [B]
              </button>
            </div>
          </div>
        </div>

        <aside className="ln-hud-sidebar">
          <div className="ln-hud-card">
            <div className="ln-hud-card-head">
              <strong>🛡️ وضعیت شوالیه شما</strong>
              <span className="ln-seat-badge">Seat #{me?.seat ?? 1}</span>
            </div>

            <div className="ln-vital-row">
              <span>سلامتی (HP)</span>
              <strong>
                {hudSnapshot.hp} / {hudSnapshot.maxHp}
              </strong>
            </div>
            <div className="ln-progress-track">
              <div
                className="ln-progress-fill ln-progress-fill--hp"
                style={{
                  width: `${(hudSnapshot.hp / Math.max(1, hudSnapshot.maxHp)) * 100}%`,
                }}
              />
            </div>

            <div className="ln-vital-row" style={{ marginTop: "0.5rem" }}>
              <span>مانا جادویی (Mana)</span>
              <strong>
                {hudSnapshot.mana} / {hudSnapshot.maxMana}
              </strong>
            </div>
            <div className="ln-progress-track">
              <div
                className="ln-progress-fill ln-progress-fill--mana"
                style={{
                  width: `${(hudSnapshot.mana / Math.max(1, hudSnapshot.maxMana)) * 100}%`,
                }}
              />
            </div>

            <div className="ln-weapon-box">
              <div>
                <small>سلاح در دست:</small>
                <strong>
                  {currentWeaponSpec.nameEn} ({currentWeaponSpec.nameFa})
                </strong>
              </div>
              <div className="ln-ammo-pills">
                <span>🏹 تیر: {hudSnapshot.arrows}</span>
                <span>💣 باروت و گلوله: {hudSnapshot.bullets}</span>
                <span>🗝️ کلید زنگ‌زده: {hudSnapshot.rustyKeys}</span>
              </div>
              {currentWeaponSpec.kind === "firearm" && (
                <div className="ln-firearm-status">
                  {hudSnapshot.reloadRemainingSec > 0 ? (
                    <span className="ln-chip ln-chip--warn">
                      در حال بارگذاری باروت ({hudSnapshot.reloadRemainingSec.toFixed(1)}s)...
                    </span>
                  ) : hudSnapshot.loadedFirearm ? (
                    <span className="ln-chip ln-chip--good">
                      ✓ آماده شلیک تک‌تیر ({currentWeaponSpec.damage} آسیب)
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => void handleReloadOrRevive()}
                    >
                      بارگذاری مجدد تفنگ باروتی [R]
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="ln-hud-card">
            <div className="ln-hud-card-head">
              <strong>
                📖 کتاب‌های جادوی تجهیزشده ({me?.equipped_spells.length ?? 0}/
                {MAX_EQUIPPED_SPELLBOOKS})
              </strong>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setShopOpen(true)}
              >
                تغییر
              </button>
            </div>
            <div className="ln-spell-slots">
              {[0, 1].map((slotIdx) => {
                const spellId = me?.equipped_spells[slotIdx];
                const spec = spellId ? getMagicBookSpec(spellId) : undefined;
                const cd = spellId ? (hudSnapshot.spellCooldowns[spellId] ?? 0) : 0;
                const keyLabel = slotIdx === 0 ? "Q" : "F";
                return (
                  <button
                    key={slotIdx}
                    type="button"
                    className={`ln-spell-slot-btn ${spec ? "ln-spell-slot-btn--filled" : ""}`}
                    disabled={!spec || cd > 0}
                    onClick={() => void handleCastSpellSlot(slotIdx as 0 | 1)}
                  >
                    <span className="ln-spell-key">[{keyLabel}]</span>
                    {spec ? (
                      <div className="ln-spell-slot-info">
                        <strong>{spec.nameEn}</strong>
                        <small>
                          {cd > 0
                            ? `کول‌داون: ${cd.toFixed(1)}s`
                            : `${spec.nameFa} (${spec.manaCost} مانا)`}
                        </small>
                      </div>
                    ) : (
                      <div className="ln-spell-slot-info">
                        <span>اسلات جادوی {slotIdx + 1} خالی</span>
                        <small>از فروشگاه کتاب جادو بخرید و تجهیز کنید</small>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ln-hud-card">
            <div className="ln-hud-card-head">
              <strong>🤝 هم‌تیمی آنلاین (۲ نفره)</strong>
              <span>{ally ? "متصل" : "سلحشور همراه فعال"}</span>
            </div>
            {ally ? (
              <div className="ln-ally-summary">
                <div>
                  <strong>{ally.name}</strong> ({getWeaponSpec(ally.equipped_weapon).nameEn})
                </div>
                <div>
                  HP: {ally.hp}/{ally.max_hp} | شکار: {ally.kills}
                </div>
                {ally.downed && (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => void handleReloadOrRevive()}
                  >
                    ✨ احیای هم‌تیمی [R]
                  </button>
                )}
              </div>
            ) : (
              <p className="ln-ally-empty">
                سلحشور همراه در کنار شما می‌جنگد؛ هر زمان بازیکن دوم کد اتاق{" "}
                <code>{normalizedCode}</code> را وارد کند، به‌صورت زنده جایگزین می‌شود.
              </p>
            )}
          </div>

          <div className="ln-hud-card">
            <div className="ln-hud-card-head">
              <strong>🕯️ اهداف نقشه ({currentMapSpec.nameFa})</strong>
              <span>هیولاهای باقی‌مانده: {hudSnapshot.enemiesRemaining}</span>
            </div>
            <ul className="ln-objectives-list">
              {(state?.objectives ?? []).map((obj) => (
                <li
                  key={obj.id}
                  className={
                    obj.completed ? "ln-obj-item ln-obj-item--done" : "ln-obj-item"
                  }
                >
                  <span>
                    {obj.completed ? "✓" : "○"} {obj.title} ({obj.progress}/{obj.target})
                  </span>
                  <strong className="ln-obj-reward">
                    +{obj.reward_coins} {SHERIFF_COIN_NAME}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {me && (
        <LastNightShopModal
          open={shopOpen}
          onClose={() => setShopOpen(false)}
          teamSheriffCoins={state?.sheriff_coins ?? 0}
          me={me}
          busyId={busyId}
          onBuyWeapon={handleBuyWeapon}
          onEquipWeapon={handleEquipWeapon}
          onBuySpellbook={handleBuySpellbook}
          onToggleEquipSpellbook={handleToggleEquipSpellbook}
          onBuyItem={handleBuyItem}
          onUseItem={handleUseItem}
        />
      )}
    </section>
  
  );
}
