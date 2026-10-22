/**
 * CODE BREAKER (رمزگشا — نبرد هم‌زمان کشف کد ۴ رقمی)
 * Authoritative TypeScript contracts matching PostgreSQL 17 `cb_project_state`
 * and `SoloCodeBreakerController` bit-for-bit.
 *
 * CRITICAL INVARIANT: All secret codes and player guesses are stored and transmitted
 * strictly as exact 4-character strings (`"0000"` .. `"9999"`), NEVER integers!
 */

export type DigitFeedbackColor = "green" | "yellow" | "red";

export type CodeBreakerRoomStatus =
  | "waiting"
  | "active"
  | "finished"
  | "abandoned"
  | "expired";

export interface EvaluatedDigitCell {
  /** Zero-based slot index (`0`, `1`, `2`, `3` -> UI label `P1`..`P4`). */
  position: number;
  /** Single ASCII digit character `'0'`..`'9'`. */
  digit: string;
  /** Deterministic feedback color (`green` | `yellow` | `red`). */
  color: DigitFeedbackColor;
}

export interface EvaluatedCodeGuess {
  digits: [
    EvaluatedDigitCell,
    EvaluatedDigitCell,
    EvaluatedDigitCell,
    EvaluatedDigitCell,
  ];
  green_count: number;
  yellow_count: number;
  red_count: number;
  is_exact_match: boolean;
}

export interface CodeBreakerPlayerView {
  seat: number;
  name: string;
  connected: boolean;
  is_ready: boolean;
  wins: number;
  attempts_this_round: number;
}

export interface CodeBreakerGuessRecord {
  id: string;
  round_number: number;
  seat: number;
  player_name: string;
  player_attempt_number: number;
  global_attempt_order: number;
  /** Preserved exact 4-character string (e.g. `"0072"`, `"9090"`). */
  guess_code: string;
  digits: [
    EvaluatedDigitCell,
    EvaluatedDigitCell,
    EvaluatedDigitCell,
    EvaluatedDigitCell,
  ];
  green_count: number;
  yellow_count: number;
  red_count: number;
  is_winner: boolean;
  /** Server-authoritative ISO timestamp when accepted. */
  submitted_at: string;
  /** Server-authoritative elapsed milliseconds since `round_started_at`. */
  elapsed_ms: number;
}

export interface CodeBreakerPastRoundSummary {
  round_number: number;
  secret_code: string;
  winner_seat: number | null;
  winner_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number;
  total_guesses: number;
}

export interface CodeBreakerRoomState {
  room_id: string;
  room_code: string;
  status: CodeBreakerRoomStatus;
  version: number;
  current_round: number;
  max_players: number;
  max_attempts_per_player: number | null;
  server_now: string;
  round_started_at: string | null;
  round_ended_at: string | null;
  elapsed_ms: number;
  /** STRICTLY `null` until `status === "finished"`! Never leaked during active play. */
  secret_code: string | null;
  winner_seat: number | null;
  winner_name: string | null;
  winning_guess_id: string | null;
  players: CodeBreakerPlayerView[];
  my_guesses: CodeBreakerGuessRecord[];
  opponent_guesses: CodeBreakerGuessRecord[];
  all_guesses: CodeBreakerGuessRecord[];
  past_rounds: CodeBreakerPastRoundSummary[];
}

export interface CodeBreakerCreateJoinResponse {
  room_code: string;
  room_id: string;
  player_token: string;
  seat: number;
  state: CodeBreakerRoomState;
}

export interface CodeBreakerStateResponse {
  room_code: string;
  seat: number | null;
  state: CodeBreakerRoomState;
}
