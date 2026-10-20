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
  SimProjectile,
  SimTelegraphZone,
  SimThornTrap,
} from "./simulation";
import type { MedievalMapId, MedievalWeaponId } from "@/types/lastNight";

export interface RenderPlayerActor {
  seat: number;
  name: string;
  isLocal: boolean;
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

  // 2. Map-specific roads, rivers, bridges & landmarks
  drawMapRoadsAndWater(ctx, scene.mapId, mapSpec.groundPalette.road);
  for (const lm of mapSpec.landmarks) {
    drawMedievalLandmark(ctx, lm);
  }

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

  // 4. Boss telegraph warning zones
  for (const tg of scene.telegraphs) {
    const pulse = 0.3 + 0.25 * Math.sin(scene.timeSec * 14);
    ctx.save();
    if (tg.kind === "circle") {
      ctx.fillStyle = `rgba(220, 38, 38, ${pulse})`;
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tg.x, tg.y, tg.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (tg.kind === "line" && tg.x2 !== undefined && tg.y2 !== undefined) {
      ctx.strokeStyle = `rgba(239, 68, 68, ${pulse + 0.25})`;
      ctx.lineWidth = tg.radius * 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tg.x, tg.y);
      ctx.lineTo(tg.x2, tg.y2);
      ctx.stroke();
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

  // 8. Projectiles & Spell Orbs
  for (const proj of scene.projectiles) {
    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.fillStyle = proj.color;
    ctx.beginPath();
    ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  // 9. Melee weapon slashes
  for (const slash of scene.slashes) {
    ctx.save();
    ctx.translate(slash.x, slash.y);
    ctx.strokeStyle = slash.color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      slash.range * 0.72,
      slash.angle - slash.arcRad / 2,
      slash.angle + slash.arcRad / 2,
    );
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

  // 12. Floating combat & reward text (drawn above darkness for crisp readability)
  for (const ft of scene.floatingTexts) {
    ctx.save();
    ctx.font = "bold 14px Tahoma, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#000000";
    ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore();
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
  }
  if (enemy.burnSec > 0) {
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(0, -enemy.radius - 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Health bar
  const barWidth = enemy.isBoss ? 86 : 36;
  const barHeight = enemy.isBoss ? 7 : 4;
  const hpRatio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(-barWidth / 2, -enemy.radius - 14, barWidth, barHeight);
  ctx.fillStyle = enemy.isBoss ? "#a855f7" : "#ef4444";
  ctx.fillRect(-barWidth / 2, -enemy.radius - 14, barWidth * hpRatio, barHeight);

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

  // Survivor body
  ctx.fillStyle = player.downed
    ? "#7f1d1d"
    : player.isLocal
      ? "#2563eb"
      : "#059669";
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = player.isLocal ? "#93c5fd" : "#6ee7b7";
  ctx.lineWidth = 2.5;
  ctx.stroke();

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
  }
  ctx.restore();

  // Name & HP bar
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Tahoma, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    player.downed ? `💀 ${player.name} (نیازمند احیا [R])` : player.name,
    0,
    -28,
  );

  const hpPct = Math.max(0, Math.min(1, player.hp / Math.max(1, player.maxHp)));
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(-20, -23, 40, 5);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(-20, -23, 40 * hpPct, 5);

  if (player.reloadingProgress !== null) {
    ctx.fillStyle = "#facc15";
    ctx.fillRect(-20, 22, 40 * player.reloadingProgress, 4);
  }

  ctx.restore();
}

function drawMedievalNightLighting(
  ctx: CanvasRenderingContext2D,
  scene: RenderSceneState,
  ambientDarkness: number,
): void {
  // Subtle atmospheric vignette & torchlight halos
  ctx.save();
  ctx.fillStyle = `rgba(6, 8, 16, ${Math.min(0.45, ambientDarkness * 0.65)})`;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.globalCompositeOperation = "lighter";
  for (const p of scene.players) {
    const radius = p.hasLantern ? 240 : 155;
    const grad = ctx.createRadialGradient(p.x, p.y, 12, p.x, p.y, radius);
    grad.addColorStop(0, "rgba(251, 191, 36, 0.22)");
    grad.addColorStop(1, "rgba(251, 191, 36, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const item of scene.interactables) {
    if (item.kind === "torch" && item.activated) {
      const grad = ctx.createRadialGradient(item.x, item.y, 6, item.x, item.y, 145);
      grad.addColorStop(0, "rgba(249, 115, 22, 0.26)");
      grad.addColorStop(1, "rgba(249, 115, 22, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 145, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
