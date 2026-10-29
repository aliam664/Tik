/**
 * Sheriff Blast — tiny WebAudio cues (no asset files).
 * All sounds are synthesized on demand; the mute preference persists locally.
 */

const MUTE_KEY = "sheriff-blast-muted";

let ctx: AudioContext | null = null;
let muted = readMute();

function readMute(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") {
    // Browsers keep AudioContext suspended until the first user gesture.
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* private mode — keep in-memory only */
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise(dur: number, gain: number): void {
  const a = ac();
  if (!a || muted) return;
  const t0 = a.currentTime;
  const frames = Math.floor(a.sampleRate * dur);
  const buffer = a.createBuffer(1, frames, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, t0);
  filter.frequency.exponentialRampToValueAtTime(180, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Short confirmation blip when a bet is registered. */
export function playBet(): void {
  tone(720, 0.09, "triangle", 0.08);
}

/** Rising two-tone chime for a successful cash-out. */
export function playCash(): void {
  tone(660, 0.14, "sine", 0.1);
  window.setTimeout(() => tone(990, 0.18, "sine", 0.1), 110);
}

/** The boom — low drop + noise burst. */
export function playCrash(): void {
  tone(180, 0.5, "sawtooth", 0.12, 48);
  noise(0.45, 0.16);
}

/** Soft tick when the betting window is about to close (< 1s). */
export function playCountdownTick(): void {
  tone(520, 0.05, "square", 0.045);
}
