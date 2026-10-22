/**
 * CODE BREAKER (رمزگشا — نبرد هم‌زمان کشف کد ۴ رقمی)
 * Core deterministic 4-digit evaluation engine, string format guards,
 * procedural audio synthesizer, session storage, and Solo AI Race controller
 * matching PostgreSQL 17 `cb_project_state` bit-for-bit.
 */

import type {
  CodeBreakerGuessRecord,
  CodeBreakerPastRoundSummary,
  CodeBreakerPlayerView,
  CodeBreakerRoomStatus,
  CodeBreakerStateResponse,
  DigitFeedbackColor,
  EvaluatedCodeGuess,
  EvaluatedDigitCell,
} from "@/types/codeBreaker";

export const CODE_LENGTH = 4;

/**
 * Validates that an input is strictly a 4-character string of ASCII digits '0'..'9'.
 * Preserves leading zeros ("0000", "0072", "0123") and converts Persian/Arabic digits safely.
 */
export function normalizeFourDigitCode(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const converted = raw
    .trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (!/^[0-9]{4}$/.test(converted)) {
    return null;
  }
  return converted;
}

/**
 * Generates an unbiased cryptographically random 4-character digit string ("0000" .. "9999").
 * Repeated digits and leading zeros are naturally permitted with uniform probability.
 */
export function generateSecretCode4(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const arr = new Uint32Array(1);
    do {
      crypto.getRandomValues(arr);
    } while (arr[0] >= 4294960000);
    return String(arr[0] % 10000).padStart(4, "0");
  }
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

/**
 * Deterministic Two-Pass Feedback Evaluator (Section 3 — exact match with SQL `cb_evaluate_guess`):
 *  - Pass 1: Identify exact-position matches (`GREEN`), counting remaining unmatched
 *    occurrences of each digit `0..9` in `secretCode`.
 *  - Pass 2: For every non-green position `i`, if `unmatched[guess[i]] > 0`, mark
 *    `YELLOW` and decrement `unmatched[guess[i]]` so the same occurrence in `secretCode`
 *    is NEVER counted multiple times. Otherwise mark `RED`.
 */
export function evaluateCodeGuess(
  secretCode: string,
  guessCode: string,
): EvaluatedCodeGuess {
  const secret = normalizeFourDigitCode(secretCode);
  const guess = normalizeFourDigitCode(guessCode);
  if (!secret || !guess) {
    throw new Error("INVALID_CODE_GUESS");
  }

  const colors: [
    DigitFeedbackColor,
    DigitFeedbackColor,
    DigitFeedbackColor,
    DigitFeedbackColor,
  ] = ["red", "red", "red", "red"];
  const unmatchedSecretCounts = new Array<number>(10).fill(0);

  let green = 0;
  let yellow = 0;

  // Pass 1: Exact position matches (`GREEN`)
  for (let i = 0; i < 4; i += 1) {
    if (guess[i] === secret[i]) {
      colors[i] = "green";
      green += 1;
    } else {
      const sDigit = secret.charCodeAt(i) - 48;
      unmatchedSecretCounts[sDigit] += 1;
    }
  }

  // Pass 2: Misplaced occurrences from remaining unmatched digits (`YELLOW` vs `RED`)
  for (let i = 0; i < 4; i += 1) {
    if (colors[i] === "green") continue;
    const gDigit = guess.charCodeAt(i) - 48;
    if (unmatchedSecretCounts[gDigit] > 0) {
      colors[i] = "yellow";
      unmatchedSecretCounts[gDigit] -= 1;
      yellow += 1;
    }
  }

  const red = 4 - green - yellow;
  const digits = [0, 1, 2, 3].map((position) => ({
    position,
    digit: guess[position],
    color: colors[position],
  })) as [
    EvaluatedDigitCell,
    EvaluatedDigitCell,
    EvaluatedDigitCell,
    EvaluatedDigitCell,
  ];

  return {
    digits,
    green_count: green,
    yellow_count: yellow,
    red_count: red,
    is_exact_match: green === 4,
  };
}

/** Format milliseconds elapsed as `MM:SS.cc` (e.g. `01:05.43`). */
export function formatElapsedMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const totalSec = Math.floor(safe / 1000);
  const centis = Math.floor((safe % 1000) / 10);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

