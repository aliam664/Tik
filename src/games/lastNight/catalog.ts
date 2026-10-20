/**
 * LAST NIGHT — MEDIEVAL SURVIVAL
 * Authoritative client-side catalog mirroring the PostgreSQL server rules.
 *
 * Art Direction: 2D Top-Down Pixel Art · Dark Medieval Survival & Dark Fantasy.
 * Currency: "Sheriff Coin" (used everywhere across HUD, shops, rewards, tooltips, and results).
 */

import {
  CURRENCY_NAME,
  SHERIFF_COIN_NAME,
  type BossSpec,
  type EnemySpec,
  type MagicBookId,
  type MagicBookSpec,
  type MedievalEnemyKind,
  type MedievalMapId,
  type MedievalMapSpec,
  type MedievalShopItemId,
  type MedievalShopItemSpec,
  type MedievalWeaponId,
  type WeaponSpec,
} from "@/types/lastNight";

export { CURRENCY_NAME, SHERIFF_COIN_NAME };

/** Maximum spellbooks a player can equip simultaneously. */
export const MAX_EQUIPPED_SPELLBOOKS = 2;

/** Maximum combined damage reduction (prevents 100% invulnerability). */
export const MAX_DAMAGE_REDUCTION_PCT = 75;

/** World dimensions in logical pixels (16:9 widescreen arena). */
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 760;

/* -------------------------------------------------------------------------- */
/* Weapons Roster (Strictly Medieval Survival + 2 Antique Black-Powder Guns)  */
/* -------------------------------------------------------------------------- */

export const MEDIEVAL_WEAPONS: readonly WeaponSpec[] = [
  {
    id: "rusty_sword",
    nameEn: "Rusty Sword",
    nameFa: "شمشیر زنگ‌زده (Rusty Sword)",
    price: 0,
    damage: 25,
    kind: "melee",
    ammoType: "none",
    magazineSize: 0,
    attackCooldownSec: 0.44,
    reloadSec: 0,
    range: 74,
    cleaveArcRad: Math.PI * 0.65,
    knockback: 26,
    descriptionFa: "شمشیر آهنی قدیمی رایگان با ضربه سریع قوسی (۲۵ آسیب).",
    descriptionEn: "Free starter iron broadsword with a reliable melee slash (25 damage).",
  },
  {
    id: "hunter_bow",
    nameEn: "Hunter Bow",
    nameFa: "کمان شکارچی (Hunter Bow)",
    price: 120,
    damage: 35,
    kind: "bow",
    ammoType: "arrow",
    magazineSize: 1,
    attackCooldownSec: 0.68,
    reloadSec: 0.55,
    range: 460,
    projectileSpeed: 640,
    knockback: 18,
    descriptionFa: "کمان چوب سرخدار برای تیراندازی از راه دور؛ نیازمند بسته تیر (۳۵ آسیب).",
    descriptionEn: "Long-range yew hunting bow firing feathered arrows (35 damage).",
  },
  {
    id: "spiked_club",
    nameEn: "Spiked Wooden Club",
    nameFa: "گرز چوبی میخ‌دار (Spiked Wooden Club)",
    price: 170,
    damage: 40,
    kind: "melee",
    ammoType: "none",
    magazineSize: 0,
    attackCooldownSec: 0.6,
    reloadSec: 0,
    range: 80,
    cleaveArcRad: Math.PI * 0.75,
    knockback: 48,
    descriptionFa: "گرز بلوط سنگین با میخ‌های آهنگری‌شده و عقب‌رانی قوی (۴۰ آسیب).",
    descriptionEn: "Heavy oak bludgeon studded with iron spikes and strong knockback (40 damage).",
  },
  {
    id: "battle_axe",
    nameEn: "Battle Axe",
    nameFa: "تبر جنگی (Battle Axe)",
    price: 250,
    damage: 60,
    kind: "melee",
    ammoType: "none",
    magazineSize: 0,
    attackCooldownSec: 0.78,
    reloadSec: 0,
    range: 88,
    cleaveArcRad: Math.PI * 0.9,
    knockback: 56,
    descriptionFa: "تبر دولبه قرون‌وسطایی برای شکافتن زره چند دشمن هم‌زمان (۶۰ آسیب).",
    descriptionEn: "Broad medieval cleaving axe capable of striking multiple monsters (60 damage).",
  },
  {
    id: "flintlock_pistol",
    nameEn: "Antique Flintlock Pistol",
    nameFa: "تپانچه چخماقی عتیقه (Antique Flintlock Pistol)",
    price: 400,
    damage: 100,
    kind: "firearm",
    ammoType: "bullet",
    magazineSize: 1,
    attackCooldownSec: 0.4,
    reloadSec: 2.1,
    range: 420,
    projectileSpeed: 880,
    knockback: 65,
    descriptionFa: "تپانچه باروتی تک‌تیر با قدرت تخریب بالا؛ نیازمند باروت و گلوله و خشاب‌گذاری پس از هر شلیک (۱۰۰ آسیب).",
    descriptionEn: "Single-shot black-powder flintlock pistol; 100 damage, one shot before reloading.",
  },
  {
    id: "hunting_musket",
    nameEn: "Old Hunting Musket",
    nameFa: "تفنگ شکاری قدیمی (Old Hunting Musket)",
    price: 600,
    damage: 140,
    kind: "firearm",
    ammoType: "bullet",
    magazineSize: 1,
    attackCooldownSec: 0.5,
    reloadSec: 2.9,
    range: 580,
    projectileSpeed: 1020,
    knockback: 88,
    descriptionFa: "تفنگ فتیله‌ای بلند برد با گلوله سربی سنگین؛ تک‌تیر قبل از هر بارگذاری مجدد (۱۴۰ آسیب).",
    descriptionEn: "Heavy long-barreled black-powder musket; 140 damage, one shot before reloading.",
  },
] as const;

