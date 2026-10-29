import { describe, expect, it } from "vitest";
import { CrashRenderer, type CrashFrame } from "./renderer";

/** Records every canvas call so draw() paths can run headlessly. */
function makeCtx() {
  const calls: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "measureText") return () => ({ width: 42 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => ({ addColorStop: () => undefined });
      }
      return (...args: unknown[]) => {
        calls.push(`${prop}(${args.length})`);
        return undefined;
      };
    },
    set(_t, prop, value) {
      calls.push(`set:${String(prop)}=${String(value)}`);
      return true;
    },
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, calls };
}

describe("CrashRenderer cinematic frames", () => {
  it("renders the whole round lifecycle without throwing", () => {
    const { ctx, calls } = makeCtx();
    const r = new CrashRenderer(ctx);
    r.resize(900, 480, 2);

    const betting: CrashFrame = {
      kind: "betting",
      closesInMs: 3200,
      bettingMs: 5000,
      lastCrash: 247,
      players: 6,
    };
    expect(r.draw(betting)).toBeNull();

    const flying: CrashFrame = {
      kind: "flying",
      elapsedMs: 2400,
      targets: [{ at: 200, label: "2.00×", mine: true }],
      markers: [{ at: 131, label: "1.31×", mine: true }],
    };
    const shown = r.draw(flying);
    expect(shown).toBeGreaterThanOrEqual(100);
    r.draw({ ...flying, elapsedMs: 4800 });

    const crashed: CrashFrame = {
      kind: "crashed",
      elapsedMs: 4621,
      crashPoint: 131,
      sinceCrashMs: 0,
      nextInMs: 2800,
      markers: [{ at: 131, label: "1.31×", mine: true }],
    };
    expect(r.draw(crashed)).toBe(131);
    // burst frames after the explosion
    r.draw({ ...crashed, sinceCrashMs: 400 });
    r.draw({ ...crashed, sinceCrashMs: 1500 });

    // back to betting — fades the ghost of the previous round
    r.draw(betting);
    r.draw(betting);

    expect(calls.length).toBeGreaterThan(50);
    expect(calls.some((c) => c.startsWith("fillText"))).toBe(true);
    expect(calls.some((c) => c.startsWith("stroke"))).toBe(true);
  });

  it("keeps drawing during an extended flight with milestone crossings", () => {
    const { ctx } = makeCtx();
    const r = new CrashRenderer(ctx);
    r.resize(640, 400, 1);
    for (const elapsedMs of [0, 500, 1200, 2500, 4000, 9000, 20_000, 60_000]) {
      expect(() => r.draw({ kind: "flying", elapsedMs })).not.toThrow();
    }
  });
});
