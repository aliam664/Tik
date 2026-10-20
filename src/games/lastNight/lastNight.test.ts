import { describe, expect, it } from "vitest";
import { getActiveGames, getGameById, PLATFORM_GAMES } from "@/games/registry";
import {
  getBossForWave,
  getMagicBookSpec,
  getMapForWave,
  getShopItemSpec,
  getWeaponSpec,
  MAGIC_BOOKS,
  MAX_DAMAGE_REDUCTION_PCT,
  MAX_EQUIPPED_SPELLBOOKS,
  MEDIEVAL_BOSSES,
  MEDIEVAL_ENEMIES,
  MEDIEVAL_MAPS,
  MEDIEVAL_SHOP_ITEMS,
  MEDIEVAL_WEAPONS,
  SHERIFF_COIN_NAME,
} from "./catalog";
import {
  applyFrostEffect,
  calculateIncomingDamage,
  calculateMeleeDamage,
  createMapInteractables,
  createWaveEnemies,
  findNearestEnemy,
  getBossPhase,
  resolveEnemySeparation,
  resolveLandmarkCollisions,
  spawnMinionEnemy,
  toggleEquippedSpellbook,
} from "./simulation";

describe("Last Night — Medieval Survival Catalog & Economy", () => {
  it("uses the exact currency name 'Sheriff Coin'", () => {
    expect(SHERIFF_COIN_NAME).toBe("Sheriff Coin");
  });

  it("registers both Doz Classic and Last Night — Medieval Survival as live platform games", () => {
    expect(PLATFORM_GAMES.some((g) => g.id === "doz" && g.status === "live")).toBe(true);
    expect(
      PLATFORM_GAMES.some((g) => g.id === "last_night" && g.status === "live"),
    ).toBe(true);
    expect(getActiveGames().length).toBeGreaterThanOrEqual(2);
    expect(getGameById("last_night")?.route).toBe("/games/last-night");
  });

  it("defines the exact 6 medieval weapons with exact Sheriff Coin prices and damages", () => {
    expect(MEDIEVAL_WEAPONS).toHaveLength(6);

    const rusty = getWeaponSpec("rusty_sword");
    expect(rusty.nameEn).toBe("Rusty Sword");
    expect(rusty.price).toBe(0);
    expect(rusty.damage).toBe(25);

    const bow = getWeaponSpec("hunter_bow");
    expect(bow.nameEn).toBe("Hunter Bow");
    expect(bow.price).toBe(120);
    expect(bow.damage).toBe(35);

    const club = getWeaponSpec("spiked_club");
    expect(club.nameEn).toBe("Spiked Wooden Club");
    expect(club.price).toBe(170);
    expect(club.damage).toBe(40);

    const axe = getWeaponSpec("battle_axe");
    expect(axe.nameEn).toBe("Battle Axe");
    expect(axe.price).toBe(250);
    expect(axe.damage).toBe(60);

    const pistol = getWeaponSpec("flintlock_pistol");
    expect(pistol.nameEn).toBe("Antique Flintlock Pistol");
    expect(pistol.price).toBe(400);
    expect(pistol.damage).toBe(100);
    expect(pistol.magazineSize).toBe(1);

    const musket = getWeaponSpec("hunting_musket");
    expect(musket.nameEn).toBe("Old Hunting Musket");
    expect(musket.price).toBe(600);
    expect(musket.damage).toBe(140);
    expect(musket.magazineSize).toBe(1);
  });

  it("defines the exact 6 Magic Books with exact prices, damages, cooldowns, and mana costs", () => {
    expect(MAGIC_BOOKS).toHaveLength(6);
    expect(MAX_EQUIPPED_SPELLBOOKS).toBe(2);

    const fire = getMagicBookSpec("book_of_fire")!;
    expect(fire.price).toBe(900);
    expect(fire.directDamage).toBe(120);
    expect(fire.burnDamagePerSec).toBe(20);
    expect(fire.burnDurationSec).toBe(3);
    expect(fire.cooldownSec).toBe(12);
    expect(fire.manaCost).toBe(30);

    const prot = getMagicBookSpec("book_of_protection")!;
    expect(prot.price).toBe(1200);
    expect(prot.damageReductionPct).toBe(70);
    expect(prot.buffDurationSec).toBe(20);
    expect(prot.cooldownSec).toBe(45);
    expect(prot.manaCost).toBe(40);

    const frost = getMagicBookSpec("book_of_frost")!;
    expect(frost.price).toBe(800);
    expect(frost.directDamage).toBe(40);
    expect(frost.freezeDurationSec).toBe(3);
    expect(frost.cooldownSec).toBe(18);
    expect(frost.manaCost).toBe(25);

    const spirits = getMagicBookSpec("book_of_spirits")!;
    expect(spirits.price).toBe(1500);
    expect(spirits.buffDurationSec).toBe(12);
    expect(spirits.spiritDamagePerAttack).toBe(25);
    expect(spirits.cooldownSec).toBe(35);
    expect(spirits.manaCost).toBe(45);

    const lightning = getMagicBookSpec("book_of_lightning")!;
    expect(lightning.price).toBe(1300);
    expect(lightning.directDamage).toBe(100);
    expect(lightning.chainDamage).toBe(55);
    expect(lightning.chainTargets).toBe(3);
    expect(lightning.cooldownSec).toBe(15);
    expect(lightning.manaCost).toBe(35);

    const shadows = getMagicBookSpec("book_of_shadows")!;
    expect(shadows.price).toBe(1100);
    expect(shadows.speedBoostPct).toBe(35);
    expect(shadows.buffDurationSec).toBe(4);
    expect(shadows.cooldownSec).toBe(25);
    expect(shadows.manaCost).toBe(30);
  });

  it("defines the exact 11 shop items with exact Sheriff Coin prices", () => {
    expect(MEDIEVAL_SHOP_ITEMS).toHaveLength(11);
    expect(getShopItemSpec("small_heal_potion")?.price).toBe(60);
    expect(getShopItemSpec("large_heal_potion")?.price).toBe(130);
    expect(getShopItemSpec("mana_potion")?.price).toBe(80);
    expect(getShopItemSpec("arrow_bundle")?.price).toBe(30);
    expect(getShopItemSpec("gunpowder_bullet")?.price).toBe(70);
    expect(getShopItemSpec("fire_oil")?.price).toBe(100);
    expect(getShopItemSpec("whetstone")?.price).toBe(150);
    expect(getShopItemSpec("protective_charm")?.price).toBe(180);
    expect(getShopItemSpec("thorn_trap")?.price).toBe(90);
    expect(getShopItemSpec("lantern")?.price).toBe(120);
    expect(getShopItemSpec("rusty_key")?.price).toBe(80);
  });

  it("maps Waves 1–10 across the 4 medieval maps and 3 bosses", () => {
    expect(MEDIEVAL_MAPS).toHaveLength(4);
    expect(MEDIEVAL_ENEMIES).toHaveLength(9);
    expect(MEDIEVAL_BOSSES).toHaveLength(3);

    expect(getMapForWave(1).id).toBe("cursed_village");
    expect(getMapForWave(2).id).toBe("cursed_village");
    expect(getMapForWave(3).id).toBe("cursed_forest");
    expect(getMapForWave(4).id).toBe("cursed_forest");
    expect(getMapForWave(5).id).toBe("snowy_forest");
    expect(getMapForWave(7).id).toBe("snowy_forest");
    expect(getMapForWave(8).id).toBe("ancient_catacombs");
    expect(getMapForWave(10).id).toBe("ancient_catacombs");

    expect(getBossForWave(4)?.kind).toBe("forest_guardian");
    expect(getBossForWave(7)?.kind).toBe("ice_giant");
    expect(getBossForWave(10)?.kind).toBe("cursed_king");
    expect(getBossForWave(1)).toBeUndefined();
  });
});

