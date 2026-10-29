/**
 * LAST NIGHT — MEDIEVAL SURVIVAL
 * 2D Top-Down Pixel Art Canvas Renderer
 * Strictly medieval survival & dark fantasy visuals (torches, lanterns, stone wells,
 * thatched cottages, graveyards, frozen rivers, catacombs, runes, and bosses).
 */

import { getMapSpec, WORLD_HEIGHT, WORLD_WIDTH } from "./catalog";
import type {
  SimEnemy,
  SimFloatingText,
  SimInteractable,
  SimLightningArc,
  SimMeleeSlash,
  SimParticle,
  SimProjectile,
  SimTelegraphZone,
  SimThornTrap,
} from "./simulation";
import type { MedievalMapId, MedievalWeaponId } from "@/types/lastNight";

export interface RenderPlayerActor {
  seat: number;
  name: string;
  isLocal: boolean;
  /** local | ally (remote knight) | squire (AI companion) — drives minimap colors. */
  role?: "ally" | "squire";
  x: number;
  y: number;
  aimAngle: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  downed: boolean;
  equippedWeapon: MedievalWeaponId;
  hasLantern: boolean;
  protectionActive: boolean;
  protectiveCharmActive: boolean;
  shadowsActive: boolean;
  fireOilActive: boolean;
  spiritActive: boolean;
  reloadingProgress: number | null; // 0..1 when reloading firearm
}

export interface RenderSceneState {
  mapId: MedievalMapId;
  wave: number;
  timeSec: number;
  players: RenderPlayerActor[];
  enemies: SimEnemy[];
  projectiles: SimProjectile[];
  thornTraps: SimThornTrap[];
  interactables: SimInteractable[];
  slashes: SimMeleeSlash[];
  lightningArcs: SimLightningArc[];
  telegraphs: SimTelegraphZone[];
  floatingTexts: SimFloatingText[];
  particles?: SimParticle[];
  nearestInteractableId: string | null;
}