/** Format ISO timestamp as `HH:MM:SS`. */
export function formatClockTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "--:--:--";
    return d.toLocaleTimeString("en-GB", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

/* =========================================================================
   Session Storage Helper (`localStorage` per room code)
   ========================================================================= */

export interface StoredCodeBreakerSession {
  roomCode: string;
  playerToken: string;
  seat: number;
  displayName: string;
  savedAt: string;
}

const CB_SESSION_PREFIX = "doz_cb_session_v1_";

export function saveCodeBreakerSession(session: StoredCodeBreakerSession): void {
  try {
    window.localStorage.setItem(
      `${CB_SESSION_PREFIX}${session.roomCode.toUpperCase()}`,
      JSON.stringify(session),
    );
  } catch {
    // Ignore storage errors in private mode
  }
}

export function loadCodeBreakerSession(
  roomCode: string,
): StoredCodeBreakerSession | null {
  try {
    const raw = window.localStorage.getItem(
      `${CB_SESSION_PREFIX}${roomCode.toUpperCase()}`,
    );
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredCodeBreakerSession>;
    if (!p.roomCode || !p.playerToken) return null;
    return {
      roomCode: p.roomCode.toUpperCase(),
      playerToken: p.playerToken,
      seat: Number(p.seat ?? 1),
      displayName: p.displayName ?? "بازیکن",
      savedAt: p.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearCodeBreakerSession(roomCode: string): void {
  try {
    window.localStorage.removeItem(
      `${CB_SESSION_PREFIX}${roomCode.toUpperCase()}`,
    );
  } catch {
    // Ignore
  }
}

/* =========================================================================
   Procedural Vault Keypad & Feedback Sound Synthesizer
   ========================================================================= */

export type CodeSoundEffect =
  | "key_tick"
  | "submit"
  | "ready_chime"
  | "crack_win"
  | "opponent_win";

class CodeBreakerSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(next: boolean): void {
    this.muted = next;
  }

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

  play(effect: CodeSoundEffect): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (effect) {
      case "key_tick":
        this.tone(ctx, "sine", 760, 620, 0.045, 0.08, t);
        break;
      case "submit":
        this.tone(ctx, "triangle", 430, 690, 0.11, 0.1, t);
        break;
      case "ready_chime":
        this.tone(ctx, "sine", 587.33, 880, 0.14, 0.12, t);
        break;
      case "crack_win":
        this.tone(ctx, "triangle", 523.25, 523.25, 0.12, 0.15, t);
        this.tone(ctx, "triangle", 659.25, 659.25, 0.12, 0.15, t + 0.09);
        this.tone(ctx, "triangle", 783.99, 783.99, 0.12, 0.16, t + 0.18);
        this.tone(ctx, "sine", 1046.5, 1046.5, 0.34, 0.18, t + 0.27);
        break;
      case "opponent_win":
        this.tone(ctx, "triangle", 392, 261.63, 0.28, 0.11, t);
        break;
    }
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    at: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), at + dur);
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.linearRampToValueAtTime(vol, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.015);
  }
}

export const codeBreakerAudio = new CodeBreakerSoundEngine();

/* =========================================================================
   Solo Real-Time Sparring Controller vs Knuth-Consistent AI Code-Breaker
   (Strictly hides `secretCode` inside private field until status === "finished"!)
   ========================================================================= */

export class SoloCodeBreakerController {
  private secretCode: string | null = null;
  private nextSecretOverride: string | undefined;
  private status: CodeBreakerRoomStatus = "waiting";
  private currentRound = 1;
  private maxAttemptsPerPlayer: number | null;
  private startedAtMs: number | null = null;
  private endedAtMs: number | null = null;
  private winnerSeat: number | null = null;
  private winningGuessId: string | null = null;
  private players: [CodeBreakerPlayerView, CodeBreakerPlayerView];
  private guesses: CodeBreakerGuessRecord[] = [];
  private pastRounds: CodeBreakerPastRoundSummary[] = [];
  private candidatePool: string[] = [];
  private version = 1;

