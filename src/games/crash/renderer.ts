/**
 * Cinematic Sheriff Blast canvas — one shared live chart for every client.
 *
 * Layers, back → front:
 *   atmosphere (nebula, stars, vignette) → grid + axis → ghost of last round →
 *   milestone flashes → filled curve → heat-gradient stroke → target/marker
 *   flags → comet head + embers → crash burst (flash, shockwaves, sparks, smoke)
 *
 * All geometry is a pure function of the shared timestamps supplied by the
 * frame, so every device draws the exact same curve at the same instant.
 */

import { elapsedAt, multiplierAt, smoothMultiplierAt } from "./math";

export type CrashMarker = { at: number; label: string; mine: boolean };

export type CrashFrame =
  | {
      kind: "betting";
      closesInMs: number;
      bettingMs: number;
      lastCrash: number | null;
      players?: number;
    }
  | { kind: "flying"; elapsedMs: number; targets?: CrashMarker[]; markers?: CrashMarker[] }
  | {
      kind: "crashed";
      elapsedMs: number;
      crashPoint: number;
      sinceCrashMs: number;
      nextInMs: number;
      targets?: CrashMarker[];
      markers?: CrashMarker[];
    };

type Star = { x: number; y: number; z: number; tw: number };
type Ember = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; hot: boolean };
type Burst = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
type Smoke = { x: number; y: number; r: number; vy: number; life: number; max: number };

const COLORS = {
  background: "#0c1018",
  grid: "rgba(229, 169, 60, 0.07)",
  gridStrong: "rgba(229, 169, 60, 0.13)",
  label: "rgba(154, 163, 182, 0.55)",
  labelBright: "rgba(232, 217, 178, 0.85)",
  crash: "#ff6577",
  gold: "#e5a93c",
  goldDeep: "#b9832a",
  goldHot: "#f2c464",
  ember: "#ff8a4c",
  green: "#39c98a",
} as const;

const PAD = { left: 54, right: 26, top: 18, bottom: 30 };
const SEGMENTS = 128;

/** Multiplier milestones (hundredths) that flash a line when crossed. */
const MILESTONES = [
  150, 200, 300, 500, 1000, 1500, 2000, 3000, 5000, 10_000, 15_000, 20_000, 50_000, 100_000,
];

function smoothMax(a: number, b: number, w: number): number {
  return (a + b + Math.sqrt((a - b) * (a - b) + w * w)) / 2;
}

function extents(elapsedS: number, multiple: number) {
  const t = Math.max(0, elapsedS);
  return {
    xMaxS: smoothMax(8, t * 1.12 + 1.1, 1),
    yMax: smoothMax(2, multiple * 1.16 + 0.12, 0.4),
  };
}

function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const base = 10 ** exponent;
  for (const m of [1, 2, 2.5, 5, 10]) if (m * base >= raw) return m * base;
  return 10 * base;
}

function multiplierTicks(max: number): number[] {
  const step = niceStep((max - 1) / 5);
  const ticks: number[] = [];
  for (let v = Math.floor(1 / step + 1) * step; v < max; v += step) ticks.push(Number(v.toFixed(2)));
  return ticks;
}

