/**
 * Auditable constants for the Sheriff Coin 2026-10-23 balance model.
 * PostgreSQL remains authoritative; this module supports simulations and UI math.
 */
export const SHERIFF_ECONOMY_MODEL = {
  targetCoinsPerMinute: { min: 3, max: 5 },
  dailyGameplayCap: 150,
  startingBalance: 150,
  wager: { min: 100, max: 300, dailyLossCap: 300 },
  rewards: {
    classic: { win: 12, draw: 6, loss: 3, firstWin: 8, streakStep: 2, streakCap: 6 },
    wordCipher: { win: 24, participation: 10 },
    codeBreaker: { win: 12, participation: 4 },
    lastNight: { campaign: 75, minimumMinutes: 17.9 },
  },
  season: { master: 600, diamond: 400, platinum: 275, gold: 180, silver: 100, bronze: 50 },
} as const;

export interface RewardClaim {
  source: string;
  requested: number;
}

/** Sequential model of the row-locked daily cap used by coins_grant. */
export function settleDailyRewardClaims(
  alreadyEarned: number,
  claims: readonly RewardClaim[],
  cap = SHERIFF_ECONOMY_MODEL.dailyGameplayCap,
): { grants: number[]; earned: number; blocked: number } {
  let earned = Math.max(0, Math.min(cap, Math.floor(alreadyEarned)));
  let blocked = 0;
  const grants = claims.map(({ requested }) => {
    const normalized = Math.max(0, Math.floor(requested));
    const grant = Math.min(normalized, Math.max(0, cap - earned));
    earned += grant;
    blocked += normalized - grant;
    return grant;
  });
  return { grants, earned, blocked };
}

/** Conservation check for a settled two-player wager. */
export function settleWagerPot(stake: number, rakePercent: number, rakeCap: number) {
  const pot = stake * 2;
  const rake = Math.min(Math.floor((pot * rakePercent) / 100), rakeCap);
  return { pot, rake, payout: pot - rake };
}
