import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GameLoop2D } from "@/games/engine2d/GameLoop2D";
import {
  getBossForWave,
  getMagicBookSpec,
  getMapSpec,
  getShopItemSpec,
  getWeaponSpec,
  MAX_EQUIPPED_SPELLBOOKS,
  SHERIFF_COIN_NAME,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@/games/lastNight/catalog";
import {
  type RenderPlayerActor,
  renderLastNightArena,
} from "@/games/lastNight/renderer";
import { loadLnSession, saveLnSession } from "@/games/lastNight/session";
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
  type SimEnemy,
  type SimFloatingText,
  type SimInteractable,
  type SimLightningArc,
  type SimMeleeSlash,
  type SimProjectile,
  type SimTelegraphZone,
  type SimThornTrap,
  spawnMinionEnemy,
  toggleEquippedSpellbook,
} from "@/games/lastNight/simulation";
import { medievalAudio } from "@/games/lastNight/sound";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { lastNightApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type {
  LnRoomPlayer,
  LnRoomStateResponse,
  MagicBookId,
  MedievalMapId,
  MedievalShopItemId,
  MedievalWeaponId,
} from "@/types/lastNight";
import { LastNightShopModal } from "./LastNightShopModal";

const QUICK_BELT_ITEMS: { id: MedievalShopItemId; key: string; shortFa: string }[] = [
  { id: "small_heal_potion", key: "1", shortFa: "معجون کوچک (+30 HP)" },
  { id: "large_heal_potion", key: "2", shortFa: "معجون بزرگ (+70 HP)" },
  { id: "mana_potion", key: "3", shortFa: "معجون مانا (+40 MP)" },
  { id: "fire_oil", key: "4", shortFa: "روغن آتشین (۲۰s)" },
  { id: "protective_charm", key: "5", shortFa: "طلسم محافظ (۱۰s)" },
  { id: "thorn_trap", key: "6", shortFa: "تله خاردار" },
];

export function LastNightRoomPage() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const normalizedCode = roomCode.trim().toUpperCase();
  const navigate = useNavigate();
  const { profile, token: profileToken, refreshProfile } = useEconomyProfile();

  const [session, setSession] = useState(() => loadLnSession(normalizedCode));
  const [joinName, setJoinName] = useState(
    () => profile?.display_name ?? "شوالیه شب",
  );
  const [joining, setJoining] = useState(false);

  const [roomState, setRoomState] = useState<LnRoomStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastBanner, setToastBanner] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [soundMuted, setSoundMuted] = useState(false);
  const [autoAimEnabled, setAutoAimEnabled] = useState(true);
  const [theaterMode, setTheaterMode] = useState(false);

  const [hudSnapshot, setHudSnapshot] = useState<{
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    arrows: number;
    bullets: number;
    rustyKeys: number;
    downed: boolean;
    loadedFirearm: boolean;
    reloadRemainingSec: number;
    spellCooldowns: Record<string, number>;
    fireOilSec: number;
    protectionSec: number;
    charmSec: number;
    shadowsSec: number;
    spiritSec: number;
    enemiesRemaining: number;
    nearestPromptFa: string | null;
    activeBoss: {
      nameFa: string;
      nameEn: string;
      hp: number;
      maxHp: number;
      phase: 1 | 2 | 3;
      portraitUrl: string;
    } | null;
  }>({
    hp: 120,
    maxHp: 120,
    mana: 100,
    maxMana: 100,
    arrows: 20,
    bullets: 4,
    rustyKeys: 1,
    downed: false,
    loadedFirearm: true,
    reloadRemainingSec: 0,
    spellCooldowns: {},
    fireOilSec: 0,
    protectionSec: 0,
    charmSec: 0,
    shadowsSec: 0,
    spiritSec: 0,
    enemiesRemaining: 0,
    nearestPromptFa: null,
    activeBoss: null,
  });

  const simRef = useRef<{
    initializedWave: number;
    initializedMap: MedievalMapId;
    timeSec: number;
    localX: number;
    localY: number;
    aimX: number;
    aimY: number;
    aimAngle: number;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    arrows: number;
    bullets: number;
    rustyKeys: number;
    downed: boolean;
    soloReviveTimerSec: number;
    webSlowSec: number;
    loadedFirearm: boolean;
    reloadRemainingSec: number;
    attackCooldownSec: number;
    spellCooldowns: Record<string, number>;
    fireOilSec: number;
    protectionSec: number;
    charmSec: number;
    shadowsSec: number;
    spiritSec: number;
    spiritAttackAccumSec: number;
    squireX: number;
    squireY: number;
    squireAimAngle: number;
    squireAttackAccumSec: number;
    pendingCoinsEarned: number;
    pendingKills: number;
    pendingBossDamage: number;
    waveClearSent: boolean;
    syncAccumSec: number;
    hudAccumSec: number;
    keysDown: Set<string>;
    touchMoveX: number;
    touchMoveY: number;
    mouseDown: boolean;
    autoAim: boolean;
    enemies: SimEnemy[];
    projectiles: SimProjectile[];
    thornTraps: SimThornTrap[];
    interactables: SimInteractable[];
    slashes: SimMeleeSlash[];
    lightningArcs: SimLightningArc[];
    telegraphs: SimTelegraphZone[];
    floatingTexts: SimFloatingText[];
    nearestInteractableId: string | null;
  }>({
    initializedWave: 0,
    initializedMap: "cursed_village",
    timeSec: 0,
    localX: 590,
    localY: 455,
    aimX: 640,
    aimY: 360,
    aimAngle: 0,
    hp: 120,
    maxHp: 120,
    mana: 100,
    maxMana: 100,
    arrows: 20,
    bullets: 4,
    rustyKeys: 1,
    downed: false,
    soloReviveTimerSec: 0,
    webSlowSec: 0,
    loadedFirearm: true,
    reloadRemainingSec: 0,
    attackCooldownSec: 0,
    spellCooldowns: {},
    fireOilSec: 0,
    protectionSec: 0,
    charmSec: 0,
    shadowsSec: 0,
    spiritSec: 0,
    spiritAttackAccumSec: 0,
    squireX: 660,
    squireY: 455,
    squireAimAngle: 0,
    squireAttackAccumSec: 0,
    pendingCoinsEarned: 0,
    pendingKills: 0,
    pendingBossDamage: 0,
    waveClearSent: false,
    syncAccumSec: 0,
    hudAccumSec: 0,
    keysDown: new Set(),
    touchMoveX: 0,
    touchMoveY: 0,
    mouseDown: false,
    autoAim: true,
    enemies: [],
    projectiles: [],
    thornTraps: [],
    interactables: createMapInteractables("cursed_village"),
    slashes: [],
    lightningArcs: [],
    telegraphs: [],
    floatingTexts: [],
    nearestInteractableId: null,
  });

  simRef.current.autoAim = autoAimEnabled;

  const roomStateRef = useRef<LnRoomStateResponse | null>(null);
  roomStateRef.current = roomState;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastBanner(msg);
  }, []);

  useEffect(() => {
    if (!toastBanner) return;
    const t = window.setTimeout(() => setToastBanner(null), 3600);
    return () => window.clearTimeout(t);
  }, [toastBanner]);

  const fetchState = useCallback(
    async (notify = false) => {
      if (!normalizedCode) return;
      try {
        const res = await lastNightApi.getRoomState(
          normalizedCode,
          session?.playerToken ?? null,
          notify,
        );
        setRoomState(res);
        setErrorBanner(null);
      } catch (err) {
        setErrorBanner(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [normalizedCode, session?.playerToken],
  );

  useEffect(() => {
    void fetchState(true);
  }, [fetchState]);

  useEffect(() => {
    const pollId = window.setInterval(() => {
      void fetchState(false);
    }, 2500);

    if (!normalizedCode) {
      return () => window.clearInterval(pollId);
    }

    const channel = supabase
      .channel(`ln_room:${normalizedCode}`)
      .on("broadcast", { event: "ln_state" }, () => {
        void fetchState(false);
      })
      .subscribe();

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [normalizedCode, fetchState]);

  const me: LnRoomPlayer | null = useMemo(() => {
    const state = roomState?.state;
    if (!state) return null;
    const mySeat = roomState?.seat ?? session?.seat ?? null;
    if (!mySeat) return null;
    return state.players.find((p) => p.seat === mySeat) ?? null;
  }, [roomState, session]);

  const ally: LnRoomPlayer | null = useMemo(() => {
    const state = roomState?.state;
    if (!state || !me) return null;
    return state.players.find((p) => p.seat !== me.seat) ?? null;
  }, [roomState, me]);

  // Synchronize wave / map initialization when room advances wave or map
  useEffect(() => {
    const state = roomState?.state;
    if (!state) return;
    const sim = simRef.current;

    if (sim.initializedMap !== state.map_id) {
      sim.initializedMap = state.map_id;
      sim.interactables = createMapInteractables(state.map_id);
      sim.thornTraps = [];
    }

    if (me && state.status === "waiting") {
      sim.arrows = me.arrows;
      sim.bullets = me.bullets;
      sim.rustyKeys = me.rusty_keys;
      sim.hp = me.hp;
      sim.maxHp = me.max_hp;
      sim.mana = me.mana;
      sim.maxMana = me.max_mana;
    }

    if (state.status === "active" && sim.initializedWave !== state.wave) {
      sim.initializedWave = state.wave;
      sim.waveClearSent = false;
      sim.enemies = createWaveEnemies(state.wave);
      sim.projectiles = [];
      sim.telegraphs = [];
      if (me) {
        const safePos = resolveLandmarkCollisions(
          me.pos_x || (me.seat === 1 ? 585 : 685),
          me.pos_y || 455,
          17,
          state.map_id,
          false,
        );
        sim.localX = safePos.x;
        sim.localY = safePos.y;
        sim.squireX = safePos.x + 54;
        sim.squireY = safePos.y;
        sim.hp = me.hp;
        sim.maxHp = me.max_hp;
        sim.mana = me.mana;
        sim.maxMana = me.max_mana;
        sim.arrows = me.arrows;
        sim.bullets = me.bullets;
        sim.rustyKeys = me.rusty_keys;
        sim.downed = me.downed;
        sim.loadedFirearm = me.loaded_firearm;
      }
      const bossSpec = getBossForWave(state.wave);
      if (bossSpec) {
        medievalAudio.play("boss_roar");
        showToast(
          `⚠️ غول موج ${state.wave} وارد میدان شد: ${bossSpec.nameFa} (${bossSpec.nameEn})!`,
        );
      } else {
        showToast(
          `⚔️ موج ${state.wave} از ۱۰ در «${getMapSpec(state.map_id).nameFa}» آغاز شد!`,
        );
      }
    }
  }, [roomState, me, showToast]);

  const handleJoinRoom = async () => {
    if (!normalizedCode || joining) return;
    setJoining(true);
    setErrorBanner(null);
    try {
      const res = await lastNightApi.joinRoom(
        normalizedCode,
        joinName.trim() || "شوالیه شب",
        profileToken,
      );
      const nextSession = {
        roomCode: res.room_code,
        playerToken: res.player_token,
        playerId: `${res.room_id}_s${res.seat}`,
        seat: res.seat,
        displayName: joinName.trim() || "شوالیه شب",
        savedAt: new Date().toISOString(),
      };
      saveLnSession(nextSession);
      setSession(nextSession);
      await fetchState(true);
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    } finally {
      setJoining(false);
    }
  };

  const handleStartCampaign = async () => {
    if (!session) return;
    setBusyId("start_wave");
    try {
      const res = await lastNightApi.syncAction(
        normalizedCode,
        session.playerToken,
        "start_wave",
      );
      setRoomState(res);
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const syncLocalAmmoFromResponse = (res: LnRoomStateResponse, fallbackSeat?: number) => {
    const mySeat = res.seat ?? fallbackSeat;
    const p = res.state.players.find((pl) => pl.seat === mySeat);
    if (p) {
      simRef.current.arrows = p.arrows;
      simRef.current.bullets = p.bullets;
      simRef.current.rustyKeys = p.rusty_keys;
      simRef.current.hp = p.hp;
      simRef.current.mana = p.mana;
    }
  };

  const handleBuyWeapon = async (weaponId: MedievalWeaponId) => {
    if (!session) return;
    setBusyId(weaponId);
    try {
      const res = await lastNightApi.shopBuy(
        normalizedCode,
        session.playerToken,
        "weapon",
        weaponId,
      );
      setRoomState(res);
      syncLocalAmmoFromResponse(res, session.seat);
      simRef.current.loadedFirearm = true;
      simRef.current.reloadRemainingSec = 0;
      medievalAudio.play("coin_clink");
      showToast(`سلاح جدید خریداری و تجهیز شد!`);
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleEquipWeapon = async (weaponId: MedievalWeaponId) => {
    if (!session) return;
    setBusyId(weaponId);
    try {
      const res = await lastNightApi.equipLoadout(normalizedCode, session.playerToken, {
        weapon: weaponId,
      });
      setRoomState(res);
      simRef.current.loadedFirearm = true;
      simRef.current.reloadRemainingSec = 0;
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleBuySpellbook = async (bookId: MagicBookId) => {
    if (!session) return;
    setBusyId(bookId);
    try {
      const res = await lastNightApi.shopBuy(
        normalizedCode,
        session.playerToken,
        "spellbook",
        bookId,
      );
      setRoomState(res);
      medievalAudio.play("coin_clink");
      showToast(`کتاب جادوی جدید خریداری شد!`);
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleEquipSpellbook = async (bookId: MagicBookId) => {
    if (!session || !me) return;
    const toggled = toggleEquippedSpellbook(
      me.equipped_spells,
      me.owned_spells,
      bookId,
    );
    if (!toggled.ok) {
      setErrorBanner(
        toggled.reason === "max_two_spellbooks"
          ? "حداکثر ۲ کتاب جادو را می‌توانید هم‌زمان تجهیز کنید."
          : "ابتدا باید این کتاب جادو را خریداری کنید.",
      );
      return;
    }
    setBusyId(bookId);
    try {
      const res = await lastNightApi.equipLoadout(normalizedCode, session.playerToken, {
        spells: toggled.equipped,
      });
      setRoomState(res);
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleBuyItem = async (itemId: MedievalShopItemId) => {
    if (!session) return;
    setBusyId(itemId);
    try {
      const res = await lastNightApi.shopBuy(
        normalizedCode,
        session.playerToken,
        "item",
        itemId,
      );
      setRoomState(res);
      syncLocalAmmoFromResponse(res, session.seat);
      medievalAudio.play("coin_clink");
      const spec = getShopItemSpec(itemId);
      if (spec) {
        showToast(`✓ ${spec.nameEn} خریداری شد.`);
      }
    } catch (err) {
      setErrorBanner(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleUseItem = useCallback(
    async (itemId: MedievalShopItemId) => {
      if (!session) return;
      setBusyId(`use_${itemId}`);
      try {
        const res = await lastNightApi.useItem(
          normalizedCode,
          session.playerToken,
          itemId,
        );
        setRoomState(res);
        const sim = simRef.current;
        const updatedMe = res.state.players.find(
          (p) => p.seat === (res.seat ?? session.seat),
        );
        if (updatedMe) {
          sim.hp = updatedMe.hp;
          sim.mana = updatedMe.mana;
          sim.downed = updatedMe.downed;
        }
        if (
          itemId === "small_heal_potion" ||
          itemId === "large_heal_potion" ||
          itemId === "mana_potion"
        ) {
          medievalAudio.play("potion_drink");
        } else if (itemId === "fire_oil") {
          sim.fireOilSec = 20;
          medievalAudio.play("torch_light");
        } else if (itemId === "protective_charm") {
          sim.charmSec = 10;
          medievalAudio.play("spell_protection");
        } else if (itemId === "thorn_trap") {
          sim.thornTraps.push({
            id: `trap_${Date.now()}`,
            x: sim.localX,
            y: sim.localY,
            radius: 26,
            damage: 65,
            charges: 3,
          });
        }
      } catch (err) {
        setErrorBanner(getErrorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [normalizedCode, session],
  );

  // Cast equipped magic book (Slot 0 = [Q], Slot 1 = [F])
  const handleCastSpellSlot = useCallback(
    async (slotIndex: 0 | 1) => {
      const currentRes = roomStateRef.current;
      const mySeat = currentRes?.seat ?? session?.seat;
      const currentMe =
        currentRes?.state.players.find((p) => p.seat === mySeat) ?? me;
      if (!session || !currentMe) return;

      const spellId = currentMe.equipped_spells[slotIndex];
      if (!spellId) {
        showToast(`اسلات جادوی ${slotIndex + 1} خالی است. از فروشگاه کتاب جادو تجهیز کنید.`);
        return;
      }

      const spec = getMagicBookSpec(spellId);
      if (!spec) return;

      const sim = simRef.current;
      if (sim.downed) return;

      const cdLeft = sim.spellCooldowns[spellId] ?? 0;
      if (cdLeft > 0) {
        showToast(`${spec.nameEn} در حال استراحت است (${cdLeft.toFixed(1)} ثانیه).`);
        return;
      }
      if (sim.mana < spec.manaCost) {
        showToast(
          `مانای کافی برای اجرای ${spec.nameEn} ندارید (${spec.manaCost} مانا نیاز است).`,
        );
        return;
      }

      // Auto-aim toward nearest enemy if auto-aim is enabled
      if (sim.autoAim && sim.enemies.length > 0) {
        const nearest = findNearestEnemy(sim.localX, sim.localY, sim.enemies, 550);
        if (nearest) {
          sim.aimX = nearest.x;
          sim.aimY = nearest.y;
          sim.aimAngle = Math.atan2(nearest.y - sim.localY, nearest.x - sim.localX);
        }
      }

      sim.mana = Math.max(0, sim.mana - spec.manaCost);
      sim.spellCooldowns[spellId] = spec.cooldownSec;

      const dirX = Math.cos(sim.aimAngle);
      const dirY = Math.sin(sim.aimAngle);

      if (spellId === "book_of_fire") {
        medievalAudio.play("spell_fire");
        sim.projectiles.push({
          id: `fire_${Date.now()}`,
          ownerSeat: currentMe.seat,
          kind: "fireball",
          x: sim.localX + dirX * 22,
          y: sim.localY + dirY * 22,
          vx: dirX * 480,
          vy: dirY * 480,
          radius: 11,
          damage: spec.directDamage,
          knockback: 28,
          color: "#f97316",
          ttlSec: 1.4,
          appliesBurn: true,
        });
      } else if (spellId === "book_of_protection") {
        medievalAudio.play("spell_protection");
        sim.protectionSec = spec.buffDurationSec ?? 20;
        sim.floatingTexts.push({
          id: `ft_${Date.now()}`,
          x: sim.localX,
          y: sim.localY - 24,
          text: "🛡️ سپر جادویی (-70% آسیب)",
          color: "#fde047",
          ttlSec: 1.5,
        });
      } else if (spellId === "book_of_frost") {
        medievalAudio.play("spell_frost");
        for (const enemy of sim.enemies) {
          const dist = Math.hypot(enemy.x - sim.localX, enemy.y - sim.localY);
          if (dist <= 200) {
            const frostRes = applyFrostEffect({ isBoss: enemy.isBoss });
            enemy.hp -= frostRes.damage;
            enemy.frozenSec = Math.max(enemy.frozenSec, frostRes.frozenSec);
            enemy.chilledSec = Math.max(enemy.chilledSec, frostRes.chilledSec);
            enemy.hitFlashSec = 0.15;
            if (enemy.isBoss) {
              sim.pendingBossDamage += frostRes.damage;
            }
          }
        }
        sim.floatingTexts.push({
          id: `ft_frost_${Date.now()}`,
          x: sim.localX,
          y: sim.localY - 24,
          text: "❄️ موج یخ (Book of Frost)",
          color: "#38bdf8",
          ttlSec: 1.4,
        });
      } else if (spellId === "book_of_spirits") {
        medievalAudio.play("spell_spirits");
        sim.spiritSec = spec.buffDurationSec ?? 12;
        sim.floatingTexts.push({
          id: `ft_spirit_${Date.now()}`,
          x: sim.localX,
          y: sim.localY - 24,
          text: "👻 روح نگهبان احضار شد (۱۲ ثانیه)",
          color: "#67e8f9",
          ttlSec: 1.6,
        });
      } else if (spellId === "book_of_lightning") {
        medievalAudio.play("spell_lightning");
        const sorted = [...sim.enemies].sort(
          (a, b) =>
            Math.hypot(a.x - sim.aimX, a.y - sim.aimY) -
            Math.hypot(b.x - sim.aimX, b.y - sim.aimY),
        );
        const primary = sorted[0];
        if (primary && Math.hypot(primary.x - sim.localX, primary.y - sim.localY) <= 520) {
          primary.hp -= spec.directDamage;
          primary.hitFlashSec = 0.2;
          if (primary.isBoss) sim.pendingBossDamage += spec.directDamage;

          const chainTargets = sorted
            .slice(1)
            .filter((e) => Math.hypot(e.x - primary.x, e.y - primary.y) <= 230)
            .slice(0, spec.chainTargets ?? 3);

          const points = [
            { x: sim.localX, y: sim.localY },
            { x: primary.x, y: primary.y },
          ];
          for (const ct of chainTargets) {
            ct.hp -= spec.chainDamage ?? 55;
            ct.hitFlashSec = 0.2;
            if (ct.isBoss) sim.pendingBossDamage += spec.chainDamage ?? 55;
            points.push({ x: ct.x, y: ct.y });
          }
          sim.lightningArcs.push({
            id: `arc_${Date.now()}`,
            points,
            ttlSec: 0.35,
          });
        }
      } else if (spellId === "book_of_shadows") {
        medievalAudio.play("spell_shadows");
        sim.shadowsSec = spec.buffDurationSec ?? 4;
        sim.floatingTexts.push({
          id: `ft_shadow_${Date.now()}`,
          x: sim.localX,
          y: sim.localY - 24,
          text: "🌑 گام سایه (+35% سرعت و مصونیت برخورد عادی)",
          color: "#c084fc",
          ttlSec: 1.5,
        });
      }

      try {
        const res = await lastNightApi.castSpell(
          normalizedCode,
          session.playerToken,
          spellId,
          sim.aimX,
          sim.aimY,
        );
        setRoomState(res);
      } catch (err) {
        setErrorBanner(getErrorMessage(err));
      }
    },
    [me, normalizedCode, session, showToast],
  );

  const handleInteractNearest = useCallback(async () => {
    const sim = simRef.current;
    if (!session || !sim.nearestInteractableId) {
      showToast("به یک مشعل، صندوقچه، رون باستانی یا دروازه نزدیک شوید تا با [E] فعال شود.");
      return;
    }
    const target = sim.interactables.find((i) => i.id === sim.nearestInteractableId);
    if (!target || target.activated) return;

    if (target.requiresKey && sim.rustyKeys <= 0) {
      showToast(
        "برای باز کردن این صندوقچه قفل‌شده به کلید زنگ‌زده (Rusty key) از فروشگاه نیاز دارید!",
      );
      return;
    }

    target.activated = true;
    if (target.requiresKey) {
      sim.rustyKeys = Math.max(0, sim.rustyKeys - 1);
    }
    medievalAudio.play(target.kind === "chest" ? "chest_unlock" : "torch_light");
    sim.floatingTexts.push({
      id: `obj_${Date.now()}`,
      x: target.x,
      y: target.y - 20,
      text: `+${target.rewardCoins} ${SHERIFF_COIN_NAME}`,
      color: "#fde047",
      ttlSec: 1.6,
    });

    try {
      const res = await lastNightApi.syncAction(
        normalizedCode,
        session.playerToken,
        target.requiresKey ? "open_chest" : "complete_objective",
        {
          chest_id: target.id,
          requires_key: Boolean(target.requiresKey),
          objective_id: target.objectiveId,
          reward_coins: target.rewardCoins,
        },
      );
      setRoomState(res);
      syncLocalAmmoFromResponse(res, session.seat);
    } catch (err) {
      target.activated = false;
      setErrorBanner(getErrorMessage(err));
    }
  }, [normalizedCode, session, showToast]);

  const handleReloadOrRevive = useCallback(async () => {
    const sim = simRef.current;
    const currentRes = roomStateRef.current;
    const mySeat = currentRes?.seat ?? session?.seat;
    const currentMe =
      currentRes?.state.players.find((p) => p.seat === mySeat) ?? me;
    if (!session || !currentMe) return;

    const downedAlly = currentRes?.state.players.find(
      (p) => p.seat !== currentMe.seat && p.downed,
    );
    if (
      downedAlly &&
      Math.hypot(downedAlly.pos_x - sim.localX, downedAlly.pos_y - sim.localY) <= 110
    ) {
      try {
        const res = await lastNightApi.syncAction(
          normalizedCode,
          session.playerToken,
          "revive_ally",
          { target_seat: downedAlly.seat },
        );
        setRoomState(res);
        showToast(`✨ هم‌تیمی شما (${downedAlly.name}) احیا شد!`);
        return;
      } catch (err) {
        setErrorBanner(getErrorMessage(err));
      }
    }

    const weapon = getWeaponSpec(currentMe.equipped_weapon);
    if (weapon.kind === "firearm" && !sim.loadedFirearm && sim.reloadRemainingSec <= 0) {
      if (sim.bullets <= 0) {
        showToast(
          "موجودی باروت و گلوله سربی (Old gunpowder and bullet) تمام شده است! از فروشگاه تهیه کنید.",
        );
        return;
      }
      sim.reloadRemainingSec = weapon.reloadSec;
      medievalAudio.play("firearm_reload");
    }
  }, [me, normalizedCode, session, showToast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      simRef.current.keysDown.add(key);

      if (key === "q") {
        e.preventDefault();
        void handleCastSpellSlot(0);
      } else if (key === "f") {
        e.preventDefault();
        void handleCastSpellSlot(1);
      } else if (key === "e") {
        e.preventDefault();
        void handleInteractNearest();
      } else if (key === "r") {
        e.preventDefault();
        void handleReloadOrRevive();
      } else if (key === "b") {
        e.preventDefault();
        setShopOpen((prev) => !prev);
      } else if (key === "1") {
        void handleUseItem("small_heal_potion");
      } else if (key === "2") {
        void handleUseItem("large_heal_potion");
      } else if (key === "3") {
        void handleUseItem("mana_potion");
      } else if (key === "4") {
        void handleUseItem("fire_oil");
      } else if (key === "5") {
        void handleUseItem("protective_charm");
      } else if (key === "6") {
        void handleUseItem("thorn_trap");
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current.keysDown.delete(e.key.toLowerCase());
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handleCastSpellSlot, handleInteractNearest, handleReloadOrRevive, handleUseItem]);

  const triggerPrimaryAttack = useCallback(() => {
    const sim = simRef.current;
    const currentRes = roomStateRef.current;
    const mySeat = currentRes?.seat ?? session?.seat;
    const currentMe =
      currentRes?.state.players.find((p) => p.seat === mySeat) ?? me;
    if (!currentMe || sim.downed || sim.attackCooldownSec > 0) return;

    // Auto-aim assist toward nearest living monster when autoAim is enabled
    if (sim.autoAim && sim.enemies.length > 0) {
      const nearest = findNearestEnemy(sim.localX, sim.localY, sim.enemies, 580);
      if (nearest) {
        sim.aimX = nearest.x;
        sim.aimY = nearest.y;
        sim.aimAngle = Math.atan2(nearest.y - sim.localY, nearest.x - sim.localX);
      }
    }

    const weapon = getWeaponSpec(currentMe.equipped_weapon);

    if (weapon.kind === "firearm") {
      if (sim.reloadRemainingSec > 0) return;
      if (!sim.loadedFirearm) {
        void handleReloadOrRevive();
        return;
      }
      if (sim.bullets <= 0) {
        showToast("گلوله و باروت ندارید! از فروشگاه Old gunpowder and bullet بخرید.");
        return;
      }
      sim.bullets = Math.max(0, sim.bullets - 1);
      sim.loadedFirearm = false;
      sim.attackCooldownSec = weapon.attackCooldownSec;
      medievalAudio.play(
        weapon.id === "hunting_musket" ? "musket_shot" : "flintlock_shot",
      );
      const dirX = Math.cos(sim.aimAngle);
      const dirY = Math.sin(sim.aimAngle);
      sim.projectiles.push({
        id: `shot_${Date.now()}`,
        ownerSeat: currentMe.seat,
        kind: "lead_ball",
        x: sim.localX + dirX * 24,
        y: sim.localY + dirY * 24,
        vx: dirX * (weapon.projectileSpeed ?? 880),
        vy: dirY * (weapon.projectileSpeed ?? 880),
        radius: weapon.id === "hunting_musket" ? 7 : 5,
        damage: weapon.damage,
        knockback: weapon.knockback,
        color: "#fde047",
        ttlSec: 0.9,
      });
      if (sim.bullets > 0) {
        sim.reloadRemainingSec = weapon.reloadSec;
      }
      if (session) {
        void lastNightApi
          .syncAction(normalizedCode, session.playerToken, "combat_sync", {
            pos_x: Math.round(sim.localX),
            pos_y: Math.round(sim.localY),
            hp: Math.round(sim.hp),
            mana: Math.round(sim.mana),
            bullets: sim.bullets,
            loaded_firearm: false,
          })
          .then(setRoomState)
          .catch(() => {});
      }
      return;
    }

    if (weapon.kind === "bow") {
      if (sim.arrows <= 0) {
        showToast("تیر کمان تمام شده است! بسته تیر (Arrow bundle) را از فروشگاه بخرید.");
        return;
      }
      sim.arrows = Math.max(0, sim.arrows - 1);
      sim.attackCooldownSec = weapon.attackCooldownSec;
      medievalAudio.play("bow_shot");
      const dirX = Math.cos(sim.aimAngle);
      const dirY = Math.sin(sim.aimAngle);
      sim.projectiles.push({
        id: `arrow_${Date.now()}`,
        ownerSeat: currentMe.seat,
        kind: "arrow",
        x: sim.localX + dirX * 20,
        y: sim.localY + dirY * 20,
        vx: dirX * (weapon.projectileSpeed ?? 640),
        vy: dirY * (weapon.projectileSpeed ?? 640),
        radius: 5,
        damage: weapon.damage,
        knockback: weapon.knockback,
        color: "#eab308",
        ttlSec: 1.1,
      });
      if (session) {
        void lastNightApi
          .syncAction(normalizedCode, session.playerToken, "combat_sync", {
            pos_x: Math.round(sim.localX),
            pos_y: Math.round(sim.localY),
            hp: Math.round(sim.hp),
            mana: Math.round(sim.mana),
            arrows: sim.arrows,
          })
          .then(setRoomState)
          .catch(() => {});
      }
      return;
    }

    // Melee weapon attack (Rusty Sword, Spiked Wooden Club, Battle Axe)
    sim.attackCooldownSec = weapon.attackCooldownSec;
    medievalAudio.play(
      weapon.id === "battle_axe"
        ? "axe_cleave"
        : weapon.id === "spiked_club"
          ? "club_swing"
          : "sword_swing",
    );

    const effectiveDamage = calculateMeleeDamage(
      weapon.damage,
      currentMe.whetstone_stacks,
      sim.fireOilSec > 0,
    );
    const arcRad = weapon.cleaveArcRad ?? Math.PI * 0.65;

    sim.slashes.push({
      id: `slash_${Date.now()}`,
      x: sim.localX,
      y: sim.localY,
      angle: sim.aimAngle,
      arcRad,
      range: weapon.range,
      color: sim.fireOilSec > 0 ? "#f97316" : "#e2e8f0",
      ttlSec: 0.16,
    });

    const mapId = currentRes?.state.map_id ?? "cursed_village";
    for (const enemy of sim.enemies) {
      const dx = enemy.x - sim.localX;
      const dy = enemy.y - sim.localY;
      const dist = Math.hypot(dx, dy);
      if (dist <= weapon.range + enemy.radius) {
        const angleToEnemy = Math.atan2(dy, dx);
        let diff = angleToEnemy - sim.aimAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= arcRad / 2 + 0.35) {
          enemy.hp -= effectiveDamage;
          enemy.hitFlashSec = 0.14;
          const kbResist = enemy.isBoss
            ? 0.15
            : enemy.kind === "stone_giant"
              ? 0.35
              : 1;
          const push = weapon.knockback * kbResist;
          const nextPos = resolveLandmarkCollisions(
            enemy.x + Math.cos(angleToEnemy) * push,
            enemy.y + Math.sin(angleToEnemy) * push,
            enemy.radius,
            mapId,
            enemy.flying || enemy.ethereal,
          );
          enemy.x = nextPos.x;
          enemy.y = nextPos.y;
          if (enemy.isBoss) {
            sim.pendingBossDamage += effectiveDamage;
          }
          medievalAudio.play("enemy_hit");
        }
      }
    }
  }, [handleReloadOrRevive, me, normalizedCode, session, showToast]);

  const handleUpdate = useCallback(
    (dt: number) => {
      const sim = simRef.current;
      const currentRes = roomStateRef.current;
      const state = currentRes?.state;
      const mySeat = currentRes?.seat ?? session?.seat;
      const currentMe = state?.players.find((p) => p.seat === mySeat) ?? me;
      sim.timeSec += dt;

      if (!state || state.status !== "active") {
        return;
      }

      const mapId = state.map_id;
      sim.attackCooldownSec = Math.max(0, sim.attackCooldownSec - dt);
      sim.fireOilSec = Math.max(0, sim.fireOilSec - dt);
      sim.protectionSec = Math.max(0, sim.protectionSec - dt);
      sim.charmSec = Math.max(0, sim.charmSec - dt);
      sim.shadowsSec = Math.max(0, sim.shadowsSec - dt);
      sim.spiritSec = Math.max(0, sim.spiritSec - dt);
      sim.webSlowSec = Math.max(0, sim.webSlowSec - dt);
      sim.mana = Math.min(sim.maxMana, sim.mana + dt * 3.5);

      for (const k of Object.keys(sim.spellCooldowns)) {
        sim.spellCooldowns[k] = Math.max(0, sim.spellCooldowns[k] - dt);
      }

      if (sim.reloadRemainingSec > 0) {
        sim.reloadRemainingSec = Math.max(0, sim.reloadRemainingSec - dt);
        if (sim.reloadRemainingSec === 0) {
          sim.loadedFirearm = true;
          medievalAudio.play("firearm_reload");
        }
      }

      // Solo Squire emergency revive if only 1 human player is in the room
      const hasHumanAlly = state.players.length >= 2;
      if (sim.downed && !hasHumanAlly) {
        sim.soloReviveTimerSec += dt;
        if (sim.soloReviveTimerSec >= 3.5) {
          sim.soloReviveTimerSec = 0;
          sim.downed = false;
          sim.hp = Math.round(sim.maxHp * 0.55);
          sim.floatingTexts.push({
            id: `sq_rev_${Date.now()}`,
            x: sim.localX,
            y: sim.localY - 26,
            text: "✨ سلحشور همراه شما را احیا کرد!",
            color: "#4ade80",
            ttlSec: 1.8,
          });
        }
      } else {
        sim.soloReviveTimerSec = 0;
      }

      // Local player movement (Keyboard WASD/Arrows + Mobile Touch D-Pad)
      if (!sim.downed) {
        let mx = sim.touchMoveX;
        let my = sim.touchMoveY;
        if (sim.keysDown.has("w") || sim.keysDown.has("arrowup")) my -= 1;
        if (sim.keysDown.has("s") || sim.keysDown.has("arrowdown")) my += 1;
        if (sim.keysDown.has("a") || sim.keysDown.has("arrowleft")) mx -= 1;
        if (sim.keysDown.has("d") || sim.keysDown.has("arrowright")) mx += 1;

        if (mx !== 0 || my !== 0) {
          const len = Math.hypot(mx, my);
          const baseSpeed = 195;
          const shadowMult = sim.shadowsSec > 0 ? 1.35 : 1;
          const webMult = sim.webSlowSec > 0 ? 0.72 : 1;
          const resolved = resolveLandmarkCollisions(
            sim.localX + (mx / len) * baseSpeed * shadowMult * webMult * dt,
            sim.localY + (my / len) * baseSpeed * shadowMult * webMult * dt,
            17,
            mapId,
            false,
          );
          sim.localX = resolved.x;
          sim.localY = resolved.y;
        }

        if (sim.autoAim && !sim.mouseDown && sim.enemies.length > 0) {
          const nearest = findNearestEnemy(sim.localX, sim.localY, sim.enemies, 480);
          if (nearest) {
            sim.aimAngle = Math.atan2(nearest.y - sim.localY, nearest.x - sim.localX);
          } else {
            sim.aimAngle = Math.atan2(sim.aimY - sim.localY, sim.aimX - sim.localX);
          }
        } else {
          sim.aimAngle = Math.atan2(sim.aimY - sim.localY, sim.aimX - sim.localX);
        }

        if (sim.mouseDown && sim.attackCooldownSec <= 0) {
          triggerPrimaryAttack();
        }
      }

      // Loyal Squire AI companion when playing solo (until Player 2 joins)
      if (!hasHumanAlly) {
        const targetEnemy = findNearestEnemy(sim.squireX, sim.squireY, sim.enemies, 340);
        const goalX = sim.downed
          ? sim.localX + 18
          : targetEnemy
            ? targetEnemy.x
            : sim.localX + 55;
        const goalY = sim.downed
          ? sim.localY
          : targetEnemy
            ? targetEnemy.y
            : sim.localY + 25;
        const sdx = goalX - sim.squireX;
        const sdy = goalY - sim.squireY;
        const sdist = Math.hypot(sdx, sdy);
        if (sdist > 36) {
          const nextSq = resolveLandmarkCollisions(
            sim.squireX + (sdx / sdist) * 165 * dt,
            sim.squireY + (sdy / sdist) * 165 * dt,
            16,
            mapId,
            false,
          );
          sim.squireX = nextSq.x;
          sim.squireY = nextSq.y;
        }
        if (targetEnemy) {
          sim.squireAimAngle = Math.atan2(
            targetEnemy.y - sim.squireY,
            targetEnemy.x - sim.squireX,
          );
          sim.squireAttackAccumSec += dt;
          if (sim.squireAttackAccumSec >= 0.95 && sdist <= 75) {
            sim.squireAttackAccumSec = 0;
            targetEnemy.hp -= 18;
            targetEnemy.hitFlashSec = 0.12;
            if (targetEnemy.isBoss) sim.pendingBossDamage += 18;
            sim.slashes.push({
              id: `sq_slash_${Date.now()}`,
              x: sim.squireX,
              y: sim.squireY,
              angle: sim.squireAimAngle,
              arcRad: 1.1,
              range: 58,
              color: "#6ee7b7",
              ttlSec: 0.14,
            });
          }
        }
      }

      // Find nearest interactable objective
      let nearestId: string | null = null;
      let nearestDist = 72;
      for (const item of sim.interactables) {
        if (item.activated) continue;
        const d = Math.hypot(item.x - sim.localX, item.y - sim.localY);
        if (d < nearestDist) {
          nearestDist = d;
          nearestId = item.id;
        }
      }
      sim.nearestInteractableId = nearestId;

      // Book of Spirits autonomous companion attacks (25 damage per attack)
      if (sim.spiritSec > 0 && sim.enemies.length > 0) {
        sim.spiritAttackAccumSec += dt;
        if (sim.spiritAttackAccumSec >= 0.85) {
          sim.spiritAttackAccumSec = 0;
          const target = findNearestEnemy(sim.localX, sim.localY, sim.enemies, 420);
          if (target) {
            target.hp -= 25;
            target.hitFlashSec = 0.14;
            if (target.isBoss) sim.pendingBossDamage += 25;
            sim.floatingTexts.push({
              id: `sp_${Date.now()}_${Math.random()}`,
              x: target.x,
              y: target.y - 16,
              text: "-25 👻",
              color: "#67e8f9",
              ttlSec: 0.7,
            });
          }
        }
      }

      // Update Projectiles
      const nextProjectiles: SimProjectile[] = [];
      for (const proj of sim.projectiles) {
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
        proj.ttlSec -= dt;
        if (
          proj.ttlSec <= 0 ||
          proj.x < 0 ||
          proj.x > WORLD_WIDTH ||
          proj.y < 0 ||
          proj.y > WORLD_HEIGHT
        ) {
          continue;
        }

        let consumed = false;
        if (proj.ownerSeat > 0) {
          for (const enemy of sim.enemies) {
            if (
              Math.hypot(enemy.x - proj.x, enemy.y - proj.y) <=
              enemy.radius + proj.radius
            ) {
              enemy.hp -= proj.damage;
              enemy.hitFlashSec = 0.16;
              if (enemy.isBoss) sim.pendingBossDamage += proj.damage;
              if (proj.appliesBurn) {
                enemy.burnSec = 3;
                enemy.burnDps = 20;
              }
              sim.floatingTexts.push({
                id: `hit_${Date.now()}_${Math.random()}`,
                x: enemy.x,
                y: enemy.y - enemy.radius,
                text: `-${proj.damage}`,
                color: proj.appliesBurn ? "#f97316" : "#fef08a",
                ttlSec: 0.75,
              });
              medievalAudio.play("enemy_hit");
              consumed = true;
              break;
            }
          }
        } else if (
          !sim.downed &&
          Math.hypot(sim.localX - proj.x, sim.localY - proj.y) <= 17 + proj.radius
        ) {
          const dmg = calculateIncomingDamage(proj.damage, {
            protectionBookActive: sim.protectionSec > 0,
            protectiveCharmActive: sim.charmSec > 0,
            shadowsActive: sim.shadowsSec > 0,
            isOrdinaryContact: false,
          });
          sim.hp = Math.max(0, sim.hp - dmg);
          if (proj.appliesSlow) {
            sim.webSlowSec = 1.8;
          }
          if (sim.hp === 0) sim.downed = true;
          consumed = true;
        }

        if (!consumed) {
          nextProjectiles.push(proj);
        }
      }
      sim.projectiles = nextProjectiles;

      // Update Enemies & Boss Multi-Phase Patterns
      const survivingEnemies: SimEnemy[] = [];
      const newlySpawnedMinions: SimEnemy[] = [];

      for (const enemy of sim.enemies) {
        enemy.hitFlashSec = Math.max(0, enemy.hitFlashSec - dt);
        enemy.attackCooldownSec = Math.max(0, enemy.attackCooldownSec - dt);

        if (enemy.burnSec > 0) {
          enemy.burnSec = Math.max(0, enemy.burnSec - dt);
          enemy.burnTickAccum += dt;
          if (enemy.burnTickAccum >= 0.5) {
            enemy.burnTickAccum -= 0.5;
            const tickDmg = Math.round(enemy.burnDps * 0.5);
            enemy.hp -= tickDmg;
            if (enemy.isBoss) sim.pendingBossDamage += tickDmg;
          }
        }

        for (const trap of sim.thornTraps) {
          if (
            trap.charges > 0 &&
            Math.hypot(enemy.x - trap.x, enemy.y - trap.y) <=
              enemy.radius + trap.radius
          ) {
            trap.charges -= 1;
            enemy.hp -= trap.damage;
            enemy.chilledSec = Math.max(enemy.chilledSec, 1.5);
            enemy.hitFlashSec = 0.2;
            if (enemy.isBoss) sim.pendingBossDamage += trap.damage;
          }
        }

        if (enemy.hp <= 0) {
          sim.pendingCoinsEarned += enemy.rewardCoins;
          sim.pendingKills += 1;
          sim.floatingTexts.push({
            id: `coin_${Date.now()}_${Math.random()}`,
            x: enemy.x,
            y: enemy.y,
            text: `+${enemy.rewardCoins} ${SHERIFF_COIN_NAME}`,
            color: "#facc15",
            ttlSec: 1.2,
          });
          continue;
        }

        if (enemy.frozenSec > 0) {
          enemy.frozenSec = Math.max(0, enemy.frozenSec - dt);
          survivingEnemies.push(enemy);
          continue;
        }

        const chillMult = enemy.chilledSec > 0 ? 0.75 : 1;
        if (enemy.chilledSec > 0) {
          enemy.chilledSec = Math.max(0, enemy.chilledSec - dt);
        }

        if (enemy.isBoss) {
          enemy.bossPhase = getBossPhase(enemy.hp, enemy.maxHp);
          const bossSpec = getBossForWave(state.wave);
          if (bossSpec) {
            enemy.patternCooldownSec = (enemy.patternCooldownSec ?? 3) - dt;
            if ((enemy.telegraphRemainingSec ?? 0) > 0) {
              enemy.telegraphRemainingSec = Math.max(
                0,
                (enemy.telegraphRemainingSec ?? 0) - dt,
              );
              if (enemy.telegraphRemainingSec === 0 && enemy.activePattern) {
                const pat = enemy.activePattern;
                const tx = enemy.telegraphTargetX ?? sim.localX;
                const ty = enemy.telegraphTargetY ?? sim.localY;
                const patRadius = pat.radiusPx ?? 95;

                if (pat.kind === "summon_pack" && sim.enemies.length < 22) {
                  newlySpawnedMinions.push(
                    spawnMinionEnemy("black_wolf", enemy.x - 45, enemy.y + 35, state.wave),
                    spawnMinionEnemy("giant_spider", enemy.x + 45, enemy.y + 35, state.wave),
                  );
                } else if (pat.kind === "icicle_fan") {
                  const baseAngle = Math.atan2(ty - enemy.y, tx - enemy.x);
                  for (let spread = -2; spread <= 2; spread++) {
                    const a = baseAngle + spread * 0.22;
                    sim.projectiles.push({
                      id: `icicle_${Date.now()}_${spread}`,
                      ownerSeat: 0,
                      kind: "icicle",
                      x: enemy.x,
                      y: enemy.y,
                      vx: Math.cos(a) * 340,
                      vy: Math.sin(a) * 340,
                      radius: 7,
                      damage: pat.damage,
                      knockback: 16,
                      color: "#38bdf8",
                      ttlSec: 1.7,
                      appliesSlow: true,
                    });
                  }
                } else if (pat.kind === "bull_charge") {
                  const chargePos = resolveLandmarkCollisions(
                    tx,
                    ty,
                    enemy.radius,
                    mapId,
                    false,
                  );
                  enemy.x = chargePos.x;
                  enemy.y = chargePos.y;
                } else if (pat.kind === "crown_beam" && sim.enemies.length < 22) {
                  newlySpawnedMinions.push(
                    spawnMinionEnemy("undead_knight", enemy.x, enemy.y + 50, state.wave),
                  );
                }

                if (
                  !sim.downed &&
                  pat.damage > 0 &&
                  Math.hypot(sim.localX - tx, sim.localY - ty) <= patRadius
                ) {
                  const bossHit = calculateIncomingDamage(pat.damage, {
                    protectionBookActive: sim.protectionSec > 0,
                    protectiveCharmActive: sim.charmSec > 0,
                    shadowsActive: sim.shadowsSec > 0,
                    isOrdinaryContact: false,
                  });
                  sim.hp = Math.max(0, sim.hp - bossHit);
                  if (sim.hp === 0) sim.downed = true;
                }
                enemy.activePattern = null;
              }
            } else if ((enemy.patternCooldownSec ?? 0) <= 0) {
              const patterns = bossSpec.patterns;
              const chosen =
                patterns[Math.floor(sim.timeSec * 7) % patterns.length];
              enemy.activePattern = chosen;
              enemy.telegraphRemainingSec = chosen.telegraphSec;
              enemy.telegraphTargetX = sim.localX;
              enemy.telegraphTargetY = sim.localY;
              const baseCd = chosen.cooldownSec ?? 4.2;
              enemy.patternCooldownSec =
                baseCd /
                (enemy.bossPhase === 3 ? 1.35 : enemy.bossPhase === 2 ? 1.15 : 1);

              sim.telegraphs.push({
                id: `tg_${Date.now()}_${Math.random()}`,
                kind: chosen.kind === "line_impale" ? "line" : "circle",
                x: chosen.kind === "line_impale" ? enemy.x : sim.localX,
                y: chosen.kind === "line_impale" ? enemy.y : sim.localY,
                x2: sim.localX,
                y2: sim.localY,
                radius: chosen.kind === "line_impale" ? 26 : (chosen.radiusPx ?? 95),
                ttlSec: chosen.telegraphSec,
                maxTtlSec: chosen.telegraphSec,
                label: chosen.nameFa,
              });
            }
          }
        }

        const dx = sim.localX - enemy.x;
        const dy = sim.localY - enemy.y;
        const dist = Math.hypot(dx, dy);

        if (enemy.ranged && dist < 260 && dist > 110) {
          if (enemy.attackCooldownSec <= 0) {
            enemy.attackCooldownSec = 2.1;
            const ux = dx / Math.max(1, dist);
            const uy = dy / Math.max(1, dist);
            sim.projectiles.push({
              id: `ebolt_${Date.now()}_${Math.random()}`,
              ownerSeat: 0,
              kind: "dark_bolt",
              x: enemy.x,
              y: enemy.y,
              vx: ux * 290,
              vy: uy * 290,
              radius: 6,
              damage: enemy.damage,
              knockback: 10,
              color: "#c084fc",
              ttlSec: 1.8,
            });
          }
        } else if (dist > enemy.radius + 14) {
          const phaseSpeedBoost =
            enemy.isBoss && enemy.bossPhase === 3
              ? 1.25
              : enemy.isBoss && enemy.bossPhase === 2
                ? 1.12
                : 1;
          enemy.x += (dx / dist) * enemy.speed * chillMult * phaseSpeedBoost * dt;
          enemy.y += (dy / dist) * enemy.speed * chillMult * phaseSpeedBoost * dt;
        }

        if (
          !sim.downed &&
          dist <= enemy.radius + 17 &&
          enemy.attackCooldownSec <= 0
        ) {
          enemy.attackCooldownSec = 1.05;
          const dmg = calculateIncomingDamage(enemy.damage, {
            protectionBookActive: sim.protectionSec > 0,
            protectiveCharmActive: sim.charmSec > 0,
            shadowsActive: sim.shadowsSec > 0,
            isOrdinaryContact: !enemy.isBoss,
          });
          if (enemy.slowsTarget) {
            sim.webSlowSec = 1.6;
          }
          if (dmg > 0) {
            sim.hp = Math.max(0, sim.hp - dmg);
            sim.floatingTexts.push({
              id: `phit_${Date.now()}_${Math.random()}`,
              x: sim.localX,
              y: sim.localY - 20,
              text: `-${dmg}`,
              color: "#ef4444",
              ttlSec: 0.7,
            });
            if (sim.hp === 0) {
              sim.downed = true;
            }
          }
        }

        survivingEnemies.push(enemy);
      }

      sim.enemies = [...survivingEnemies, ...newlySpawnedMinions];
      resolveEnemySeparation(sim.enemies, dt, mapId);

      sim.thornTraps = sim.thornTraps.filter((t) => t.charges > 0);
      sim.slashes = sim.slashes
        .map((s) => ({ ...s, ttlSec: s.ttlSec - dt }))
        .filter((s) => s.ttlSec > 0);
      sim.lightningArcs = sim.lightningArcs
        .map((a) => ({ ...a, ttlSec: a.ttlSec - dt }))
        .filter((a) => a.ttlSec > 0);
      sim.telegraphs = sim.telegraphs
        .map((t) => ({ ...t, ttlSec: t.ttlSec - dt }))
        .filter((t) => t.ttlSec > 0);
      sim.floatingTexts = sim.floatingTexts
        .map((f) => ({ ...f, y: f.y - 22 * dt, ttlSec: f.ttlSec - dt }))
        .filter((f) => f.ttlSec > 0);

      if (sim.enemies.length === 0 && !sim.waveClearSent && session) {
        sim.waveClearSent = true;
        const coinsToSync = sim.pendingCoinsEarned;
        const killsToSync = sim.pendingKills;
        const bossDmgToSync = sim.pendingBossDamage;
        sim.pendingCoinsEarned = 0;
        sim.pendingKills = 0;
        sim.pendingBossDamage = 0;
        const bossForWave = getBossForWave(state.wave);

        void lastNightApi
          .syncAction(normalizedCode, session.playerToken, "combat_sync", {
            pos_x: Math.round(sim.localX),
            pos_y: Math.round(sim.localY),
            hp: Math.round(sim.hp),
            mana: Math.round(sim.mana),
            arrows: sim.arrows,
            bullets: sim.bullets,
            downed: sim.downed,
            coins_delta: coinsToSync,
            kills_delta: killsToSync,
            damage_delta: bossDmgToSync,
          })
          .then(() =>
            lastNightApi.syncAction(
              normalizedCode,
              session.playerToken,
              "wave_cleared",
              { boss_id: bossForWave?.kind ?? null },
            ),
          )
          .then((res) => {
            setRoomState(res);
            syncLocalAmmoFromResponse(res, session.seat);
            void refreshProfile();
          })
          .catch(() => {});
      }

      sim.syncAccumSec += dt;
      if (sim.syncAccumSec >= 1.4 && session && currentMe) {
        sim.syncAccumSec = 0;
        const coinsDelta = sim.pendingCoinsEarned;
        const killsDelta = sim.pendingKills;
        const bossDmgDelta = sim.pendingBossDamage;
        sim.pendingCoinsEarned = 0;
        sim.pendingKills = 0;
        sim.pendingBossDamage = 0;

        void lastNightApi
          .syncAction(normalizedCode, session.playerToken, "combat_sync", {
            pos_x: Math.round(sim.localX),
            pos_y: Math.round(sim.localY),
            hp: Math.round(sim.hp),
            mana: Math.round(sim.mana),
            arrows: sim.arrows,
            bullets: sim.bullets,
            downed: sim.downed,
            loaded_firearm: sim.loadedFirearm,
            coins_delta: coinsDelta,
            kills_delta: killsDelta,
            damage_delta: bossDmgDelta,
          })
          .then(setRoomState)
          .catch(() => {});
      }

      sim.hudAccumSec += dt;
      if (sim.hudAccumSec >= 0.1) {
        sim.hudAccumSec = 0;
        const bossEntity = sim.enemies.find((e) => e.isBoss);
        const bossSpec = getBossForWave(state.wave);
        const nearItem = sim.nearestInteractableId
          ? sim.interactables.find((i) => i.id === sim.nearestInteractableId)
          : null;
        setHudSnapshot({
          hp: Math.round(sim.hp),
          maxHp: sim.maxHp,
          mana: Math.round(sim.mana),
          maxMana: sim.maxMana,
          arrows: sim.arrows,
          bullets: sim.bullets,
          rustyKeys: sim.rustyKeys,
          downed: sim.downed,
          loadedFirearm: sim.loadedFirearm,
          reloadRemainingSec: sim.reloadRemainingSec,
          spellCooldowns: { ...sim.spellCooldowns },
          fireOilSec: sim.fireOilSec,
          protectionSec: sim.protectionSec,
          charmSec: sim.charmSec,
          shadowsSec: sim.shadowsSec,
          spiritSec: sim.spiritSec,
          enemiesRemaining: sim.enemies.length,
          nearestPromptFa: nearItem ? nearItem.labelFa : null,
          activeBoss:
            bossEntity && bossSpec
              ? {
                  nameFa: bossEntity.nameFa,
                  nameEn: bossEntity.nameEn,
                  hp: Math.max(0, Math.round(bossEntity.hp)),
                  maxHp: bossEntity.maxHp,
                  phase: bossEntity.bossPhase ?? 1,
                  portraitUrl: bossSpec.portraitUrl,
                }
              : null,
        });
      }
    },
    [me, normalizedCode, refreshProfile, session, triggerPrimaryAttack],
  );

  const handleRender = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const sim = simRef.current;
      const currentRes = roomStateRef.current;
      const state = currentRes?.state;
      const mySeat = currentRes?.seat ?? session?.seat ?? 1;
      const currentMe = state?.players.find((p) => p.seat === mySeat) ?? me;
      const weapon = getWeaponSpec(currentMe?.equipped_weapon ?? "rusty_sword");

      const playersToRender: RenderPlayerActor[] = [
        {
          seat: currentMe?.seat ?? 1,
          name: currentMe?.name ?? "شوالیه ۱",
          isLocal: true,
          x: sim.localX,
          y: sim.localY,
          aimAngle: sim.aimAngle,
          hp: sim.hp,
          maxHp: sim.maxHp,
          mana: sim.mana,
          maxMana: sim.maxMana,
          downed: sim.downed,
          equippedWeapon: currentMe?.equipped_weapon ?? "rusty_sword",
          hasLantern: Boolean(currentMe?.has_lantern),
          protectionActive: sim.protectionSec > 0,
          protectiveCharmActive: sim.charmSec > 0,
          shadowsActive: sim.shadowsSec > 0,
          fireOilActive: sim.fireOilSec > 0,
          spiritActive: sim.spiritSec > 0,
          reloadingProgress:
            sim.reloadRemainingSec > 0 && weapon.reloadSec > 0
              ? 1 - sim.reloadRemainingSec / weapon.reloadSec
              : null,
        },
      ];

      const remoteAlly = state?.players.find(
        (p) => p.seat !== (currentMe?.seat ?? 1),
      );
      if (remoteAlly) {
        const nowMs = Date.now();
        playersToRender.push({
          seat: remoteAlly.seat,
          name: remoteAlly.name,
          isLocal: false,
          x: remoteAlly.pos_x,
          y: remoteAlly.pos_y,
          aimAngle: remoteAlly.facing ?? 0,
          hp: remoteAlly.hp,
          maxHp: remoteAlly.max_hp,
          mana: remoteAlly.mana,
          maxMana: remoteAlly.max_mana,
          downed: remoteAlly.downed,
          equippedWeapon: remoteAlly.equipped_weapon,
          hasLantern: remoteAlly.has_lantern,
          protectionActive: (remoteAlly.active_buffs?.protection_until ?? 0) > nowMs,
          protectiveCharmActive: (remoteAlly.active_buffs?.charm_until ?? 0) > nowMs,
          shadowsActive: (remoteAlly.active_buffs?.shadows_until ?? 0) > nowMs,
          fireOilActive: (remoteAlly.active_buffs?.fire_oil_until ?? 0) > nowMs,
          spiritActive: (remoteAlly.active_buffs?.spirit_until ?? 0) > nowMs,
          reloadingProgress: null,
        });
      } else if (state?.status === "active") {
        // Render loyal Squire companion when playing solo
        playersToRender.push({
          seat: 2,
          name: "سلحشور همراه (AI)",
          isLocal: false,
          x: sim.squireX,
          y: sim.squireY,
          aimAngle: sim.squireAimAngle,
          hp: 100,
          maxHp: 100,
          mana: 100,
          maxMana: 100,
          downed: false,
          equippedWeapon: "rusty_sword",
          hasLantern: false,
          protectionActive: false,
          protectiveCharmActive: false,
          shadowsActive: false,
          fireOilActive: false,
          spiritActive: false,
          reloadingProgress: null,
        });
      }

      renderLastNightArena(ctx, width, height, {
        mapId: state?.map_id ?? "cursed_village",
        wave: state?.wave ?? 1,
        timeSec: sim.timeSec,
        players: playersToRender,
        enemies: sim.enemies,
        projectiles: sim.projectiles,
        thornTraps: sim.thornTraps,
        interactables: sim.interactables,
        slashes: sim.slashes,
        lightningArcs: sim.lightningArcs,
        telegraphs: sim.telegraphs,
        floatingTexts: sim.floatingTexts,
        nearestInteractableId: sim.nearestInteractableId,
      });
    },
    [me, session],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = new GameLoop2D({
      tickHz: 60,
      update: (dt) => handleUpdate(dt),
      render: () => handleRender(ctx, canvas.width, canvas.height),
    });

    loop.start();
    return () => {
      loop.stop();
    };
  }, [handleUpdate, handleRender]);

  if (loading && !roomState) {
    return (
      <section className="page-container">
        <div className="panel" style={{ textAlign: "center", padding: "3rem" }}>
          در حال بارگذاری قلمرو Last Night — Medieval Survival...
        </div>
      </section>
    );
  }

  const state = roomState?.state;
  const currentMapSpec = getMapSpec(state?.map_id ?? "cursed_village");
  const currentWeaponSpec = getWeaponSpec(me?.equipped_weapon ?? "rusty_sword");
  const isFinished = state?.status === "victory" || state?.status === "defeat";
  const isPrepOrWaiting =
    state?.status === "waiting" ||
    (state?.status === "active" && state.phase === "prep");

  const setTouchVector = (vx: number, vy: number) => {
    simRef.current.touchMoveX = vx;
    simRef.current.touchMoveY = vy;
  };

  return (
    <section
      className={`page-container ln-room-page ${theaterMode ? "ln-room-page--theater" : ""}`}
    >
      <div className="ln-top-bar">
        <div className="ln-top-bar__left">
          <Link to="/games/last-night" className="btn btn--ghost btn--sm">
            ← لابی Last Night
          </Link>
          <span className="ln-room-code-badge" dir="ltr">
            ROOM: {normalizedCode}
          </span>
          <span className="ln-map-pill">
            🗺️ {currentMapSpec.nameFa} — موج{" "}
            <strong>{state?.wave ?? 1}</strong> از <strong>10</strong>
          </span>
        </div>

        <div className="ln-top-bar__right">
          <div
            className="ln-sheriff-wallet"
            title={`خزانه مشترک تیم (${SHERIFF_COIN_NAME})`}
          >
            <span className="ln-coin-icon">🪙</span>
            <div>
              <small>خزانه تیم ({SHERIFF_COIN_NAME})</small>
              <strong>
                {(state?.sheriff_coins ?? 0).toLocaleString("en-US")}{" "}
                {SHERIFF_COIN_NAME}
              </strong>
            </div>
          </div>

          {me && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setShopOpen(true)}
            >
              ⚒️ آهنگری و کتاب‌های جادو [B]
            </button>
          )}

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setAutoAimEnabled((v) => !v)}
          >
            {autoAimEnabled ? "🎯 هدف‌گیری خودکار: روشن" : "🎯 هدف‌گیری دستی"}
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setTheaterMode((v) => !v)}
          >
            {theaterMode ? "🗗 نمای استاندارد" : "⛶ بزرگ‌نمایی میدان"}
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              medievalAudio.muted = !soundMuted;
              setSoundMuted(!soundMuted);
            }}
          >
            {soundMuted ? "🔇 صدا خاموش" : "🔊 صدای قرون‌وسطایی"}
          </button>
        </div>
      </div>

      {errorBanner && (
        <div className="alert alert--error" style={{ marginBottom: "0.75rem" }}>
          <span>{errorBanner}</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setErrorBanner(null)}
          >
            بستن
          </button>
        </div>
      )}

      {toastBanner && <div className="ln-toast-banner">{toastBanner}</div>}

      {!me && state && !isFinished && (
        <div className="ln-join-prompt-card">
          <div>
            <h3>پیوستن به اتاق دونفره آنلاین ({normalizedCode})</h3>
            <p>
              شوالیه دوم می‌تواند از دستگاه مجزا وارد این کمپین ۱۰ موجی شود و در خزانه{" "}
              <strong>{SHERIFF_COIN_NAME}</strong> شریک گردد.
            </p>
          </div>
          <div className="ln-join-prompt-actions">
            <input
              type="text"
              className="input"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="نام شوالیه شما..."
              maxLength={24}
            />
            <button
              type="button"
              className="btn btn--primary"
              disabled={joining}
              onClick={() => void handleJoinRoom()}
            >
              {joining ? "در حال ورود..." : "ورود به کمپین به عنوان هم‌تیمی"}
            </button>
          </div>
        </div>
      )}

      {hudSnapshot.activeBoss && (
        <div className="ln-boss-hud-banner">
          <img
            src={hudSnapshot.activeBoss.portraitUrl}
            alt={hudSnapshot.activeBoss.nameEn}
            className="ln-boss-hud-portrait"
          />
          <div className="ln-boss-hud-body">
            <div className="ln-boss-hud-head">
              <strong>
                👑 {hudSnapshot.activeBoss.nameFa} ({hudSnapshot.activeBoss.nameEn})
              </strong>
              <span className="ln-boss-phase-tag">
                فاز نبرد {hudSnapshot.activeBoss.phase} از ۳
              </span>
              <span>
                HP: {hudSnapshot.activeBoss.hp} / {hudSnapshot.activeBoss.maxHp}
              </span>
            </div>
            <div className="ln-progress-track ln-progress-track--boss">
              <div
                className="ln-progress-fill ln-progress-fill--boss"
                style={{
                  width: `${Math.max(0, Math.min(100, (hudSnapshot.activeBoss.hp / Math.max(1, hudSnapshot.activeBoss.maxHp)) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="ln-main-grid">
        <div className="ln-arena-column">
          <div
            className="ln-canvas-wrapper"
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                simRef.current.aimX =
                  ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH;
                simRef.current.aimY =
                  ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
              }
            }}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                simRef.current.aimX =
                  ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH;
                simRef.current.aimY =
                  ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
              }
              simRef.current.mouseDown = true;
              triggerPrimaryAttack();
            }}
            onPointerUp={() => {
              simRef.current.mouseDown = false;
            }}
            onPointerCancel={() => {
              simRef.current.mouseDown = false;
            }}
          >
            <canvas
              ref={canvasRef}
              width={WORLD_WIDTH}
              height={WORLD_HEIGHT}
              className="ln-canvas-stage"
              aria-label="Last Night — Medieval Survival 2D Pixel Art Arena"
            />

            {isPrepOrWaiting && (
              <div className="ln-canvas-overlay">
                <div className="ln-overlay-box">
                  <span className="ln-badge-gold">
                    {currentMapSpec.nameFa} — آماده آغاز موج {state?.wave ?? 1}
                  </span>
                  <h3>اتاق کمپین قرون‌وسطایی ({normalizedCode})</h3>
                  <p>
                    بازیکنان حاضر در اتاق:{" "}
                    <strong>
                      {state?.players.length ?? 1} / {state?.max_players ?? 2}
                    </strong>
                  </p>
                  <p className="ln-overlay-hint">
                    می‌توانید کد اتاق <code>{normalizedCode}</code> را برای بازیکن دوم در
                    دستگاه دیگر بفرستید، از فروشگاه با{" "}
                    <strong>{SHERIFF_COIN_NAME}</strong> خرید کنید و موج{" "}
                    {state?.wave ?? 1} را آغاز نمایید.
                  </p>
                  {me && (
                    <div className="ln-overlay-actions">
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={busyId === "start_wave"}
                        onClick={() => void handleStartCampaign()}
                      >
                        ⚔️ آغاز موج {state?.wave ?? 1} در {currentMapSpec.nameFa}
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => setShopOpen(true)}
                      >
                        ⚒️ فروشگاه و تجهیز جادو ({SHERIFF_COIN_NAME})
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isFinished && state && (
              <div className="ln-canvas-overlay">
                <div className="ln-overlay-box">
                  <span className="ln-badge-gold">
                    {state.status === "victory"
                      ? "🏆 پیروزی در هر ۱۰ موج!"
                      : "💀 سقوط شوالیه‌ها در تاریکی"}
                  </span>
                  <h3>
                    {state.status === "victory"
                      ? "پادشاه نفرین‌شده (Cursed King) شکست خورد!"
                      : "کمپین Last Night به پایان رسید"}
                  </h3>
                  <p>
                    موج نهایی: <strong>{state.wave} از 10</strong> | کل{" "}
                    <strong>{SHERIFF_COIN_NAME}</strong> کسب‌شده:{" "}
                    <strong>{state.total_coins_earned.toLocaleString("en-US")}</strong>
                  </p>
                  <div className="ln-results-table">
                    {state.players.map((p) => (
                      <div key={p.seat} className="ln-results-row">
                        <span>
                          شوالیه {p.seat}: <strong>{p.name}</strong>
                        </span>
                        <span>شکار هیولا: {p.kills}</span>
                        <span>احیا: {p.revives_performed}</span>
                      </div>
                    ))}
                  </div>
                  <div className="ln-overlay-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => navigate("/games/last-night")}
                    >
                      بازگشت به لابی Last Night
                    </button>
                    <Link to="/shop" className="btn btn--secondary">
                      کیف پول و فروشگاه ({SHERIFF_COIN_NAME})
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tappable Quick-Use Consumables Belt (Works on Mobile & Desktop) */}
          {me && (
            <div className="ln-quick-belt" aria-label="کمربند مصرف سریع آیتم‌ها">
              {QUICK_BELT_ITEMS.map((item) => {
                const count = Number(me.inventory?.[item.id] ?? 0);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`ln-belt-btn ${count > 0 ? "ln-belt-btn--ready" : ""}`}
                    disabled={count <= 0 || busyId === `use_${item.id}`}
                    onClick={() => void handleUseItem(item.id)}
                  >
                    <span className="ln-spell-key">[{item.key}]</span>
                    <span className="ln-belt-label">{item.shortFa}</span>
                    <strong className="ln-belt-count">×{count}</strong>
                  </button>
                );
              })}
            </div>
          )}

          {/* Responsive Touch / Mobile & Tablet Gamepad Controls */}
          <div className="ln-touch-controls" aria-label="کنترلر لمسی موبایل و تبلت">
            <div className="ln-dpad-grid">
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--up-left"
                onPointerDown={() => setTouchVector(-1, -1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت بالا چپ"
              >
                ↖
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--up"
                onPointerDown={() => setTouchVector(0, -1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت بالا"
              >
                ▲
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--up-right"
                onPointerDown={() => setTouchVector(1, -1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت بالا راست"
              >
                ↗
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--left"
                onPointerDown={() => setTouchVector(-1, 0)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت چپ"
              >
                ◀
              </button>
              <span className="ln-dpad-center">حرکت</span>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--right"
                onPointerDown={() => setTouchVector(1, 0)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت راست"
              >
                ▶
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--down-left"
                onPointerDown={() => setTouchVector(-1, 1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت پایین چپ"
              >
                ↙
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--down"
                onPointerDown={() => setTouchVector(0, 1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت پایین"
              >
                ▼
              </button>
              <button
                type="button"
                className="ln-dpad-btn ln-dpad-btn--down-right"
                onPointerDown={() => setTouchVector(1, 1)}
                onPointerUp={() => setTouchVector(0, 0)}
                onPointerLeave={() => setTouchVector(0, 0)}
                aria-label="حرکت پایین راست"
              >
                ↘
              </button>
            </div>

            <div className="ln-touch-actions">
              <button
                type="button"
                className="ln-touch-btn ln-touch-btn--attack"
                onPointerDown={() => {
                  simRef.current.mouseDown = true;
                  triggerPrimaryAttack();
                }}
                onPointerUp={() => {
                  simRef.current.mouseDown = false;
                }}
                onPointerLeave={() => {
                  simRef.current.mouseDown = false;
                }}
              >
                ⚔️ ضربه / شلیک
              </button>
              <button
                type="button"
                className="ln-touch-btn ln-touch-btn--spell"
                onClick={() => void handleCastSpellSlot(0)}
              >
                📖 جادوی ۱ [Q]
              </button>
              <button
                type="button"
                className="ln-touch-btn ln-touch-btn--spell"
                onClick={() => void handleCastSpellSlot(1)}
              >
                📖 جادوی ۲ [F]
              </button>
              <button
                type="button"
                className={`ln-touch-btn ${hudSnapshot.nearestPromptFa ? "ln-touch-btn--highlight" : ""}`}
                onClick={() => void handleInteractNearest()}
              >
                🕯️ {hudSnapshot.nearestPromptFa ? `تعامل [E]` : "مشعل/صندوق [E]"}
              </button>
              <button
                type="button"
                className="ln-touch-btn"
                onClick={() => void handleReloadOrRevive()}
              >
                🔄 خشاب / احیا [R]
              </button>
              <button
                type="button"
                className="ln-touch-btn"
                onClick={() => setShopOpen(true)}
              >
                ⚒️ فروشگاه [B]
              </button>
            </div>
          </div>
        </div>

        <aside className="ln-hud-sidebar">
          <div className="ln-hud-card">
            <div className="ln-hud-card-head">
              <strong>🛡️ وضعیت شوالیه شما</strong>
              <span className="ln-seat-badge">Seat #{me?.seat ?? 1}</span>
            </div>

            <div className="ln-vital-row">
              <span>سلامتی (HP)</span>
              <strong>
                {hudSnapshot.hp} / {hudSnapshot.maxHp}
              </strong>
            </div>
            <div className="ln-progress-track">
              <div
                className="ln-progress-fill ln-progress-fill--hp"
                style={{
                  width: `${(hudSnapshot.hp / Math.max(1, hudSnapshot.maxHp)) * 100}%`,
                }}
              />
            </div>

            <div className="ln-vital-row" style={{ marginTop: "0.5rem" }}>
              <span>مانا جادویی (Mana)</span>
              <strong>
                {hudSnapshot.mana} / {hudSnapshot.maxMana}
              </strong>
            </div>
            <div className="ln-progress-track">
              <div
                className="ln-progress-fill ln-progress-fill--mana"
                style={{
                  width: `${(hudSnapshot.mana / Math.max(1, hudSnapshot.maxMana)) * 100}%`,
                }}
              />
            </div>

            <div className="ln-weapon-box">
              <div>
                <small>سلاح در دست:</small>
                <strong>
                  {currentWeaponSpec.nameEn} ({currentWeaponSpec.nameFa})
                </strong>
              </div>
              <div className="ln-ammo-pills">
                <span>🏹 تیر: {hudSnapshot.arrows}</span>
                <span>💣 باروت و گلوله: {hudSnapshot.bullets}</span>
                <span>🗝️ کلید زنگ‌زده: {hudSnapshot.rustyKeys}</span>
              </div>
              {currentWeaponSpec.kind === "firearm" && (
                <div className="ln-firearm-status">
                  {hudSnapshot.reloadRemainingSec > 0 ? (
                    <span className="ln-chip ln-chip--warn">
                      در حال بارگذاری باروت ({hudSnapshot.reloadRemainingSec.toFixed(1)}s)...
                    </span>
                  ) : hudSnapshot.loadedFirearm ? (
                    <span className="ln-chip ln-chip--good">
                      ✓ آماده شلیک تک‌تیر ({currentWeaponSpec.damage} آسیب)
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => void handleReloadOrRevive()}
                    >
                      بارگذاری مجدد تفنگ باروتی [R]
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="ln-hud-card">
            <div className="ln-hud-card-head">
              <strong>
                📖 کتاب‌های جادوی تجهیزشده ({me?.equipped_spells.length ?? 0}/
                {MAX_EQUIPPED_SPELLBOOKS})
              </strong>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setShopOpen(true)}
              >
                تغییر
              </button>
            </div>
            <div className="ln-spell-slots">
              {[0, 1].map((slotIdx) => {
                const spellId = me?.equipped_spells[slotIdx];
                const spec = spellId ? getMagicBookSpec(spellId) : undefined;
                const cd = spellId ? (hudSnapshot.spellCooldowns[spellId] ?? 0) : 0;
                const keyLabel = slotIdx === 0 ? "Q" : "F";
                return (
                  <button
                    key={slotIdx}
                    type="button"
                    className={`ln-spell-slot-btn ${spec ? "ln-spell-slot-btn--filled" : ""}`}
                    disabled={!spec || cd > 0}
                    onClick={() => void handleCastSpellSlot(slotIdx as 0 | 1)}
                  >
                    <span className="ln-spell-key">[{keyLabel}]</span>
                    {spec ? (
                      <div className="ln-spell-slot-info">
                        <strong>{spec.nameEn}</strong>
                        <small>
                          {cd > 0
                            ? `کول‌داون: ${cd.toFixed(1)}s`
                            : `${spec.nameFa} (${spec.manaCost} مانا)`}
                        </small>
                      </div>
                    ) : (
                      <div className="ln-spell-slot-info">
                        <span>اسلات جادوی {slotIdx + 1} خالی</span>
                        <small>از فروشگاه کتاب جادو بخرید و تجهیز کنید</small>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ln-hud-card">
            <div className="ln-hud-card-head">
              <strong>🤝 هم‌تیمی آنلاین (۲ نفره)</strong>
              <span>{ally ? "متصل" : "سلحشور همراه فعال"}</span>
            </div>
            {ally ? (
              <div className="ln-ally-summary">
                <div>
                  <strong>{ally.name}</strong> ({getWeaponSpec(ally.equipped_weapon).nameEn})
                </div>
                <div>
                  HP: {ally.hp}/{ally.max_hp} | شکار: {ally.kills}
                </div>
                {ally.downed && (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => void handleReloadOrRevive()}
                  >
                    ✨ احیای هم‌تیمی [R]
                  </button>
                )}
              </div>
            ) : (
              <p className="ln-ally-empty">
                سلحشور همراه در کنار شما می‌جنگد؛ هر زمان بازیکن دوم کد اتاق{" "}
                <code>{normalizedCode}</code> را وارد کند، به‌صورت زنده جایگزین می‌شود.
              </p>
            )}
          </div>

          <div className="ln-hud-card">
            <div className="ln-hud-card-head">
              <strong>🕯️ اهداف نقشه ({currentMapSpec.nameFa})</strong>
              <span>هیولاهای باقی‌مانده: {hudSnapshot.enemiesRemaining}</span>
            </div>
            <ul className="ln-objectives-list">
              {(state?.objectives ?? []).map((obj) => (
                <li
                  key={obj.id}
                  className={
                    obj.completed ? "ln-obj-item ln-obj-item--done" : "ln-obj-item"
                  }
                >
                  <span>
                    {obj.completed ? "✓" : "○"} {obj.title} ({obj.progress}/{obj.target})
                  </span>
                  <strong className="ln-obj-reward">
                    +{obj.reward_coins} {SHERIFF_COIN_NAME}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {me && (
        <LastNightShopModal
          open={shopOpen}
          onClose={() => setShopOpen(false)}
          teamSheriffCoins={state?.sheriff_coins ?? 0}
          me={me}
          busyId={busyId}
          onBuyWeapon={handleBuyWeapon}
          onEquipWeapon={handleEquipWeapon}
          onBuySpellbook={handleBuySpellbook}
          onToggleEquipSpellbook={handleToggleEquipSpellbook}
          onBuyItem={handleBuyItem}
          onUseItem={handleUseItem}
        />
      )}
    </section>
  );
}
