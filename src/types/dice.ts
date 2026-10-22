import type { DiceSide } from "@/games/dice/math";

export type DicePhase = "betting" | "revealed";

export interface DiceRound {
  id: string;
  index: number;
  phase: DicePhase;
  seed_hash: string;
  seed: string | null;
  salt: string;
  roll: number | null;
  betting_ends_at: string;
  revealed_at: string | null;
  next_at: string | null;
  server_now: string;
}

export interface DiceBet {
  id: string;
  amount: number;
  side: DiceSide;
  target: number;
  chance_bps: number;
  multiplier: number;
  won: boolean | null;
  payout: number;
  name: string;
  is_me: boolean;
  created_at: string;
}

export interface DiceHistoryRow {
  index: number;
  roll: number;
  seed_hash: string;
  seed: string;
  salt: string;
  revealed_at: string;
}

export interface DiceState {
  round: DiceRound;
  history: DiceHistoryRow[];
  bets: DiceBet[];
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
    house_edge_bps: number;
  };
}
