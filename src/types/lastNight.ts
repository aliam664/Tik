/**
 * LAST NIGHT — MEDIEVAL SURVIVAL
 * Core TypeScript contracts for weapons, magic books, shop items,
 * 4 medieval maps, 9 enemy types, 3 multi-phase bosses, and authoritative multiplayer rooms.
 */

export const CURRENCY_NAME = "Sheriff Coin" as const;
export const SHERIFF_COIN_NAME = CURRENCY_NAME;

export type MedievalWeaponId =
  | "rusty_sword"
  | "hunter_bow"
  | "battle_axe"
  | "spiked_club"
  | "flintlock_pistol"
  | "hunting_musket";

export type MagicBookId =
  | "book_of_fire"
  | "book_of_protection"
  | "book_of_frost"
  | "book_of_spirits"
  | "book_of_lightning"
  | "book_of_shadows";

export type MedievalShopItemId =
  | "small_heal_potion"
  | "large_heal_potion"
  | "mana_potion"
  | "arrow_bundle"
  | "gunpowder_bullet"
  | "fire_oil"
  | "whetstone"
  | "protective_charm"
  | "thorn_trap"
  | "lantern"
  | "rusty_key";

export type MedievalMapId =
  | "cursed_village"
  | "cursed_forest"
  | "snowy_forest"
  | "ancient_catacombs";

export type MedievalEnemyKind =
  | "village_zombie"
  | "skeleton_swordsman"
  | "black_wolf"
  | "dark_sorcerer"
  | "stone_giant"
  | "cursed_bat"
  | "undead_knight"
  | "wandering_spirit"
  | "giant_spider";

export type MedievalBossKind =
  | "forest_guardian"
  | "ice_giant"
  | "cursed_king";

export interface WeaponSpec {
  readonly id: MedievalWeaponId;
  readonly nameEn: string;
  readonly nameFa: string;
  readonly price: number; // Sheriff Coins
  readonly damage: number;
  readonly kind: "melee" | "bow" | "firearm";
  readonly ammoType: "none" | "arrow" | "bullet";
  readonly magazineSize: number; // 1 for flintlock & musket
  readonly attackCooldownSec: number;
  readonly reloadSec: number;
  readonly range: number;
  readonly projectileSpeed?: number;
  readonly cleaveArcRad?: number;
  readonly knockback: number;
  readonly descriptionFa: string;
  readonly descriptionEn: string;
}

export interface MagicBookSpec {
  readonly id: MagicBookId;
  readonly nameEn: string;
  readonly nameFa: string;
  readonly price: number; // Sheriff Coins
  readonly manaCost: number;
  readonly cooldownSec: number;
  readonly directDamage: number;
  readonly burnDamagePerSec?: number;
  readonly burnDurationSec?: number;
  readonly freezeDurationSec?: number;
  readonly damageReductionPct?: number;
  readonly buffDurationSec?: number;
  readonly spiritDamagePerAttack?: number;
  readonly chainDamage?: number;
  readonly chainTargets?: number;
  readonly speedBoostPct?: number;
  readonly contactImmune?: boolean;
  readonly color: string;
  readonly descriptionFa: string;
  readonly descriptionEn: string;
}

export interface MedievalShopItemSpec {
  readonly id: MedievalShopItemId;
  readonly nameEn: string;
  readonly nameFa: string;
  readonly price: number; // Sheriff Coins
  readonly kind: "consumable" | "ammo" | "passive" | "permanent_upgrade" | "trap";
  readonly cooldownSec: number; // 0 for passive/ammo/permanent
  readonly healHp?: number;
  readonly restoreMana?: number;
  readonly arrowsGranted?: number;
  readonly bulletsGranted?: number;
  readonly durationSec?: number;
  readonly descriptionFa: string;
  readonly descriptionEn: string;
}

export interface MapLandmark {
  readonly id: string;
  readonly nameEn: string;
  readonly nameFa: string;
  readonly kind:
    | "safehouse"
    | "square"
    | "well"
    | "blacksmith"
    | "witch_shop"
    | "mill"
    | "fence"
    | "gate"
    | "bridge"
    | "swamp"
    | "cabin"
    | "graveyard"
    | "nest"
    | "boss_arena"
    | "frozen_river"
    | "monastery"
    | "cottage"
    | "cave"
    | "corridor"
    | "altar"
    | "stone_door"
    | "rune"
    | "torch"
    | "chest";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly solid?: boolean;
}

export interface MedievalMapSpec {
  readonly id: MedievalMapId;
  readonly number: 1 | 2 | 3 | 4;
  readonly nameEn: string;
  readonly nameFa: string;
  readonly waves: readonly number[];
  readonly bossId?: MedievalBossKind;
  readonly bossWave?: number;
  readonly ambientDarkness: number; // 0..1
  readonly previewUrl: string;
  readonly groundPalette: {
    readonly base: string;
    readonly road: string;
    readonly accent: string;
    readonly waterOrIce: string;
    readonly wall: string;
  };
  readonly descriptionFa: string;
  readonly descriptionEn: string;
  readonly landmarks: readonly MapLandmark[];
}

