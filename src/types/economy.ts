import type { PlayerSymbol } from "./room";

export type GameMode = "friendly" | "ranked" | "stakes";

export interface SettlementResult {
  settled: boolean;
  match_id?: string;
  rating_x?: { before: number; after: number };
  rating_o?: { before: number; after: number };
  coins_x?: number;
  coins_o?: number;
  rake?: number;
}

export interface PlayerStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_streak: number;
  best_win_streak: number;
  forfeits_for: number;
  forfeits_against: number;
  stakes_played: number;
  stakes_won: number;
}

export interface TierInfoJson {
  tier: string;
  division: number;
}

export interface PlayerProfile {
  id: string;
  display_name: string;
  created_at: string | null;
  wallet_frozen: boolean;
  balance: number;
  stats: PlayerStats;
  rating: {
    rating: number;
    peak_rating: number;
    placement_left: number;
    tier: TierInfoJson;
  };
}

export interface RegisterPlayerResponse {
  player_token: string;
  recovery_code: string;
  profile: PlayerProfile;
}

export interface RecoverPlayerResponse {
  player_token: string;
  profile: PlayerProfile;
}

export interface ProfileMatchRow {
  room_code: string;
  game_number: number;
  mode: GameMode;
  stake: number;
  winner_symbol: PlayerSymbol | null;
  is_draw: boolean;
  forfeit: boolean;
  move_count: number;
  finished_at: string;
  my_symbol: PlayerSymbol;
  my_rating_before: number | null;
  my_rating_after: number | null;
  my_coins: number | null;
  opponent_name: string | null;
}

export interface LedgerRow {
  amount: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

export interface InventoryItem extends ShopItem {
  acquired_at: string;
  equipped: boolean;
}

export interface EquippedCosmetic {
  id: string;
  sku: string;
  name: string;
  kind: string;
  rarity: string;
}

export interface DailyGameplayProgress {
  earned: number;
  cap: number;
  remaining: number;
  resets_at: string;
}

export interface AchievementRow {
  code: string;
  title: string;
  description: string;
  reward_coins: number;
  achieved: boolean;
}

export interface MyProfileResponse {
  profile: PlayerProfile;
  recent_matches: ProfileMatchRow[];
  recent_ledger: LedgerRow[];
  achievements: AchievementRow[];
  inventory: InventoryItem[];
  equipped: Record<string, EquippedCosmetic>;
  daily_gameplay: DailyGameplayProgress;
}

export interface LeaderboardRow {
  rank: number;
  display_name: string;
  rating: number;
  peak_rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  tier: TierInfoJson;
}

export interface LeaderboardResponse {
  period: string;
  total: number;
  items: LeaderboardRow[];
  server_now: string;
}

export interface ShopItem {
  id: string;
  sku: string;
  name: string;
  kind: string;
  price: number;
  rarity: string;
}

export type QueueTicketStatus =
  | "searching"
  | "matched"
  | "accepted"
  | "closed"
  | "cancelled"
  | "dodged"
  | "expired";

export interface QueueTicket {
  id: string;
  mode: GameMode;
  stake: number;
  rating: number;
  status: QueueTicketStatus;
  enqueued_at: string | null;
  accept_deadline: string | null;
  wait_seconds: number;
  search_window: number | null;
}

export interface QueueStatusResponse {
  ticket: QueueTicket | null;
  opponent?: { name: string; rating: number } | null;
}

export interface QueueAcceptResponse {
  ticket: QueueTicket;
  room_code?: string;
  player_token?: string;
  symbol?: PlayerSymbol;
  both_accepted?: boolean;
}
