/**
 * Pure Elo rating core — client-side mirror of the SQL implementation
 * (public.elo_expected / elo_k_for / tier_for_rating). The server remains the
 * single source of truth; this module powers optimistic UI, tests and labels.
 */

export type TierName =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "master";

export interface TierInfo {
  tier: TierName;
  division: number; // 4..1 (master is always 1)
}

export const TIER_LABELS: Record<TierName, string> = {
  bronze: "برنز",
  silver: "نقره",
  gold: "طلا",
  platinum: "پلاتین",
  diamond: "الماس",
  master: "استاد",
};

export const DEFAULT_ELO = {
  start: 1200,
  kNew: 32,
  kMid: 24,
  kPro: 16,
  kPlacement: 40,
  placementGames: 10,
  /** First-move advantage of X, folded into the expected score. */
  xAdvantage: 40,
  floor: 100,
} as const;

/** Expected score of A against B (A has optional advantage, e.g. playing X). */
export function expectedScore(
  ratingA: number,
  ratingB: number,
  advantage = 0,
): number {
  return 1 / (1 + Math.pow(10, (ratingB - (ratingA + advantage)) / 400));
}

export function kFactor(
  gamesPlayed: number,
  placementLeft: number,
  cfg: {
    kNew: number;
    kMid: number;
    kPro: number;
    kPlacement: number;
  } = DEFAULT_ELO,
): number {
  if (placementLeft > 0) return cfg.kPlacement;
  if (gamesPlayed < 20) return cfg.kNew;
  if (gamesPlayed < 50) return cfg.kMid;
  return cfg.kPro;
}

/**
 * Compute both new ratings after one game.
 * `scoreX`: 1 win, 0.5 draw, 0 loss for X.
 */
export function updateRatings(
  ratingX: number,
  ratingO: number,
  scoreX: number,
  gamesX: number,
  gamesO: number,
  placementLeftX: number,
  placementLeftO: number,
  cfg: typeof DEFAULT_ELO = DEFAULT_ELO,
): { x: number; o: number; dx: number; do_: number } {
  const ex = expectedScore(ratingX, ratingO, cfg.xAdvantage);
  const eo = expectedScore(ratingO, ratingX, -cfg.xAdvantage);
  const kx = kFactor(gamesX, placementLeftX, cfg);
  const ko = kFactor(gamesO, placementLeftO, cfg);
  const nx = Math.max(
    cfg.floor,
    Math.round(ratingX + kx * (scoreX - ex)),
  );
  const no = Math.max(
    cfg.floor,
    Math.round(ratingO + ko * (1 - scoreX - eo)),
  );
  return { x: nx, o: no, dx: nx - ratingX, do_: no - ratingO };
}

export function tierForRating(rating: number): TierInfo {
  const r = rating ?? 0;
  if (r >= 1800) return { tier: "master", division: 1 };
  let tier: TierName;
  if (r >= 1600) tier = "diamond";
  else if (r >= 1400) tier = "platinum";
  else if (r >= 1200) tier = "gold";
  else if (r >= 1000) tier = "silver";
  else tier = "bronze";
  const div = 4 - Math.min(3, Math.max(0, Math.floor(((r % 200) + 200) % 200) / 50));
  return { tier, division: div };
}

export function tierLabel(info: TierInfo): string {
  const base = TIER_LABELS[info.tier];
  return info.tier === "master" ? base : `${base} ${roman(info.division)}`;
}

function roman(n: number): string {
  return ["", "I", "II", "III", "IV"][n] ?? String(n);
}

/** Rating range label for a tier (leaderboard display). */
export function tierRange(info: TierInfo): string {
  switch (info.tier) {
    case "master":
      return "۱۸۰۰+";
    case "diamond":
      return "۱۶۰۰–۱۷۹۹";
    case "platinum":
      return "۱۴۰۰–۱۵۹۹";
    case "gold":
      return "۱۲۰۰–۱۳۹۹";
    case "silver":
      return "۱۰۰۰–۱۱۹۹";
    default:
      return "زیر ۱۰۰۰";
  }
}
