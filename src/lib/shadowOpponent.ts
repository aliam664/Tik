/**
 * SHADOW OPPONENT — the platform's hidden bot-opponent system.
 *
 * Whenever a player is seated alone in a two-player room, the platform quietly
 * finds them an opponent after a short, human-looking delay so every game on
 * DOZ ONLINE (Doz Classic, Word Cipher, Code Breaker, Last Night, Sheriff Blast)
 * always becomes a real duel — without the player ever waiting in an empty room.
 *
 * Design rules:
 *  - Personas are plausible human display names. They must NEVER leak the
 *    words "AI", "bot", or anything machine-flavored (enforced by tests).
 *  - Activation delay is randomized so the seat fills like a real person
 *    joining, never instantly and never on a fixed metronome.
 *  - The moment a REAL opponent joins the room, `armed` flips false and the
 *    shadow yield instantly — humans always take priority.
 */

import { useEffect, useState } from "react";

export type ShadowGameId =
  | "doz"
  | "word_cipher"
  | "code_breaker"
  | "last_night"
  | "sheriff_blast";

/** Plausible opponent/guest names, themed per title. */
export const SHADOW_PERSONAS: Record<ShadowGameId, readonly string[]> = {
  doz: [
    "مهرداد رازی",
    "آرش پروا",
    "کیان نامدار",
    "نوبر چوپان",
    "زردشت آبتین",
    "سامان تیزهوش",
    "آیدین مرادی",
    "رهام کیانی",
  ],
  word_cipher: [
    "سیمین اندیشه",
    "نسترن ذکاوت",
    "بهزاد رازنامه",
    "واژه‌بان نازنین",
    "مهرنوش فرهمند",
    "آیدا سخن‌پرداز",
    "کیانا دانایی",
    "لیلا قاصدک",
  ],
  code_breaker: [
    "آرماند منطق",
    "رمزبان شایان",
    "نویان هوشمند",
    "شکارچی ارقام",
    "پارسا رمزینه",
    "آراد الگوریتم",
    "ستاره محاسبات",
    "کاوه دقت",
  ],
  last_night: [
    "شوالیهٔ سایه",
    "آریس شب",
    "نگهبان سپیده",
    "کاوهٔ تاریک",
    "ارس رخش",
    "سپیدار مینو",
    "دِلم سپید",
    "بهمن شمشیر",
  ],
  sheriff_blast: [
    "سپهر طلایی",
    "کاوه بی‌باک",
    "نیلوفر شانس",
    "آراد آتشین",
    "مهسا پرنده",
    "تینا بخت‌آور",
    "سامیار رعد",
    "الینا شعله",
  ],
};

/** Base wait before a shadow opponent takes the empty seat. */
export const SHADOW_TRIGGER_DELAY_MS = 6_000;
/** Extra randomized humanizing jitter on top of the base delay. */
export const SHADOW_TRIGGER_JITTER_MS = 2_500;

/**
 * Pick a persona for a game. `rnd` is injectable for deterministic tests.
 */
export function pickShadowPersona(
  game: ShadowGameId,
  rnd: () => number = Math.random,
): string {
  const pool = SHADOW_PERSONAS[game];
  if (pool.length === 0) return "حریف";
  const raw = Math.floor(rnd() * pool.length);
  const idx = Math.min(pool.length - 1, Math.max(0, raw));
  return pool[idx];
}

/** Randomized activation delay: [SHADOW_TRIGGER_DELAY_MS, +JITTER] ms. */
export function shadowTriggerDelayMs(rnd: () => number = Math.random): number {
  const jitter = Math.min(1, Math.max(0, rnd()));
  return SHADOW_TRIGGER_DELAY_MS + Math.round(jitter * SHADOW_TRIGGER_JITTER_MS);
}

export interface ShadowOpponentState {
  /** True once the hidden opponent has taken the empty seat. */
  active: boolean;
  /** True while we are still "searching" for an opponent (armed, not yet seated). */
  searching: boolean;
  /** Display name of the shadow opponent for this activation. */
  name: string;
}

/**
 * React hook that seats a hidden bot opponent after a short randomized wait
 * while `armed` stays true (player alone in a two-player room). Deactivates
 * the moment `armed` turns false — i.e. a real human joined or the room state
 * moved on.
 */
export function useShadowOpponent({
  game,
  armed,
  delayMs,
}: {
  game: ShadowGameId;
  armed: boolean;
  /** Override the base delay (tests / tuned per game). */
  delayMs?: number;
}): ShadowOpponentState {
  const [active, setActive] = useState(false);
  const [name, setName] = useState(() => pickShadowPersona(game));

  useEffect(() => {
    if (!armed) {
      setActive(false);
      return;
    }
    const base = delayMs ?? SHADOW_TRIGGER_DELAY_MS;
    const jitter = Math.round(Math.random() * SHADOW_TRIGGER_JITTER_MS);
    const timer = window.setTimeout(() => {
      setName(pickShadowPersona(game));
      setActive(true);
    }, base + jitter);
    return () => window.clearTimeout(timer);
  }, [game, armed, delayMs]);

  return {
    active: armed && active,
    searching: armed && !active,
    name,
  };
}
