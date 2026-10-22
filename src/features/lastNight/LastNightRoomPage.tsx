import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GameLoop2D } from "@/games/engine2d/GameLoop2D";
import {
  getBossForWave,
  getMagicBookSpec,
  getMapSpec,
  getShopItemSpec,
  getWeaponSpec,
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
import { getErrorMessage, toUserError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type {
  LnRoomPlayer,
  LnRoomStateResponse,
  MagicBookId,
  MedievalMapId,
  MedievalShopItemId,
  MedievalWeaponId,
} from "@/types/lastNight";
import { LastNightRoomHud } from "./LastNightRoomHud";

type CombatSyncRetry = {
  roomCode: string;
  playerToken: string;
  requestId: string;
  payload: Record<string, unknown>;
  coinsDelta: number;
  killsDelta: number;
  bossDamageDelta: number;
};

const isCombatActive = (
  state: LnRoomStateResponse["state"] | null | undefined,
): boolean =>
  state?.status === "active" &&
  (state.phase === "combat" || state.phase === "boss");

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

  const roomStateRef = useRef<LnRoomStateResponse | null>(null);
  const roomRequestSeqRef = useRef(0);
  const activeRoomCodeRef = useRef(normalizedCode);
  const activePlayerTokenRef = useRef(session?.playerToken ?? null);
  const combatSyncInFlightRef = useRef(false);
  const combatSyncRetryRef = useRef<CombatSyncRetry | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const isCurrentRoomSession = useCallback(
    (roomCode: string, playerToken: string) =>
      activeRoomCodeRef.current === roomCode &&
      activePlayerTokenRef.current === playerToken,
    [],
  );

  useEffect(() => {
    simRef.current.autoAim = autoAimEnabled;
  }, [autoAimEnabled]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    activeRoomCodeRef.current = normalizedCode;
    activePlayerTokenRef.current = session?.playerToken ?? null;
  }, [normalizedCode, session?.playerToken]);

  const showToast = useCallback((msg: string) => {
    setToastBanner(msg);
  }, []);

  useEffect(() => {
    if (!toastBanner) return;
    const t = window.setTimeout(() => setToastBanner(null), 3600);
    return () => window.clearTimeout(t);
  }, [toastBanner]);

  useEffect(() => {
    roomRequestSeqRef.current += 1;
    activeRoomCodeRef.current = normalizedCode;
    const storedSession = loadLnSession(normalizedCode);
    activePlayerTokenRef.current = storedSession?.playerToken ?? null;
    combatSyncRetryRef.current = null;
    setSession(storedSession);
    roomStateRef.current = null;
    setRoomState(null);
    setLoading(/^[A-Z2-9]{6}$/.test(normalizedCode));
    setErrorBanner(
      /^[A-Z2-9]{6}$/.test(normalizedCode)
        ? null
        : "کد اتاق معتبر نیست. کد باید ۶ نویسه داشته باشد.",
    );

    const sim = simRef.current;
    sim.initializedWave = 0;
    sim.initializedMap = "cursed_village";
    sim.timeSec = 0;
    sim.localX = 590;
    sim.localY = 455;
    sim.aimX = 640;
    sim.aimY = 360;
    sim.aimAngle = 0;
    sim.hp = 120;
    sim.maxHp = 120;
    sim.mana = 100;
    sim.maxMana = 100;
    sim.arrows = 20;
    sim.bullets = 4;
    sim.rustyKeys = 1;
    sim.downed = false;
    sim.soloReviveTimerSec = 0;
    sim.webSlowSec = 0;
    sim.loadedFirearm = true;
    sim.reloadRemainingSec = 0;
    sim.attackCooldownSec = 0;
    sim.spellCooldowns = {};
    sim.fireOilSec = 0;
    sim.protectionSec = 0;
    sim.charmSec = 0;
    sim.shadowsSec = 0;
    sim.spiritSec = 0;
    sim.spiritAttackAccumSec = 0;
    sim.squireX = 660;
    sim.squireY = 455;
    sim.squireAimAngle = 0;
    sim.squireAttackAccumSec = 0;
    sim.pendingCoinsEarned = 0;
    sim.pendingKills = 0;
    sim.pendingBossDamage = 0;
    sim.waveClearSent = false;
    sim.syncAccumSec = 0;
    sim.hudAccumSec = 0;
    sim.keysDown.clear();
    sim.touchMoveX = 0;
    sim.touchMoveY = 0;
    sim.mouseDown = false;
    sim.enemies = [];
    sim.projectiles = [];
    sim.thornTraps = [];
    sim.interactables = createMapInteractables("cursed_village");
    sim.slashes = [];
    sim.lightningArcs = [];
    sim.telegraphs = [];
    sim.floatingTexts = [];
    sim.nearestInteractableId = null;

    setHudSnapshot((current) => ({
      ...current,
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
    }));
  }, [normalizedCode]);

  const playerToken =
    session?.roomCode.toUpperCase() === normalizedCode ? session.playerToken : null;

  const applyRoomState = useCallback((next: LnRoomStateResponse) => {
    setRoomState((current) => {
      if (next.state.room_code !== activeRoomCodeRef.current) return current;
      if (
        current &&
        current.state.room_code === next.state.room_code &&
        current.state.version > next.state.version
      ) {
        return current;
      }
      return next;
    });
  }, []);

  const fetchState = useCallback(
    async (notify = false) => {
      if (!/^[A-Z2-9]{6}$/.test(normalizedCode)) {
        setLoading(false);
        return;
      }

      const requestSeq = ++roomRequestSeqRef.current;
      try {
        const res = await lastNightApi.getRoomState(normalizedCode, playerToken, notify);
        if (
          requestSeq !== roomRequestSeqRef.current ||
          res.state.room_code !== normalizedCode
        ) {
          return;
        }
        applyRoomState(res);
        setErrorBanner(null);
      } catch (err) {
        if (requestSeq === roomRequestSeqRef.current) {
          setErrorBanner(getErrorMessage(err));
        }
      } finally {
        if (requestSeq === roomRequestSeqRef.current) setLoading(false);
      }
    },
    [applyRoomState, normalizedCode, playerToken],
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

    const completedInteractables = new Set([
      ...(state.chests_opened ?? []),
      ...(state.interactions ?? []),
    ]);
    if (completedInteractables.size > 0) {
      sim.interactables = sim.interactables.map((interactable) =>
        completedInteractables.has(interactable.id)
          ? { ...interactable, activated: true }
          : interactable,
      );
    }

    const isIntermission =
      state.status === "waiting" ||
      (state.status === "active" && state.phase === "prep");
    if (me && isIntermission) {
      sim.arrows = me.arrows;
      sim.bullets = me.bullets;
      sim.rustyKeys = me.rusty_keys;
      sim.hp = me.hp;
      sim.maxHp = me.max_hp;
      sim.mana = me.mana;
      sim.maxMana = me.max_mana;
      sim.downed = me.downed;
      sim.loadedFirearm = me.loaded_firearm;
      setHudSnapshot((current) => ({
        ...current,
        hp: me.hp,
        maxHp: me.max_hp,
        mana: me.mana,
        maxMana: me.max_mana,
        arrows: me.arrows,
        bullets: me.bullets,
        rustyKeys: me.rusty_keys,
        downed: me.downed,
        loadedFirearm: me.loaded_firearm,
      }));
    }

    if (
      state.status === "active" &&
      (state.phase === "combat" || state.phase === "boss") &&
      sim.initializedWave !== state.wave
    ) {
      sim.initializedWave = state.wave;
      sim.waveClearSent = false;
      sim.enemies = createWaveEnemies(state.wave);
      sim.projectiles = [];
      sim.telegraphs = [];
      sim.nearestInteractableId = null;
      setHudSnapshot((current) => ({
        ...current,
        enemiesRemaining: sim.enemies.length,
        activeBoss: null,
      }));
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

        const serverNowMs = Date.parse(state.server_now);
        const remainingSeconds = (readyAtMs?: number) => {
          const readyAt = Number(readyAtMs ?? 0);
          return Number.isFinite(serverNowMs) && Number.isFinite(readyAt)
            ? Math.max(0, (readyAt - serverNowMs) / 1000)
            : 0;
        };
        sim.spellCooldowns = Object.fromEntries(
          Object.entries(me.spell_cooldowns ?? {})
            .map(([spellId, readyAt]) => [spellId, remainingSeconds(readyAt)] as const)
            .filter(([, seconds]) => seconds > 0),
        );
        sim.protectionSec = remainingSeconds(me.active_buffs.protection_until);
        sim.shadowsSec = remainingSeconds(me.active_buffs.shadows_until);
        sim.fireOilSec = remainingSeconds(me.active_buffs.fire_oil_until);
        sim.charmSec = remainingSeconds(me.active_buffs.charm_until);
        sim.spiritSec = remainingSeconds(me.active_buffs.spirit_until);
        sim.spiritAttackAccumSec = 0;

        const reloadReadyAtMs = me.firearm_reload_ready_at
          ? Date.parse(me.firearm_reload_ready_at)
          : Number.NaN;
        sim.reloadRemainingSec = Number.isFinite(serverNowMs) && Number.isFinite(reloadReadyAtMs)
          ? Math.max(0, (reloadReadyAtMs - serverNowMs) / 1000)
          : 0;
        if (!sim.loadedFirearm && sim.reloadRemainingSec === 0) {
          sim.loadedFirearm = true;
        }
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
      if (activeRoomCodeRef.current !== normalizedCode) return;
      activePlayerTokenRef.current = nextSession.playerToken;
      setSession(nextSession);
      const stateRes = await lastNightApi.getRoomState(
        normalizedCode,
        nextSession.playerToken,
        true,
      );
      if (!isCurrentRoomSession(normalizedCode, nextSession.playerToken)) return;
      applyRoomState(stateRes);
      setErrorBanner(null);
    } catch (err) {
      if (activeRoomCodeRef.current === normalizedCode) {
        setErrorBanner(getErrorMessage(err));
      }
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
      if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
      applyRoomState(res);
    } catch (err) {
      if (isCurrentRoomSession(normalizedCode, session.playerToken)) {
        setErrorBanner(getErrorMessage(err));
      }
    } finally {
      setBusyId(null);
    }
  };

  const syncLocalAmmoFromResponse = (res: LnRoomStateResponse, fallbackSeat?: number) => {
    if (res.state.room_code !== activeRoomCodeRef.current) return;
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

  const sendCombatSync = useCallback(async (): Promise<LnRoomStateResponse | null> => {
    if (
      !session ||
      !isCurrentRoomSession(normalizedCode, session.playerToken) ||
      combatSyncInFlightRef.current
    ) {
      return null;
    }

    const sim = simRef.current;
    let request = combatSyncRetryRef.current;
    if (
      !request ||
      request.roomCode !== normalizedCode ||
      request.playerToken !== session.playerToken
    ) {
      request = {
        roomCode: normalizedCode,
        playerToken: session.playerToken,
        requestId: crypto.randomUUID(),
        payload: {
          pos_x: Math.round(sim.localX),
          pos_y: Math.round(sim.localY),
          hp: Math.round(sim.hp),
          mana: Math.round(sim.mana),
          arrows: sim.arrows,
          bullets: sim.bullets,
          downed: sim.downed,
          loaded_firearm: sim.loadedFirearm,
          coins_delta: sim.pendingCoinsEarned,
          kills_delta: sim.pendingKills,
          damage_delta: sim.pendingBossDamage,
        },
        coinsDelta: sim.pendingCoinsEarned,
        killsDelta: sim.pendingKills,
        bossDamageDelta: sim.pendingBossDamage,
      };
      combatSyncRetryRef.current = request;
    }

    combatSyncInFlightRef.current = true;
    try {
      const res = await lastNightApi.syncAction(
        request.roomCode,
        request.playerToken,
        "combat_sync",
        { ...request.payload, request_id: request.requestId },
      );
      if (
        activeRoomCodeRef.current !== request.roomCode ||
        activePlayerTokenRef.current !== request.playerToken
      ) {
        return res;
      }
      if (combatSyncRetryRef.current?.requestId === request.requestId) {
        combatSyncRetryRef.current = null;
      }

      sim.pendingCoinsEarned = Math.max(0, sim.pendingCoinsEarned - request.coinsDelta);
      sim.pendingKills = Math.max(0, sim.pendingKills - request.killsDelta);
      sim.pendingBossDamage = Math.max(0, sim.pendingBossDamage - request.bossDamageDelta);

      const sentHp = request.payload.hp;
      const sentMana = request.payload.mana;
      const sentArrows = request.payload.arrows;
      const sentBullets = request.payload.bullets;
      const sentDowned = request.payload.downed;
      const sentLoaded = request.payload.loaded_firearm;
      const mySeat = res.seat ?? session.seat;
      const player = res.state.players.find((candidate) => candidate.seat === mySeat);
      if (player) {
        if (typeof sentHp === "number" && Math.round(sim.hp) === sentHp) sim.hp = player.hp;
        if (typeof sentMana === "number" && Math.round(sim.mana) === sentMana) sim.mana = player.mana;
        if (typeof sentArrows === "number" && sim.arrows === sentArrows) sim.arrows = player.arrows;
        if (typeof sentBullets === "number" && sim.bullets === sentBullets) sim.bullets = player.bullets;
        if (typeof sentDowned === "boolean" && sim.downed === sentDowned) sim.downed = player.downed;
        if (typeof sentLoaded === "boolean" && sim.loadedFirearm === sentLoaded) {
          sim.loadedFirearm = player.loaded_firearm;
          if (player.loaded_firearm) sim.reloadRemainingSec = 0;
        }
      }

      applyRoomState(res);
      const creditedCoins = res.combat_reward_coins ?? 0;
      if (creditedCoins > 0) {
        sim.floatingTexts.push({
          id: `combat_reward_${request.requestId}`,
          x: sim.localX,
          y: sim.localY - 24,
          text: `+${creditedCoins} ${SHERIFF_COIN_NAME}`,
          color: "#facc15",
          ttlSec: 1.6,
        });
      }
      return res;
    } catch (err) {
      const userError = toUserError(err);
      const permanentCodes = new Set([
        "GAME_NOT_ACTIVE",
        "INVALID_AMMO",
        "INVALID_PLAYER_STATE",
        "INVALID_POSITION",
        "PLAYER_MOVED_TOO_FAST",
        "PLAYER_UNAUTHORIZED",
        "ROOM_CLOSED",
        "ROOM_EXPIRED",
        "ROOM_NOT_FOUND",
      ]);
      if (
        permanentCodes.has(userError.code) &&
        combatSyncRetryRef.current?.requestId === request.requestId
      ) {
        combatSyncRetryRef.current = null;
      }
      throw err;
    } finally {
      combatSyncInFlightRef.current = false;
    }
  }, [applyRoomState, isCurrentRoomSession, normalizedCode, session]);

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
      if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
      applyRoomState(res);
      syncLocalAmmoFromResponse(res, session.seat);
      simRef.current.loadedFirearm = true;
      simRef.current.reloadRemainingSec = 0;
      medievalAudio.play("coin_clink");
      showToast(`سلاح جدید خریداری و تجهیز شد!`);
    } catch (err) {
      if (isCurrentRoomSession(normalizedCode, session.playerToken)) {
        setErrorBanner(getErrorMessage(err));
      }
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
      if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
      applyRoomState(res);
      simRef.current.loadedFirearm = true;
      simRef.current.reloadRemainingSec = 0;
    } catch (err) {
      if (isCurrentRoomSession(normalizedCode, session.playerToken)) {
        setErrorBanner(getErrorMessage(err));
      }
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
      if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
      applyRoomState(res);
      medievalAudio.play("coin_clink");
      showToast(`کتاب جادوی جدید خریداری شد!`);
    } catch (err) {
      if (isCurrentRoomSession(normalizedCode, session.playerToken)) {
        setErrorBanner(getErrorMessage(err));
      }
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
      if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
      applyRoomState(res);
    } catch (err) {
      if (isCurrentRoomSession(normalizedCode, session.playerToken)) {
        setErrorBanner(getErrorMessage(err));
      }
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
      if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
      applyRoomState(res);
      syncLocalAmmoFromResponse(res, session.seat);
      medievalAudio.play("coin_clink");
      const spec = getShopItemSpec(itemId);
      if (spec) {
        showToast(`✓ ${spec.nameEn} خریداری شد.`);
      }
    } catch (err) {
      if (isCurrentRoomSession(normalizedCode, session.playerToken)) {
        setErrorBanner(getErrorMessage(err));
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleUseItem = useCallback(
    async (itemId: MedievalShopItemId) => {
      if (!session) return;
      if (!isCombatActive(roomStateRef.current?.state)) {
        setErrorBanner("استفاده از آیتم فقط هنگام نبرد امکان‌پذیر است.");
        return;
      }
      setBusyId(`use_${itemId}`);
      try {
        const res = await lastNightApi.useItem(
          normalizedCode,
          session.playerToken,
          itemId,
        );
        if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
        applyRoomState(res);
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
        if (isCurrentRoomSession(normalizedCode, session.playerToken)) {
          setErrorBanner(getErrorMessage(err));
        }
      } finally {
        setBusyId(null);
      }
    },
    [applyRoomState, isCurrentRoomSession, normalizedCode, session],
  );

  // Cast equipped magic book (Slot 0 = [Q], Slot 1 = [F])
  /* eslint-disable react-hooks/immutability -- This callback intentionally mutates the ref-owned simulation world, never React state. */
  const handleCastSpellSlot = useCallback(
    async (slotIndex: 0 | 1) => {
      const currentRes = roomStateRef.current;
      const mySeat = currentRes?.seat ?? session?.seat;
      const currentMe =
        currentRes?.state.players.find((p) => p.seat === mySeat) ?? me;
      if (!session || !currentMe) return;
      if (!isCombatActive(currentRes?.state)) {
        showToast("طلسم‌ها را فقط هنگام نبرد می‌توانید اجرا کنید.");
        return;
      }

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

      // Ask the server to validate mana, cooldown, seat and phase before any
      // local projectile, damage, buff, or resource mutation is applied.
      let castResult: LnRoomStateResponse;
      try {
        castResult = await lastNightApi.castSpell(
          normalizedCode,
          session.playerToken,
          spellId,
          sim.aimX,
          sim.aimY,
        );
      } catch (err) {
        if (isCurrentRoomSession(normalizedCode, session.playerToken)) {
          setErrorBanner(getErrorMessage(err));
        }
        return;
      }
      if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
      applyRoomState(castResult);
      const updatedMe = castResult.state.players.find(
        (player) => player.seat === (castResult.seat ?? session.seat),
      );
      sim.mana = updatedMe?.mana ?? Math.max(0, sim.mana - spec.manaCost);
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

    },
    [applyRoomState, isCurrentRoomSession, me, normalizedCode, session, showToast],
  );
  /* eslint-enable react-hooks/immutability */

  const handleInteractNearest = useCallback(async () => {
    const sim = simRef.current;
    if (!session || !isCombatActive(roomStateRef.current?.state)) {
      showToast("این تعامل در فاز آماده‌سازی در دسترس نیست.");
      return;
    }
    if (!sim.nearestInteractableId) {
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

    const previousRustyKeys = sim.rustyKeys;
    const floatingTextId = `obj_${Date.now()}_${target.id}`;
    target.activated = true;
    if (target.requiresKey) {
      sim.rustyKeys = Math.max(0, sim.rustyKeys - 1);
    }
    sim.floatingTexts.push({
      id: floatingTextId,
      x: target.x,
      y: target.y - 20,
      text: "در حال ثبت تعامل...",
      color: "#fde047",
      ttlSec: 1.6,
    });

    try {
      const res = await lastNightApi.syncAction(
        normalizedCode,
        session.playerToken,
        target.requiresKey ? "open_chest" : "complete_objective",
        {
          interactable_id: target.id,
          chest_id: target.id,
          pos_x: Math.round(sim.localX),
          pos_y: Math.round(sim.localY),
          requires_key: Boolean(target.requiresKey),
          objective_id: target.objectiveId,
          reward_coins: target.rewardCoins,
        },
      );
      if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
      applyRoomState(res);
      syncLocalAmmoFromResponse(res, session.seat);
      const earnedCoins = res.interaction_recorded
        ? (res.interaction_reward_coins ?? 0)
        : 0;
      sim.floatingTexts = sim.floatingTexts.filter((item) => item.id !== floatingTextId);
      sim.floatingTexts.push({
        id: `${floatingTextId}_result`,
        x: target.x,
        y: target.y - 20,
        text: earnedCoins > 0
          ? `+${earnedCoins} ${SHERIFF_COIN_NAME}`
          : res.interaction_recorded
            ? "پیشرفت هدف ثبت شد"
            : "این شیء قبلاً فعال شده است",
        color: earnedCoins > 0 ? "#fde047" : res.interaction_recorded ? "#86efac" : "#94a3b8",
        ttlSec: 1.6,
      });
      medievalAudio.play(target.kind === "chest" ? "chest_unlock" : "torch_light");
    } catch (err) {
      if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
      target.activated = false;
      sim.rustyKeys = previousRustyKeys;
      sim.floatingTexts = sim.floatingTexts.filter((item) => item.id !== floatingTextId);
      setErrorBanner(getErrorMessage(err));
    }
  }, [applyRoomState, isCurrentRoomSession, normalizedCode, session, showToast]);

  const handleReloadOrRevive = useCallback(async () => {
    const sim = simRef.current;
    const currentRes = roomStateRef.current;
    const mySeat = currentRes?.seat ?? session?.seat;
    const currentMe =
      currentRes?.state.players.find((p) => p.seat === mySeat) ?? me;
    if (!session || !currentMe || !isCombatActive(currentRes?.state)) return;

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
          {
            target_seat: downedAlly.seat,
            pos_x: Math.round(sim.localX),
            pos_y: Math.round(sim.localY),
          },
        );
        if (!isCurrentRoomSession(normalizedCode, session.playerToken)) return;
        applyRoomState(res);
        showToast(`✨ هم‌تیمی شما (${downedAlly.name}) احیا شد!`);
        return;
      } catch (err) {
        if (isCurrentRoomSession(normalizedCode, session.playerToken)) {
          setErrorBanner(getErrorMessage(err));
        }
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
  }, [applyRoomState, isCurrentRoomSession, me, normalizedCode, session, showToast]);

  useEffect(() => {
    if (shopOpen) {
      simRef.current.keysDown.clear();
      simRef.current.touchMoveX = 0;
      simRef.current.touchMoveY = 0;
      simRef.current.mouseDown = false;
    }
  }, [shopOpen]);

  useEffect(() => {
    const sim = simRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      const actionKeys = "qferb123456";
      if (e.repeat && actionKeys.includes(key)) return;

      if (key === "b") {
        e.preventDefault();
        setShopOpen((prev) => !prev);
        return;
      }
      if (shopOpen) return;

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
      sim.keysDown.clear();
    };
  }, [
    handleCastSpellSlot,
    handleInteractNearest,
    handleReloadOrRevive,
    handleUseItem,
    shopOpen,
  ]);

  /* eslint-disable react-hooks/immutability -- The fixed-timestep loop mutates only ref-owned world entities outside React render. */
  const triggerPrimaryAttack = useCallback(() => {
    const sim = simRef.current;
    const currentRes = roomStateRef.current;
    const mySeat = currentRes?.seat ?? session?.seat;
    const currentMe =
      currentRes?.state.players.find((p) => p.seat === mySeat) ?? me;
    if (
      !currentMe ||
      !isCombatActive(currentRes?.state) ||
      sim.downed ||
      sim.attackCooldownSec > 0
    ) {
      return;
    }

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
      void sendCombatSync().catch(() => {});
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
      void sendCombatSync().catch(() => {});
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
  }, [handleReloadOrRevive, me, sendCombatSync, session, showToast]);
  /* eslint-enable react-hooks/immutability */

  /* eslint-disable react-hooks/immutability -- Simulation arrays are mutable by design and are owned by simRef, not React state. */
  const handleUpdate = useCallback(
    (dt: number) => {
      const sim = simRef.current;
      const currentRes = roomStateRef.current;
      const state = currentRes?.state;
      const mySeat = currentRes?.seat ?? session?.seat;
      const currentMe = state?.players.find((p) => p.seat === mySeat) ?? me;
      sim.timeSec += dt;

      if (
        !state ||
        state.status !== "active" ||
        (state.phase !== "combat" && state.phase !== "boss")
      ) {
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
        const bossForWave = getBossForWave(state.wave);

        void sendCombatSync()
          .then((syncRes) => {
            if (!syncRes) throw new Error("COMBAT_SYNC_BUSY");
            return lastNightApi.syncAction(
              normalizedCode,
              session.playerToken,
              "wave_cleared",
              { boss_id: bossForWave?.kind ?? null },
            );
          })
          .then((res) => {
            applyRoomState(res);
            syncLocalAmmoFromResponse(res, session.seat);
            void refreshProfile();
          })
          .catch(() => {
            // The server may reject an early clear or a transient sync. Retry
            // the idempotent transition after a short delay rather than softlocking the wave.
            window.setTimeout(() => {
              sim.waveClearSent = false;
            }, 2500);
          });
      }

      sim.syncAccumSec += dt;
      if (sim.syncAccumSec >= 1.4 && session && currentMe) {
        sim.syncAccumSec = 0;
        void sendCombatSync().catch(() => {});
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
    [applyRoomState, me, normalizedCode, refreshProfile, sendCombatSync, session, triggerPrimaryAttack],
  );
  /* eslint-enable react-hooks/immutability */

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

  const updateHandlerRef = useRef(handleUpdate);
  const renderHandlerRef = useRef(handleRender);

  useEffect(() => {
    updateHandlerRef.current = handleUpdate;
  }, [handleUpdate]);

  useEffect(() => {
    renderHandlerRef.current = handleRender;
  }, [handleRender]);

  useEffect(() => {
    const canvas = canvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = new GameLoop2D({
      tickHz: 60,
      update: (dt) => updateHandlerRef.current(dt),
      render: () => renderHandlerRef.current(ctx, canvas.width, canvas.height),
    });

    loop.start();
    return () => {
      loop.stop();
    };
  }, [canvasElement]);

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
    <LastNightRoomHud
      theaterMode={theaterMode}
      setTheaterMode={setTheaterMode}
      normalizedCode={normalizedCode}
      currentMapSpec={currentMapSpec}
      currentWeaponSpec={currentWeaponSpec}
      state={state}
      me={me}
      ally={ally}
      shopOpen={shopOpen}
      setShopOpen={setShopOpen}
      autoAimEnabled={autoAimEnabled}
      setAutoAimEnabled={setAutoAimEnabled}
      soundMuted={soundMuted}
      setSoundMuted={setSoundMuted}
      errorBanner={errorBanner}
      setErrorBanner={setErrorBanner}
      toastBanner={toastBanner}
      isFinished={isFinished}
      isPrepOrWaiting={isPrepOrWaiting}
      joinName={joinName}
      setJoinName={setJoinName}
      joining={joining}
      handleJoinRoom={handleJoinRoom}
      hudSnapshot={hudSnapshot}
      simRef={simRef}
      setCanvasElement={setCanvasElement}
      busyId={busyId}
      handleStartCampaign={handleStartCampaign}
      navigate={navigate}
      handleUseItem={handleUseItem}
      setTouchVector={setTouchVector}
      triggerPrimaryAttack={triggerPrimaryAttack}
      handleCastSpellSlot={handleCastSpellSlot}
      handleInteractNearest={handleInteractNearest}
      handleReloadOrRevive={handleReloadOrRevive}
      handleBuyWeapon={handleBuyWeapon}
      handleEquipWeapon={handleEquipWeapon}
      handleBuySpellbook={handleBuySpellbook}
      handleToggleEquipSpellbook={handleToggleEquipSpellbook}
      handleBuyItem={handleBuyItem}
    />
  );
}
