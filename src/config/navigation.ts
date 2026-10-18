/**
 * Centralized navigation & admin feature registry.
 * To add a new site page or admin panel tab in the future, register it here.
 */

export interface SiteNavItem {
  path: string;
  label: string;
  exact?: boolean;
}

export const MAIN_NAV_ITEMS: readonly SiteNavItem[] = [
  { path: "/", label: "خانه", exact: true },
  { path: "/play", label: "بازی رقابتی" },
  { path: "/leaderboard", label: "رده‌بندی" },
  { path: "/shop", label: "فروشگاه" },
  { path: "/profile", label: "پروفایل" },
  { path: "/rules", label: "قوانین" },
  { path: "/join", label: "ورود به اتاق" },
] as const;

export type AdminTabId =
  | "overview"
  | "system"
  | "arena"
  | "players"
  | "rooms"
  | "economy"
  | "integrity"
  | "seasons"
  | "games"
  | "settings"
  | "audit";

export interface AdminTabMeta {
  id: AdminTabId;
  label: string;
  badge?: string;
}

export const ADMIN_TABS_META: readonly AdminTabMeta[] = [
  { id: "overview", label: "داشبورد و نمودارها" },
  { id: "system", label: "منابع سرور (CPU/RAM)", badge: "زنده" },
  { id: "arena", label: "میدان نبرد هوش مصنوعی", badge: "AI" },
  { id: "players", label: "بازیکنان (سکه/XP/بن)" },
  { id: "rooms", label: "اتاق‌ها و اخراج" },
  { id: "economy", label: "مرکز اقتصاد" },
  { id: "integrity", label: "ضدتقلب و صف" },
  { id: "seasons", label: "فصل‌ها" },
  { id: "games", label: "تاریخچه بازی‌ها" },
  { id: "settings", label: "تنظیمات و اعلان‌ها" },
  { id: "audit", label: "گزارش عملیات" },
] as const;