  constructor(
    humanName: string,
    maxAttemptsPerPlayer: number | null = null,
    fixedSecretForTest?: string,
  ) {
    this.maxAttemptsPerPlayer = maxAttemptsPerPlayer;
    this.nextSecretOverride = fixedSecretForTest;
    this.players = [
      {
        seat: 1,
        name: humanName.trim() || "شما",
        connected: true,
        is_ready: false,
        wins: 0,
        attempts_this_round: 0,
      },
      {
        seat: 2,
        name: "واحد رمزگشای AI",
        connected: true,
        is_ready: true,
        wins: 0,
        attempts_this_round: 0,
      },
    ];
    this.resetAiCandidates();
  }

  private resetAiCandidates(): void {
    this.candidatePool = [];
    for (let n = 0; n < 10000; n += 1) {
      this.candidatePool.push(String(n).padStart(4, "0"));
    }
  }

  setReady(ready: boolean): CodeBreakerStateResponse {
    if (this.status !== "waiting") {
      return this.getSnapshot();
    }
    this.players[0] = { ...this.players[0], is_ready: ready };
    this.players[1] = { ...this.players[1], is_ready: true };

    if (this.players[0].is_ready && this.players[1].is_ready) {
      this.secretCode = this.nextSecretOverride ?? generateSecretCode4();
      this.nextSecretOverride = undefined;
      this.startedAtMs = Date.now();
      this.endedAtMs = null;
      this.winnerSeat = null;
      this.winningGuessId = null;
      this.status = "active";
    }
    this.version += 1;
    return this.getSnapshot();
  }

  submitGuess(rawGuess: string): CodeBreakerStateResponse {
    const clean = normalizeFourDigitCode(rawGuess);
    if (!clean) throw new Error("INVALID_CODE_GUESS");
    if (this.status === "waiting") throw new Error("WAITING_FOR_READY");
    if (this.status === "finished") throw new Error("ROUND_ALREADY_FINISHED");
    if (this.status !== "active" || !this.secretCode || this.startedAtMs === null) {
      throw new Error("GAME_NOT_ACTIVE");
    }
    if (
      this.maxAttemptsPerPlayer !== null &&
      this.players[0].attempts_this_round >= this.maxAttemptsPerPlayer
    ) {
      throw new Error("MAX_ATTEMPTS_REACHED");
    }

    this.appendGuessInternal(1, clean);
    this.version += 1;
    return this.getSnapshot();
  }

  triggerAiStep(): CodeBreakerStateResponse | null {
    if (this.status !== "active" || !this.secretCode || this.startedAtMs === null) {
      return null;
    }
    if (
      this.maxAttemptsPerPlayer !== null &&
      this.players[1].attempts_this_round >= this.maxAttemptsPerPlayer
    ) {
      return null;
    }

    const pick =
      this.players[1].attempts_this_round === 0
        ? ["0123", "1245", "3678", "4589"][Math.floor(Math.random() * 4)]
        : this.candidatePool[
            Math.floor(Math.random() * Math.max(1, this.candidatePool.length))
          ] ?? generateSecretCode4();

    const rec = this.appendGuessInternal(2, pick);
    // Prune AI candidates using Knuth consistency against AI's own feedback only!
    this.candidatePool = this.candidatePool.filter((cand) => {
      if (cand === pick) return false;
      const hyp = evaluateCodeGuess(cand, pick);
      return hyp.green_count === rec.green_count && hyp.yellow_count === rec.yellow_count;
    });

    this.version += 1;
    return this.getSnapshot();
  }

  rematch(nextFixedSecretForTest?: string): CodeBreakerStateResponse {
    if (this.status !== "finished") {
      throw new Error("REMATCH_NOT_ALLOWED");
    }
    const durationMs =
      this.startedAtMs !== null && this.endedAtMs !== null
        ? Math.max(0, this.endedAtMs - this.startedAtMs)
        : 0;
    const winnerObj =
      this.winnerSeat !== null
        ? this.players.find((p) => p.seat === this.winnerSeat) ?? null
        : null;

    this.pastRounds = [
      ...this.pastRounds,
      {
        round_number: this.currentRound,
        secret_code: this.secretCode ?? "----",
        winner_seat: this.winnerSeat,
        winner_name: winnerObj?.name ?? null,
        started_at:
          this.startedAtMs !== null ? new Date(this.startedAtMs).toISOString() : null,
        ended_at:
          this.endedAtMs !== null ? new Date(this.endedAtMs).toISOString() : null,
        duration_ms: durationMs,
        total_guesses: this.guesses.length,
      },
    ];

    this.currentRound += 1;
    this.secretCode = null;
    this.nextSecretOverride = nextFixedSecretForTest;
    this.startedAtMs = null;
    this.endedAtMs = null;
    this.winnerSeat = null;
    this.winningGuessId = null;
    this.guesses = [];
    this.players = [
      { ...this.players[0], is_ready: false, attempts_this_round: 0 },
      { ...this.players[1], is_ready: true, attempts_this_round: 0 },
    ];
    this.resetAiCandidates();
    this.status = "waiting";
    this.version += 1;
    return this.getSnapshot();
  }

