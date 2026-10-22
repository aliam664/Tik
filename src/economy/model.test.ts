import { describe, expect, it } from "vitest";
import { SHERIFF_ECONOMY_MODEL, settleDailyRewardClaims, settleWagerPot } from "./model";

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
  );
}

describe("Sheriff Coin balance model", () => {
  it("keeps every interleaving of cross-game reward claims under one 150 SH cap", () => {
    const claims = [
      { source: "classic_ranked", requested: 12 },
      { source: "word_cipher", requested: 24 },
      { source: "code_breaker", requested: 12 },
      { source: "last_night", requested: 75 },
      { source: "classic_ranked", requested: 30 },
    ];

    for (const ordering of permutations(claims)) {
      const result = settleDailyRewardClaims(20, ordering);
      expect(result.earned).toBe(150);
      expect(result.grants.reduce((sum, grant) => sum + grant, 0)).toBe(130);
      expect(result.blocked).toBe(23);
    }
  });

  it("tapers cleanly at the cap without a negative or fractional grant", () => {
    expect(settleDailyRewardClaims(147, [{ source: "word_cipher", requested: 24 }])).toEqual({
      grants: [3],
      earned: 150,
      blocked: 21,
    });
    expect(settleDailyRewardClaims(150, [{ source: "last_night", requested: 75 }]).grants).toEqual([0]);
  });

  it("prices the four game faucets near the 3–5 SH/minute target under documented sessions", () => {
    const r = SHERIFF_ECONOMY_MODEL.rewards;
    const rates = {
      classic: ((r.classic.win + r.classic.loss) / 2) / 2,
      wordCipher: ((r.wordCipher.win + r.wordCipher.participation) / 2) / 5,
      codeBreaker: ((r.codeBreaker.win + r.codeBreaker.participation) / 2) / 2.5,
      lastNight: r.lastNight.campaign / r.lastNight.minimumMinutes,
    };

    for (const rate of Object.values(rates)) {
      expect(rate).toBeGreaterThanOrEqual(SHERIFF_ECONOMY_MODEL.targetCoinsPerMinute.min);
      expect(rate).toBeLessThanOrEqual(SHERIFF_ECONOMY_MODEL.targetCoinsPerMinute.max);
    }
  });

  it("conserves stake principal and records the exact integer rake", () => {
    for (const stake of [100, 150, 200, 300]) {
      const result = settleWagerPot(stake, 7, 20);
      expect(result.payout + result.rake).toBe(result.pot);
      expect(result.rake).toBeLessThanOrEqual(20);
    }
  });

  it("makes the first cosmetic immediately affordable while prestige remains aspirational", () => {
    expect(SHERIFF_ECONOMY_MODEL.startingBalance).toBe(150);
    expect(Math.ceil(5_000 / SHERIFF_ECONOMY_MODEL.dailyGameplayCap)).toBe(34);
  });
});