export interface EnemySpec {
  readonly kind: MedievalEnemyKind;
  readonly nameEn: string;
  readonly nameFa: string;
  readonly maxHp: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly rewardCoins: number; // Sheriff Coins
  readonly minWave: number;
  readonly ranged?: boolean;
  readonly flying?: boolean;
  readonly ethereal?: boolean;
  readonly slowsTarget?: boolean;
  readonly color: string;
  readonly accentColor: string;
  readonly descriptionFa?: string;
}

export interface BossAttackPattern {
  readonly id: string;
  readonly nameEn: string;
  readonly nameFa: string;
  readonly telegraphSec: number;
  readonly cooldownSec?: number;
  readonly radiusPx?: number;
  readonly damage: number;
  readonly kind: "line_impale" | "nova_burst" | "summon_pack" | "shockwave_slam" | "icicle_fan" | "bull_charge" | "royal_cleave" | "soul_pillars" | "crown_beam";
}

export interface BossSpec {
  readonly kind: MedievalBossKind;
  readonly nameEn: string;
  readonly nameFa: string;
  readonly titleEn: string;
  readonly titleFa: string;
  readonly wave: 4 | 7 | 10;
  readonly mapId: MedievalMapId;
  readonly maxHp: number;
  readonly contactDamage: number;
  readonly speed: number;
  readonly radius: number;
  readonly rewardCoins: number; // Sheriff Coins
  readonly portraitUrl: string;
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly patterns: readonly BossAttackPattern[];
}

/* ---------------- Server-Authoritative Room & Player State ---------------- */

export interface LnObjectiveState {
  readonly id: string;
  readonly title: string;
  readonly titleEn: string;
  readonly kind:
    | "light_torches"
    | "collect_keys"
    | "break_eggs"
    | "activate_runes"
    | "destroy_relics"
    | "open_gate";
  readonly progress: number;
  readonly target: number;
  readonly reward_coins: number;
  readonly completed: boolean;
}

export interface LnPlayerInventory {
  small_heal_potion?: number;
  large_heal_potion?: number;
  mana_potion?: number;
  fire_oil?: number;
  protective_charm?: number;
  thorn_trap?: number;
  [key: string]: number | undefined;
}

export interface LnPlayerBuffs {
  protection_until?: number;
  shadows_until?: number;
  fire_oil_until?: number;
  charm_until?: number;
  spirit_until?: number;
}

export interface LnRoomPlayer {
  seat: 1 | 2 | 3;
  hero_class: "warden" | "ranger" | "runepriest";
  name: string;
  connected: boolean;
  profile_id?: string | null;
  hp: number;
  max_hp: number;
  mana: number;
  max_mana: number;
  downed: boolean;
  revive_progress: number;
  pos_x: number;
  pos_y: number;
  facing: number;
  equipped_weapon: MedievalWeaponId;
  owned_weapons: MedievalWeaponId[];
  equipped_spells: MagicBookId[];
  owned_spells: MagicBookId[];
  arrows: number;
  bullets: number;
  loaded_firearm: boolean;
  firearm_reload_ready_at?: string | null;
  whetstone_stacks: number;
  has_lantern: boolean;
  rusty_keys: number;
  inventory: LnPlayerInventory;
  spell_cooldowns: Record<string, number>;
  item_cooldowns: Record<string, number>;
  active_buffs: LnPlayerBuffs;
  kills: number;
  damage_dealt: number;
  revives_performed: number;
}

export interface LnRoomState {
  room_code: string;
  status: "waiting" | "active" | "victory" | "defeat" | "closed" | "expired";
  mode: "coop" | "ranked" | "stakes";
  stake: number;
  max_players: 2 | 3;
  wave: number;
  map_id: MedievalMapId;
  phase: "prep" | "combat" | "boss" | "cleared" | "transition";
  currency_name: typeof CURRENCY_NAME;
  sheriff_coins: number;
  total_coins_earned: number;
  total_kills: number;
  bosses_defeated: MedievalBossKind[];
  objectives: LnObjectiveState[];
  chests_opened: string[];
  interactions?: string[];
  world_state: Record<string, unknown>;
  settlement: {
    settled?: boolean;
    platform_bonus_sh?: number;
    campaign_cleared?: boolean;
  };
  version: number;
  players: LnRoomPlayer[];
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  expires_in_seconds: number;
  server_now: string;
}

export interface LnCreateJoinResponse {
  room_code: string;
  room_id: string;
  player_token: string;
  seat: 1 | 2 | 3;
  state: LnRoomState;
}

export interface LnRoomStateResponse {
  seat: 1 | 2 | 3 | null;
  state: LnRoomState;
  interaction_recorded?: boolean;
  interaction_reward_coins?: number;
  combat_reward_coins?: number;
  combat_reward_kills?: number;
}
