/**
 * DOZ ONLINE — deterministic 2D game loop (heavy engine core).
 *
 * Design:
 *  - Fixed-timestep simulation at a constant 60Hz (16.6̄ ms per tick).
 *  - Render interpolation: the renderer receives `alpha`, the fraction of
 *    the current tick that has elapsed, so motion stays smooth even when
 *    display refresh ≠ simulation rate.
 *  - Spiral-of-death guard: at most `maxSubSteps` ticks run per frame;
 *    any remaining accumulated time is discarded and counted as a dropped
 *    frame, keeping the simulation stable on slow devices.
 *  - Live FPS / frame-time counters (EMA-smoothed) exposed via stats.
 *
 * The loop is fully injectable (clock + frame scheduler) so it can be unit
 * tested deterministically without a browser.
 */

import type {
  GameLoopStats2D,
  Viewport2DConfig,
  ViewportFit2D,
} from "./types";

export const DEFAULT_TICK_HZ = 60;
export const DEFAULT_MAX_SUB_STEPS = 5;
export const DEFAULT_MAX_FRAME_TIME_MS = 250;

export interface GameLoop2DOptions {
  /** Deterministic simulation step; receives a fixed dt in seconds. */
  readonly update: (dtSeconds: number) => void;
  /** Render step; receives the interpolation factor in [0, 1). */
  readonly render: (alpha: number) => void;
  /** Simulation rate in ticks per second. Default 60Hz. */
  readonly tickHz?: number;
  /** Max simulation ticks per frame before the remainder is dropped. */
  readonly maxSubSteps?: number;
  /** Clamp for a single frame's duration (ms) — anti-spiral guard, part 1. */
  readonly maxFrameTimeMs?: number;
  /** Clock in milliseconds (defaults to performance.now). */
  readonly now?: () => number;
  /** Frame scheduler (defaults to requestAnimationFrame). */
  readonly scheduleFrame?: (callback: () => void) => unknown;
  /** Frame canceler matching the scheduler. */
  readonly cancelFrame?: (handle: unknown) => void;
  /** Called once per rendered frame with fresh stats. */
  readonly onStats?: (stats: GameLoopStats2D) => void;
}

/**
 * Fixed-timestep game loop with render interpolation.
 */
export class GameLoop2D {
  readonly tickHz: number;
  readonly maxSubSteps: number;
  readonly maxFrameTimeMs: number;

  private readonly stepMs: number;
  private readonly update: (dtSeconds: number) => void;
  private readonly render: (alpha: number) => void;
  private readonly clock: () => number;
  private readonly scheduleFrame: (callback: () => void) => unknown;
  private readonly cancelFrame: (handle: unknown) => void;
  private readonly onStats?: (stats: GameLoopStats2D) => void;

  private accumulatorMs = 0;
  private lastTimeMs: number | null = null;
  private frameHandle: unknown = null;
  private running = false;

  private frames = 0;
  private ticks = 0;
  private droppedFrames = 0;
  private emaFrameMs: number;
  private emaReady = false;
  private alpha = 0;
  private lastTickDurationMs = 0;

