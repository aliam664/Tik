/**
 * LAST NIGHT — MEDIEVAL SURVIVAL
 * Pure & deterministic-friendly 2D gameplay rules & simulation helpers.
 * Used by both the live 60FPS Canvas arena and the Vitest unit test suite.
 */

import {
  getBossForWave,
  getEnemySpec,
  getMagicBookSpec,
  getMapForWave,
  getMapSpec,
  getWeaponSpec,
  MAX_DAMAGE_REDUCTION_PCT,
  MAX_EQUIPPED_SPELLBOOKS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./catalog";
import type {
  BossAttackPattern,
  MagicBookId,
  MedievalBossKind,
  MedievalEnemyKind,
  MedievalMapId,
} from "@/types/lastNight";

/* -------------------------------------------------------------------------- */
/* Combat & Progression Math (Pure Functions)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Compute effective melee damage including permanent Whetstone upgrades (+10 each)
 * and temporary Fire Oil (+35% melee damage).
 */
export function calculateMeleeDamage(
  baseDamage: number,
  whetstoneStacks: number,
  fireOilActive: boolean,
): number {
  const flatBonus = Math.max(0, Math.min(5, whetstoneStacks)) * 10;
  const raw = baseDamage + flatBonus;
  return fireOilActive ? Math.round(raw * 1.35) : raw;
}

/**
 * Compute incoming damage after Book of Protection (70%), Protective Charm (20%),
 * and Book of Shadows (contact immunity vs ordinary enemies).
 *
 * Rules enforced:
 *  - Defensive magic NEVER makes players 100% invulnerable (max DR capped at 75%).
 *  - Book of Shadows only blocks ordinary enemy contact damage, not boss or ranged damage.
 */
export function calculateIncomingDamage(
  rawDamage: number,
  options: {
    protectionBookActive: boolean;
    protectiveCharmActive: boolean;
    shadowsActive: boolean;
    isOrdinaryContact: boolean;
  },
): number {
  if (rawDamage <= 0) return 0;
  if (options.shadowsActive && options.isOrdinaryContact) {
    return 0;
  }

  let reductionPct = 0;
  if (options.protectionBookActive) reductionPct += 70;
  if (options.protectiveCharmActive) reductionPct += 20;
  reductionPct = Math.min(MAX_DAMAGE_REDUCTION_PCT, reductionPct);

  const mitigated = Math.round(rawDamage * (1 - reductionPct / 100));
  return Math.max(1, mitigated);
}

/**
 * Enforce the 2-spellbook equipment limit.
 */
export function toggleEquippedSpellbook(
  currentEquipped: readonly MagicBookId[],
  ownedSpells: readonly MagicBookId[],
  targetSpell: MagicBookId,
): { ok: true; equipped: MagicBookId[] } | { ok: false; reason: "not_owned" | "max_two_spellbooks" } {
  if (!ownedSpells.includes(targetSpell)) {
    return { ok: false, reason: "not_owned" };
  }
  if (currentEquipped.includes(targetSpell)) {
    return {
      ok: true,
      equipped: currentEquipped.filter((id) => id !== targetSpell),
    };
  }
  if (currentEquipped.length >= MAX_EQUIPPED_SPELLBOOKS) {
    return { ok: false, reason: "max_two_spellbooks" };
  }
  return {
    ok: true,
    equipped: [...currentEquipped, targetSpell],
  };
}

/**
 * Apply Book of Frost effect to an enemy or boss.
 * Normal enemies are frozen for 3 seconds; Bosses are NEVER permanently frozen
 * (they only take a brief 25% chill slow for 1.5 seconds).
 */
export function applyFrostEffect(target: { isBoss: boolean }): {
  damage: number;
  frozenSec: number;
  chilledSec: number;
  speedMultiplier: number;
} {
  const frost = getMagicBookSpec("book_of_frost")!;
  if (target.isBoss) {
    return {
      damage: frost.directDamage,
      frozenSec: 0,
      chilledSec: 1.5,
      speedMultiplier: 0.75,
    };
  }
  return {
    damage: frost.directDamage,
    frozenSec: frost.freezeDurationSec ?? 3,
    chilledSec: 0,
    speedMultiplier: 0,
  };
}

/**
 * Determine boss health phase (1, 2, or 3) from current HP.
 */
export function getBossPhase(hp: number, maxHp: number): 1 | 2 | 3 {
  if (maxHp <= 0) return 1;
  const ratio = hp / maxHp;
  if (ratio > 0.66) return 1;
  if (ratio > 0.33) return 2;
  return 3;
}

/**
 * Resolve circle-vs-AABB collisions against solid medieval map landmarks
 * and clamp entity inside the arena boundaries so no player or enemy can
 * get knocked out of bounds or walk through stone buildings.
 */
export function resolveLandmarkCollisions(
  x: number,
  y: number,
  radius: number,
  mapId: MedievalMapId,
  ignoreSolid = false,
): { x: number; y: number } {
  const pad = Math.max(16, radius + 6);
  let nx = Math.max(pad, Math.min(WORLD_WIDTH - pad, x));
  let ny = Math.max(pad, Math.min(WORLD_HEIGHT - pad, y));

  if (ignoreSolid) {
    return { x: nx, y: ny };
  }

  const mapSpec = getMapSpec(mapId);
  for (const lm of mapSpec.landmarks) {
    if (!lm.solid) continue;
    const closestX = Math.max(lm.x, Math.min(nx, lm.x + lm.width));
    const closestY = Math.max(lm.y, Math.min(ny, lm.y + lm.height));
    const dx = nx - closestX;
    const dy = ny - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < radius * radius) {
      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        nx += (dx / dist) * overlap;
        ny += (dy / dist) * overlap;
      } else {
        // Center is inside the AABB: push out toward nearest edge
        const leftPen = nx - lm.x;
        const rightPen = lm.x + lm.width - nx;
        const topPen = ny - lm.y;
        const bottomPen = lm.y + lm.height - ny;
        const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
        if (minPen === leftPen) nx = lm.x - radius;
        else if (minPen === rightPen) nx = lm.x + lm.width + radius;
        else if (minPen === topPen) ny = lm.y - radius;
        else ny = lm.y + lm.height + radius;
      }
    }
  }

  nx = Math.max(pad, Math.min(WORLD_WIDTH - pad, nx));
  ny = Math.max(pad, Math.min(WORLD_HEIGHT - pad, ny));
  return { x: nx, y: ny };
}

