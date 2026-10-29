import { rpc } from "./client";

/**
 * Sheriff Blast — shared salon RPCs.
 * The server owns ONE global round for every client (any OS / any device):
 *  • crash_get_state   → current round + history + live bets + wallet + stats
 *  • crash_place_bet   → place a stake in the shared round (server-validated)
 *  • crash_cash_out    → cash out at the server clock (race-proof)
 * All timestamps in the payload are ISO strings from Postgres.
 */

export type CrashServerPhase = "betting" | "flying" | "crashed";

export interface CrashServerRound {
  id: string;
  index: number;
  phase: CrashServerPhase;
  seed_hash: string;
  seed: string | null;
  salt: string;
  crash_point: number | null;
  betting_ends_at: string;
  flying_started_at: string | null;
  crashed_at: string | null;
  next_at: string | null;
  server_now: string;
}

export interface CrashServerHistoryRow {
  index: number;
  crash_point: number;
  crashed_at: string | null;
  seed_hash: string;
  seed: string;
  salt: string;
}

export interface CrashServerBet {
  id: string;
  slot: number;
  amount: number;
  auto_at: number | null;
  cashed_at: number | null;
  payout: number;
  name: string;
  is_me: boolean;
  created_at: string;
}

export interface CrashServerState {
  round: CrashServerRound;
  history: CrashServerHistoryRow[];
  bets: CrashServerBet[];
  wallet: { balance: number | null };
  stats: {
    wagered_today: number;
    paid_today: number;
    pnl_today: number;
    loss_today: number;
    daily_loss_cap: number;
  };
  limits: {
    min_bet: number;
    max_bet: number;
    max_slots: number;
    house_edge_bps: number;
  };
}

export async function crashGetState(token: string | null): Promise<CrashServerState> {
  return rpc<CrashServerState>("crash_get_state", { p_token: token });
}

export async function crashPlaceBet(
  token: string,
  amount: number,
  autoAt: number | null,
  slot: 0 | 1,
): Promise<CrashServerState> {
  return rpc<CrashServerState>("crash_place_bet", {
    p_token: token,
    p_amount: Math.floor(amount),
    p_auto_at: autoAt,
    p_slot: slot,
  });
}

export async function crashCashOut(token: string, betId: string): Promise<CrashServerState> {
  return rpc<CrashServerState>("crash_cash_out", { p_token: token, p_bet_id: betId });
}
