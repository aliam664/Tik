/**
 * Cinematic Sheriff Blast canvas — gold comet, flame trail, crash burst.
 * Original Sheriff theme (not Aviator art).
 */

import { multiplierAt, smoothMultiplierAt } from "./math";

export type CrashFrame =
  | { kind: "betting"; closesInMs: number; bettingMs: number; lastCrash: number | null }
  | { kind: "flying"; elapsedMs: number }
  | { kind: "crashed"; elapsedMs: number; crashPoint: number; sinceCrashMs: number; nextInMs: number };

type Star = { x: number; y: number; z: number; tw: number };
type Ember = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; hue: number };
type Burst = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };

const COLORS = {
  background: "#0c1018",
  grid: "rgba(229, 169, 60, 0.07)",
  label: "rgba(154, 163, 182, 0.55)",
  crash: "#ff6577",
  gold: "#e5a93c",
  goldHot: "#f2c464",
  ember: "#ff8a4c",
} as const;

const PAD = { left: 48, right: 22, top: 16, bottom: 28 };
const SEGMENTS = 128;

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

export class CrashRenderer {
  private width = 0;
  private height = 0;
  private dpr = 1;
  private stars: Star[] = [];
  private embers: Ember[] = [];
  private burst: Burst[] = [];
  private lastKind: CrashFrame["kind"] | null = null;
  private lastHead: { x: number; y: number } | null = null;
  private reduced = false;
  private clock = 0;

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    this.reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    if (frame.kind !== this.lastKind) {
      if (frame.kind === "betting") {
        this.embers = [];
        this.burst = [];
        this.lastHead = null;
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
      this.grid(extents(0, 1), ox, oy);
      this.waitingCraft(frame, ox, oy);
      return null;
    }

    if (frame.kind === "flying") {
      const shown = multiplierAt(frame.elapsedMs);
      const head = this.plot(frame.elapsedMs, heatColor(shown), false, ox, oy);
      this.lastHead = head;
      this.spawnEmbers(head, shown);
      this.drawEmbers();
      this.craft(head.x, head.y, head.angle, heatColor(shown), shown);
      return shown;
    }

    const head = this.plot(frame.elapsedMs, COLORS.crash, true, ox, oy);
    this.lastHead = head;
    this.drawEmbers(0.92);
    this.explosion(head.x, head.y, frame.sinceCrashMs);
    return frame.crashPoint;
  }

