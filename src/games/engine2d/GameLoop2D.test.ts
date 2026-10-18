import { describe, expect, it } from "vitest";
import {
  GameLoop2D,
  computeViewportFit2D,
  DEFAULT_MAX_SUB_STEPS,
  DEFAULT_TICK_HZ,
} from "./GameLoop2D";
import type { GameLoopStats2D } from "./types";

const STEP_MS = 1000 / DEFAULT_TICK_HZ; // 16.6̄ ms

function createLoop(overrides: Partial<ConstructorParameters<typeof GameLoop2D>[0]> = {}) {
  const calls = {
    updates: [] as number[],
    alphas: [] as number[],
    stats: [] as GameLoopStats2D[],
  };
  const loop = new GameLoop2D({
    update: (dt) => calls.updates.push(dt),
    render: (alpha) => calls.alphas.push(alpha),
    now: () => 0,
    ...overrides,
  });
  return { loop, calls };
}

/** Drive the loop with absolute timestamps; the first frame is the baseline. */
function run(loop: GameLoop2D, absoluteTimesMs: number[]) {
  absoluteTimesMs.forEach((t) => loop.frame(t));
}

describe("GameLoop2D — fixed timestep", () => {
  it("runs exactly one deterministic tick per 60Hz step", () => {
    const { loop, calls } = createLoop();
    run(loop, [0, STEP_MS]);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0]).toBeCloseTo(1 / DEFAULT_TICK_HZ, 12);
  });

  it("never passes a variable dt — simulation step is constant", () => {
    const { loop, calls } = createLoop();
    // Irregular frame times totalling 3.3 ticks of lag.
    run(loop, [0, STEP_MS * 0.4, STEP_MS * 1.1, STEP_MS * 3.3]);
    expect(calls.updates.every((dt) => Math.abs(dt - 1 / DEFAULT_TICK_HZ) < 1e-12)).toBe(true);
    expect(calls.updates).toHaveLength(3);
  });

  it("is deterministic: identical frame times produce identical results", () => {
    const feedTimes = [0, STEP_MS * 1.5, STEP_MS * 2.7, STEP_MS * 0.2, STEP_MS * 4.1];
    const a = createLoop();
    const b = createLoop();
    run(a.loop, feedTimes);
    run(b.loop, feedTimes);
    expect(a.calls.updates.length).toBe(b.calls.updates.length);
    expect(a.calls.alphas).toEqual(b.calls.alphas);
  });

  it("exposes the interpolation alpha in [0, 1) to the renderer", () => {
    const { loop, calls } = createLoop();
    run(loop, [0, STEP_MS * 0.5, STEP_MS * 0.75, STEP_MS * 1.5]);
    expect(calls.alphas[1]).toBeCloseTo(0.5, 6);
    expect(calls.alphas[2]).toBeCloseTo(0.75, 6);
    // 0.75 + 0.75 = 1.5 ticks → one tick runs, 0.5 remains.
    expect(calls.updates).toHaveLength(1);
    expect(calls.alphas[3]).toBeCloseTo(0.5, 6);
  });

  it("never lets alpha reach 1 (it always rolls into a tick first)", () => {
    const { loop, calls } = createLoop();
    const times = [0, ...Array.from({ length: 20 }, (_, i) => STEP_MS * (i + 1) * 0.999)];
    run(loop, times);
    expect(calls.alphas.every((a) => a >= 0 && a < 1)).toBe(true);
  });
});

describe("GameLoop2D — frame-drop protection", () => {
  it("caps ticks per frame at maxSubSteps and counts a dropped frame", () => {
    const { loop, calls } = createLoop({ maxSubSteps: 5 });
    // A full second of lag, then a normal frame: the discarded
    // remainder must not leak into the next frame's simulation.
    run(loop, [0, 1000, 1000 + STEP_MS * 1.5]);
    expect(calls.updates).toHaveLength(DEFAULT_MAX_SUB_STEPS + 1);
    expect(loop.getStats().droppedFrames).toBe(1);
  });

  it("does not drop when the accumulator is fully consumed within budget", () => {
    const { loop } = createLoop({ maxSubSteps: 5 });
    run(loop, [0, STEP_MS * 5 + 0.5]); // just over five ticks of lag
    expect(loop.getStats().droppedFrames).toBe(0);
    expect(loop.getStats().ticks).toBe(5);
  });

  it("clamps absurd frame times before simulation", () => {
    const { loop } = createLoop({ maxFrameTimeMs: 80 });
    run(loop, [0, 10_000]); // 10s stall clamped to 80ms ≈ 4.8 ticks
    expect(loop.getStats().ticks).toBe(4);
    expect(loop.getStats().droppedFrames).toBe(0);
  });
});

