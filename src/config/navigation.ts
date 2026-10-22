/**
 * Centralized navigation & admin feature registry.
 * Game links come from `PLATFORM_GAMES` — do not hardcode a new title here.
 * See HOW_TO_ADD_A_NEW_GAME.md
 */

import { getHeaderNavGames } from "@/games/registry";

export interface SiteNavItem {
  path: string;
  label: string;
  exact?: boolean;
}

export const MAIN_NAV_ITEMS: readonly SiteNavItem[] = [
  { path: "/", label: "خانه", exact: true },
  { path: "/play", label: "بازی کن" },
  ...getHeaderNavGames(),
  { path: "/leaderboard", label: "رده‌بندی" },
  { path: "/shop", label: "فروشگاه" },
  { path: "/profile", label: "پروفایل" },
  { path: "/join", label: "ورود با کد" },
];

export type AdminTabId =
  | "overview"
  | "system"
  | "arena"
  | "blast"
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
  { id: "overview", label: "مرکز فرمان" },
  { id: "system", label: "منابع سرور", badge: "زنده" },
  { id: "arena", label: "عرصه هوش مصنوعی", badge: "AI" },
  { id: "blast", label: "انفجار شریف", badge: "LIVE" },
  { id: "players", label: "پرونده بازیکنان", badge: "SOC" },
  { id: "rooms", label: "اتاق‌ها" },
  { id: "economy", label: "اقتصاد" },
  { id: "integrity", label: "ضدتقلب" },
  { id: "seasons", label: "فصل‌ها" },
  { id: "games", label: "تاریخچه بازی" },
  { id: "settings", label: "تنظیمات" },
  { id: "audit", label: "گزارش عملیات" },
] as const;
