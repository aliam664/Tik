/**
 * LAST NIGHT — Renderer smoke tests
 *
 * Renders a fully populated scene (elites, boss, particles, telegraphs,
 * weather, minimap) through a Proxy-based 2D context stub so every new draw
 * path is executed without a real browser canvas.
 */
import { describe, expect, it } from "vitest";
import { MEDIEVAL_MAPS } from "./catalog";
import { renderLastNightArena, type RenderSceneState } from "./renderer";
import { createMapInteractables, createWaveEnemies, type SimParticle } from "./simulation";

function makeProxyCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  return new Proxy(store, {
    get(_target, prop) {
      if (
        prop === "createRadialGradient" ||
        prop === "createLinearGradient" ||
        prop === "createConicGradient"
      ) {
        return () => gradient;
      }
      if (prop === "measureText") return () => ({ width: 24 });
      if (prop === "canvas") return { width: 1200, height: 820 };
      return () => undefined;
    },
    set(_target, prop, value) {
      store[String(prop)] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function buildBusyScene(mapId: RenderSceneState["mapId"]): RenderSceneState {
  const enemies = createWaveEnemies(7); // includes a boss + elite slots
  const particles: SimParticle[] = [
    { x: 400, y: 400, vx: 80, vy: -40, lifeSec: 0.4, maxLifeSec: 0.7, color: "#fbbf24", size: 3 },
    { x: 460, y: 420, vx: -30, vy: 60, lifeSec: 0.05, maxLifeSec: 0.7, color: "#94a3b8", size: 2 },
  ];
  return {
    mapId,
    wave: 7,
    timeSec: 12.75,
    players: [
      {
        seat: 1,
        name: "شوالیه شب",
        isLocal: true,
        x: 560,
        y: 430,
        aimAngle: 0.9,
        hp: 42,
        maxHp: 120,
        mana: 55,
        maxMana: 100,
        downed: false,
        equippedWeapon: "battle_axe",
        hasLantern: true,
        protectionActive: true,
        protectiveCharmActive: false,
        shadowsActive: true,
        fireOilActive: true,
        spiritActive: true,
        reloadingProgress: 0.4,
      },
      {
        seat: 2,
        name: "همراه",
        isLocal: false,
        role: "ally",
        x: 620,
        y: 450,
        aimAngle: -1.2,
        hp: 0,
        maxHp: 120,
        mana: 10,
        maxMana: 100,
        downed: true,
        equippedWeapon: "hunting_musket",
        hasLantern: false,
        protectionActive: false,
        protectiveCharmActive: true,
        shadowsActive: false,
        fireOilActive: false,
        spiritActive: false,
        reloadingProgress: null,
      },
      {
        seat: 3,
        name: "سلحشور همراه (AI)",
        isLocal: false,
        role: "squire",
        x: 500,
        y: 470,
        aimAngle: 2.4,
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
      },
    ],
    enemies,
    projectiles: [
      {
        id: "p1",
        ownerSeat: 1,
        kind: "arrow",
        x: 300,
        y: 300,
        vx: 640,
        vy: -120,
        radius: 5,
        damage: 30,
        knockback: 6,
        color: "#eab308",
        ttlSec: 0.8,
      },
      {
        id: "p2",
        ownerSeat: 0,
        kind: "icicle",
        x: 700,
        y: 260,
        vx: -340,
        vy: 90,
        radius: 7,
        damage: 18,
        knockback: 16,
        color: "#38bdf8",
        ttlSec: 1.2,
        appliesSlow: true,
      },
    ],
    thornTraps: [{ id: "t1", x: 450, y: 520, radius: 30, damage: 45, charges: 3 }],
    interactables: createMapInteractables(mapId),
    slashes: [
      {
        id: "s1",
        x: 560,
        y: 430,
        angle: 0.9,
        arcRad: 2.1,
        range: 74,
        color: "#f97316",
        ttlSec: 0.16,
      },
    ],
    lightningArcs: [
      {
        id: "l1",
        points: [
          { x: 500, y: 400 },
          { x: 540, y: 430 },
          { x: 590, y: 415 },
        ],
        ttlSec: 0.2,
      },
    ],
    telegraphs: [
      {
        id: "tg1",
        kind: "circle",
        x: 550,
        y: 420,
        radius: 95,
        ttlSec: 0.6,
        maxTtlSec: 1.4,
        label: "smash",
      },
      {
        id: "tg2",
        kind: "line",
        x: 300,
        y: 200,
        x2: 900,
        y2: 340,
        radius: 42,
        ttlSec: 0.9,
        maxTtlSec: 1.6,
        label: "charge",
      },
    ],
    floatingTexts: [
      { id: "f1", x: 560, y: 380, text: "-45", color: "#fef08a", ttlSec: 0.7 },
      { id: "f2", x: 600, y: 360, text: "×5 زنجیره!", color: "#fde047", ttlSec: 1 },
    ],
    particles,
    nearestInteractableId: createMapInteractables(mapId)[0]?.id ?? null,
  };
}

describe("Last Night — Canvas renderer smoke coverage", () => {
  it("renders a busy scene on every medieval map without throwing", () => {
    for (const map of MEDIEVAL_MAPS) {
      const ctx = makeProxyCtx();
      expect(() =>
        renderLastNightArena(ctx, 960, 640, buildBusyScene(map.id)),
      ).not.toThrow();
    }
  });

  it("tolerates empty scenes and missing optional particle layer", () => {
    const ctx = makeProxyCtx();
    const base = buildBusyScene("cursed_village");
    const minimal: RenderSceneState = {
      ...base,
      players: [],
      enemies: [],
      projectiles: [],
      slashes: [],
      lightningArcs: [],
      telegraphs: [],
      floatingTexts: [],
      interactables: [],
      thornTraps: [],
      particles: undefined,
      nearestInteractableId: null,
    };
    expect(() => renderLastNightArena(ctx, 800, 600, minimal)).not.toThrow();
  });
});
