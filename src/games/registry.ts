/**
 * DOZ ONLINE — central game registry.
 * Single source of truth for every title hosted on the platform hub.
 * Designer & Engineer: Ali369
 */

export type GameStatus = "live" | "beta" | "coming_soon";

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
  readonly icon: "grid" | "rocket";
  /** Ranked/stakes support flags. */
  readonly features: readonly string[];
}

/**
 * Platform catalog. `doz` is the flagship live title; `arena2d` is the
 * heavy 60FPS 2D arena engine arriving next.
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
    players: "۲ نفره",
    genre: "استراتژی / نوبتی",
    engine: "Server-authoritative",
    accent: "#e5a93c",
    icon: "grid",
    features: ["اتاق خصوصی", "رنکینگ Elo", "شرط‌بندی sh"],
  },
  {
    id: "arena2d",
    title: "آرنا ۲بعدی",
    titleEn: "ARENA 2D",
    tagline: "موتور بازی ۲بعدی سنگین با حلقه ۶۰ فریم ثابت",
    description:
      "عنوان بعدی پلتفرم: موتور Canvas 2D با حلقه بازی قطعی ۶۰ هرتز، درونیابی رندر و محافظت از افت فریم — در دست توسعه.",
    status: "coming_soon",
    route: "/games/arena2d",
    players: "۱–۴ نفره",
    genre: "اکشن / realtime",
    frameRate: 60,
    engine: "Canvas 2D · Fixed-Timestep",
    accent: "#4dd0c4",
    icon: "rocket",
    features: ["۶۰ FPS", "Fixed-Timestep 60Hz", "درونیابی رندر"],
  },
] as const;

/** Look up a game by its stable id (case-insensitive). */
export function getGameById(id: string): PlatformGame | undefined {
  const needle = id.trim().toLowerCase();
  if (!needle) return undefined;
  return PLATFORM_GAMES.find((g) => g.id === needle);
}

/** Every game currently playable on the platform (status === "live"). */
export function getActiveGames(): readonly PlatformGame[] {
  return PLATFORM_GAMES.filter((g) => g.status === "live");
}

/** Signature of the site's visual designer & engineer. */
export const SITE_DESIGNER = "Ali369";

/** Full credit line used in header, footer, home and admin. */
export const DESIGNER_CREDIT = "Designed & Engineered by Ali369";
