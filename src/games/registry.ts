/**
 * DOZ ONLINE — central game registry.
 * Single source of truth for every title hosted on the platform hub.
 * Designer & Engineer: Ali369
 */

export type GameStatus = "live" | "beta" | "coming_soon";

export type PlatformGameIcon =
  | "grid"
  | "rocket"
  | "swords"
  | "crown"
  | "flame"
  | "shield"
  | "target"
  | "trophy"
  | "sparkles"
  | "compass";

export interface PlatformGame {
  /** Stable machine id, used in routes and telemetry. */
  readonly id: string;
  /** Display name (Persian). */
  readonly title: string;
  /** Latin brand name. */
  readonly titleEn: string;
  /** One-line pitch shown on the Multi-Game Hub. */
  readonly tagline: string;
  /** Longer description for the catalog card. */
  readonly description: string;
  /** Lifecycle state of the title. */
  readonly status: GameStatus;
  /** In-app route (must start with "/"). */
  readonly route: string;
  /** Optional room route prefix (e.g. "/games/last-night/room"). */
  readonly roomRoutePrefix?: string;
  /** Optional preview banner image in /public/assets/... */
  readonly bannerUrl?: string;
  /** Optional custom call-to-action button label. */
  readonly ctaLabel?: string;
  /** Player count label, e.g. "۲ نفره". */
  readonly players: string;
  /** Genre / category label. */
  readonly genre: string;
  /** Target frame rate for real-time titles (undefined for turn-based). */
  readonly frameRate?: number;
  /** Rendering engine note, e.g. "Canvas 2D". */
  readonly engine?: string;
  /** Accent color used on the hub card. */
  readonly accent: string;
  /** Lucide icon key resolved by the hub UI. */
  readonly icon: PlatformGameIcon;
  /** Ranked/stakes support flags. */
  readonly features: readonly string[];
  /** Short header/drawer label. Omit to keep the title hub-only. */
  readonly navLabel?: string;
  /** When true, `navLabel` is injected into MAIN_NAV_ITEMS. */
  readonly showInNav?: boolean;
  /** Lower numbers appear earlier in the header. */
  readonly navOrder?: number;
  /** Extra lobby paths (legacy aliases). */
  readonly routeAliases?: readonly string[];
}

/**
 * Platform catalog. Adding a new game here automatically surfaces it across
 * the Home Multi-Game Hub, header nav, generated routes, and unified Sheriff Coin shop.
 * Agent playbook: HOW_TO_ADD_A_NEW_GAME.md
 */