export function getWeaponSpec(id: MedievalWeaponId): WeaponSpec {
  return MEDIEVAL_WEAPONS.find((w) => w.id === id) ?? MEDIEVAL_WEAPONS[0];
}

/* -------------------------------------------------------------------------- */
/* Ancient Magic Books (Max 2 Equipped, Independent Cooldown & Mana Cost)     */
/* -------------------------------------------------------------------------- */

export const MAGIC_BOOKS: readonly MagicBookSpec[] = [
  {
    id: "book_of_fire",
    nameEn: "Book of Fire",
    nameFa: "کتاب آتش (Book of Fire)",
    price: 900,
    manaCost: 30,
    cooldownSec: 12,
    directDamage: 120,
    burnDamagePerSec: 20,
    burnDurationSec: 3,
    color: "#ff6b35",
    descriptionFa:
      "پرتاب گوی آتشین باستانی: ۱۲۰ آسیب مستقیم + ۲۰ آسیب سوختگی در ثانیه به مدت ۳ ثانیه (کول‌داون ۱۲ ثانیه · ۳۰ مانا).",
    descriptionEn:
      "Throws a fireball; 120 direct damage, 20 burn damage per second for 3 seconds, 12-second cooldown, 30 mana.",
  },
  {
    id: "book_of_protection",
    nameEn: "Book of Protection",
    nameFa: "کتاب محافظت (Book of Protection)",
    price: 1200,
    manaCost: 40,
    cooldownSec: 45,
    directDamage: 0,
    damageReductionPct: 70,
    buffDurationSec: 20,
    color: "#e5a93c",
    descriptionFa:
      "سپر رونیک مقدس: کاهش ۷۰٪ آسیب دریافتی به مدت ۲۰ ثانیه بدون مصونیت مطلق (کول‌داون ۴۵ ثانیه · ۴۰ مانا).",
    descriptionEn:
      "Reduces incoming damage by 70% for 20 seconds, 45-second cooldown, 40 mana.",
  },
  {
    id: "book_of_frost",
    nameEn: "Book of Frost",
    nameFa: "کتاب یخ‌زدگی (Book of Frost)",
    price: 800,
    manaCost: 25,
    cooldownSec: 18,
    directDamage: 40,
    freezeDurationSec: 3,
    color: "#5ce1e6",
    descriptionFa:
      "موج سرمای باستانی: ۴۰ آسیب و انجماد کامل دشمنان عادی برای ۳ ثانیه (باس‌ها منجمد دائمی نمی‌شوند، فقط کند می‌شوند · کول‌داون ۱۸ ثانیه · ۲۵ مانا).",
    descriptionEn:
      "Deals 40 damage and freezes normal enemies for 3 seconds (bosses are only briefly chilled, never permanently frozen), 18-second cooldown, 25 mana.",
  },
  {
    id: "book_of_spirits",
    nameEn: "Book of Spirits",
    nameFa: "کتاب ارواح (Book of Spirits)",
    price: 1500,
    manaCost: 45,
    cooldownSec: 35,
    directDamage: 25,
    buffDurationSec: 12,
    spiritDamagePerAttack: 25,
    color: "#9d8cff",
    descriptionFa:
      "احضار روح نگهبان خودکار به مدت ۱۲ ثانیه با ۲۵ آسیب در هر حمله (کول‌داون ۳۵ ثانیه · ۴۵ مانا).",
    descriptionEn:
      "Summons a friendly spirit for 12 seconds, 25 damage per attack, 35-second cooldown, 45 mana.",
  },
  {
    id: "book_of_lightning",
    nameEn: "Book of Lightning",
    nameFa: "کتاب آذرخش (Book of Lightning)",
    price: 1300,
    manaCost: 35,
    cooldownSec: 15,
    directDamage: 100,
    chainDamage: 55,
    chainTargets: 3,
    color: "#ffe066",
    descriptionFa:
      "صاعقه زنجیره‌ای: ۱۰۰ آسیب به هدف اصلی و ۵۵ آسیب به حداکثر ۳ دشمن نزدیک (کول‌داون ۱۵ ثانیه · ۳۵ مانا).",
    descriptionEn:
      "Deals 100 damage to the primary target and 55 to up to three nearby enemies, 15-second cooldown, 35 mana.",
  },
  {
    id: "book_of_shadows",
    nameEn: "Book of Shadows",
    nameFa: "کتاب سایه‌ها (Book of Shadows)",
    price: 1100,
    manaCost: 30,
    cooldownSec: 25,
    directDamage: 0,
    speedBoostPct: 35,
    buffDurationSec: 4,
    contactImmune: true,
    color: "#b48ead",
    descriptionFa:
      "گام سایه: افزایش ۳۵٪ سرعت حرکت و مصونیت موقت از آسیب برخورد دشمنان عادی به مدت ۴ ثانیه (کول‌داون ۲۵ ثانیه · ۳۰ مانا).",
    descriptionEn:
      "Increases movement speed by 35% and grants temporary immunity to ordinary enemy contact damage for 4 seconds, 25-second cooldown, 30 mana.",
  },
] as const;

