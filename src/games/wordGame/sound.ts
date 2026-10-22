/**
 * RAZ-VAJEH (رازواژه — WORD CIPHER)
 * Procedural WebAudio tactile tabletop card & chime sound engine.
 * Safe in SSR/jsdom test environments (gracefully no-ops without AudioContext).
 */

export type WordSoundEffect =
  | "card_select"
  | "clue_sent"
  | "hint_unlock"
  | "guess_correct"
  | "guess_related"
  | "guess_wrong"
  | "round_next"
  | "match_victory";

class WordCipherSoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  play(effect: WordSoundEffect): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    switch (effect) {
      case "card_select":
        this.note(ctx, "triangle", 480, 620, 0.09, 0.11, t);
        break;
      case "clue_sent":
        this.note(ctx, "sine", 523.25, 659.25, 0.14, 0.12, t);
        this.note(ctx, "triangle", 783.99, 783.99, 0.16, 0.09, t + 0.07);
        break;
      case "hint_unlock":
        this.note(ctx, "sine", 587.33, 880, 0.18, 0.11, t);
        break;
      case "guess_correct":
        this.note(ctx, "sine", 523.25, 523.25, 0.12, 0.14, t);
        this.note(ctx, "sine", 659.25, 659.25, 0.12, 0.14, t + 0.09);
        this.note(ctx, "triangle", 783.99, 1046.5, 0.28, 0.16, t + 0.18);
        break;
      case "guess_related":
        this.note(ctx, "triangle", 440, 554.37, 0.16, 0.12, t);
        this.note(ctx, "sine", 554.37, 659.25, 0.18, 0.1, t + 0.1);
        break;
      case "guess_wrong":
        this.note(ctx, "sawtooth", 240, 165, 0.18, 0.08, t);
        break;
      case "round_next":
        this.note(ctx, "sine", 392, 587.33, 0.16, 0.12, t);
        break;
      case "match_victory":
        this.note(ctx, "triangle", 523.25, 523.25, 0.14, 0.14, t);
        this.note(ctx, "triangle", 659.25, 659.25, 0.14, 0.14, t + 0.11);
        this.note(ctx, "triangle", 783.99, 783.99, 0.14, 0.15, t + 0.22);
        this.note(ctx, "sine", 1046.5, 1046.5, 0.36, 0.18, t + 0.33);
        break;
    }
  }

  private note(
    ctx: AudioContext,
    type: OscillatorType,
    startHz: number,
    endHz: number,
    durationSec: number,
    peakGain: number,
    startAt: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startHz, startAt);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(30, endHz),
      startAt + durationSec,
    );
    gain.gain.setValueAtTime(0.001, startAt);
    gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + durationSec + 0.015);
  }
}

export const wordCipherAudio = new WordCipherSoundEngine();