export function renderLastNightArena(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: RenderSceneState,
): void {
  const mapSpec = getMapSpec(scene.mapId);
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const scaleX = width / WORLD_WIDTH;
  const scaleY = height / WORLD_HEIGHT;
  ctx.scale(scaleX, scaleY);

  // 1. Base ground & pixel-art tile grid
  ctx.fillStyle = mapSpec.groundPalette.base;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const tileSize = 32;
  ctx.fillStyle = mapSpec.groundPalette.accent;
  for (let gx = 0; gx < WORLD_WIDTH; gx += tileSize) {
    for (let gy = 0; gy < WORLD_HEIGHT; gy += tileSize) {
      const hash = ((gx * 31 + gy * 17) >>> 0) % 7;
      if (hash === 0 || hash === 3) {
        ctx.fillRect(gx + 2, gy + 2, tileSize - 4, tileSize - 4);
      }
    }
  }

  // 1.5 Deterministic ground scatter (grass, pebbles, bones, rubble, snow drifts)
  drawGroundDecor(ctx, scene.mapId);

  // 2. Map-specific roads, rivers, bridges & landmarks
  drawMapRoadsAndWater(ctx, scene.mapId, mapSpec.groundPalette.road);
  for (const lm of mapSpec.landmarks) {
    drawMedievalLandmark(ctx, lm);
  }

  // 2.5 Low ground fog drifting through villages & crypts
  drawGroundFog(ctx, scene.mapId, scene.timeSec);

  // 3. Thorn traps on ground
  for (const trap of scene.thornTraps) {
    ctx.save();
    ctx.translate(trap.x, trap.y);
    ctx.fillStyle = "#3f2e1e";
    ctx.beginPath();
    ctx.arc(0, 0, trap.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a3e635";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
      ctx.lineTo(Math.cos(a) * (trap.radius - 2), Math.sin(a) * (trap.radius - 2));
      ctx.stroke();
    }
    ctx.restore();
  }

  // 4. Boss telegraph warning zones (pulse fill + rotating dashed impact ring)
  for (const tg of scene.telegraphs) {
    const pulse = 0.32 + 0.22 * Math.sin(scene.timeSec * 14);
    const urgency =
      1 - Math.max(0, Math.min(1, tg.ttlSec / Math.max(0.001, tg.maxTtlSec)));
    ctx.save();
    if (tg.kind === "circle") {
      ctx.fillStyle = `rgba(220, 38, 38, ${pulse * (0.55 + 0.45 * urgency)})`;
      ctx.strokeStyle = "rgba(248, 113, 113, 0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tg.x, tg.y, tg.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Rotating dashed inner ring communicates "impact incoming".
      ctx.strokeStyle = "rgba(254, 226, 226, 0.8)";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -scene.timeSec * 46;
      ctx.beginPath();
      ctx.arc(tg.x, tg.y, Math.max(6, tg.radius * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#fee2e2";
      ctx.font = "bold 15px Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!", tg.x, tg.y + 5);
    } else if (tg.kind === "line" && tg.x2 !== undefined && tg.y2 !== undefined) {
      ctx.strokeStyle = `rgba(239, 68, 68, ${pulse + 0.25})`;
      ctx.lineWidth = tg.radius * 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tg.x, tg.y);
      ctx.lineTo(tg.x2, tg.y2);
      ctx.stroke();
      // Dashed lane borders so the charge path reads clearly at a glance.
      const laneAngle = Math.atan2(tg.y2 - tg.y, tg.x2 - tg.x);
      const nx = Math.cos(laneAngle + Math.PI / 2) * tg.radius;
      const ny = Math.sin(laneAngle + Math.PI / 2) * tg.radius;
      ctx.strokeStyle = "rgba(254, 226, 226, 0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 9]);
      ctx.lineDashOffset = -scene.timeSec * 52;
      ctx.beginPath();
      ctx.moveTo(tg.x - nx, tg.y - ny);
      ctx.lineTo(tg.x2 - nx, tg.y2 - ny);
      ctx.moveTo(tg.x + nx, tg.y + ny);
      ctx.lineTo(tg.x2 + nx, tg.y2 + ny);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // 5. Map interactables (Torches, Locked Chests, Cursed Eggs, Runes, Relics, Gates)
  for (const item of scene.interactables) {
    drawInteractable(
      ctx,
      item,
      scene.timeSec,
      item.id === scene.nearestInteractableId,
    );
  }

  // 6. Enemies & Bosses
  for (const enemy of scene.enemies) {
    drawEnemyOrBoss(ctx, enemy, scene.timeSec);
  }

  // 7. Players & Summoned Friendly Spirits
  for (const player of scene.players) {
    drawPlayerActor(ctx, player, scene.timeSec);
  }

  // 8. Projectiles & Spell Orbs (motion trail + glow core)
  for (const proj of scene.projectiles) {
    ctx.save();
    const heading = Math.atan2(proj.vy, proj.vx);
    const trailLen = Math.min(46, Math.hypot(proj.vx, proj.vy) * 0.05);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = proj.color;
    ctx.lineWidth = proj.radius * 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(
      proj.x - Math.cos(heading) * trailLen,
      proj.y - Math.sin(heading) * trailLen,
    );
    ctx.lineTo(proj.x, proj.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.translate(proj.x, proj.y);
    ctx.shadowColor = proj.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = proj.color;
    ctx.beginPath();
    ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.4, proj.radius * 0.4), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 9. Melee weapon slashes — sweeping arc that opens with the swing
  for (const slash of scene.slashes) {
    const life = Math.max(0, Math.min(1, slash.ttlSec / 0.16));
    const sweep = 0.55 + 0.45 * (1 - life);
    const start = slash.angle - slash.arcRad / 2;
    const end = start + slash.arcRad * sweep;
    ctx.save();
    ctx.translate(slash.x, slash.y);
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.35 + 0.65 * life;
    ctx.strokeStyle = slash.color;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, slash.range * 0.72, start, end);
    ctx.stroke();
    ctx.globalAlpha = (0.35 + 0.65 * life) * 0.9;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, slash.range * 0.78, start + 0.08, end);
    ctx.stroke();
    ctx.restore();
  }

  // 10. Book of Lightning chain arcs
  for (const arc of scene.lightningArcs) {
    if (arc.points.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 3.5;
    ctx.shadowColor = "#facc15";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(arc.points[0].x, arc.points[0].y);
    for (let i = 1; i < arc.points.length; i++) {
      const p = arc.points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 11. Medieval Darkness & Torch/Lantern Dynamic Lighting Overlay
  drawMedievalNightLighting(ctx, scene, mapSpec.ambientDarkness);

  // 11.5 Combat particles (sparks & death poofs) glow through the darkness
  if (scene.particles && scene.particles.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of scene.particles) {
      const lifeK = Math.max(
        0,
        Math.min(1, p.lifeSec / Math.max(0.001, p.maxLifeSec)),
      );
      ctx.globalAlpha = lifeK;
      ctx.fillStyle = p.color;
      const size = Math.max(1, p.size * (0.4 + 0.6 * lifeK));
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.restore();
  }

  // 12. Floating combat & reward text (pop-in scale, crisp outlined readability)
  for (const ft of scene.floatingTexts) {
    ctx.save();
    const pop = 1 + 0.3 * Math.max(0, Math.min(1, ft.ttlSec / 0.75));
    ctx.translate(ft.x, ft.y);
    ctx.scale(pop, pop);
    ctx.font = "bold 14px Tahoma, monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.strokeText(ft.text, 0, 0);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }

  // 13. Foreground weather (snowfall, fireflies & leaves, embers & dust motes)
  drawForegroundWeather(ctx, scene.mapId, scene.timeSec);

  ctx.restore();

  // 14. Corner minimap (screen space) for tactical awareness
  drawMinimap(ctx, width, scene);
}

function drawMapRoadsAndWater(
  ctx: CanvasRenderingContext2D,
  mapId: MedievalMapId,
  roadColor: string,
): void {
  ctx.save();
  ctx.fillStyle = roadColor;

  if (mapId === "cursed_village") {
    // Central crossroad & northern gate road
    ctx.fillRect(605, 70, 70, 580);
    ctx.fillRect(140, 325, 1000, 68);
  } else if (mapId === "cursed_forest") {
    // Winding forest path + dark stream
    ctx.fillRect(100, 330, 1080, 62);
    ctx.fillStyle = "#0f2937";
    ctx.fillRect(495, 0, 55, WORLD_HEIGHT);
    // Wooden bridge planks
    ctx.fillStyle = "#6b4423";
    ctx.fillRect(485, 322, 75, 78);
  } else if (mapId === "snowy_forest") {
    // Frozen river across middle + stone bridge
    ctx.fillStyle = "#7dd3fc";
    ctx.fillRect(0, 330, WORLD_WIDTH, 68);
    ctx.fillStyle = roadColor;
    ctx.fillRect(580, 315, 120, 96);
  } else if (mapId === "ancient_catacombs") {
    // Underground stone halls
    ctx.fillRect(90, 320, 1100, 80);
    ctx.fillRect(590, 80, 100, 560);
  }

  ctx.restore();
}

function drawMedievalLandmark(
  ctx: CanvasRenderingContext2D,
  lm: {
    x: number;
    y: number;
    width: number;
    height: number;
    kind: string;
    nameFa: string;
  },
): void {
  ctx.save();

  switch (lm.kind) {
    case "safehouse":
    case "cottage":
    case "blacksmith":
    case "witch_shop":
    case "mill":
      // Stone foundation + timber roof
      ctx.fillStyle = "#292018";
      ctx.fillRect(lm.x, lm.y, lm.width, lm.height);
      ctx.fillStyle =
        lm.kind === "witch_shop"
          ? "#3b1d4a"
          : lm.kind === "blacksmith"
            ? "#4a2518"
            : "#4d3522";
      ctx.fillRect(lm.x + 6, lm.y + 6, lm.width - 12, lm.height - 12);
      ctx.strokeStyle = "#785536";
      ctx.lineWidth = 3;
      ctx.strokeRect(lm.x, lm.y, lm.width, lm.height);
      // Warm candle window
      ctx.fillStyle = lm.kind === "witch_shop" ? "#a855f7" : "#f59e0b";
      ctx.fillRect(lm.x + 16, lm.y + 16, 14, 14);
      break;

    case "well":
      ctx.fillStyle = "#4b5563";
      ctx.beginPath();
      ctx.arc(lm.x + lm.width / 2, lm.y + lm.height / 2, lm.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1e3a8a";
      ctx.beginPath();
      ctx.arc(
        lm.x + lm.width / 2,
        lm.y + lm.height / 2,
        lm.width / 2 - 10,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      break;

    case "graveyard":
      ctx.fillStyle = "rgba(17, 24, 39, 0.65)";
      ctx.fillRect(lm.x, lm.y, lm.width, lm.height);
      ctx.strokeStyle = "#4b5563";
      ctx.strokeRect(lm.x, lm.y, lm.width, lm.height);
      // Pixel headstones
      ctx.fillStyle = "#9ca3af";
      for (let gx = lm.x + 24; gx < lm.x + lm.width - 20; gx += 46) {
        for (let gy = lm.y + 26; gy < lm.y + lm.height - 20; gy += 48) {
          ctx.fillRect(gx, gy, 14, 20);
        }
      }
      break;

    case "boss_arena":
    case "shrine":
    case "altar":
      ctx.fillStyle = "rgba(88, 28, 135, 0.22)";
      ctx.fillRect(lm.x, lm.y, lm.width, lm.height);
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 2;
      ctx.strokeRect(lm.x, lm.y, lm.width, lm.height);
      break;

    default:
      ctx.fillStyle = "rgba(31, 41, 55, 0.55)";
      ctx.fillRect(lm.x, lm.y, lm.width, lm.height);
      ctx.strokeStyle = "#6b7280";
      ctx.strokeRect(lm.x, lm.y, lm.width, lm.height);
      break;
  }

  ctx.fillStyle = "rgba(254, 243, 199, 0.82)";
  ctx.font = "11px Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(lm.nameFa, lm.x + lm.width / 2, lm.y + lm.height / 2 + 4);
  ctx.restore();
}

function drawInteractable(
  ctx: CanvasRenderingContext2D,
  item: SimInteractable,
  timeSec: number,
  isNearest: boolean,
): void {
  ctx.save();
  ctx.translate(item.x, item.y);

  const pulse = 1 + 0.08 * Math.sin(timeSec * 6);

  if (!item.activated) {
    // Ground guidance ring — key-locked objectives shimmer gold.
    ctx.strokeStyle = item.requiresKey
      ? "rgba(250, 204, 21, 0.8)"
      : "rgba(226, 232, 240, 0.4)";
    ctx.lineWidth = item.requiresKey ? 2 : 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 10, 17 * pulse, 6.5 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Vertical objective beacon so unfinished tasks stay visible across the map.
    const beamA =
      (item.requiresKey ? 0.16 : 0.1) + 0.06 * Math.sin(timeSec * 3 + item.x * 0.02);
    ctx.fillStyle = item.requiresKey
      ? `rgba(250, 204, 21, ${beamA})`
      : `rgba(148, 163, 184, ${beamA})`;
    ctx.beginPath();
    ctx.moveTo(-7, -6);
    ctx.lineTo(7, -6);
    ctx.lineTo(15, -98);
    ctx.lineTo(-15, -98);
    ctx.closePath();
    ctx.fill();
  }

  if (item.kind === "torch") {
    ctx.fillStyle = "#5c3a21";
    ctx.fillRect(-5, -8, 10, 18);
    if (item.activated) {
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.arc(0, -11, 9 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(0, -11, 5 * pulse, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#6b7280";
      ctx.beginPath();
      ctx.arc(0, -10, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (item.kind === "chest") {
    ctx.fillStyle = item.activated ? "#4b5563" : "#854d0e";
    ctx.fillRect(-14, -10, 28, 20);
    ctx.strokeStyle = item.activated ? "#9ca3af" : "#facc15";
    ctx.lineWidth = 2;
    ctx.strokeRect(-14, -10, 28, 20);
  } else if (item.kind === "egg") {
    ctx.fillStyle = item.activated ? "#374151" : "#65a30d";
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (item.kind === "rune") {
    ctx.strokeStyle = item.activated ? "#38bdf8" : "#64748b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 15 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  } else if (item.kind === "relic") {
    ctx.fillStyle = item.activated ? "#475569" : "#c084fc";
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(13, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(-13, 0);
    ctx.closePath();
    ctx.fill();
  } else if (item.kind === "gate") {
    ctx.fillStyle = item.activated ? "#15803d" : "#374151";
    ctx.fillRect(-22, -12, 44, 24);
    ctx.strokeStyle = "#d1d5db";
    ctx.strokeRect(-22, -12, 44, 24);
  }

  if (!item.activated && isNearest) {
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 12px Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`[E] ${item.labelFa}`, 0, -24);
  }

  ctx.restore();
}

function drawEnemyOrBoss(
  ctx: CanvasRenderingContext2D,
  enemy: SimEnemy,
  timeSec: number,
): void {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);

  // Ground blob shadow (bolder for elites & bosses)
  ctx.fillStyle = enemy.isBoss
    ? "rgba(2, 6, 14, 0.55)"
    : enemy.elite
      ? "rgba(2, 6, 14, 0.45)"
      : "rgba(2, 6, 14, 0.32)";
  ctx.beginPath();
  ctx.ellipse(
    0,
    enemy.radius * 0.66,
    enemy.radius * (enemy.isBoss ? 1.15 : 1.05),
    enemy.radius * 0.42,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Elite (نخبه) rotating champion ring
  if (enemy.elite && !enemy.isBoss) {
    ctx.strokeStyle = "rgba(251, 191, 36, 0.9)";
    ctx.lineWidth = 2.2;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -timeSec * 30;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Boss phase aura
  if (enemy.isBoss) {
    const phaseColor =
      enemy.bossPhase === 3
        ? "rgba(239, 68, 68, 0.35)"
        : enemy.bossPhase === 2
          ? "rgba(245, 158, 11, 0.28)"
          : "rgba(168, 85, 247, 0.22)";
    ctx.fillStyle = phaseColor;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 12 + Math.sin(timeSec * 6) * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distinct pixel-art appendages & silhouettes per monster / boss kind
  if (enemy.kind === "cursed_bat") {
    const wingY = Math.sin(timeSec * 18) * 6;
    ctx.fillStyle = "#3b1d4a";
    ctx.beginPath();
    ctx.moveTo(-enemy.radius - 10, wingY);
    ctx.lineTo(0, -4);
    ctx.lineTo(enemy.radius + 10, wingY);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
  } else if (enemy.kind === "giant_spider") {
    ctx.strokeStyle = "#1f1612";
    ctx.lineWidth = 2.5;
    for (let leg = -1.5; leg <= 1.5; leg += 1) {
      const a = leg * 0.35;
      ctx.beginPath();
      ctx.moveTo(-enemy.radius - 7, Math.sin(a) * 18);
      ctx.lineTo(enemy.radius + 7, -Math.sin(a) * 18);
      ctx.stroke();
    }
  } else if (enemy.kind === "black_wolf") {
    // Wolf ears
    ctx.fillStyle = "#181920";
    ctx.fillRect(-10, -enemy.radius - 5, 5, 7);
    ctx.fillRect(5, -enemy.radius - 5, 5, 7);
  } else if (enemy.kind === "forest_guardian") {
    // Stag antlers & root crown
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-14, -enemy.radius + 4);
    ctx.lineTo(-26, -enemy.radius - 16);
    ctx.moveTo(14, -enemy.radius + 4);
    ctx.lineTo(26, -enemy.radius - 16);
    ctx.stroke();
  } else if (enemy.kind === "ice_giant") {
    // Glacial warhammer in hand & Norse horns
    ctx.fillStyle = "#7dd3fc";
    ctx.fillRect(enemy.radius - 2, -16, 16, 30);
    ctx.strokeStyle = "#e0f2fe";
    ctx.lineWidth = 2;
    ctx.strokeRect(enemy.radius - 2, -16, 16, 30);
  } else if (enemy.kind === "cursed_king") {
    // Golden crown & necrotic runic greatsword
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-14, -enemy.radius - 8, 28, 8);
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(enemy.radius - 4, -22, 8, 44);
  }

  // Main Body
  ctx.fillStyle = enemy.hitFlashSec > 0 ? "#ffffff" : enemy.color;
  ctx.beginPath();
  ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = enemy.accentColor;
  ctx.lineWidth = enemy.isBoss ? 4 : 2;
  ctx.stroke();

  // Shield / staff details for Undead Knight, Skeleton Swordsman & Dark Sorcerer
  if (enemy.kind === "undead_knight" || enemy.kind === "skeleton_swordsman") {
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(-enemy.radius - 4, -7, 6, 14);
  } else if (enemy.kind === "dark_sorcerer") {
    ctx.fillStyle = "#d8b4fe";
    ctx.beginPath();
    ctx.arc(enemy.radius + 3, -6, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes / visor detail
  ctx.fillStyle = enemy.isBoss ? "#fef08a" : "#ef4444";
  ctx.fillRect(-6, -5, 4, 4);
  ctx.fillRect(2, -5, 4, 4);

  // Frozen / Burn status overlays
  if (enemy.frozenSec > 0) {
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 3;
    ctx.strokeRect(-enemy.radius, -enemy.radius, enemy.radius * 2, enemy.radius * 2);
    // Ice crystal spikes over the frozen victim
    ctx.strokeStyle = "#e0f2fe";
    ctx.lineWidth = 2;
    for (let spike = 0; spike < 4; spike++) {
      const sa = (spike * Math.PI) / 2 + 0.6;
      ctx.beginPath();
      ctx.moveTo(
        Math.cos(sa) * enemy.radius * 0.35,
        Math.sin(sa) * enemy.radius * 0.35,
      );
      ctx.lineTo(
        Math.cos(sa) * (enemy.radius + 7),
        Math.sin(sa) * (enemy.radius + 7),
      );
      ctx.stroke();
    }
  }
  if (enemy.burnSec > 0) {
    const flick = 1 + 0.32 * Math.sin(timeSec * 22 + enemy.x * 0.05);
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.ellipse(0, -enemy.radius - 5, 5 * flick, 7 * flick, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.ellipse(
      0,
      -enemy.radius - 4,
      2.6 * flick,
      4 * flick,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Health bar
  const barWidth = enemy.isBoss ? 86 : enemy.elite ? 48 : 36;
  const barHeight = enemy.isBoss ? 7 : enemy.elite ? 5 : 4;
  const hpRatio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(-barWidth / 2, -enemy.radius - 14, barWidth, barHeight);
  ctx.fillStyle = enemy.isBoss
    ? "#a855f7"
    : enemy.elite
      ? "#f59e0b"
      : "#ef4444";
  ctx.fillRect(-barWidth / 2, -enemy.radius - 14, barWidth * hpRatio, barHeight);
  // subtle highlight stripe on the filled portion
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fillRect(
    -barWidth / 2,
    -enemy.radius - 14,
    barWidth * hpRatio,
    Math.max(1, barHeight * 0.3),
  );

  // Elite gold crown marker above the health bar
  if (enemy.elite && !enemy.isBoss) {
    const crownY = -enemy.radius - 24;
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.moveTo(-8, crownY + 5);
    ctx.lineTo(-8, crownY - 2);
    ctx.lineTo(-4, crownY + 2);
    ctx.lineTo(0, crownY - 4);
    ctx.lineTo(4, crownY + 2);
    ctx.lineTo(8, crownY - 2);
    ctx.lineTo(8, crownY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (enemy.isBoss) {
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 12px Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `${enemy.nameFa} (فاز ${enemy.bossPhase ?? 1})`,
      0,
      -enemy.radius - 20,
    );
  }

  ctx.restore();
}

function drawPlayerActor(
  ctx: CanvasRenderingContext2D,
  player: RenderPlayerActor,
  timeSec: number,
): void {
  ctx.save();
  ctx.translate(player.x, player.y);

  // Book of Protection golden ward
  if (player.protectionActive || player.protectiveCharmActive) {
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 + Math.sin(timeSec * 8) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Book of Shadows dark mist
  if (player.shadowsActive) {
    ctx.fillStyle = "rgba(88, 28, 135, 0.45)";
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  // Friendly Spirit companion (Book of Spirits)
  if (player.spiritActive) {
    const sx = Math.cos(timeSec * 3.2) * 38;
    const sy = Math.sin(timeSec * 3.2) * 38;
    ctx.fillStyle = "#67e8f9";
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground shadow & idle bob
  ctx.fillStyle = "rgba(2, 6, 14, 0.42)";
  ctx.beginPath();
  ctx.ellipse(0, 15, 15, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = Math.sin(timeSec * 6 + player.seat * 1.7) * 1.2;

  const bodyColor = player.downed
    ? "#7f1d1d"
    : player.isLocal
      ? "#1d4ed8"
      : "#047857";
  const rimColor = player.isLocal ? "#93c5fd" : "#6ee7b7";

  ctx.save();
  ctx.translate(0, bob * 0.4);

  // Legs
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-8, 8, 6, 8);
  ctx.fillRect(2, 8, 6, 8);

  // Armored torso with seat-colored tabard
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.roundRect(-11, -6, 22, 18, 5);
  ctx.fill();
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
  ctx.fillRect(-2, -6, 4, 18);

  // Steel pauldrons
  ctx.fillStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.arc(-11, -3, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(11, -3, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Equipped weapon in hand
  ctx.save();
  ctx.rotate(player.aimAngle);
  ctx.fillStyle = player.fireOilActive ? "#f97316" : "#d1d5db";
  if (
    player.equippedWeapon === "flintlock_pistol" ||
    player.equippedWeapon === "hunting_musket"
  ) {
    const gunLen = player.equippedWeapon === "hunting_musket" ? 28 : 20;
    ctx.fillStyle = "#78350f";
    ctx.fillRect(10, -3, gunLen, 6);
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(14, -2, gunLen - 2, 4);
  } else if (player.equippedWeapon === "hunter_bow") {
    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(14, 0, 12, -Math.PI / 2.3, Math.PI / 2.3);
    ctx.stroke();
  } else {
    ctx.fillRect(12, -3, 22, 6);
    // steel guard & pommel read as a real blade
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(11, -5, 3, 10);
  }
  ctx.restore();

  // Shield on the off-hand (opposite the aim direction)
  ctx.save();
  const shieldAngle = player.aimAngle + Math.PI;
  ctx.translate(Math.cos(shieldAngle) * 13, Math.sin(shieldAngle) * 12 + 3);
  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.roundRect(-5, -7, 10, 14, 3);
  ctx.fill();
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = rimColor;
  ctx.fillRect(-1.2, -4, 2.4, 8);
  ctx.restore();

  // Helmet with visor slit & flowing plume
  ctx.save();
  ctx.translate(0, bob * 0.5);
  ctx.fillStyle = player.downed ? "#64748b" : "#e2e8f0";
  ctx.beginPath();
  ctx.roundRect(-8, -17, 16, 13, 4);
  ctx.fill();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-5, -13, 10, 3);
  // plume trailing behind the aim direction
  ctx.strokeStyle = player.downed
    ? "#7f1d1d"
    : player.isLocal
      ? "#60a5fa"
      : "#34d399";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.quadraticCurveTo(
    -Math.cos(player.aimAngle) * 9,
    -25,
    -Math.cos(player.aimAngle) * 14,
    -20 + Math.sin(timeSec * 5) * 1.6,
  );
  ctx.stroke();
  ctx.restore();

  // Downed knights pulse a red rescue halo
  if (player.downed) {
    ctx.strokeStyle = `rgba(239, 68, 68, ${0.45 + 0.4 * Math.sin(timeSec * 6)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Name & HP bar
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
  ctx.strokeText(
    player.downed ? `💀 ${player.name} (نیازمند احیا [R])` : player.name,
    0,
    -36,
  );
  ctx.fillText(
    player.downed ? `💀 ${player.name} (نیازمند احیا [R])` : player.name,
    0,
    -36,
  );

  const hpPct = Math.max(0, Math.min(1, player.hp / Math.max(1, player.maxHp)));
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(-20, -31, 40, 5);
  ctx.fillStyle = hpPct > 0.3 ? "#22c55e" : "#ef4444";
  ctx.fillRect(-20, -31, 40 * hpPct, 5);
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fillRect(-20, -31, 40 * hpPct, 1.5);

  if (player.reloadingProgress !== null) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(-20, 22, 40, 5);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-20, 22, 40 * player.reloadingProgress, 5);
  }

  ctx.restore();
}

function drawMedievalNightLighting(
  ctx: CanvasRenderingContext2D,
  scene: RenderSceneState,
  ambientDarkness: number,
): void {
  // Cool night wash over the whole arena
  ctx.save();
  ctx.fillStyle = `rgba(6, 8, 16, ${Math.min(0.45, ambientDarkness * 0.65)})`;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.globalCompositeOperation = "lighter";

  // Knight lanterns — warm halo with a gentle per-seat flicker
  for (const p of scene.players) {
    const flick =
      1 +
      0.035 * Math.sin(scene.timeSec * 8.2 + p.seat * 2.4) +
      0.02 * Math.sin(scene.timeSec * 21 + p.seat);
    const radius = (p.hasLantern ? 240 : 155) * flick;
    const grad = ctx.createRadialGradient(p.x, p.y, 12, p.x, p.y, radius);
    grad.addColorStop(0, "rgba(251, 191, 36, 0.22)");
    grad.addColorStop(1, "rgba(251, 191, 36, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Soft neutral halo keeps melee scrims readable inside the dark
    const inner = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, 76);
    inner.addColorStop(0, "rgba(148, 163, 184, 0.1)");
    inner.addColorStop(1, "rgba(148, 163, 184, 0)");
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 76, 0, Math.PI * 2);
    ctx.fill();
  }

  // Activated torches — per-torch flicker phase so the night feels alive
  for (const item of scene.interactables) {
    if (item.kind === "torch" && item.activated) {
      const flick =
        1 +
        0.07 * Math.sin(scene.timeSec * 9.3 + item.x * 0.37) +
        0.04 * Math.sin(scene.timeSec * 23 + item.y * 0.11);
      const radius = 145 * flick;
      const grad = ctx.createRadialGradient(item.x, item.y, 6, item.x, item.y, radius);
      grad.addColorStop(0, "rgba(249, 115, 22, 0.26)");
      grad.addColorStop(1, "rgba(249, 115, 22, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Cinematic corner vignette
  const vig = ctx.createRadialGradient(
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.38,
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    Math.max(WORLD_WIDTH, WORLD_HEIGHT) * 0.72,
  );
  vig.addColorStop(0, "rgba(0, 0, 0, 0)");
  vig.addColorStop(1, "rgba(2, 4, 10, 0.42)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

/* -------------------------------------------------------------------------- */
/* Atmosphere & Tactical Overlays                                            */
/* -------------------------------------------------------------------------- */

/** Deterministic value hash for stable scatter/weather placement. */
function hash2(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function wrapMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** True when a scatter point would sit on a road / river band (keep paths clear). */
function isOnPath(mapId: MedievalMapId, x: number, y: number): boolean {
  switch (mapId) {
    case "cursed_village":
      return (x > 595 && x < 690) || (y > 313 && y < 402);
    case "cursed_forest":
      return (x > 487 && x < 558) || (y > 322 && y < 400);
    case "snowy_forest":
      return y > 322 && y < 406 && !(x > 570 && x < 710);
    case "ancient_catacombs":
      return (y > 312 && y < 408) || (x > 582 && x < 698);
  }
}

/** Deterministic ground scatter — grass, pebbles, bones, drifts, rubble. */
function drawGroundDecor(ctx: CanvasRenderingContext2D, mapId: MedievalMapId): void {
  const cell = 54;
  ctx.save();
  for (let gx = 0; gx < WORLD_WIDTH; gx += cell) {
    for (let gy = 0; gy < WORLD_HEIGHT; gy += cell) {
      if (hash2(gx, gy) < 0.58) continue;
      const px = gx + Math.floor(hash2(gx + 7, gy) * cell);
      const py = gy + Math.floor(hash2(gx, gy + 13) * cell);
      if (isOnPath(mapId, px, py)) continue;
      const kind = hash2(gx + 31, gy + 17);

      if (mapId === "cursed_village") {
        if (kind < 0.55) {
          ctx.strokeStyle = "rgba(96, 148, 78, 0.85)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - 3, py - 7);
          ctx.moveTo(px + 2, py);
          ctx.lineTo(px + 3, py - 8);
          ctx.moveTo(px + 4, py);
          ctx.lineTo(px + 7, py - 6);
          ctx.stroke();
        } else if (kind < 0.8) {
          ctx.fillStyle = "rgba(120, 126, 138, 0.75)";
          ctx.fillRect(px, py, 5, 4);
          ctx.fillStyle = "rgba(150, 156, 168, 0.6)";
          ctx.fillRect(px, py, 3, 2);
        } else {
          ctx.strokeStyle = "rgba(214, 211, 200, 0.55)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px - 5, py + 2);
          ctx.lineTo(px + 5, py - 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px - 5, py + 2, 2.2, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (mapId === "cursed_forest") {
        if (kind < 0.5) {
          ctx.strokeStyle = "rgba(64, 120, 58, 0.9)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - 3, py - 8);
          ctx.moveTo(px + 3, py);
          ctx.lineTo(px + 5, py - 6);
          ctx.stroke();
        } else if (kind < 0.76) {
          ctx.fillStyle = "#d6d3d1";
          ctx.fillRect(px - 1, py - 2, 3, 5);
          ctx.fillStyle = kind < 0.63 ? "#dc2626" : "#ca8a04";
          ctx.beginPath();
          ctx.ellipse(px + 0.5, py - 3, 5, 3.2, 0, Math.PI, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "rgba(180, 83, 9, 0.75)";
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(hash2(gx + 3, gy + 5) * Math.PI);
          ctx.beginPath();
          ctx.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (mapId === "snowy_forest") {
        if (kind < 0.5) {
          ctx.fillStyle = "rgba(241, 245, 249, 0.55)";
          ctx.beginPath();
          ctx.ellipse(px, py, 11 + kind * 14, 4.5 + kind * 4, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind < 0.78) {
          ctx.strokeStyle = "rgba(226, 232, 240, 0.8)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + 3, py - 8);
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(71, 85, 105, 0.7)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px - 5, py);
          ctx.lineTo(px + 6, py - 3);
          ctx.stroke();
        }
      } else {
        // ancient_catacombs — rubble, cracks & dust piles
        if (kind < 0.5) {
          ctx.fillStyle = "rgba(75, 85, 99, 0.7)";
          ctx.fillRect(px, py, 6, 5);
          ctx.fillStyle = "rgba(107, 114, 128, 0.6)";
          ctx.fillRect(px, py, 4, 2);
        } else if (kind < 0.78) {
          ctx.strokeStyle = "rgba(15, 10, 8, 0.55)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(px - 7, py - 2);
          ctx.lineTo(px - 2, py + 2);
          ctx.lineTo(px + 3, py - 3);
          ctx.lineTo(px + 8, py + 1);
          ctx.stroke();
        } else {
          ctx.fillStyle = "rgba(120, 110, 96, 0.4)";
          ctx.beginPath();
          ctx.ellipse(px, py, 9, 3.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}

/** Ground-level fog wisps for villages, forests & crypts. */
function drawGroundFog(
  ctx: CanvasRenderingContext2D,
  mapId: MedievalMapId,
  timeSec: number,
): void {
  if (mapId !== "cursed_village" && mapId !== "ancient_catacombs") return;
  ctx.save();
  ctx.globalAlpha = mapId === "ancient_catacombs" ? 0.15 : 0.11;
  for (let i = 0; i < 5; i++) {
    const baseX = wrapMod(
      hash2(i, 3) * WORLD_WIDTH + timeSec * (14 + i * 5),
      WORLD_WIDTH + 300,
    ) - 150;
    const baseY =
      90 + hash2(i, 11) * (WORLD_HEIGHT - 160) + Math.sin(timeSec * 0.5 + i) * 18;
    ctx.fillStyle = mapId === "ancient_catacombs" ? "#94a3b8" : "#cbd5e1";
    ctx.beginPath();
    ctx.ellipse(baseX, baseY, 110 + i * 22, 26 + i * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Foreground weather drawn above the darkness: snow, fireflies, leaves, embers. */
function drawForegroundWeather(
  ctx: CanvasRenderingContext2D,
  mapId: MedievalMapId,
  timeSec: number,
): void {
  ctx.save();
  if (mapId === "snowy_forest") {
    for (let i = 0; i < 70; i++) {
      const speed = 26 + hash2(i, 5) * 46;
      const x = wrapMod(
        hash2(i, 1) * WORLD_WIDTH +
          Math.sin(timeSec * (0.6 + hash2(i, 9)) + i) * 34,
        WORLD_WIDTH,
      );
      const y = wrapMod(hash2(i, 2) * WORLD_HEIGHT + timeSec * speed, WORLD_HEIGHT);
      const rr = 1.2 + hash2(i, 4) * 2.1;
      ctx.globalAlpha = 0.35 + hash2(i, 7) * 0.55;
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mapId === "cursed_forest") {
    // Fireflies / will-o'-wisps
    for (let i = 0; i < 26; i++) {
      const x = wrapMod(
        hash2(i, 13) * WORLD_WIDTH +
          Math.sin(timeSec * (0.35 + hash2(i, 6) * 0.5) + i * 2.1) * 60,
        WORLD_WIDTH,
      );
      const y = wrapMod(
        hash2(i, 17) * WORLD_HEIGHT +
          Math.cos(timeSec * (0.3 + hash2(i, 8) * 0.4) + i) * 40,
        WORLD_HEIGHT,
      );
      ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(timeSec * 2.2 + i * 1.4));
      ctx.fillStyle = i % 3 === 0 ? "#fde68a" : "#86efac";
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // Falling leaves
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#b45309";
    for (let i = 0; i < 10; i++) {
      const x = wrapMod(hash2(i, 23) * WORLD_WIDTH + timeSec * (18 + i * 2), WORLD_WIDTH);
      const y = wrapMod(
        hash2(i, 29) * WORLD_HEIGHT + timeSec * (34 + i * 3),
        WORLD_HEIGHT,
      );
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(timeSec * 1.6 + i);
      ctx.fillRect(-3, -1.6, 6, 3.2);
      ctx.restore();
    }
  } else if (mapId === "ancient_catacombs") {
    for (let i = 0; i < 34; i++) {
      const x = wrapMod(
        hash2(i, 31) * WORLD_WIDTH + Math.sin(timeSec * 0.4 + i) * 26,
        WORLD_WIDTH,
      );
      const y = wrapMod(
        hash2(i, 37) * WORLD_HEIGHT - timeSec * (7 + hash2(i, 41) * 12),
        WORLD_HEIGHT,
      );
      ctx.globalAlpha = 0.16 + 0.3 * Math.abs(Math.sin(timeSec + i));
      ctx.fillStyle = i % 4 === 0 ? "#fb923c" : "#cbd5e1";
      ctx.fillRect(x, y, 2, 2);
    }
  } else {
    // cursed_village — hearth ash & drifting embers
    for (let i = 0; i < 20; i++) {
      const x = wrapMod(
        hash2(i, 43) * WORLD_WIDTH + Math.sin(timeSec * 0.5 + i * 1.7) * 30,
        WORLD_WIDTH,
      );
      const y = wrapMod(
        hash2(i, 47) * WORLD_HEIGHT - timeSec * (10 + hash2(i, 53) * 16),
        WORLD_HEIGHT,
      );
      ctx.globalAlpha = 0.14 + 0.3 * Math.abs(Math.sin(timeSec * 1.4 + i));
      ctx.fillStyle = i % 5 === 0 ? "#f97316" : "#94a3b8";
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.restore();
}

/** Screen-space corner minimap: players, monsters & unfinished objectives. */
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  width: number,
  scene: RenderSceneState,
): void {
  const mapW = 172;
  const mapH = 118;
  const x0 = width - mapW - 12;
  const y0 = 12;
  const sx = mapW / WORLD_WIDTH;
  const sy = mapH / WORLD_HEIGHT;

  ctx.save();
  ctx.fillStyle = "rgba(8, 8, 16, 0.78)";
  ctx.fillRect(x0, y0, mapW, mapH);
  ctx.strokeStyle = "rgba(229, 169, 60, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, mapW - 1, mapH - 1);

  // Solid landmarks
  const mapSpec = getMapSpec(scene.mapId);
  ctx.fillStyle = "rgba(148, 163, 184, 0.32)";
  for (const lm of mapSpec.landmarks) {
    if (!lm.solid) continue;
    ctx.fillRect(
      x0 + lm.x * sx,
      y0 + lm.y * sy,
      Math.max(2, lm.width * sx),
      Math.max(2, lm.height * sy),
    );
  }

  // Unfinished objectives — gold
  ctx.fillStyle = "#facc15";
  for (const item of scene.interactables) {
    if (item.activated) continue;
    ctx.fillRect(x0 + item.x * sx - 1.5, y0 + item.y * sy - 1.5, 3.4, 3.4);
  }

  // Enemies
  for (const e of scene.enemies) {
    const ex = x0 + e.x * sx;
    const ey = y0 + e.y * sy;
    if (e.isBoss) {
      const r = 4 + Math.sin(scene.timeSec * 6) * 1.2;
      ctx.fillStyle = "#d946ef";
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f0abfc";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = e.elite ? "#fb923c" : "#ef4444";
      ctx.fillRect(ex - 1.7, ey - 1.7, 3.4, 3.4);
    }
  }

  // Players / companions
  for (const p of scene.players) {
    const px = x0 + p.x * sx;
    const py = y0 + p.y * sy;
    ctx.fillStyle = p.isLocal
      ? "#4ade80"
      : p.role === "squire"
        ? "#94a3b8"
        : "#38bdf8";
    ctx.beginPath();
    ctx.arc(px, py, p.isLocal ? 3.4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (p.isLocal) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.restore();
}