export function getMagicBookSpec(id: MagicBookId): MagicBookSpec | undefined {
  return MAGIC_BOOKS.find((b) => b.id === id);
}

/* -------------------------------------------------------------------------- */
/* Shop Items (11 Exact Medieval Survival Items & Prices in Sheriff Coins)    */
/* -------------------------------------------------------------------------- */

export const MEDIEVAL_SHOP_ITEMS: readonly MedievalShopItemSpec[] = [
  {
    id: "small_heal_potion",
    nameEn: "Small healing potion",
    nameFa: "معجون درمان کوچک (Small healing potion)",
    price: 60,
    kind: "consumable",
    cooldownSec: 5,
    healHp: 30,
    descriptionFa: "معجون گیاهی که ۳۰ واحد سلامت (HP) را بازیابی می‌کند.",
    descriptionEn: "Restores 30 HP (5s cooldown).",
  },
  {
    id: "large_heal_potion",
    nameEn: "Large healing potion",
    nameFa: "معجون درمان بزرگ (Large healing potion)",
    price: 130,
    kind: "consumable",
    cooldownSec: 8,
    healHp: 70,
    descriptionFa: "اکسیر غلیظ کیمیاگری که ۷۰ واحد سلامت (HP) را بازیابی می‌کند.",
    descriptionEn: "Restores 70 HP (8s cooldown).",
  },
  {
    id: "mana_potion",
    nameEn: "Mana potion",
    nameFa: "معجون مانا (Mana potion)",
    price: 80,
    kind: "consumable",
    cooldownSec: 6,
    restoreMana: 40,
    descriptionFa: "جوهر آبی باستانی که ۴۰ واحد مانا را بازیابی می‌کند.",
    descriptionEn: "Restores 40 mana (6s cooldown).",
  },
  {
    id: "arrow_bundle",
    nameEn: "Arrow bundle",
    nameFa: "بسته تیر کمان (Arrow bundle)",
    price: 30,
    kind: "ammo",
    cooldownSec: 0,
    arrowsGranted: 10,
    descriptionFa: "ترکش شامل ۱۰ تیر پرپوش برای کمان شکارچی.",
    descriptionEn: "Contains 10 arrows for the Hunter Bow.",
  },
  {
    id: "gunpowder_bullet",
    nameEn: "Old gunpowder and bullet",
    nameFa: "باروت قدیمی و گلوله سربی (Old gunpowder and bullet)",
    price: 70,
    kind: "ammo",
    cooldownSec: 0,
    bulletsGranted: 1,
    descriptionFa: "کیسه باروت سیاه و یک گوی سربی برای یک شلیک تپانچه چخماقی یا تفنگ شکاری.",
    descriptionEn: "Supplies one firearm shot for the Antique Flintlock Pistol or Old Hunting Musket.",
  },
  {
    id: "fire_oil",
    nameEn: "Fire oil",
    nameFa: "روغن آتشین (Fire oil)",
    price: 100,
    kind: "consumable",
    cooldownSec: 25,
    durationSec: 20,
    descriptionFa: "آغشته‌کردن تیغه به روغن شعله‌ور؛ افزایش ۳۵٪ قدرت سلاح‌های سرد به مدت ۲۰ ثانیه.",
    descriptionEn: "Boosts melee weapon damage by 35% for 20 seconds (25s cooldown).",
  },
  {
    id: "whetstone",
    nameEn: "Whetstone",
    nameFa: "سنگ چاقوتیزکن (Whetstone)",
    price: 150,
    kind: "permanent_upgrade",
    cooldownSec: 0,
    descriptionFa: "تیز کردن دائمی تیغه‌ها؛ افزایش دائمی آسیب سلاح‌های سرد (+۱۰ آسیب) در کل این دور.",
    descriptionEn: "Permanently increases melee weapon damage (+10 damage) for the current run.",
  },
  {
    id: "protective_charm",
    nameEn: "Protective charm",
    nameFa: "طلسم محافظ (Protective charm)",
    price: 180,
    kind: "consumable",
    cooldownSec: 20,
    durationSec: 10,
    descriptionFa: "حرز سنگی قدیمی که آسیب دریافتی را به مدت ۱۰ ثانیه ۲۰٪ کاهش می‌دهد.",
    descriptionEn: "Reduces incoming damage by 20% for 10 seconds (20s cooldown).",
  },
  {
    id: "thorn_trap",
    nameEn: "Thorn trap",
    nameFa: "تله خاردار (Thorn trap)",
    price: 90,
    kind: "trap",
    cooldownSec: 8,
    descriptionFa: "تله خار و آهن روی زمین که به دشمنان عبوری ۶۵ آسیب و کندی وارد می‌کند.",
    descriptionEn: "Damages and slows enemies crossing it (8s cooldown).",
  },
  {
    id: "lantern",
    nameEn: "Lantern",
    nameFa: "فانوس دستی (Lantern)",
    price: 120,
    kind: "passive",
    cooldownSec: 0,
    descriptionFa: "آیتم غیرفعال: شعاع دید بازیکن را در مناطق تاریک و دخمه‌ها به‌طور دائمی افزایش می‌دهد.",
    descriptionEn: "Passive item: increases visibility in dark regions (no cooldown).",
  },
  {
    id: "rusty_key",
    nameEn: "Rusty key",
    nameFa: "کلید زنگ‌زده (Rusty key)",
    price: 80,
    kind: "passive",
    cooldownSec: 0,
    descriptionFa: "آیتم غیرفعال: یک صندوقچه قفل‌شده یا دروازه قدیمی مشخص را باز می‌کند.",
    descriptionEn: "Passive item: opens one designated locked chest (no cooldown).",
  },
] as const;