/**
 * Apply soft separation forces between overlapping enemies so monster packs
 * spread out naturally in 2D space instead of stacking onto a single pixel.
 */
export function resolveEnemySeparation(
  enemies: SimEnemy[],
  dt: number,
  mapId: MedievalMapId,
): void {
  const n = enemies.length;
  for (let i = 0; i < n; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < n; j++) {
      const b = enemies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.radius + b.radius + 4;
      const distSq = dx * dx + dy * dy;
      if (distSq > 0 && distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const push = Math.min(120 * dt, (minDist - dist) * 0.5);
        const ux = dx / dist;
        const uy = dy / dist;
        if (!a.isBoss) {
          a.x -= ux * push;
          a.y -= uy * push;
        }
        if (!b.isBoss) {
          b.x += ux * push;
          b.y += uy * push;
        }
      } else if (distSq === 0) {
        b.x += 6;
        b.y += 4;
      }
    }
    const resolved = resolveLandmarkCollisions(
      a.x,
      a.y,
      a.radius,
      mapId,
      a.flying || a.ethereal,
    );
    a.x = resolved.x;
    a.y = resolved.y;
  }
}

/**
 * Find the nearest living enemy within `maxRange` of `(x, y)`.
 */
export function findNearestEnemy(
  x: number,
  y: number,
  enemies: readonly SimEnemy[],
  maxRange = 650,
): SimEnemy | null {
  let best: SimEnemy | null = null;
  let bestDist = maxRange;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

/**
 * Create a single summoned minion enemy (used by Forest Guardian & Cursed King boss patterns).
 */
export function spawnMinionEnemy(
  kind: MedievalEnemyKind,
  x: number,
  y: number,
  wave: number,
): SimEnemy {
  const spec = getEnemySpec(kind);
  const scaledHp = Math.round(spec.maxHp * (1 + Math.max(0, wave - 1) * 0.05));
  return {
    id: `minion_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    nameFa: spec.nameFa,
    nameEn: spec.nameEn,
    isBoss: false,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: scaledHp,
    maxHp: scaledHp,
    damage: spec.damage,
    speed: spec.speed,
    radius: spec.radius,
    rewardCoins: Math.max(8, Math.round(spec.rewardCoins * 0.5)),
    color: spec.color,
    accentColor: spec.accentColor,
    ranged: Boolean(spec.ranged),
    flying: Boolean(spec.flying),
    ethereal: Boolean(spec.ethereal),
    slowsTarget: Boolean(spec.slowsTarget),
    frozenSec: 0,
    chilledSec: 0,
    burnSec: 0,
    burnDps: 0,
    burnTickAccum: 0,
    attackCooldownSec: 0.7,
    hitFlashSec: 0.25,
  };
}

/* -------------------------------------------------------------------------- */
/* Live Arena Entities                                                        */
/* -------------------------------------------------------------------------- */

export interface SimEnemy {
  id: string;
  kind: MedievalEnemyKind | MedievalBossKind;
  nameFa: string;
  nameEn: string;
  isBoss: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  radius: number;
  rewardCoins: number;
  color: string;
  accentColor: string;
  ranged: boolean;
  flying: boolean;
  ethereal: boolean;
  slowsTarget: boolean;
  /** Status effects */
  frozenSec: number;
  chilledSec: number;
  burnSec: number;
  burnDps: number;
  burnTickAccum: number;
  attackCooldownSec: number;
  hitFlashSec: number;
  /** Boss-specific fields */
  bossPhase?: 1 | 2 | 3;
  patternCooldownSec?: number;
  activePattern?: BossAttackPattern | null;
  telegraphRemainingSec?: number;
  telegraphTargetX?: number;
  telegraphTargetY?: number;
}

export interface SimProjectile {
  id: string;
  ownerSeat: number; // 0 = enemy projectile
  kind: "arrow" | "lead_ball" | "fireball" | "frost_wave" | "dark_bolt" | "icicle" | "web_spit";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  knockback: number;
  color: string;
  ttlSec: number;
  appliesBurn?: boolean;
  appliesFrost?: boolean;
  appliesSlow?: boolean;
}

export interface SimThornTrap {
  id: string;
  x: number;
  y: number;
  radius: number;
  damage: number;
  charges: number;
}

export interface SimFloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  ttlSec: number;
}

export interface SimMeleeSlash {
  id: string;
  x: number;
  y: number;
  angle: number;
  arcRad: number;
  range: number;
  color: string;
  ttlSec: number;
}

export interface SimLightningArc {
  id: string;
  points: { x: number; y: number }[];
  ttlSec: number;
}

export interface SimTelegraphZone {
  id: string;
  kind: "circle" | "line";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius: number;
  ttlSec: number;
  maxTtlSec: number;
  label: string;
}

export interface SimInteractable {
  id: string;
  kind: "torch" | "chest" | "egg" | "rune" | "relic" | "gate";
  objectiveId: string;
  labelFa: string;
  labelEn: string;
  x: number;
  y: number;
  radius: number;
  activated: boolean;
  requiresKey?: boolean;
  rewardCoins: number;
}

/* -------------------------------------------------------------------------- */
/* Wave Roster Builder (Waves 1..10)                                          */
/* -------------------------------------------------------------------------- */

const WAVE_ENEMY_POOLS: Record<number, MedievalEnemyKind[]> = {
  1: ["village_zombie", "skeleton_swordsman"],
  2: ["village_zombie", "skeleton_swordsman", "black_wolf", "cursed_bat"],
  3: ["skeleton_swordsman", "black_wolf", "giant_spider", "dark_sorcerer"],
  4: ["black_wolf", "giant_spider", "dark_sorcerer", "wandering_spirit"],
  5: ["skeleton_swordsman", "black_wolf", "stone_giant", "undead_knight", "wandering_spirit"],
  6: ["dark_sorcerer", "stone_giant", "undead_knight", "cursed_bat", "wandering_spirit"],
  7: ["stone_giant", "undead_knight", "dark_sorcerer", "wandering_spirit"],
  8: ["skeleton_swordsman", "dark_sorcerer", "stone_giant", "undead_knight", "giant_spider"],
  9: ["stone_giant", "undead_knight", "dark_sorcerer", "wandering_spirit", "cursed_bat"],
  10: ["undead_knight", "stone_giant", "dark_sorcerer", "wandering_spirit"],
};

export function createWaveEnemies(wave: number): SimEnemy[] {
  const clampedWave = Math.max(1, Math.min(10, wave));
  const pool = WAVE_ENEMY_POOLS[clampedWave] ?? WAVE_ENEMY_POOLS[1];
  const count = 7 + clampedWave * 2;
  const enemies: SimEnemy[] = [];

  for (let i = 0; i < count; i++) {
    const kind = pool[i % pool.length];
    const spec = getEnemySpec(kind);
    const edge = i % 4;
    const x =
      edge === 0
        ? 90 + ((i * 173) % (WORLD_WIDTH - 180))
        : edge === 1
          ? WORLD_WIDTH - 75
          : edge === 2
            ? 90 + ((i * 197) % (WORLD_WIDTH - 180))
            : 75;
    const y =
      edge === 0
        ? 65
        : edge === 2
          ? WORLD_HEIGHT - 70
          : 90 + ((i * (edge === 1 ? 137 : 157)) % (WORLD_HEIGHT - 180));

    const hpScale = 1 + (clampedWave - 1) * 0.1;
    const scaledHp = Math.round(spec.maxHp * hpScale);

    enemies.push({
      id: `w${clampedWave}_e${i}_${kind}`,
      kind,
      nameFa: spec.nameFa,
      nameEn: spec.nameEn,
      isBoss: false,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: scaledHp,
      maxHp: scaledHp,
      damage: spec.damage,
      speed: spec.speed,
      radius: spec.radius,
      rewardCoins: spec.rewardCoins,
      color: spec.color,
      accentColor: spec.accentColor,
      ranged: Boolean(spec.ranged),
      flying: Boolean(spec.flying),
      ethereal: Boolean(spec.ethereal),
      slowsTarget: Boolean(spec.slowsTarget),
      frozenSec: 0,
      chilledSec: 0,
      burnSec: 0,
      burnDps: 0,
      burnTickAccum: 0,
      attackCooldownSec: 0.6 + (i % 3) * 0.25,
      hitFlashSec: 0,
    });
  }

  // Spawn wave Boss on Waves 4, 7, and 10
  const bossSpec = getBossForWave(clampedWave);
  if (bossSpec) {
    enemies.push({
      id: `boss_${bossSpec.kind}_w${clampedWave}`,
      kind: bossSpec.kind,
      nameFa: bossSpec.nameFa,
      nameEn: bossSpec.nameEn,
      isBoss: true,
      x: WORLD_WIDTH / 2,
      y: 165,
      vx: 0,
      vy: 0,
      hp: bossSpec.maxHp,
      maxHp: bossSpec.maxHp,
      damage: bossSpec.contactDamage,
      speed: bossSpec.speed,
      radius: bossSpec.radius,
      rewardCoins: bossSpec.rewardCoins,
      color: bossSpec.primaryColor,
      accentColor: bossSpec.accentColor,
      ranged: false,
      flying: false,
      ethereal: false,
      slowsTarget: false,
      frozenSec: 0,
      chilledSec: 0,
      burnSec: 0,
      burnDps: 0,
      burnTickAccum: 0,
      attackCooldownSec: 1.2,
      hitFlashSec: 0,
      bossPhase: 1,
      patternCooldownSec: 3.2,
      activePattern: null,
      telegraphRemainingSec: 0,
      telegraphTargetX: WORLD_WIDTH / 2,
      telegraphTargetY: WORLD_HEIGHT / 2,
    });
  }

  return enemies;
}

/* -------------------------------------------------------------------------- */
/* Map Interactables Builder (Torches, Chests, Eggs, Runes, Relics, Gates)    */
/* -------------------------------------------------------------------------- */

export function createMapInteractables(mapId: MedievalMapId): SimInteractable[] {
  switch (mapId) {
    case "cursed_village":
      return [
        { id: "v_torch_1", kind: "torch", objectiveId: "village_torches", labelFa: "مشعل میدان دهکده", labelEn: "Village Square Torch", x: 500, y: 310, radius: 24, activated: false, rewardCoins: 30 },
        { id: "v_torch_2", kind: "torch", objectiveId: "village_torches", labelFa: "مشعل آهنگری", labelEn: "Blacksmith Torch", x: 430, y: 495, radius: 24, activated: false, rewardCoins: 30 },
        { id: "v_torch_3", kind: "torch", objectiveId: "village_torches", labelFa: "مشعل دکان جادوگر", labelEn: "Witch's Shop Torch", x: 830, y: 495, radius: 24, activated: false, rewardCoins: 30 },
        { id: "v_chest_mill", kind: "chest", objectiveId: "mill_chest", labelFa: "صندوقچه قفل‌شده آسیاب (نیازمند Rusty key)", labelEn: "Locked Mill Chest (Requires Rusty key)", x: 940, y: 285, radius: 26, activated: false, requiresKey: true, rewardCoins: 140 },
        { id: "v_north_gate", kind: "gate", objectiveId: "north_gate", labelFa: "دروازه سنگی شمالی", labelEn: "Northern Stone Gate", x: 640, y: 80, radius: 32, activated: false, rewardCoins: 80 },
      ];
    case "cursed_forest":
      return [
        { id: "f_egg_1", kind: "egg", objectiveId: "cursed_eggs", labelFa: "تخم نفرین‌شده عنکبوت ۱", labelEn: "Cursed Egg #1", x: 930, y: 175, radius: 24, activated: false, rewardCoins: 45 },
        { id: "f_egg_2", kind: "egg", objectiveId: "cursed_eggs", labelFa: "تخم نفرین‌شده عنکبوت ۲", labelEn: "Cursed Egg #2", x: 1030, y: 165, radius: 24, activated: false, rewardCoins: 45 },
        { id: "f_egg_3", kind: "egg", objectiveId: "cursed_eggs", labelFa: "تخم نفرین‌شده عنکبوت ۳", labelEn: "Cursed Egg #3", x: 985, y: 240, radius: 24, activated: false, rewardCoins: 45 },
        { id: "f_torch_1", kind: "torch", objectiveId: "graveyard_torches", labelFa: "مشعل گورستان غربی", labelEn: "West Graveyard Torch", x: 855, y: 495, radius: 24, activated: false, rewardCoins: 35 },
        { id: "f_torch_2", kind: "torch", objectiveId: "graveyard_torches", labelFa: "مشعل گورستان شرقی", labelEn: "East Graveyard Torch", x: 1065, y: 495, radius: 24, activated: false, rewardCoins: 35 },
        { id: "f_torch_3", kind: "torch", objectiveId: "graveyard_torches", labelFa: "مشعل پل چوبی", labelEn: "Wooden Bridge Torch", x: 530, y: 350, radius: 24, activated: false, rewardCoins: 35 },
        { id: "f_rune_1", kind: "rune", objectiveId: "forest_shrine", labelFa: "رون محراب جنگل ۱", labelEn: "Forest Shrine Rune #1", x: 540, y: 150, radius: 26, activated: false, rewardCoins: 60 },
        { id: "f_rune_2", kind: "rune", objectiveId: "forest_shrine", labelFa: "رون محراب جنگل ۲", labelEn: "Forest Shrine Rune #2", x: 750, y: 150, radius: 26, activated: false, rewardCoins: 60 },
        { id: "f_chest_swamp", kind: "chest", objectiveId: "forest_shrine", labelFa: "صندوقچه مخفی مرداب (نیازمند Rusty key)", labelEn: "Swamp Hidden Chest", x: 290, y: 260, radius: 26, activated: false, requiresKey: true, rewardCoins: 160 },
      ];
    case "snowy_forest":
      return [
        { id: "s_rune_1", kind: "rune", objectiveId: "monastery_runes", labelFa: "رون باستانی صومعه ۱", labelEn: "Monastery Rune #1", x: 165, y: 280, radius: 26, activated: false, rewardCoins: 55 },
        { id: "s_rune_2", kind: "rune", objectiveId: "monastery_runes", labelFa: "رون باستانی صومعه ۲", labelEn: "Monastery Rune #2", x: 345, y: 280, radius: 26, activated: false, rewardCoins: 55 },
        { id: "s_rune_3", kind: "rune", objectiveId: "monastery_runes", labelFa: "رون باستانی پل سنگی", labelEn: "Stone Bridge Rune #3", x: 640, y: 365, radius: 26, activated: false, rewardCoins: 55 },
        { id: "s_torch_1", kind: "torch", objectiveId: "frozen_braziers", labelFa: "آتشدان غار یخی ۱", labelEn: "Icy Cave Brazier #1", x: 950, y: 155, radius: 24, activated: false, rewardCoins: 45 },
        { id: "s_torch_2", kind: "torch", objectiveId: "frozen_braziers", labelFa: "آتشدان غار یخی ۲", labelEn: "Icy Cave Brazier #2", x: 1110, y: 155, radius: 24, activated: false, rewardCoins: 45 },
        { id: "s_torch_3", kind: "torch", objectiveId: "frozen_braziers", labelFa: "آتشدان کلبه برفی", labelEn: "Snow Cottage Brazier", x: 355, y: 555, radius: 24, activated: false, rewardCoins: 45 },
        { id: "s_gate_arena", kind: "gate", objectiveId: "sanctuary_gate", labelFa: "دروازه سنگی میدان غول یخی", labelEn: "Ice Arena Stone Gate", x: 760, y: 540, radius: 30, activated: false, rewardCoins: 140 },
        { id: "s_chest_cave", kind: "chest", objectiveId: "sanctuary_gate", labelFa: "صندوقچه قفل‌شده غار یخی", labelEn: "Icy Cave Locked Chest", x: 1035, y: 215, radius: 26, activated: false, requiresKey: true, rewardCoins: 190 },
      ];
    case "ancient_catacombs":
      return [
        { id: "c_relic_1", kind: "relic", objectiveId: "cursed_relics", labelFa: "عتیقه نفرین‌شده محراب شمالی", labelEn: "North Altar Cursed Relic", x: 410, y: 240, radius: 26, activated: false, rewardCoins: 65 },
        { id: "c_relic_2", kind: "relic", objectiveId: "cursed_relics", labelFa: "عتیقه نفرین‌شده دالان غربی", labelEn: "West Corridor Cursed Relic", x: 180, y: 360, radius: 26, activated: false, rewardCoins: 65 },
        { id: "c_relic_3", kind: "relic", objectiveId: "cursed_relics", labelFa: "عتیقه نفرین‌شده قبرستان دخمه", labelEn: "Crypt Graveyard Cursed Relic", x: 420, y: 560, radius: 26, activated: false, rewardCoins: 65 },
        { id: "c_rune_1", kind: "rune", objectiveId: "catacomb_runes", labelFa: "رون سلطنتی دخمه ۱", labelEn: "Catacomb Rune #1", x: 895, y: 535, radius: 26, activated: false, rewardCoins: 60 },
        { id: "c_rune_2", kind: "rune", objectiveId: "catacomb_runes", labelFa: "رون سلطنتی دخمه ۲", labelEn: "Catacomb Rune #2", x: 1030, y: 535, radius: 26, activated: false, rewardCoins: 60 },
        { id: "c_rune_3", kind: "rune", objectiveId: "catacomb_runes", labelFa: "رون تالار پادشاه نفرین‌شده", labelEn: "Cursed King Hall Rune", x: 720, y: 205, radius: 26, activated: false, rewardCoins: 60 },
        { id: "c_door_1", kind: "gate", objectiveId: "crypt_doors", labelFa: "در سنگی قفل‌شده شمالی", labelEn: "North Locked Stone Door", x: 650, y: 95, radius: 30, activated: false, rewardCoins: 80 },
        { id: "c_door_2", kind: "gate", objectiveId: "crypt_doors", labelFa: "در سنگی قفل‌شده شرقی", labelEn: "East Locked Stone Door", x: 960, y: 340, radius: 30, activated: false, rewardCoins: 80 },
        { id: "c_chest_royal", kind: "chest", objectiveId: "crypt_doors", labelFa: "صندوقچه سلطنتی قفل‌شده (نیازمند Rusty key)", labelEn: "Royal Locked Chest", x: 1080, y: 175, radius: 28, activated: false, requiresKey: true, rewardCoins: 240 },
      ];
  }
}

export { getMapForWave, getWeaponSpec, getMagicBookSpec };