describe("GameLoop2D — live FPS / frame-time counters", () => {
  it("reports ~60 FPS when frames arrive on schedule", () => {
    const { loop } = createLoop();
    run(loop, Array.from({ length: 31 }, (_, i) => STEP_MS * i));
    const stats = loop.getStats();
    expect(stats.fps).toBeCloseTo(60, 0);
    expect(stats.frameTimeMs).toBeCloseTo(STEP_MS, 1);
    expect(stats.tickHz).toBe(DEFAULT_TICK_HZ);
  });

  it("counts frames and ticks separately", () => {
    const { loop } = createLoop();
    run(loop, [0, STEP_MS, STEP_MS * 2]);
    const stats = loop.getStats();
    expect(stats.frames).toBe(3); // baseline + two frames
    expect(stats.ticks).toBe(2); // one tick per elapsed step
  });

  it("emits a stats snapshot per frame via onStats", () => {
    const seen: GameLoopStats2D[] = [];
    const { loop } = createLoop({ onStats: (s) => seen.push(s) });
    run(loop, [0, STEP_MS, STEP_MS]);
    expect(seen).toHaveLength(3);
    expect(seen[2].frames).toBe(3);
  });

  it("rejects invalid configuration", () => {
    expect(() => new GameLoop2D({ update() {}, render() {}, tickHz: 0 })).toThrow(RangeError);
    expect(() => new GameLoop2D({ update() {}, render() {}, tickHz: NaN })).toThrow(RangeError);
    expect(() => new GameLoop2D({ update() {}, render() {}, maxSubSteps: 0 })).toThrow(RangeError);
  });
});

describe("GameLoop2D — lifecycle", () => {
  it("schedules exactly one frame at a time and stops on demand", () => {
    const scheduled: Array<() => void> = [];
    let cancelled = false;
    const { loop } = createLoop({
      scheduleFrame: (cb) => {
        scheduled.push(cb);
        return scheduled.length;
      },
      cancelFrame: (handle) => {
        cancelled = true;
        scheduled[Number(handle) - 1] = () => {};
      },
    });

    expect(loop.isRunning).toBe(false);
    loop.start();
    expect(loop.isRunning).toBe(true);
    expect(scheduled).toHaveLength(1);

    scheduled[0](); // one frame elapses → exactly one follow-up scheduled
    expect(scheduled).toHaveLength(2);

    loop.stop();
    expect(loop.isRunning).toBe(false);
    expect(cancelled).toBe(true);

    loop.start(); // restart is safe
    expect(loop.isRunning).toBe(true);
  });

  it("reset() clears every counter", () => {
    const { loop } = createLoop();
    run(loop, [0, STEP_MS * 3]);
    loop.reset();
    const stats = loop.getStats();
    expect(stats.frames).toBe(0);
    expect(stats.ticks).toBe(0);
    expect(stats.droppedFrames).toBe(0);
  });
});

describe("computeViewportFit2D", () => {
  it("scales up to fill a larger container (contain)", () => {
    const fit = computeViewportFit2D({
      worldWidth: 100,
      worldHeight: 100,
      containerWidth: 400,
      containerHeight: 400,
    });
    expect(fit.scale).toBe(4);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(0);
    expect(fit.visibleWorldWidth).toBe(100);
  });

  it("letterboxes the shorter axis and centers the world", () => {
    const fit = computeViewportFit2D({
      worldWidth: 200,
      worldHeight: 100,
      containerWidth: 100,
      containerHeight: 100,
    });
    expect(fit.scale).toBe(0.5);
    expect(fit.viewportWidth).toBe(100);
    expect(fit.viewportHeight).toBe(50);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(25);
    expect(fit.visibleWorldWidth).toBe(200);
    expect(fit.visibleWorldHeight).toBe(200);
  });

  it("respects min/max scale clamps", () => {
    const minFit = computeViewportFit2D({
      worldWidth: 100,
      worldHeight: 100,
      containerWidth: 50,
      containerHeight: 50,
      minScale: 1,
    });
    expect(minFit.scale).toBe(1);

    const maxFit = computeViewportFit2D({
      worldWidth: 100,
      worldHeight: 100,
      containerWidth: 1000,
      containerHeight: 1000,
      maxScale: 2,
    });
    expect(maxFit.scale).toBe(2);
  });

  it("multiplies backing-store size by the device pixel ratio", () => {
    const fit = computeViewportFit2D({
      worldWidth: 100,
      worldHeight: 100,
      containerWidth: 300,
      containerHeight: 200,
      devicePixelRatio: 2,
    });
    expect(fit.devicePixelRatio).toBe(2);
    expect(fit.pixelWidth).toBe(600);
    expect(fit.pixelHeight).toBe(400);
  });

  it("degrades gracefully on degenerate inputs", () => {
    const fit = computeViewportFit2D({
      worldWidth: 0,
      worldHeight: 100,
      containerWidth: 100,
      containerHeight: 100,
    });
    expect(fit.scale).toBe(1);
    expect(fit.visibleWorldWidth).toBe(0);
  });
});