export function getShopItemSpec(id: MedievalShopItemId): MedievalShopItemSpec | undefined {
  return MEDIEVAL_SHOP_ITEMS.find((i) => i.id === id);
}

/* -------------------------------------------------------------------------- */
/* 4 Medieval Maps (10 Waves Total)                                           */
/* -------------------------------------------------------------------------- */

export const MEDIEVAL_MAPS: readonly MedievalMapSpec[] = [
  {
    id: "cursed_village",
    number: 1,
    nameEn: "Map 1: Cursed Village",
    nameFa: "نقشه ۱: دهکده نفرین‌شده (Cursed Village)",
    waves: [1, 2],
    ambientDarkness: 0.58,
    previewUrl: "/assets/last-night/map-cursed-village.png",
    groundPalette: {
      base: "#1b1d17",
      road: "#3b2e22",
      accent: "#293322",
      waterOrIce: "#1a2d38",
      wall: "#4a3b2c",
    },
    descriptionFa:
      "دهکده چوبی تاریک با کلبه‌های سقف‌پوشالی، جاده گِلی، چاه سنگی، آهنگری، دکان جادوگر، آسیاب متروکه، حصارهای چوبی و دروازه شمالی.",
    descriptionEn:
      "Two waves. Includes a safehouse, village square, stone well, blacksmith, witch's shop, abandoned mill, wooden fences, and a northern gate.",
    landmarks: [
      { id: "safehouse", nameEn: "Safehouse", nameFa: "پناهگاه امن", kind: "safehouse", x: 110, y: 120, width: 170, height: 120, solid: true },
      { id: "village_square", nameEn: "Village Square", nameFa: "میدان دهکده", kind: "square", x: 520, y: 310, width: 240, height: 180, solid: false },
      { id: "stone_well", nameEn: "Stone Well", nameFa: "چاه سنگی", kind: "well", x: 615, y: 375, width: 52, height: 52, solid: true },
      { id: "blacksmith", nameEn: "Blacksmith", nameFa: "آهنگری (فروشگاه سلاح)", kind: "blacksmith", x: 260, y: 470, width: 155, height: 110, solid: true },
      { id: "witch_shop", nameEn: "Witch's Shop", nameFa: "دکان جادوگر (کتب جادو)", kind: "witch_shop", x: 860, y: 470, width: 155, height: 110, solid: true },
      { id: "abandoned_mill", nameEn: "Abandoned Mill", nameFa: "آسیاب متروکه", kind: "mill", x: 960, y: 130, width: 170, height: 135, solid: true },
      { id: "wooden_fence_w", nameEn: "Wooden Fences", nameFa: "حصارهای چوبی", kind: "fence", x: 350, y: 240, width: 120, height: 22, solid: true },
      { id: "wooden_fence_e", nameEn: "Wooden Fences", nameFa: "حصارهای چوبی", kind: "fence", x: 800, y: 240, width: 120, height: 22, solid: true },
      { id: "northern_gate", nameEn: "Northern Gate", nameFa: "دروازه شمالی", kind: "gate", x: 570, y: 28, width: 140, height: 42, solid: false },
    ],
  },
  {
    id: "cursed_forest",
    number: 2,
    nameEn: "Map 2: Cursed Forest",
    nameFa: "نقشه ۲: جنگل نفرین‌شده (Cursed Forest)",
    waves: [3, 4],
    bossId: "forest_guardian",
    bossWave: 4,
    ambientDarkness: 0.66,
    previewUrl: "/assets/last-night/map-cursed-forest.png",
    groundPalette: {
      base: "#142016",
      road: "#36291e",
      accent: "#1e3222",
      waterOrIce: "#1c3329",
      wall: "#2c3d28",
    },
    descriptionFa:
      "موج ۳ و ۴. شامل جاده خاکی پرپیچ‌وخم، پل چوبی، میان‌بر مرداب، کلبه شکارچی، گورستان، لانه هیولا و میدان باس نگهبان جنگل.",
    descriptionEn:
      "Waves 3 and 4. Includes a winding dirt road, wooden bridge, swamp shortcut, hunter cabin, graveyard, monster nest, and forest boss arena.",
    landmarks: [
      { id: "hunter_cabin", nameEn: "Hunter Cabin", nameFa: "کلبه شکارچی (فروشگاه)", kind: "cabin", x: 120, y: 490, width: 160, height: 115, solid: true },
      { id: "wooden_bridge", nameEn: "Wooden Bridge", nameFa: "پل چوبی", kind: "bridge", x: 460, y: 360, width: 140, height: 64, solid: false },
      { id: "swamp_shortcut", nameEn: "Swamp Shortcut", nameFa: "میان‌بر مرداب", kind: "swamp", x: 220, y: 210, width: 210, height: 130, solid: false },
      { id: "graveyard", nameEn: "Graveyard", nameFa: "گورستان قدیمی", kind: "graveyard", x: 850, y: 490, width: 240, height: 150, solid: false },
      { id: "monster_nest", nameEn: "Monster Nest", nameFa: "لانه هیولا (تخم‌های نفرین‌شده)", kind: "nest", x: 920, y: 140, width: 200, height: 140, solid: false },
      { id: "forest_boss_arena", nameEn: "Forest Boss Arena", nameFa: "میدان نگهبان جنگل", kind: "boss_arena", x: 520, y: 120, width: 260, height: 200, solid: false },
    ],
  },
  {
    id: "snowy_forest",
    number: 3,
    nameEn: "Map 3: Snowy Forest",
    nameFa: "نقشه ۳: جنگل برفی و صومعه ویران (Snowy Forest)",
    waves: [5, 6, 7],
    bossId: "ice_giant",
    bossWave: 7,
    ambientDarkness: 0.56,
    previewUrl: "/assets/last-night/map-snowy-forest.png",
    groundPalette: {
      base: "#24303d",
      road: "#3a4654",
      accent: "#2e3e4e",
      waterOrIce: "#4c7594",
      wall: "#465566",
    },
    descriptionFa:
      "موج ۵، ۶ و ۷. شامل رودخانه‌های یخ‌زده، پل سنگی، صومعه ویران، کلبه‌های برف‌گرفته، غار یخی و میدان نبرد غول یخی.",
    descriptionEn:
      "Waves 5, 6, and 7. Includes frozen rivers, a stone bridge, ruined monastery, snow-covered cottages, icy cave, and an ice boss arena.",
    landmarks: [
      { id: "frozen_river", nameEn: "Frozen River", nameFa: "رودخانه یخ‌زده", kind: "frozen_river", x: 0, y: 330, width: 1280, height: 85, solid: false },
      { id: "stone_bridge", nameEn: "Stone Bridge", nameFa: "پل سنگی", kind: "bridge", x: 560, y: 315, width: 160, height: 115, solid: false },
      { id: "ruined_monastery", nameEn: "Ruined Monastery", nameFa: "صومعه ویران (فروشگاه و رون‌ها)", kind: "monastery", x: 130, y: 110, width: 230, height: 150, solid: true },
      { id: "snow_cottage_1", nameEn: "Snow-Covered Cottage", nameFa: "کلبه برف‌گرفته", kind: "cottage", x: 180, y: 510, width: 155, height: 110, solid: true },
      { id: "icy_cave", nameEn: "Icy Cave", nameFa: "غار یخی", kind: "cave", x: 940, y: 110, width: 210, height: 150, solid: false },
      { id: "ice_boss_arena", nameEn: "Ice Boss Arena", nameFa: "میدان غول یخی", kind: "boss_arena", x: 760, y: 460, width: 320, height: 220, solid: false },
    ],
  },
  {
    id: "ancient_catacombs",
    number: 4,
    nameEn: "Map 4: Ancient Catacombs",
    nameFa: "نقشه ۴: دخمه‌های باستانی (Ancient Catacombs)",
    waves: [8, 9, 10],
    bossId: "cursed_king",
    bossWave: 10,
    ambientDarkness: 0.72,
    previewUrl: "/assets/last-night/map-ancient-catacombs.png",
    groundPalette: {
      base: "#17141d",
      road: "#282332",
      accent: "#221d2b",
      waterOrIce: "#2d1a2e",
      wall: "#3b3447",
    },
    descriptionFa:
      "موج ۸، ۹ و ۱۰. شامل دالان‌های سنگی، قبرها، مشعل‌های دیواری، محراب‌های نفرین‌شده، درهای سنگی قفل‌شده، رون‌های باستانی و تالار نهایی پادشاه نفرین‌شده.",
    descriptionEn:
      "Waves 8, 9, and 10. Includes stone corridors, graves, wall torches, cursed altars, locked stone doors, ancient runes, and the final Cursed King arena.",
    landmarks: [
      { id: "stone_corridor_w", nameEn: "Stone Corridors", nameFa: "دالان‌های سنگی", kind: "corridor", x: 90, y: 100, width: 180, height: 540, solid: false },
      { id: "catacomb_graves", nameEn: "Catacomb Graves", nameFa: "قبرهای سنگی", kind: "graveyard", x: 310, y: 500, width: 220, height: 140, solid: false },
      { id: "cursed_altar_n", nameEn: "Cursed Altars", nameFa: "محراب نفرین‌شده", kind: "altar", x: 340, y: 130, width: 140, height: 95, solid: true },
      { id: "locked_stone_doors", nameEn: "Locked Stone Doors", nameFa: "درهای سنگی قفل‌شده", kind: "stone_door", x: 580, y: 40, width: 140, height: 48, solid: false },
      { id: "ancient_runes", nameEn: "Ancient Runes", nameFa: "رون‌های باستانی", kind: "rune", x: 880, y: 500, width: 190, height: 130, solid: false },
      { id: "cursed_king_arena", nameEn: "Cursed King Arena", nameFa: "تالار پادشاه نفرین‌شده", kind: "boss_arena", x: 540, y: 210, width: 360, height: 260, solid: false },
    ],
  },
] as const;

