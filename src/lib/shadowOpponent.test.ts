import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pickShadowPersona,
  SHADOW_PERSONAS,
  SHADOW_TRIGGER_DELAY_MS,
  SHADOW_TRIGGER_JITTER_MS,
  shadowTriggerDelayMs,
  useShadowOpponent,
  type ShadowGameId,
} from "./shadowOpponent";

const ALL_GAMES: ShadowGameId[] = [
  "doz",
  "word_cipher",
  "code_breaker",
  "last_night",
  "sheriff_blast",
];

describe("Shadow Opponent — persona pools", () => {
  it("provides themed personas for every live game", () => {
    for (const game of ALL_GAMES) {
      const pool = SHADOW_PERSONAS[game];
      expect(pool.length).toBeGreaterThanOrEqual(6);
      expect(new Set(pool).size).toBe(pool.length);
      for (const name of pool) {
        expect(name.trim().length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("never leaks machine identity in personas (must read as human)", () => {
    for (const game of ALL_GAMES) {
      for (const name of SHADOW_PERSONAS[game]) {
        expect(name).not.toMatch(/ai|bot|bots|هوش مصنوعی|ربات|ان‌آی|GPT/i);
      }
    }
  });

  it("picks deterministically from the pool for injected random values", () => {
    expect(pickShadowPersona("doz", () => 0)).toBe(SHADOW_PERSONAS.doz[0]);
    expect(pickShadowPersona("doz", () => 0.999999)).toBe(
      SHADOW_PERSONAS.doz[SHADOW_PERSONAS.doz.length - 1],
    );
    expect(SHADOW_PERSONAS.sheriff_blast).toContain(
      pickShadowPersona("sheriff_blast", () => 0.5),
    );
  });

  it("keeps the activation delay human-like and inside the jitter window", () => {
    expect(shadowTriggerDelayMs(() => 0)).toBe(SHADOW_TRIGGER_DELAY_MS);
    expect(shadowTriggerDelayMs(() => 1)).toBe(
      SHADOW_TRIGGER_DELAY_MS + SHADOW_TRIGGER_JITTER_MS,
    );
    const mid = shadowTriggerDelayMs(() => 0.5);
    expect(mid).toBeGreaterThan(SHADOW_TRIGGER_DELAY_MS);
    expect(mid).toBeLessThanOrEqual(SHADOW_TRIGGER_DELAY_MS + SHADOW_TRIGGER_JITTER_MS);
  });
});

describe("Shadow Opponent — useShadowOpponent hook", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("searches first, then seats the hidden opponent after the delay", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useShadowOpponent({ game: "doz", armed: true, delayMs: 5000 }),
    );

    expect(result.current.searching).toBe(true);
    expect(result.current.active).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5000 + SHADOW_TRIGGER_JITTER_MS + 1);
    });

    expect(result.current.active).toBe(true);
    expect(result.current.searching).toBe(false);
    expect(SHADOW_PERSONAS.doz).toContain(result.current.name);
  });

  it("yields the seat instantly when a real opponent arrives", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ armed }: { armed: boolean }) =>
        useShadowOpponent({ game: "word_cipher", armed, delayMs: 5000 }),
      { initialProps: { armed: true } },
    );

    act(() => {
      vi.advanceTimersByTime(SHADOW_TRIGGER_DELAY_MS + SHADOW_TRIGGER_JITTER_MS + 1);
    });
    expect(result.current.active).toBe(true);

    rerender({ armed: false });
    expect(result.current.active).toBe(false);
    expect(result.current.searching).toBe(false);
  });

  it("never activates while disarmed even after long waits", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useShadowOpponent({ game: "code_breaker", armed: false, delayMs: 100 }),
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.active).toBe(false);
    expect(result.current.searching).toBe(false);
  });
});