  private appendGuessInternal(seat: 1 | 2, cleanCode: string): CodeBreakerGuessRecord {
    const nowMs = Date.now();
    const elapsedMs = Math.max(0, nowMs - (this.startedAtMs ?? nowMs));
    const pIdx = seat - 1;
    const attemptNum = this.players[pIdx].attempts_this_round + 1;
    const globalOrder = this.guesses.length + 1;
    const ev = evaluateCodeGuess(this.secretCode!, cleanCode);
    const id = `solo_g_${this.currentRound}_${globalOrder}`;

    const record: CodeBreakerGuessRecord = {
      id,
      round_number: this.currentRound,
      seat,
      player_name: this.players[pIdx].name,
      player_attempt_number: attemptNum,
      global_attempt_order: globalOrder,
      guess_code: cleanCode,
      digits: ev.digits,
      green_count: ev.green_count,
      yellow_count: ev.yellow_count,
      red_count: ev.red_count,
      is_winner: ev.is_exact_match,
      submitted_at: new Date(nowMs).toISOString(),
      elapsed_ms: elapsedMs,
    };

    this.guesses = [...this.guesses, record];
    this.players[pIdx] = {
      ...this.players[pIdx],
      attempts_this_round: attemptNum,
      wins: this.players[pIdx].wins + (ev.is_exact_match ? 1 : 0),
    };

    if (ev.is_exact_match) {
      this.endedAtMs = nowMs;
      this.winnerSeat = seat;
      this.winningGuessId = id;
      this.status = "finished";
    } else if (
      this.maxAttemptsPerPlayer !== null &&
      this.players[0].attempts_this_round >= this.maxAttemptsPerPlayer &&
      this.players[1].attempts_this_round >= this.maxAttemptsPerPlayer
    ) {
      this.endedAtMs = nowMs;
      this.status = "finished";
    }

    return record;
  }

  getSnapshot(): CodeBreakerStateResponse {
    const nowMs = Date.now();
    const elapsedMs =
      this.startedAtMs !== null
        ? Math.max(0, (this.endedAtMs ?? nowMs) - this.startedAtMs)
        : 0;
    const winnerObj =
      this.winnerSeat !== null
        ? this.players.find((p) => p.seat === this.winnerSeat) ?? null
        : null;

    return {
      room_code: "SOLOAI",
      seat: 1,
      state: {
        room_id: "solo_room",
        room_code: "SOLOAI",
        status: this.status,
        version: this.version,
        current_round: this.currentRound,
        max_players: 2,
        max_attempts_per_player: this.maxAttemptsPerPlayer,
        server_now: new Date(nowMs).toISOString(),
        round_started_at:
          this.startedAtMs !== null ? new Date(this.startedAtMs).toISOString() : null,
        round_ended_at:
          this.endedAtMs !== null ? new Date(this.endedAtMs).toISOString() : null,
        elapsed_ms: elapsedMs,
        // STRICT ZERO-LEAK INVARIANT:
        secret_code: this.status === "finished" ? this.secretCode : null,
        winner_seat: this.winnerSeat,
        winner_name: winnerObj?.name ?? null,
        winning_guess_id: this.winningGuessId,
        players: [...this.players],
        my_guesses: this.guesses.filter((g) => g.seat === 1),
        opponent_guesses: this.guesses.filter((g) => g.seat === 2),
        all_guesses: [...this.guesses],
        past_rounds: [...this.pastRounds],
      },
    };
  }
}