describe("Last Night — Medieval Survival Rules & Simulation", () => {
  it("enforces the maximum of 2 equipped spellbooks per player", () => {
    const owned = [
      "book_of_fire",
      "book_of_frost",
      "book_of_lightning",
    ] as const;

    const r1 = toggleEquippedSpellbook([], owned, "book_of_fire");
    expect(r1).toEqual({ ok: true, equipped: ["book_of_fire"] });

    const r2 = toggleEquippedSpellbook(
      ["book_of_fire"],
      owned,
      "book_of_frost",
    );
    expect(r2).toEqual({
      ok: true,
      equipped: ["book_of_fire", "book_of_frost"],
    });

    const r3 = toggleEquippedSpellbook(
      ["book_of_fire", "book_of_frost"],
      owned,
      "book_of_lightning",
    );
    expect(r3).toEqual({ ok: false, reason: "max_two_spellbooks" });

    const r4 = toggleEquippedSpellbook(
      ["book_of_fire", "book_of_frost"],
      owned,
      "book_of_fire",
    );
    expect(r4).toEqual({ ok: true, equipped: ["book_of_frost"] });
  });

  it("freezes normal enemies for 3s with Book of Frost but NEVER permanently freezes bosses", () => {
    const normalEffect = applyFrostEffect({ isBoss: false });
    expect(normalEffect.damage).toBe(40);
    expect(normalEffect.frozenSec).toBe(3);

    const bossEffect = applyFrostEffect({ isBoss: true });
    expect(bossEffect.damage).toBe(40);
    expect(bossEffect.frozenSec).toBe(0);
    expect(bossEffect.chilledSec).toBeGreaterThan(0);
    expect(bossEffect.speedMultiplier).toBe(0.75);
  });

  it("caps defensive magic damage reduction at 75% so players are never 100% invulnerable", () => {
    expect(MAX_DAMAGE_REDUCTION_PCT).toBe(75);
    const mitigated = calculateIncomingDamage(100, {
      protectionBookActive: true,
      protectiveCharmActive: true,
      shadowsActive: false,
      isOrdinaryContact: true,
    });
    expect(mitigated).toBe(25);

    expect(
      calculateIncomingDamage(40, {
        protectionBookActive: false,
        protectiveCharmActive: false,
        shadowsActive: true,
        isOrdinaryContact: true,
      }),
    ).toBe(0);

    expect(
      calculateIncomingDamage(40, {
        protectionBookActive: false,
        protectiveCharmActive: false,
        shadowsActive: true,
        isOrdinaryContact: false,
      }),
    ).toBe(40);
  });

  it("computes melee damage with Whetstone stacks and Fire Oil", () => {
    expect(calculateMeleeDamage(25, 0, false)).toBe(25);
    expect(calculateMeleeDamage(25, 2, false)).toBe(45);
    expect(calculateMeleeDamage(60, 1, true)).toBe(Math.round(70 * 1.35));
  });

  it("spawns bosses on Waves 4, 7, and 10 and transitions boss phases at 66% and 33% HP", () => {
    const w4 = createWaveEnemies(4);
    expect(w4.some((e) => e.isBoss && e.kind === "forest_guardian")).toBe(true);

    const w7 = createWaveEnemies(7);
    expect(w7.some((e) => e.isBoss && e.kind === "ice_giant")).toBe(true);

    const w10 = createWaveEnemies(10);
    expect(w10.some((e) => e.isBoss && e.kind === "cursed_king")).toBe(true);

    expect(getBossPhase(900, 1000)).toBe(1);
    expect(getBossPhase(500, 1000)).toBe(2);
    expect(getBossPhase(200, 1000)).toBe(3);
  });

  it("creates medieval interactables (torches, chests, eggs, runes, relics, gates) for all 4 maps", () => {
    for (const m of MEDIEVAL_MAPS) {
      expect(m.previewUrl).toMatch(/^\/assets\/last-night\/map-.*\.png$/);
      const items = createMapInteractables(m.id);
      expect(items.length).toBeGreaterThanOrEqual(5);
      expect(items.some((i) => i.requiresKey)).toBe(true);
    }
  });

  it("prevents ground entities from walking through solid landmarks or getting knocked out of bounds", () => {
    // Stone well in Cursed Village is at x: 615..667, y: 375..427
    const insideWell = resolveLandmarkCollisions(640, 400, 17, "cursed_village", false);
    const wellBox = { x: 615, y: 375, width: 52, height: 52 };
    const stillOverlapping =
      insideWell.x > wellBox.x &&
      insideWell.x < wellBox.x + wellBox.width &&
      insideWell.y > wellBox.y &&
      insideWell.y < wellBox.y + wellBox.height;
    expect(stillOverlapping).toBe(false);

    // Out of bounds clamp
    const clamped = resolveLandmarkCollisions(-500, 9999, 17, "cursed_village", false);
    expect(clamped.x).toBeGreaterThanOrEqual(23);
    expect(clamped.y).toBeLessThanOrEqual(760 - 23);
  });

  it("separates stacked enemies and finds the nearest living enemy for auto-aim", () => {
    const e1 = spawnMinionEnemy("black_wolf", 400, 400, 2);
    const e2 = spawnMinionEnemy("black_wolf", 400, 400, 2);
    const list = [e1, e2];
    resolveEnemySeparation(list, 0.016, "cursed_village");
    expect(Math.hypot(e2.x - e1.x, e2.y - e1.y)).toBeGreaterThan(0);

    const nearest = findNearestEnemy(390, 390, list, 300);
    expect(nearest).not.toBeNull();
  });
});
