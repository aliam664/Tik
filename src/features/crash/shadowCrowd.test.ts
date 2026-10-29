import { describe, expect, it } from "vitest";
import { MAX_BET, MIN_BET } from "@/games/crash/math";
import { SHADOW_PERSONAS } from "@/lib/shadowOpponent";
import {
  buildShadowCrowd,
  SHADOW_CROWD_POOL,
  shadowGuestCashed,
  shadowGuestPayout,
} from "./shadowCrowd";

describe("Shadow Crowd — live salon virtual guests", () => {
  it("returns nothing when the crowd is not needed", () => {
    expect(buildShadowCrowd(12, 0)).toEqual([]);
    expect(buildShadowCrowd(12, -3)).toEqual([]);
  });

  it("is deterministic per round so the feed never flickers", () => {
    const a = buildShadowCrowd(7, 3);
    const b = buildShadowCrowd(7, 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(a.map((g) => g.id)).toEqual([
      "shadow_7_0",
      "shadow_7_1",
      "shadow_7_2",
    ]);

    // Different rounds get different crowds.
    const other = buildShadowCrowd(8, 3);
    expect(other.map((g) => `${g.name}:${g.amount}`)).not.toEqual(
      a.map((g) => `${g.name}:${g.amount}`),
    );
  });

  it("keeps the first N guests stable when the need shrinks", () => {
    const full = buildShadowCrowd(4, SHADOW_CROWD_POOL);
    const partial = buildShadowCrowd(4, 2);
    expect(partial).toEqual(full.slice(0, 2));
    expect(full).toHaveLength(SHADOW_CROWD_POOL);
  });

  it("uses plausible human personas with legal stake bounds", () => {
    for (const guest of buildShadowCrowd(21, SHADOW_CROWD_POOL)) {
      expect(SHADOW_PERSONAS.sheriff_blast).toContain(guest.name);
      expect(guest.amount).toBeGreaterThanOrEqual(MIN_BET);
      expect(guest.amount).toBeLessThanOrEqual(MAX_BET);
      expect(guest.isMe).toBe(false);
      expect(guest.shadow).toBe(true);
      expect(guest.cashTarget).toBeGreaterThan(1);
      if (guest.autoAt !== null) {
        expect(guest.cashTarget).toBe(guest.autoAt);
      }
    }
  });

  it("cashes out only after the live multiplier crosses the target", () => {
    const [guest] = buildShadowCrowd(3, 1);
    expect(guest).toBeDefined();
    if (!guest) return;
    expect(shadowGuestCashed(guest, null, "flying")).toBe(false);
    expect(shadowGuestCashed(guest, guest.cashTarget + 1, "betting")).toBe(false);
    expect(shadowGuestCashed(guest, guest.cashTarget - 1, "flying")).toBe(false);
    expect(shadowGuestCashed(guest, guest.cashTarget, "flying")).toBe(true);
    expect(shadowGuestCashed(guest, guest.cashTarget + 300, "crashed")).toBe(true);
    expect(shadowGuestPayout(guest)).toBeGreaterThan(guest.amount);
  });
});