export const PLATFORM_GAMES: readonly PlatformGame[] = [
  {
    id: "doz",
    title: "دوز کلاسیک",
    titleEn: "DOZ CLASSIC",
    tagline: "دوز دو نفره، بدون ثبت‌نام و با کد اتاق",
    description:
      "بازی اصلی پلتفرم: سه‌خانه‌های یکسان روی سرور اعتبارسنجی می‌شود، تقلب ممکن نیست و با یک کد ۶ نویسه‌ای وارد اتاق می‌شوید.",
    status: "live",
    route: "/",
    roomRoutePrefix: "/room",
    players: "۲ نفره",
    genre: "استراتژی / نوبتی",
    engine: "Server-authoritative",
    accent: "#e5a93c",
    icon: "grid",
    features: ["اتاق خصوصی", "رنکینگ Elo", "Sheriff Coin"],
    showInNav: false,
  },
  {
    id: "last_night",
    title: "Last Night — بقای قرون‌وسطایی",
    titleEn: "LAST NIGHT — MEDIEVAL SURVIVAL",
    tagline: "کمپین آنلاین ۲ نفره پیکسل‌آرت در ۴ نقشه، ۱۰ موج، ۶ سلاح و ۶ کتاب جادو",
    description:
      "بقای قرون‌وسطایی و فانتزی تاریک ۲بعدی از بالا (Top-Down Pixel Art): دهکده نفرین‌شده، جنگل تاریک، جنگل برفی و دخمه‌های باستانی به همراه خزانه مشترک Sheriff Coin، آهنگری، حداکثر ۲ کتاب جادوی هم‌زمان و ۳ غول چندفازی.",
    status: "live",
    route: "/games/last-night",
    roomRoutePrefix: "/games/last-night/room",
    bannerUrl: "/assets/last-night/hero-banner.png",
    players: "۲ نفره آنلاین (Co-op)",
    genre: "بقای قرون‌وسطایی / Pixel Art",
    frameRate: 60,
    engine: "Canvas 2D Pixel-Art · Server-Authoritative",
    accent: "#f59e0b",
    icon: "rocket",
    features: [
      "کمپین ۱۰ موجی ۲ نفره",
      "۶ سلاح + ۶ کتاب جادو",
      "خزانه مشترک Sheriff Coin",
      "۳ غول بزرگ چندفازی",
    ],
    navLabel: "Last Night",
    showInNav: true,
    navOrder: 3,
    routeAliases: ["/games/arena2d"],
  },
  {
    id: "word_cipher",
    title: "رازواژه — تداعی و حدس کلمات",
    titleEn: "RAZ-VAJEH · WORD CIPHER",
    tagline: "بازی آنلاین ۲ نفره تداعی واژگان، سرنخ‌های هوشمند پلکانی و کشف واژه مخفی",
    description:
      "در هر راند ۴ دسته‌بندی و ۱۶ کارت واژه آماده می‌شود؛ بازیکن راهنما واژه مخفی را برمی‌گزیند و سرنخ می‌دهد و حدس‌زننده با تحلیل معنایی (درست، مرتبط یا نادرست) و تا ۲ راهنمای کمکی واژه را کشف می‌کند.",
    status: "live",
    route: "/games/word-cipher",
    roomRoutePrefix: "/games/word-cipher/room",
    bannerUrl: "/assets/word-cipher/hero-banner.png",
    ctaLabel: "رازواژه — بازی کلمات",
    players: "۲ نفره آنلاین + تمرین AI",
    genre: "فکری / تداعی کلمات",
    engine: "Server-Authoritative · Zero-Leak",
    accent: "#4dd0c4",
    icon: "sparkles",
    features: [
      "۱۶ کارت در ۴ دسته‌بندی",
      "چرخش نقش راهنما و حدس‌زننده",
      "تشخیص پاسخ مرتبط و مترادف فارسی",
      "پاداش Sheriff Coin + تمرین با AI",
    ],
    navLabel: "رازواژه",
    showInNav: true,
    navOrder: 2,
  },
  {
    id: "code_breaker",
    title: "رمزگشا — کشف کد ۴ رقمی هم‌زمان",
    titleEn: "CODE BREAKER · 4-DIGIT CIPHER DUEL",
    tagline: "رقابت زنده ۲ نفره برای کشف هم‌زمان کد مخفی ۴ رقمی سرور با تحلیل موقعیت سبز، زرد و قرمز",
    description:
      "سرور یک کد مخفی ۴ رقمی واحد (شامل صفر ابتدایی مثل 0072 یا ارقام تکراری مثل 9090) تولید می‌کند؛ هر دو بازیکن هم‌زمان و مستقل حدس می‌زنند، تاریخچه کامل و دقیق هر دو نفر را زنده می‌بینند و اولین نفری که کد را باز کند برنده فوری راند می‌شود.",
    status: "live",
    route: "/games/code-breaker",
    roomRoutePrefix: "/games/code-breaker/room",
    bannerUrl: "/assets/code-breaker/hero-banner.png",
    ctaLabel: "رمزگشا — نبرد کد ۴ رقمی",
    players: "۲ نفره آنلاین هم‌زمان + تمرین AI",
    genre: "استنتاجی / منطقی زنده",
    engine: "Server-Authoritative · Zero-Leak · Atomic Race Lock",
    accent: "#10b981",
    icon: "target",
    features: [
      "رقابت هم‌زمان روی کد ۴ رقمی واحد",
      "تحلیل موقعیت سبز / زرد / قرمز",
      "تاریخچه کامل هر دو بازیکن با تایمر سرور",
      "پشتیبانی کامل از صفر ابتدایی و ارقام تکراری",
    ],
    navLabel: "رمزگشا",
    showInNav: true,
    navOrder: 1,
  },
  {
    id: "sheriff_blast",
    title: "انفجار شریف",
    titleEn: "SHERIFF BLAST",
    tagline: "سالن زنده ضریب طلایی — برداشت کن قبل از انفجار",
    description:
      "همه با هم یک راند را می‌بینند. ضریب از ۱.۰۰× بالا می‌رود؛ قبل از انفجار برداشت کن تا شرط Sheriff Coin در همان ضریب ضرب شود. نقطهٔ انفجار با HMAC-SHA256 از قبل قفل است (لبهٔ خانه ۱٪).",
    status: "live",
    route: "/games/blast",
    players: "سالن زنده · همه با هم",
    genre: "ضریب / انفجار",
    frameRate: 60,
    engine: "Canvas 2D · Provably Fair HMAC-SHA256",
    accent: "#e85d4c",
    icon: "flame",
    features: [
      "دو شرط هم‌زمان + خروج خودکار",
      "RTP حدود ۹۹٪ — لبهٔ خانه شفاف ۱٪",
      "تأیید منصفانه بعد از هر راند",
      "فقط Sheriff Coin مجازی — نقد نمی‌شود",
    ],
    navLabel: "انفجار",
    showInNav: true,
    navOrder: 0,
  },
] as const;

/** Look up a game by its stable id (case-insensitive). */
export function getGameById(id: string): PlatformGame | undefined {
  const needle = id.trim().toLowerCase();
  if (!needle) return undefined;
  if (needle === "arena2d") {
    return PLATFORM_GAMES.find((g) => g.id === "last_night");
  }
  return PLATFORM_GAMES.find((g) => g.id === needle);
}

/** Every game currently playable on the platform (status === "live"). */
export function getActiveGames(): readonly PlatformGame[] {
  return PLATFORM_GAMES.filter((g) => g.status === "live");
}

/** Secondary/standalone games with dedicated lobby routes (excluding root "/"). */
export function getStandaloneGames(): readonly PlatformGame[] {
  return PLATFORM_GAMES.filter((g) => g.status === "live" && g.route !== "/");
}

/** Games that appear in the site header / mobile drawer. */
export function getHeaderNavGames(): readonly { path: string; label: string }[] {
  return PLATFORM_GAMES.filter((g) => g.showInNav && g.navLabel && g.route !== "/")
    .slice()
    .sort((a, b) => (a.navOrder ?? 50) - (b.navOrder ?? 50))
    .map((g) => ({
      path: g.route,
      label: g.navLabel as string,
    }));
}

/** Signature of the site's visual designer & engineer. */
export const SITE_DESIGNER = "Ali369";

/** Full credit line used in header, footer, home and admin. */
export const DESIGNER_CREDIT = "Designed & Engineered by Ali369";