  private seedStars(): void {
    const count = this.reduced ? 24 : 90;
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
          ? 0.85
          : 0;
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, "#121826");
    g.addColorStop(0.55, COLORS.background);
    g.addColorStop(1, "#080b11");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    const bloom = ctx.createRadialGradient(
      this.width * 0.72 + ox,
      this.height * 0.28 + oy,
      10,
      this.width * 0.55,
      this.height * 0.45,
      Math.max(this.width, this.height) * 0.7,
    );
    const bloomColor =
      frame.kind === "crashed" ? "rgba(255, 101, 119, 0.16)" : `rgba(229, 169, 60, ${0.05 + heat * 0.16})`;
    bloom.addColorStop(0, bloomColor);
    bloom.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, this.width, this.height);

    const t = this.clock / 1000;
    ctx.save();
    for (const s of this.stars) {
      const drift = frame.kind === "betting" ? t * 0.012 : t * (0.02 + s.z * 0.04);
      const x = ((s.x + drift) % 1) * this.width;
      const y = s.y * this.height * 0.92;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.4 + s.z) + s.tw));
      ctx.globalAlpha = tw * s.z * 0.7;
      ctx.fillStyle = s.z > 0.7 ? "#f4e6c3" : "#9aa3b6";
      ctx.fillRect(x, y, s.z > 0.8 ? 1.8 : 1.1, s.z > 0.8 ? 1.8 : 1.1);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private plot(
    elapsedMs: number,
    color: string,
    crashed: boolean,
    ox: number,
    oy: number,
  ): { x: number; y: number; angle: number } {
    const { ctx } = this;
    const t = Math.max(0, elapsedMs);
    const endMultiple = smoothMultiplierAt(t) / 100;
    const view = extents(t / 1000, endMultiple);
    this.grid(view, ox, oy);

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

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0]?.x ?? x0, pts[0]?.y ?? y0);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(head.x, y0);
    ctx.lineTo(x0, y0);
    ctx.closePath();
    const area = ctx.createLinearGradient(0, PAD.top, 0, y0);
    area.addColorStop(0, withAlpha(color, crashed ? 0.12 : 0.32));
    area.addColorStop(0.7, withAlpha(color, crashed ? 0.04 : 0.08));
    area.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = area;
    ctx.fill();
    ctx.restore();

    const glow = this.reduced ? 0 : crashed ? 10 : 16;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0]?.x ?? x0, pts[0]?.y ?? y0);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = withAlpha(color, 0.18);
    ctx.lineWidth = glow;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pts[0]?.x ?? x0, pts[0]?.y ?? y0);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.4;
    ctx.stroke();

    const sheen = ctx.createLinearGradient(x0, y0, head.x, head.y);
    sheen.addColorStop(0, withAlpha("#ffffff", 0));
    sheen.addColorStop(1, withAlpha("#ffffff", crashed ? 0.15 : 0.45));
    ctx.beginPath();
    ctx.moveTo(pts[0]?.x ?? x0, pts[0]?.y ?? y0);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = sheen;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    return { x: head.x, y: head.y, angle };
  }

  private grid(view: { xMaxS: number; yMax: number }, ox = 0, oy = 0): void {
    const { ctx } = this;
    const x0 = PAD.left + ox;
    const y0 = this.height - PAD.bottom + oy;
    const w = this.width - PAD.left - PAD.right;
    const h = this.height - PAD.top - PAD.bottom;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = COLORS.label;
    ctx.font = "500 11px Vazirmatn, Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const m of multiplierTicks(view.yMax)) {
      const y = Math.round(y0 - ((m - 1) / (view.yMax - 1)) * h) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
      ctx.fillText(`${m}×`, x0 - 8, y);
    }
    ctx.strokeStyle = "rgba(229, 169, 60, 0.32)";
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 0.5);
    ctx.lineTo(x0 + w, y0 + 0.5);
    ctx.stroke();
  }

  private waitingCraft(frame: Extract<CrashFrame, { kind: "betting" }>, ox: number, oy: number): void {
    const { ctx } = this;
    const x = PAD.left + 18 + ox;
    const y = this.height - PAD.bottom - 10 + oy;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock / 320);
    ctx.save();
    ctx.fillStyle = `rgba(229, 169, 60, ${0.08 + pulse * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, 26 + pulse * 8, 0, Math.PI * 2);
    ctx.fill();
    this.craft(x, y, -0.55, COLORS.gold, 100, 0.72 + pulse * 0.12);
    ctx.restore();

    const frac = 1 - Math.min(1, Math.max(0, frame.closesInMs / frame.bettingMs));
    const barW = Math.min(280, this.width * 0.48);
    const bx = (this.width - barW) / 2;
    const by = this.height - 18;
    ctx.fillStyle = "rgba(229, 169, 60, 0.14)";
    this.roundRect(bx, by, barW, 5, 3);
    ctx.fill();
    ctx.fillStyle = COLORS.gold;
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

    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    halo.addColorStop(0, withAlpha(color, 0.55 * flicker));
    halo.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = withAlpha(color, 0.55 * flicker);
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.quadraticCurveTo(-10, 7 * flicker, 2, 0);
    ctx.quadraticCurveTo(-10, -7 * flicker, -28, 0);
    ctx.fill();

    ctx.fillStyle = withAlpha("#ff7a3c", 0.45 * flicker);
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(-8, 4, -2, 0);
    ctx.quadraticCurveTo(-8, -4, -22, 0);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(4, 0, 11, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath();
    ctx.ellipse(6, -1, 5.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = withAlpha("#fff6d4", 0.9);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const r = i === 0 ? 7.2 : 6.4;
      const px = 5 + Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
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
        hue: shown > 400 ? 0.15 : 0.08,
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
      ctx.fillStyle = e.hue > 0.1 ? COLORS.ember : COLORS.goldHot;
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
    const n = this.reduced ? 18 : 56;
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
  }

  private explosion(x: number, y: number, sinceMs: number): void {
    const { ctx } = this;
    const p = Math.min(1, Math.max(0, sinceMs) / 900);
    const flash = Math.max(0, 1 - sinceMs / 180);
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
