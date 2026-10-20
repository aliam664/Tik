/**
 * LAST NIGHT — MEDIEVAL SURVIVAL
 * Old-fashioned medieval & black-powder procedural WebAudio sound engine.
 * Safe in headless/test environments (no-ops when AudioContext is unavailable).
 */

export type MedievalSoundEffect =
  | "sword_swing"
  | "club_swing"
  | "axe_cleave"
  | "bow_shot"
  | "flintlock_shot"
  | "musket_shot"
  | "firearm_reload"
  | "spell_fire"
  | "spell_frost"
  | "spell_lightning"
  | "spell_protection"
  | "spell_spirits"
  | "spell_shadows"
  | "potion_drink"
  | "coin_clink"
  | "torch_light"
  | "chest_unlock"
  | "enemy_hit"
  | "boss_roar";

class MedievalSoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  play(effect: MedievalSoundEffect): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (effect) {
      case "sword_swing":
        this.tone(ctx, "triangle", 320, 120, 0.11, 0.12, now);
        this.noiseBurst(ctx, 0.08, 0.08, 1800, now);
        break;
      case "club_swing":
        this.tone(ctx, "sine", 160, 55, 0.16, 0.18, now);
        break;
      case "axe_cleave":
        this.tone(ctx, "sawtooth", 210, 68, 0.18, 0.15, now);
        this.noiseBurst(ctx, 0.12, 0.1, 1100, now);
        break;
      case "bow_shot":
        this.tone(ctx, "triangle", 520, 190, 0.14, 0.11, now);
        this.noiseBurst(ctx, 0.09, 0.05, 2600, now + 0.02);
        break;
      case "flintlock_shot":
        // Flint spark click followed by black-powder crack
        this.tone(ctx, "square", 1400, 900, 0.025, 0.08, now);
        this.noiseBurst(ctx, 0.24, 0.26, 950, now + 0.025);
        this.tone(ctx, "sawtooth", 150, 42, 0.22, 0.22, now + 0.025);
        break;
      case "musket_shot":
        // Heavy hunting musket thunderous boom
        this.tone(ctx, "square", 1200, 750, 0.03, 0.09, now);
        this.noiseBurst(ctx, 0.36, 0.32, 680, now + 0.03);
        this.tone(ctx, "sawtooth", 115, 32, 0.34, 0.28, now + 0.03);
        break;
      case "firearm_reload":
        this.tone(ctx, "triangle", 640, 820, 0.06, 0.08, now);
        this.tone(ctx, "triangle", 480, 720, 0.07, 0.08, now + 0.12);
        break;
      case "spell_fire":
        this.noiseBurst(ctx, 0.28, 0.18, 720, now);
        this.tone(ctx, "sawtooth", 280, 95, 0.26, 0.14, now);
        break;
      case "spell_frost":
        this.tone(ctx, "sine", 880, 1420, 0.22, 0.14, now);
        this.tone(ctx, "triangle", 1320, 660, 0.24, 0.1, now + 0.04);
        break;
      case "spell_lightning":
        this.noiseBurst(ctx, 0.22, 0.22, 2400, now);
        this.tone(ctx, "sawtooth", 760, 140, 0.2, 0.16, now);
        break;
      case "spell_protection":
        this.tone(ctx, "sine", 440, 660, 0.28, 0.14, now);
        this.tone(ctx, "triangle", 660, 880, 0.28, 0.11, now + 0.06);
        break;
      case "spell_spirits":
        this.tone(ctx, "sine", 360, 540, 0.34, 0.13, now);
        this.tone(ctx, "sine", 540, 720, 0.32, 0.1, now + 0.08);
        break;
      case "spell_shadows":
        this.noiseBurst(ctx, 0.18, 0.11, 1400, now);
        this.tone(ctx, "sine", 240, 120, 0.2, 0.12, now);
        break;
      case "potion_drink":
        this.tone(ctx, "sine", 380, 620, 0.14, 0.12, now);
        this.tone(ctx, "sine", 520, 780, 0.14, 0.12, now + 0.09);
        break;
      case "coin_clink":
        this.tone(ctx, "sine", 1350, 1760, 0.09, 0.1, now);
        break;
      case "torch_light":
        this.noiseBurst(ctx, 0.2, 0.12, 900, now);
        this.tone(ctx, "triangle", 340, 520, 0.18, 0.1, now);
        break;
      case "chest_unlock":
        this.tone(ctx, "triangle", 520, 780, 0.12, 0.12, now);
        this.tone(ctx, "sine", 780, 1040, 0.18, 0.14, now + 0.1);
        break;
      case "enemy_hit":
        this.tone(ctx, "triangle", 190, 80, 0.07, 0.1, now);
        break;
      case "boss_roar":
        this.tone(ctx, "sawtooth", 110, 48, 0.45, 0.22, now);
        this.noiseBurst(ctx, 0.35, 0.16, 420, now);
        break;
    }
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    startHz: number,
    endHz: number,
    durationSec: number,
    gainPeak: number,
    startTime: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startHz, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), startTime + durationSec);
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.01);
  }

  private noiseBurst(
    ctx: AudioContext,
    durationSec: number,
    gainPeak: number,
    cutoffHz: number,
    startTime: number,
  ): void {
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoffHz, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(startTime);
    source.stop(startTime + durationSec + 0.01);
  }
}

export const medievalAudio = new MedievalSoundEngine();