export function getMapSpec(id: MedievalMapId): MedievalMapSpec {
  return MEDIEVAL_MAPS.find((m) => m.id === id) ?? MEDIEVAL_MAPS[0];
}

export function getMapForWave(wave: number): MedievalMapSpec {
  if (wave <= 2) return MEDIEVAL_MAPS[0];
  if (wave <= 4) return MEDIEVAL_MAPS[1];
  if (wave <= 7) return MEDIEVAL_MAPS[2];
  return MEDIEVAL_MAPS[3];
}

/* -------------------------------------------------------------------------- */
/* 9 Medieval Fantasy Monsters                                                */
/* -------------------------------------------------------------------------- */

export const MEDIEVAL_ENEMIES: readonly EnemySpec[] = [
  {
    kind: "village_zombie",
    nameEn: "Village Zombie",
    nameFa: "زامبی دهکده (Village Zombie)",
    maxHp: 55,
    damage: 11,
    speed: 62,
    radius: 15,
    rewardCoins: 18,
    minWave: 1,
    color: "#5f7a52",
    accentColor: "#9ab37c",
  },
  {
    kind: "skeleton_swordsman",
    nameEn: "Skeleton Swordsman",
    nameFa: "اسکلت شمشیرزن (Skeleton Swordsman)",
    maxHp: 70,
    damage: 15,
    speed: 82,
    radius: 15,
    rewardCoins: 24,
    minWave: 1,
    color: "#d8d4c5",
    accentColor: "#8f99a8",
  },
  {
    kind: "black_wolf",
    nameEn: "Black Wolf",
    nameFa: "گرگ سیاه (Black Wolf)",
    maxHp: 48,
    damage: 14,
    speed: 128,
    radius: 14,
    rewardCoins: 22,
    minWave: 2,
    color: "#2b2d38",
    accentColor: "#ff4d5e",
  },
  {
    kind: "cursed_bat",
    nameEn: "Cursed Bat",
    nameFa: "خفاش نفرین‌شده (Cursed Bat)",
    maxHp: 36,
    damage: 10,
    speed: 138,
    radius: 12,
    rewardCoins: 19,
    minWave: 2,
    flying: true,
    color: "#4a3059",
    accentColor: "#d972ff",
  },
  {
    kind: "giant_spider",
    nameEn: "Giant Spider",
    nameFa: "عنکبوت غول‌پیکر (Giant Spider)",
    maxHp: 80,
    damage: 16,
    speed: 92,
    radius: 17,
    rewardCoins: 28,
    minWave: 2,
    slowsTarget: true,
    color: "#3d2b24",
    accentColor: "#83c441",
  },
  {
    kind: "dark_sorcerer",
    nameEn: "Dark Sorcerer",
    nameFa: "جادوگر تاریکی (Dark Sorcerer)",
    maxHp: 75,
    damage: 18,
    speed: 68,
    radius: 15,
    rewardCoins: 35,
    minWave: 3,
    ranged: true,
    color: "#4c2863",
    accentColor: "#b86bff",
  },
  {
    kind: "wandering_spirit",
    nameEn: "Wandering Spirit",
    nameFa: "روح سرگردان (Wandering Spirit)",
    maxHp: 68,
    damage: 16,
    speed: 98,
    radius: 15,
    rewardCoins: 34,
    minWave: 4,
    ethereal: true,
    color: "#6ad2db",
    accentColor: "#c4f9ff",
  },
  {
    kind: "stone_giant",
    nameEn: "Stone Giant",
    nameFa: "غول سنگی (Stone Giant)",
    maxHp: 190,
    damage: 28,
    speed: 48,
    radius: 23,
    rewardCoins: 52,
    minWave: 5,
    color: "#6d737a",
    accentColor: "#e5a93c",
  },
  {
    kind: "undead_knight",
    nameEn: "Undead Knight",
    nameFa: "شوالیه نامرده (Undead Knight)",
    maxHp: 145,
    damage: 24,
    speed: 78,
    radius: 18,
    rewardCoins: 45,
    minWave: 5,
    color: "#3f4a59",
    accentColor: "#ff6577",
  },
] as const;