function timeTicks(maxS: number): number[] {
  const step = niceStep(maxS / 6);
  const ticks: number[] = [];
  for (let v = step; v < maxS; v += step) ticks.push(Number(v.toFixed(1)));
  return ticks;
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function heatColor(hundredths: number): string {
  if (hundredths < 150) return COLORS.gold;
  if (hundredths < 250) return COLORS.goldHot;
  if (hundredths < 500) return "#ffb347";
  if (hundredths < 1000) return COLORS.ember;
  return "#ff6b5a";
}

function isReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export class CrashRenderer {
  private width = 0;
  private height = 0;
  private dpr = 1;
  private stars: Star[] = [];
  private embers: Ember[] = [];
  private burst: Burst[] = [];
  private smoke: Smoke[] = [];
  private lastKind: CrashFrame["kind"] | null = null;
  private lastHead: { x: number; y: number } | null = null;
  private reduced = false;
  private clock = 0;
  private spin = 0;
  /** Smoothed camera so axes never jump between frames. */
  private view = { xMaxS: 8, yMax: 2 };
  /** Faded replay of the previous round shown during the betting window. */
  private ghost: { elapsedMs: number; point: number } | null = null;
  private milestone: { value: number; t0: number } | null = null;
  private lastMilestoneSeen = 0;
  private flashRed = 0;

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    this.reduced = isReducedMotion();
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.width = cssWidth;
    this.height = cssHeight;
    this.dpr = dpr;
    this.seedStars();
  }

  draw(frame: CrashFrame): number | null {
    const { ctx } = this;
    this.clock = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.spin += 0.03;

    if (frame.kind !== this.lastKind) {
      if (frame.kind === "betting") {
        if (this.lastKind === "crashed" && this.lastCrashInfo) this.ghost = this.lastCrashInfo;
        this.embers = [];
        this.burst = [];
        this.smoke = [];
        this.lastHead = null;
        this.milestone = null;
        this.lastMilestoneSeen = 0;
        this.flashRed = 0;
      }
      if (frame.kind === "flying") {
        this.ghost = null;
        this.milestone = null;
        this.lastMilestoneSeen = 0;
      }
      if (frame.kind === "crashed" && this.lastHead) this.ignite(this.lastHead.x, this.lastHead.y);
      this.lastKind = frame.kind;
    }

    const shake =
      !this.reduced && frame.kind === "crashed" && frame.sinceCrashMs < 420
        ? (1 - frame.sinceCrashMs / 420) * 7
        : 0;
    const ox = shake ? (Math.random() - 0.5) * shake : 0;
    const oy = shake ? (Math.random() - 0.5) * shake : 0;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    this.atmosphere(frame, ox, oy);

    if (frame.kind === "betting") {
      const view = this.camera(0, 1);
      this.grid(view, ox, oy);
      this.drawGhost(view, ox, oy);
      this.waitingCraft(frame, ox, oy);
      return null;
    }

    if (frame.kind === "flying") {
      const shown = multiplierAt(frame.elapsedMs);
      const view = this.camera(Math.max(0, frame.elapsedMs) / 1000, shown / 100);
      const head = this.plot(frame.elapsedMs, heatColor(shown), false, ox, oy, view);
      this.trackMilestone(shown);
      this.drawMilestoneFlash(ox, oy);
      this.drawTargets(frame.targets, ox, oy);
      this.drawMarkers(frame.markers, ox, oy);
      this.lastHead = head;
      this.spawnEmbers(head, shown);
      this.drawEmbers();
      this.craft(head.x, head.y, head.angle, heatColor(shown), shown);
      return shown;
    }

    const crashMultiple = frame.crashPoint / 100;
    const crashView = this.camera(Math.max(0, frame.elapsedMs) / 1000, crashMultiple);
    const head = this.plot(frame.elapsedMs, COLORS.crash, true, ox, oy, crashView);
    this.drawMarkers(frame.markers, ox, oy);
    this.lastHead = head;
    this.lastCrashInfo = { elapsedMs: frame.elapsedMs, point: frame.crashPoint };
    this.drawEmbers(0.92);
    this.explosion(head.x, head.y, frame.sinceCrashMs);
    this.flashRed = Math.max(0, 1 - frame.sinceCrashMs / 1600);
    return frame.crashPoint;
  }

  private lastCrashInfo: { elapsedMs: number; point: number } | null = null;

  private camera(elapsedS: number, multiple: number): { xMaxS: number; yMax: number } {
    const target = extents(elapsedS, multiple);
    const k = this.reduced ? 1 : 0.14;
    this.view.xMaxS += (target.xMaxS - this.view.xMaxS) * k;
    this.view.yMax += (target.yMax - this.view.yMax) * k;
    return this.view;
  }

  private seedStars(): void {
    const count = this.reduced ? 24 : 96;
    this.stars = Array.from({ length: count }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      z: 0.25 + Math.random() * 0.75,
      tw: Math.random() * Math.PI * 2 + i,
    }));
  }

  private atmosphere(frame: CrashFrame, ox: number, oy: number): void {
    const { ctx } = this;
    const heat =
      frame.kind === "flying"
        ? Math.min(1, (multiplierAt(frame.elapsedMs) - 100) / 900)
        : frame.kind === "crashed"
          ? 0.85 * this.flashRed + 0.15
          : 0;
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, "#121826");
    g.addColorStop(0.55, COLORS.background);
    g.addColorStop(1, "#080b11");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    const t = this.clock / 1000;

    // Drifting nebula blobs — slow parallax, phase-tinted.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const blobA = ctx.createRadialGradient(
      this.width * (0.24 + 0.04 * Math.sin(t * 0.11)) + ox,
      this.height * (0.3 + 0.05 * Math.cos(t * 0.09)) + oy,
      8,
      this.width * 0.28,
      this.height * 0.34,
      Math.max(this.width, this.height) * 0.55,
    );
    blobA.addColorStop(0, `rgba(229, 169, 60, ${0.045 + heat * 0.1})`);
    blobA.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = blobA;
    ctx.fillRect(0, 0, this.width, this.height);
    const blobB = ctx.createRadialGradient(
      this.width * (0.78 - 0.05 * Math.cos(t * 0.08)) + ox,
      this.height * (0.62 + 0.04 * Math.sin(t * 0.1)) + oy,
      10,
      this.width * 0.72,
      this.height * 0.6,
      Math.max(this.width, this.height) * 0.5,
    );
    blobB.addColorStop(0, `rgba(255, 101, 119, ${frame.kind === "crashed" ? 0.14 * this.flashRed + 0.03 : 0.04})`);
    blobB.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = blobB;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    // Stars
    ctx.save();
    for (const s of this.stars) {
      const drift = frame.kind === "betting" ? t * 0.012 : t * (0.02 + s.z * 0.04);
      const x = ((s.x + drift) % 1) * this.width;
      const y = s.y * this.height * 0.92;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.4 + s.z) + s.tw));
      ctx.globalAlpha = tw * s.z * 0.7;
      ctx.fillStyle = s.z > 0.7 ? "#f4e6c3" : "#9aa3b6";
      const size = s.z > 0.8 ? 1.8 : 1.1;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Corner vignette — keeps the chart readable under glows.
    const vig = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.32,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.72,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(4, 6, 10, 0.5)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private plot(
    elapsedMs: number,
    color: string,
    crashed: boolean,
    ox: number,
    oy: number,
    view: { xMaxS: number; yMax: number },
  ): { x: number; y: number; angle: number } {
    const { ctx } = this;
    const t = Math.max(0, elapsedMs);
    const endMultiple = smoothMultiplierAt(t) / 100;

    const x0 = PAD.left + ox;
    const y0 = this.height - PAD.bottom + oy;
    const w = this.width - PAD.left - PAD.right;
    const h = this.height - PAD.top - PAD.bottom;
    const toX = (ms: number) => x0 + (ms / 1000 / view.xMaxS) * w;
    const toY = (multiple: number) => y0 - ((multiple - 1) / (view.yMax - 1)) * h;

    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const ms = (t * i) / SEGMENTS;
      pts.push({ x: toX(ms), y: toY(smoothMultiplierAt(ms) / 100) });
    }
    const head = pts[pts.length - 1] ?? { x: toX(t), y: toY(endMultiple) };
    const prev = pts[Math.max(0, pts.length - 6)] ?? head;
    const angle = Math.atan2(head.y - prev.y, head.x - prev.x);

    // Filled area with heat gradient
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0]?.x ?? x0, pts[0]?.y ?? y0);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(head.x, y0);
    ctx.lineTo(x0, y0);
    ctx.closePath();
    const area = ctx.createLinearGradient(0, PAD.top, 0, y0);
    area.addColorStop(0, withAlpha(color, crashed ? 0.14 : 0.34));
    area.addColorStop(0.7, withAlpha(color, crashed ? 0.05 : 0.09));
    area.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = area;
    ctx.fill();
    ctx.restore();

    // Soft outer glow → crisp stroke → heat gradient → white sheen
    const glow = this.reduced ? 0 : crashed ? 10 : 16;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0]?.x ?? x0, pts[0]?.y ?? y0);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = withAlpha(color, 0.18);
    ctx.lineWidth = glow;
    ctx.stroke();

    const stroke = ctx.createLinearGradient(x0, y0, head.x, head.y);
    stroke.addColorStop(0, withAlpha(COLORS.gold, 0.85));
    stroke.addColorStop(1, color);
    ctx.beginPath();
    ctx.moveTo(pts[0]?.x ?? x0, pts[0]?.y ?? y0);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3.4;
    ctx.stroke();

    // Animated shimmer racing toward the head
    if (!this.reduced && !crashed) {
      ctx.save();
      ctx.setLineDash([12, 16]);
      ctx.lineDashOffset = -this.clock / 26;
      ctx.beginPath();
      ctx.moveTo(pts[0]?.x ?? x0, pts[0]?.y ?? y0);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = withAlpha("#ffffff", 0.35);
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    } else {
      const sheen = ctx.createLinearGradient(x0, y0, head.x, head.y);
      sheen.addColorStop(0, withAlpha("#ffffff", 0));
      sheen.addColorStop(1, withAlpha("#ffffff", crashed ? 0.15 : 0.45));
      ctx.beginPath();
      ctx.moveTo(pts[0]?.x ?? x0, pts[0]?.y ?? y0);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = sheen;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    return { x: head.x, y: head.y, angle };
  }

  private grid(view: { xMaxS: number; yMax: number }, ox = 0, oy = 0): void {
    const { ctx } = this;
    const x0 = PAD.left + ox;
    const y0 = this.height - PAD.bottom + oy;
    const w = this.width - PAD.left - PAD.right;
    const h = this.height - PAD.top - PAD.bottom;
    ctx.lineWidth = 1;
    ctx.font = "500 11px Vazirmatn, Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";

    // Horizontal multiplier lines
    for (const m of multiplierTicks(view.yMax)) {
      const clean = Math.abs(m - Math.round(m)) < 0.001 && m >= 2;
      const y = Math.round(y0 - ((m - 1) / (view.yMax - 1)) * h) + 0.5;
      ctx.strokeStyle = clean ? COLORS.gridStrong : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
      ctx.fillStyle = clean ? COLORS.labelBright : COLORS.label;
      ctx.textAlign = "right";
      ctx.fillText(`${m}×`, x0 - 8, y);
    }

    // Vertical time lines
    ctx.textAlign = "center";
    for (const s of timeTicks(view.xMaxS)) {
      const x = Math.round(x0 + (s / view.xMaxS) * w) + 0.5;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top + oy);
      ctx.lineTo(x, y0);
      ctx.stroke();
      ctx.fillStyle = COLORS.label;
      ctx.fillText(`${s}s`, x, y0 + 13);
    }

    // Gold baseline + axis
    ctx.strokeStyle = "rgba(229, 169, 60, 0.4)";
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 0.5);
    ctx.lineTo(x0 + w, y0 + 0.5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(229, 169, 60, 0.22)";
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, PAD.top + oy);
    ctx.lineTo(x0 + 0.5, y0);
    ctx.stroke();
  }

  private drawGhost(view: { xMaxS: number; yMax: number }, ox: number, oy: number): void {
    const ghost = this.ghost;
    if (!ghost) return;
    const { ctx } = this;
    const x0 = PAD.left + ox;
    const y0 = this.height - PAD.bottom + oy;
    const w = this.width - PAD.left - PAD.right;
    const h = this.height - PAD.top - PAD.bottom;
    const toX = (ms: number) => x0 + (ms / 1000 / view.xMaxS) * w;
    const toY = (m: number) => y0 - ((m - 1) / (view.yMax - 1)) * h;

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    const steps = 64;
    for (let i = 0; i <= steps; i += 1) {
      const ms = (ghost.elapsedMs * i) / steps;
      const x = toX(ms);
      const y = toY(smoothMultiplierAt(ms) / 100);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = withAlpha(COLORS.crash, 0.5);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
    const hx = toX(ghost.elapsedMs);
    const hy = toY(ghost.point / 100);
    ctx.fillStyle = withAlpha(COLORS.crash, 0.75);
    ctx.beginPath();
    ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private trackMilestone(shown: number): void {
    if (this.reduced) return;
    let crossed: number | null = null;
    for (const m of MILESTONES) {
      if (shown >= m && m > this.lastMilestoneSeen) crossed = m;
    }
    if (crossed !== null) {
      this.lastMilestoneSeen = crossed;
      this.milestone = { value: crossed, t0: this.clock };
    }
  }

  private drawMilestoneFlash(ox: number, oy: number): void {
    const ms = this.milestone;
    if (!ms) return;
    const age = this.clock - ms.t0;
    if (age > 1700) {
      this.milestone = null;
      return;
    }
    const { ctx } = this;
    const view = this.view;
    const x0 = PAD.left + ox;
    const y0 = this.height - PAD.bottom + oy;
    const w = this.width - PAD.left - PAD.right;
    const h = this.height - PAD.top - PAD.bottom;
    const y = y0 - ((ms.value / 100 - 1) / (view.yMax - 1)) * h;
    const alpha = age < 220 ? age / 220 : Math.max(0, 1 - (age - 220) / 1480);
    if (y < PAD.top || y > y0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = withAlpha(COLORS.goldHot, 0.75);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = `${(ms.value / 100).toFixed(2)}×`;
    ctx.font = "700 12px Vazirmatn, Inter, system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    const px = x0 + w - tw - 18;
    const py = y - 9;
    ctx.fillStyle = "rgba(12, 14, 20, 0.92)";
    ctx.strokeStyle = withAlpha(COLORS.goldHot, 0.8);
    ctx.lineWidth = 1;
    this.roundRect(px, py, tw + 14, 18, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.goldHot;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, px + 7, py + 9.5);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Auto-cashout target lines (dashed) with a flag on the right edge. */
  private drawTargets(targets: CrashMarker[] | undefined, ox: number, oy: number): void {
    if (!targets?.length) return;
    const { ctx } = this;
    const view = this.view;
    const x0 = PAD.left + ox;
    const y0 = this.height - PAD.bottom + oy;
    const w = this.width - PAD.left - PAD.right;
    const h = this.height - PAD.top - PAD.bottom;

    for (const t of targets) {
      const multiple = t.at / 100;
      if (multiple < 1 || multiple > view.yMax) continue;
      const y = y0 - ((multiple - 1) / (view.yMax - 1)) * h;
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = withAlpha(COLORS.goldHot, 0.65);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
      ctx.restore();

      this.pill(x0 + w - 4, y, t.label, COLORS.goldHot, "left");
    }
  }

  /** Cash-out markers sitting on the curve. */
  private drawMarkers(markers: CrashMarker[] | undefined, ox: number, oy: number): void {
    if (!markers?.length) return;
    const { ctx } = this;
    const view = this.view;
    const x0 = PAD.left + ox;
    const y0 = this.height - PAD.bottom + oy;
    const w = this.width - PAD.left - PAD.right;
    const h = this.height - PAD.top - PAD.bottom;

    for (const m of markers) {
      const multiple = m.at / 100;
      if (multiple < 1 || multiple > view.yMax + 0.001) continue;
      let ms: number;
      try {
        ms = elapsedAt(m.at);
      } catch {
        continue;
      }
      const x = x0 + (ms / 1000 / view.xMaxS) * w;
      const y = y0 - ((multiple - 1) / (view.yMax - 1)) * h;
      const pulse = 0.6 + 0.4 * Math.sin(this.clock / 180);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(x, y, 1, x, y, 14 * pulse);
      halo.addColorStop(0, withAlpha(COLORS.green, 0.55));
      halo.addColorStop(1, withAlpha(COLORS.green, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, 14 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = COLORS.green;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
      this.pill(x, y - 14, m.label, COLORS.green, "center");
    }
  }

  private pill(x: number, y: number, label: string, color: string, align: "left" | "center"): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = "700 11.5px Vazirmatn, Inter, system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    const w = tw + 14;
    const h = 18;
    const px = align === "left" ? x - w : x - w / 2;
    const py = y - h / 2;
    ctx.fillStyle = "rgba(12, 14, 20, 0.92)";
    ctx.strokeStyle = withAlpha(color, 0.85);
    ctx.lineWidth = 1;
    this.roundRect(px, py, w, h, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, px + 7, py + h / 2 + 0.5);
    ctx.restore();
  }

  private waitingCraft(frame: Extract<CrashFrame, { kind: "betting" }>, ox: number, oy: number): void {
    const { ctx } = this;
    const x = PAD.left + 42 + ox;
    const y = this.height - PAD.bottom - 34 + oy;
    const frac = Math.min(1, Math.max(0, 1 - frame.closesInMs / frame.bettingMs));
    const pulse = 0.5 + 0.5 * Math.sin(this.clock / 320);

    // Countdown ring around the parked craft
    ctx.save();
    ctx.fillStyle = `rgba(229, 169, 60, ${0.07 + pulse * 0.09})`;
    ctx.beginPath();
    ctx.arc(x, y, 30 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(229, 169, 60, 0.18)";
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    this.craft(x, y, -0.55, COLORS.gold, 100, 0.78 + pulse * 0.1);
    ctx.restore();

    // Bottom progress bar with shimmer
    const barW = Math.min(300, this.width * 0.5);
    const bx = (this.width - barW) / 2;
    const by = this.height - 14;
    ctx.fillStyle = "rgba(229, 169, 60, 0.12)";
    this.roundRect(bx, by, barW, 5, 3);
    ctx.fill();
    const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
    grad.addColorStop(0, COLORS.goldDeep);
    grad.addColorStop(1, COLORS.goldHot);
    ctx.fillStyle = grad;
    this.roundRect(bx, by, Math.max(4, barW * frac), 5, 3);
    ctx.fill();
  }

  private craft(x: number, y: number, angle: number, color: string, hundredths: number, scale = 1): void {
    const { ctx } = this;
    const flicker = 0.75 + 0.25 * Math.sin(this.clock / 50);
    const heat = Math.min(1, (hundredths - 100) / 800);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    // Rotating orbit ring — reads as "live craft"
    if (!this.reduced) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = withAlpha(color, 0.4);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 7]);
      ctx.lineDashOffset = -this.spin * 4;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);
    }

    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    halo.addColorStop(0, withAlpha(color, 0.55 * flicker));
    halo.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    // Flame tail
    ctx.fillStyle = withAlpha(color, 0.55 * flicker);
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.quadraticCurveTo(-10, 7.5 * flicker, 2, 0);
    ctx.quadraticCurveTo(-10, -7.5 * flicker, -30, 0);
    ctx.fill();
    ctx.fillStyle = withAlpha("#ff7a3c", 0.5 * flicker);
    ctx.beginPath();
    ctx.moveTo(-23, 0);
    ctx.quadraticCurveTo(-8, 4.4, -2, 0);
    ctx.quadraticCurveTo(-8, -4.4, -23, 0);
    ctx.fill();

    // Arrow body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.quadraticCurveTo(4, -7.4, -10, -5.4);
    ctx.quadraticCurveTo(-4, 0, -10, 5.4);
    ctx.quadraticCurveTo(4, 7.4, 13, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath();
    ctx.ellipse(4.5, -1.2, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#fff6d4", 0.9);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(4.5, -1, 3.4, 0, Math.PI * 2);
    ctx.stroke();

    if (heat > 0.35) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255, 180, 80, ${0.12 + heat * 0.18})`;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + heat * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private spawnEmbers(head: { x: number; y: number; angle: number }, shown: number): void {
    if (this.reduced) return;
    const n = shown > 500 ? 3 : 2;
    for (let i = 0; i < n; i += 1) {
      const spread = (Math.random() - 0.5) * 0.9;
      const speed = 0.6 + Math.random() * 1.4;
      this.embers.push({
        x: head.x - Math.cos(head.angle) * 10,
        y: head.y - Math.sin(head.angle) * 10,
        vx: -Math.cos(head.angle) * speed + Math.sin(head.angle) * spread,
        vy: -Math.sin(head.angle) * speed - Math.cos(head.angle) * spread + 0.15,
        life: 1,
        max: 18 + Math.random() * 22,
        size: 1.2 + Math.random() * 2.4,
        hot: shown > 400,
      });
    }
    if (this.embers.length > 160) this.embers.splice(0, this.embers.length - 160);
  }

  private drawEmbers(drag = 1): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = this.embers.length - 1; i >= 0; i -= 1) {
      const e = this.embers[i];
      if (!e) continue;
      e.life += 1;
      e.x += e.vx * drag;
      e.y += e.vy * drag;
      e.vy += 0.02;
      const p = e.life / e.max;
      if (p >= 1) {
        this.embers.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.fillStyle = e.hot ? COLORS.ember : COLORS.goldHot;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * (1 - p * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private ignite(x: number, y: number): void {
    this.burst = [];
    this.smoke = [];
    const n = this.reduced ? 18 : 64;
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const sp = 1.6 + Math.random() * 5.5;
      this.burst.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.2,
        life: 0,
        max: 28 + Math.random() * 36,
        size: 1.5 + Math.random() * 3.4,
        color: i % 3 === 0 ? "#fff1c2" : i % 3 === 1 ? COLORS.ember : COLORS.crash,
      });
    }
    if (!this.reduced) {
      for (let i = 0; i < 12; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const d = 6 + Math.random() * 18;
        this.smoke.push({
          x: x + Math.cos(a) * d,
          y: y + Math.sin(a) * d,
          r: 6 + Math.random() * 14,
          vy: -0.14 - Math.random() * 0.2,
          life: 0,
          max: 70 + Math.random() * 60,
        });
      }
    }
  }

  private explosion(x: number, y: number, sinceMs: number): void {
    const { ctx } = this;
    const p = Math.min(1, Math.max(0, sinceMs) / 900);
    const p2 = Math.min(1, Math.max(0, sinceMs) / 1700);
    const flash = Math.max(0, 1 - sinceMs / 180);

    // Smoke first (behind the light)
    if (this.smoke.length) {
      ctx.save();
      for (let i = this.smoke.length - 1; i >= 0; i -= 1) {
        const s = this.smoke[i];
        if (!s) continue;
        s.life += 1;
        s.y += s.vy;
        s.r += 0.35;
        const q = s.life / s.max;
        if (q >= 1) {
          this.smoke.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = 0.16 * (1 - q);
        ctx.fillStyle = "#7d8494";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (flash > 0) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 80 + flash * 40);
      g.addColorStop(0, `rgba(255, 244, 210, ${0.55 * flash})`);
      g.addColorStop(0.4, `rgba(255, 101, 119, ${0.28 * flash})`);
      g.addColorStop(1, "rgba(255,101,119,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 90 + flash * 50, 0, Math.PI * 2);
      ctx.fill();
    }

    // Twin shockwaves — fast inner, slow outer
    const ring = 18 + p * 86;
    ctx.strokeStyle = `rgba(255, 101, 119, ${Math.max(0, 0.55 - p * 0.55)})`;
    ctx.lineWidth = 3 * (1 - p);
    ctx.beginPath();
    ctx.arc(x, y, ring, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 210, 120, ${Math.max(0, 0.35 - p * 0.4)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, ring * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    const ring2 = 26 + p2 * 170;
    ctx.strokeStyle = `rgba(255, 140, 120, ${Math.max(0, 0.26 - p2 * 0.26)})`;
    ctx.lineWidth = 2.2 * (1 - p2);
    ctx.beginPath();
    ctx.arc(x, y, ring2, 0, Math.PI * 2);
    ctx.stroke();

    // Sparks with motion trails
    for (let i = this.burst.length - 1; i >= 0; i -= 1) {
      const b = this.burst[i];
      if (!b) continue;
      b.life += 1;
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.12;
      b.vx *= 0.985;
      const q = b.life / b.max;
      if (q >= 1) {
        this.burst.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = (1 - q) * 0.85;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = Math.max(0.8, b.size * (1 - q) * 0.7);
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 2.2, b.y - b.vy * 2.2);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1 - q;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size * (1 - q * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
