export type CrashPhase = "betting" | "flying" | "crashed";

export interface CrashServerRound {
  id: string;
  index: number;
  phase: CrashPhase;
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

export interface CrashServerBet {
  id: string;
  slot: 0 | 1;
  amount: number;
  auto_at: number | null;
  cashed_at: number | null;
  payout: number;
  name: string;
  is_me: boolean;
  created_at: string;
}

export interface CrashHistoryRow {
  index: number;
  crash_point: number;
  crashed_at: string;
  seed_hash: string;
  seed: string;
  salt: string;
}

export interface CrashServerState {
  round: CrashServerRound;
  history: CrashHistoryRow[];
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
