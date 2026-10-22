import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MAGIC_BOOKS,
  MAX_EQUIPPED_SPELLBOOKS,
  MEDIEVAL_BOSSES,
  MEDIEVAL_ENEMIES,
  MEDIEVAL_MAPS,
  MEDIEVAL_SHOP_ITEMS,
  MEDIEVAL_WEAPONS,
  RUN_COIN_NAME,
  SHERIFF_COIN_NAME,
} from "@/games/lastNight/catalog";
import { saveLnSession } from "@/games/lastNight/session";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { lastNightApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

export function LastNightLobbyPage() {
  const navigate = useNavigate();
  const { profile, token: profileToken } = useEconomyProfile();

  const [displayName, setDisplayName] = useState(
    () => profile?.display_name ?? "شوالیه شب",
  );
  const [joinCode, setJoinCode] = useState("");
  const [busyAction, setBusyAction] = useState<"create" | "join" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [codexTab, setCodexTab] = useState<
    "maps" | "weapons" | "magic" | "items" | "bestiary"
  >("maps");

  const handleCreateCampaignRoom = async () => {
    if (busyAction) return;
    setBusyAction("create");
    setErrorMessage(null);
    try {
      const name = displayName.trim() || profile?.display_name || "شوالیه شب";
      const res = await lastNightApi.createRoom(name, {
        maxPlayers: 2,
        mode: "coop",
        stake: 0,
        profileToken,
      });
      saveLnSession({
        roomCode: res.room_code,
        playerToken: res.player_token,
        playerId: `${res.room_id}_s${res.seat}`,
        seat: res.seat,
        displayName: name,
        savedAt: new Date().toISOString(),
      });
      navigate(`/games/last-night/room/${res.room_code}`);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinCampaignRoom = async () => {
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode || busyAction) return;
    setBusyAction("join");
    setErrorMessage(null);
    try {
      const name = displayName.trim() || profile?.display_name || "شوالیه شب";
      const res = await lastNightApi.joinRoom(cleanCode, name, profileToken);
      saveLnSession({
        roomCode: res.room_code,
        playerToken: res.player_token,
        playerId: `${res.room_id}_s${res.seat}`,
        seat: res.seat,
        displayName: name,
        savedAt: new Date().toISOString(),
      });
      navigate(`/games/last-night/room/${res.room_code}`);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="page-container ln-lobby-page">
      {/* Medieval Dark Fantasy Hero Section */}
      <div className="ln-hero-card">
        <div className="ln-hero-content">
          <div className="ln-hero-badges">
            <span className="ln-badge-gold">2D Top-Down Pixel Art</span>
            <span className="ln-badge-dark">کمپین آنلاین ۲ نفره (۱۰ موج در ۴ نقشه)</span>
            <span className="ln-badge-gold">داخل کمپین: {RUN_COIN_NAME} · پاداش پایدار: {SHERIFF_COIN_NAME}</span>
          </div>
          <h1 className="ln-hero-title">Last Night — Medieval Survival</h1>
          <p className="ln-hero-subtitle">
            بقای قرون‌وسطایی و فانتزی تاریک: در کنار هم‌تیمی خود در دهکده نفرین‌شده،
            جنگل تاریک، جنگل برفی و دخمه‌های باستانی بجنگید، مشعل‌ها و رون‌های باستانی را
            روشن کنید، با{" "}
            <strong>{RUN_COIN_NAME}</strong> موقتِ همان کمپین سلاح‌های قرون‌وسطایی و{" "}
            <strong>کتاب‌های جادو</strong> بخرید و ۳ غول بزرگ را شکست دهید. این خزانه پس از پایان اتاق صفر می‌شود؛ پاداش پایان کامل کمپین ۷۵ Sheriff Coin پایدار است.
          </p>

          <div className="ln-wallet-strip">
            <div>
              <small>موجودی کیف پول پایدار شما ({SHERIFF_COIN_NAME}):</small>
              <strong>
                🪙 {(profile?.coins ?? 0).toLocaleString("en-US")} {SHERIFF_COIN_NAME}
              </strong>
            </div>
            <Link to="/shop" className="btn btn--ghost btn--sm">
              خزانه و کیف پول {SHERIFF_COIN_NAME}
            </Link>
            <Link to="/" className="btn btn--ghost btn--sm">
              بازگشت به هاب بازی‌ها
            </Link>
          </div>
        </div>

        <div className="ln-hero-art-wrap">
          <img
            src="/assets/last-night/hero-banner.png"
            alt="Last Night — Medieval Survival Pixel Art"
            className="ln-hero-art"
          />
        </div>
      </div>

      {errorMessage && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2-Player Online Campaign Matchmaking / Room Cards */}
      <div className="ln-lobby-actions-grid">
        <div className="ln-action-panel">
          <h3>⚔️ ساخت اتاق کمپین دونفره (Create 2-Player Room)</h3>
          <p>
            یک اتاق آنلاین جدید بسازید و کد ۶ رقمی آن را برای بازیکن دوم در دستگاه دیگر
            ارسال کنید یا بلافاصله وارد دهکده نفرین‌شده شوید.
          </p>
          <div className="ln-form-row">
            <label htmlFor="ln-knight-name">نام شوالیه شما</label>
            <input
              id="ln-knight-name"
              type="text"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={24}
              placeholder="نام شوالیه..."
            />
          </div>
          <button
            type="button"
            className="btn btn--primary btn--full"
            disabled={busyAction !== null}
            onClick={() => void handleCreateCampaignRoom()}
          >
            {busyAction === "create"
              ? "در حال ساخت قلمرو..."
              : "ساخت اتاق آنلاین و ورود به دهکده نفرین‌شده"}
          </button>
        </div>

        <div className="ln-action-panel">
          <h3>🛡️ پیوستن به اتاق هم‌تیمی (Join Co-op Room)</h3>
          <p>
            کد اتاق را وارد کنید تا از دستگاه خود به کمپین هم‌تیمی متصل شوید و در خزانه{" "}
            <strong>{RUN_COIN_NAME}</strong> شریک شوید.
          </p>
          <div className="ln-form-row">
            <label htmlFor="ln-room-code">کد ۶ رقمی اتاق</label>
            <input
              id="ln-room-code"
              type="text"
              dir="ltr"
              className="input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="مثال: AB12CD"
            />
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--full"
            disabled={!joinCode.trim() || busyAction !== null}
            onClick={() => void handleJoinCampaignRoom()}
          >
            {busyAction === "join" ? "در حال اتصال..." : "ورود به اتاق هم‌تیمی"}
          </button>
        </div>
      </div>

      {/* Medieval Compendium: Maps, Weapons, Magic Books, Shop Items, Enemies & Bosses */}
      <div className="ln-codex-section">
        <div className="ln-codex-header">
          <h2>📜 دایره‌المعارف کامل Last Night — Medieval Survival</h2>
          <div className="ln-shop-tabs">
            <button
              type="button"
              className={`ln-shop-tab ${codexTab === "maps" ? "ln-shop-tab--active" : ""}`}
              onClick={() => setCodexTab("maps")}
            >
              🗺️ ۴ نقشه و ۱۰ موج
            </button>
            <button
              type="button"
              className={`ln-shop-tab ${codexTab === "weapons" ? "ln-shop-tab--active" : ""}`}
              onClick={() => setCodexTab("weapons")}
            >
              ⚔️ ۶ سلاح قرون‌وسطایی
            </button>
            <button
              type="button"
              className={`ln-shop-tab ${codexTab === "magic" ? "ln-shop-tab--active" : ""}`}
              onClick={() => setCodexTab("magic")}
            >
              📖 ۶ کتاب جادو (حداکثر {MAX_EQUIPPED_SPELLBOOKS} تجهیز)
            </button>
            <button
              type="button"
              className={`ln-shop-tab ${codexTab === "items" ? "ln-shop-tab--active" : ""}`}
              onClick={() => setCodexTab("items")}
            >
              🧪 ۱۱ آیتم فروشگاه ({RUN_COIN_NAME})
            </button>
            <button
              type="button"
              className={`ln-shop-tab ${codexTab === "bestiary" ? "ln-shop-tab--active" : ""}`}
              onClick={() => setCodexTab("bestiary")}
            >
              👹 ۹ دشمن و ۳ غول (Bosses)
            </button>
          </div>
        </div>

        {codexTab === "maps" && (
          <div className="ln-shop-grid">
            {MEDIEVAL_MAPS.map((m) => (
              <div key={m.id} className="ln-shop-item-card">
                <img
                  src={m.previewUrl}
                  alt={m.nameEn}
                  className="ln-boss-card-img"
                />
                <div className="ln-shop-item-head">
                  <div>
                    <h4>{m.nameEn}</h4>
                    <span className="ln-sub">{m.nameFa}</span>
                  </div>
                  <span className="ln-price-pill">
                    موج {m.waves[0]} تا {m.waves[m.waves.length - 1]}
                  </span>
                </div>
                <p className="ln-item-desc">{m.descriptionFa}</p>
                <div className="ln-stat-chips">
                  {m.landmarks.map((lm) => (
                    <span key={lm.id} className="ln-chip">
                      {lm.nameFa}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {codexTab === "weapons" && (
          <div className="ln-shop-grid">
            {MEDIEVAL_WEAPONS.map((w) => (
              <div key={w.id} className="ln-shop-item-card">
                <div className="ln-shop-item-head">
                  <div>
                    <h4>{w.nameEn}</h4>
                    <span className="ln-sub">{w.nameFa}</span>
                  </div>
                  <span className="ln-price-pill">
                    {w.price === 0 ? "Free" : `${w.price} ${RUN_COIN_NAME}`}
                  </span>
                </div>
                <p className="ln-item-desc">{w.descriptionFa}</p>
                <div className="ln-stat-chips">
                  <span className="ln-chip">Damage: {w.damage}</span>
                  {w.kind === "firearm" && (
                    <span className="ln-chip ln-chip--warn">
                      1 shot before reloading ({w.reloadSec}s)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {codexTab === "magic" && (
          <div className="ln-shop-grid">
            {MAGIC_BOOKS.map((b) => (
              <div key={b.id} className="ln-shop-item-card">
                <div className="ln-shop-item-head">
                  <div>
                    <h4>{b.nameEn}</h4>
                    <span className="ln-sub">{b.nameFa}</span>
                  </div>
                  <span className="ln-price-pill">
                    {b.price.toLocaleString("en-US")} {RUN_COIN_NAME}
                  </span>
                </div>
                <p className="ln-item-desc">{b.descriptionFa}</p>
                <div className="ln-stat-chips">
                  <span className="ln-chip">Cooldown: {b.cooldownSec}s</span>
                  <span className="ln-chip">Mana cost: {b.manaCost}</span>
                  {b.directDamage > 0 && (
                    <span className="ln-chip">Damage: {b.directDamage}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {codexTab === "items" && (
          <div className="ln-shop-grid">
            {MEDIEVAL_SHOP_ITEMS.map((item) => (
              <div key={item.id} className="ln-shop-item-card">
                <div className="ln-shop-item-head">
                  <div>
                    <h4>{item.nameEn}</h4>
                    <span className="ln-sub">{item.nameFa}</span>
                  </div>
                  <span className="ln-price-pill">
                    {item.price} {RUN_COIN_NAME}
                  </span>
                </div>
                <p className="ln-item-desc">{item.descriptionEn}</p>
                <p className="ln-sub">{item.descriptionFa}</p>
              </div>
            ))}
          </div>
        )}

        {codexTab === "bestiary" && (
          <div>
            <h3 style={{ margin: "0.5rem 0 1rem" }}>👑 ۳ غول بزرگ کمپین (Bosses)</h3>
            <div className="ln-shop-grid" style={{ marginBottom: "1.5rem" }}>
              {MEDIEVAL_BOSSES.map((boss) => (
                <div key={boss.kind} className="ln-shop-item-card ln-boss-card">
                  <img
                    src={boss.portraitUrl}
                    alt={boss.nameEn}
                    className="ln-boss-card-img"
                  />
                  <div className="ln-shop-item-head">
                    <div>
                      <h4>
                        Wave {boss.wave}: {boss.nameEn}
                      </h4>
                      <span className="ln-sub">
                        {boss.nameFa} — {boss.titleFa}
                      </span>
                    </div>
                    <span className="ln-price-pill">
                      +{boss.rewardCoins} {RUN_COIN_NAME}
                    </span>
                  </div>
                  <div className="ln-stat-chips">
                    <span className="ln-chip">HP: {boss.maxHp}</span>
                    {boss.patterns.map((pat) => (
                      <span key={pat.id} className="ln-chip ln-chip--warn">
                        {pat.nameFa} ({pat.damage} dmg)
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ margin: "0.5rem 0 1rem" }}>👹 ۹ هیولای قرون‌وسطایی (Enemies)</h3>
            <div className="ln-shop-grid">
              {MEDIEVAL_ENEMIES.map((en) => (
                <div key={en.kind} className="ln-shop-item-card">
                  <div className="ln-shop-item-head">
                    <div>
                      <h4>{en.nameEn}</h4>
                      <span className="ln-sub">{en.nameFa}</span>
                    </div>
                    <span className="ln-price-pill">
                      +{en.rewardCoins} {RUN_COIN_NAME}
                    </span>
                  </div>
                  <div className="ln-stat-chips">
                    <span className="ln-chip">HP: {en.maxHp}</span>
                    <span className="ln-chip">آسیب: {en.damage}</span>
                    <span className="ln-chip">از موج {en.minWave}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