export function getEnemySpec(kind: MedievalEnemyKind): EnemySpec {
  return MEDIEVAL_ENEMIES.find((e) => e.kind === kind) ?? MEDIEVAL_ENEMIES[0];
}

/* -------------------------------------------------------------------------- */
/* 3 Multi-Phase Bosses (Wave 4, Wave 7, Wave 10)                             */
/* -------------------------------------------------------------------------- */

export const MEDIEVAL_BOSSES: readonly BossSpec[] = [
  {
    kind: "forest_guardian",
    nameEn: "Forest Guardian",
    nameFa: "نگهبان جنگل (Forest Guardian)",
    titleEn: "Ancient Briar Behemoth — Wave 4 Boss",
    titleFa: "فرمانروای ریشه‌ها و خارهای نفرین‌شده — باس موج ۴",
    wave: 4,
    mapId: "cursed_forest",
    maxHp: 1150,
    contactDamage: 26,
    speed: 66,
    radius: 34,
    rewardCoins: 350,
    portraitUrl: "/assets/last-night/boss-forest-guardian.png",
    primaryColor: "#355e3b",
    accentColor: "#e5a93c",
    patterns: [
      {
        id: "root_impale",
        nameEn: "Root Impale Line",
        nameFa: "خط نیزه‌های ریشه",
        telegraphSec: 1.2,
        damage: 32,
        kind: "line_impale",
      },
      {
        id: "briar_nova",
        nameEn: "Briar Thorn Nova",
        nameFa: "انفجار حلقه خار",
        telegraphSec: 1.4,
        damage: 28,
        kind: "nova_burst",
      },
      {
        id: "call_pack",
        nameEn: "Call of the Wild Pack",
        nameFa: "احضار گرگ‌های سیاه و عنکبوت‌ها",
        telegraphSec: 1.0,
        damage: 0,
        kind: "summon_pack",
      },
    ],
  },
  {
    kind: "ice_giant",
    nameEn: "Ice Giant",
    nameFa: "غول یخی (Ice Giant)",
    titleEn: "Colossus of the Ruined Monastery — Wave 7 Boss",
    titleFa: "غول یخچال‌های صومعه ویران — باس موج ۷",
    wave: 7,
    mapId: "snowy_forest",
    maxHp: 1750,
    contactDamage: 32,
    speed: 62,
    radius: 38,
    rewardCoins: 450,
    portraitUrl: "/assets/last-night/boss-ice-giant.png",
    primaryColor: "#4c8cb5",
    accentColor: "#9eeeff",
    patterns: [
      {
        id: "glacial_slam",
        nameEn: "Glacial Warhammer Slam",
        nameFa: "کوبش چکش یخچالی",
        telegraphSec: 1.35,
        damage: 38,
        kind: "shockwave_slam",
      },
      {
        id: "icicle_barrage",
        nameEn: "Icicle Shard Fan",
        nameFa: "رگبار قندیل‌های یخی",
        telegraphSec: 1.1,
        damage: 26,
        kind: "icicle_fan",
      },
      {
        id: "blizzard_charge",
        nameEn: "Blizzard Juggernaut Charge",
        nameFa: "یورش بهمن کشنده",
        telegraphSec: 1.2,
        damage: 36,
        kind: "bull_charge",
      },
    ],
  },
  {
    kind: "cursed_king",
    nameEn: "Cursed King",
    nameFa: "پادشاه نفرین‌شده (Cursed King)",
    titleEn: "Undead Sovereign of the Catacombs — Final Wave 10 Boss",
    titleFa: "شهریار نامرده دخمه‌های باستانی — باس نهایی موج ۱۰",
    wave: 10,
    mapId: "ancient_catacombs",
    maxHp: 2600,
    contactDamage: 38,
    speed: 74,
    radius: 40,
    rewardCoins: 700,
    portraitUrl: "/assets/last-night/boss-cursed-king.png",
    primaryColor: "#7a233c",
    accentColor: "#c77dff",
    patterns: [
      {
        id: "royal_cleave",
        nameEn: "Royal Greatsword Cleave",
        nameFa: "شکاف شمشیر سلطنتی",
        telegraphSec: 1.15,
        damage: 42,
        kind: "royal_cleave",
      },
      {
        id: "soul_pillars",
        nameEn: "Catacomb Soul Pillars",
        nameFa: "ستون‌های آتش ارواح",
        telegraphSec: 1.4,
        damage: 36,
        kind: "soul_pillars",
      },
      {
        id: "crown_beam",
        nameEn: "Necrotic Crown Decree",
        nameFa: "فرمان تاج نفرین‌شده و احضار شوالیه‌ها",
        telegraphSec: 1.25,
        damage: 34,
        kind: "crown_beam",
      },
    ],
  },
] as const;

export function getBossForWave(wave: number): BossSpec | undefined {
  return MEDIEVAL_BOSSES.find((b) => b.wave === wave);
}