  constructor(options: GameLoop2DOptions) {
    this.update = options.update;
    this.render = options.render;
    this.tickHz = options.tickHz ?? DEFAULT_TICK_HZ;
    this.maxSubSteps = options.maxSubSteps ?? DEFAULT_MAX_SUB_STEPS;
    this.maxFrameTimeMs =
      options.maxFrameTimeMs ?? DEFAULT_MAX_FRAME_TIME_MS;
    this.clock = options.now ?? (() => performance.now());
    this.scheduleFrame =
      options.scheduleFrame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame =
      options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle as number));
    this.onStats = options.onStats;

    if (!Number.isFinite(this.tickHz) || this.tickHz <= 0) {
      throw new RangeError(`tickHz must be a positive number, got ${this.tickHz}`);
    }
    if (!Number.isInteger(this.maxSubSteps) || this.maxSubSteps < 1) {
      throw new RangeError(`maxSubSteps must be a positive integer, got ${this.maxSubSteps}`);
    }

    this.stepMs = 1000 / this.tickHz;
    this.emaFrameMs = this.stepMs;
  }

  /** Nominal step duration in milliseconds (e.g. 16.6̄ at 60Hz). */
  get stepMsDuration(): number {
    return this.stepMs;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Start the loop. No-op when already running. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimeMs = null;
    this.frameHandle = this.scheduleFrame(() => this.frame(this.clock()));
  }

  /** Stop the loop and cancel any pending frame. */
  stop(): void {
    this.running = false;
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  /** Reset all counters (used by tests and scene re-entry). */
  reset(): void {
    this.accumulatorMs = 0;
    this.frames = 0;
    this.ticks = 0;
    this.droppedFrames = 0;
    this.alpha = 0;
    this.emaFrameMs = this.stepMs;
    this.emaReady = false;
    this.lastTickDurationMs = 0;
  }

  /**
   * Process a single display frame. Exposed publicly so tests (and
   * manual steppers) can drive the loop with synthetic timestamps.
   */
  frame(nowMs: number): void {
    if (this.lastTimeMs === null) {
      this.lastTimeMs = nowMs;
    }

    let frameTimeMs = nowMs - this.lastTimeMs;
    this.lastTimeMs = nowMs;
    if (frameTimeMs < 0) frameTimeMs = 0;
    if (frameTimeMs > this.maxFrameTimeMs) frameTimeMs = this.maxFrameTimeMs;

    // Live frame-time / FPS counters (exponential moving average).
    // The baseline frame (0 ms) carries no timing information, so the
    // EMA seeds itself on the first real frame instead.
    if (this.emaReady) {
      this.emaFrameMs = this.emaFrameMs * 0.9 + frameTimeMs * 0.1;
    } else if (frameTimeMs > 0) {
      this.emaFrameMs = frameTimeMs;
      this.emaReady = true;
    }
    this.frames += 1;

    // Fixed-timestep simulation with a hard sub-step budget.
    this.accumulatorMs += frameTimeMs;
    let steps = 0;
    const tickStart = this.clock();
    while (this.accumulatorMs >= this.stepMs && steps < this.maxSubSteps) {
      this.update(this.stepMs / 1000);
      this.accumulatorMs -= this.stepMs;
      this.ticks += 1;
      steps += 1;
    }
    if (steps === this.maxSubSteps && this.accumulatorMs >= this.stepMs) {
      // Budget exhausted with time still pending: drop the remainder.
      this.droppedFrames += 1;
      this.accumulatorMs = 0;
    }
    this.lastTickDurationMs = this.clock() - tickStart;

    // Interpolation factor for the renderer.
    this.alpha = this.accumulatorMs / this.stepMs;
    this.render(this.alpha);

    this.emitStats();

    // Chain the next display frame while running (self-scheduling
    // RAF loop; manually-driven frames stay manual).
    if (this.running) {
      this.frameHandle = this.scheduleFrame(() => this.frame(this.clock()));
    }
  }

  /** Snapshot of the live performance counters. */
  getStats(): GameLoopStats2D {
    return {
      fps: this.computeFps(),
      frameTimeMs: this.emaFrameMs,
      tickHz: this.tickHz,
      ticks: this.ticks,
      frames: this.frames,
      droppedFrames: this.droppedFrames,
      alpha: this.alpha,
      lastTickDurationMs: this.lastTickDurationMs,
      lastFrameAtMs: this.clock(),
    };
  }

  /** EMA-smoothed frames per second derived from the frame-time EMA. */
  computeFps(): number {
    if (this.emaFrameMs <= 0) return 0;
    return 1000 / this.emaFrameMs;
  }

  private emitStats(): void {
    this.onStats?.(this.getStats());
  }
}

/* -------------------------------------------------------------------------- */
/* Responsive viewport fitting                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fit a fixed world rectangle into a container using the "contain"
 * strategy: the world is uniformly scaled to fit entirely inside the
 * container and centered, preserving aspect ratio. Scale is clamped
 * into [minScale, maxScale] when provided.
 */
export function computeViewportFit2D(
  config: Viewport2DConfig,
): ViewportFit2D {
  const {
    worldWidth,
    worldHeight,
    containerWidth,
    containerHeight,
    minScale,
    maxScale,
  } = config;
  const dpr = config.devicePixelRatio ?? 1;

  const validWorld =
    Number.isFinite(worldWidth) && worldWidth > 0 &&
    Number.isFinite(worldHeight) && worldHeight > 0;
  const validContainer =
    Number.isFinite(containerWidth) && containerWidth > 0 &&
    Number.isFinite(containerHeight) && containerHeight > 0;

  if (!validWorld || !validContainer) {
    return {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      viewportWidth: Math.max(0, containerWidth),
      viewportHeight: Math.max(0, containerHeight),
      visibleWorldWidth: validWorld ? worldWidth : 0,
      visibleWorldHeight: validWorld ? worldHeight : 0,
      pixelWidth: Math.round(Math.max(0, containerWidth) * dpr),
      pixelHeight: Math.round(Math.max(0, containerHeight) * dpr),
      devicePixelRatio: dpr,
    };
  }

  const rawScale = Math.min(
    containerWidth / worldWidth,
    containerHeight / worldHeight,
  );
  const lower = minScale ?? 0;
  const upper = maxScale ?? Number.POSITIVE_INFINITY;
  const scale = Math.min(Math.max(rawScale, lower), upper);

  const viewportWidth = worldWidth * scale;
  const viewportHeight = worldHeight * scale;

  return {
    scale,
    offsetX: (containerWidth - viewportWidth) / 2,
    offsetY: (containerHeight - viewportHeight) / 2,
    viewportWidth,
    viewportHeight,
    visibleWorldWidth: containerWidth / scale,
    visibleWorldHeight: containerHeight / scale,
    pixelWidth: Math.round(containerWidth * dpr),
    pixelHeight: Math.round(containerHeight * dpr),
    devicePixelRatio: dpr,
  };
}
