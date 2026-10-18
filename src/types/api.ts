/**
 * Central API types — mirror of the server's public JSON shapes.
 * The server (SECURITY DEFINER RPCs) is the single source of truth.
 */

export type PlayerSymbol = "X" | "O";

export type RoomStatus =
  | "waiting"
  | "active"
  | "finished"
  | "closed"
  | "expired";

export interface PublicPlayer {
  symbol: PlayerSymbol;
  name: string;
  connected: boolean;
  profile_id?: string | null;
}

export interface RoomState {
  room_code: string;
  status: RoomStatus;
  mode: GameMode;
  stake: number;
  board: string; // 9 chars: X / O / .
  current_turn: PlayerSymbol;
  winner: PlayerSymbol | null;
  is_draw: boolean;
  winning_cells: number[];
  move_count: number;
  game_number: number;
  rematch_requested_by: PlayerSymbol | null;
  version: number;
  settlement: SettlementResult | null;
  forfeit: boolean;
  players: PublicPlayer[];
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  expires_in_seconds: number;
  server_now: string;
}

export interface RoomStateResponse {
  role: PlayerSymbol | null;
  state: RoomState;
}

export interface JoinCreateResponse {
  room_code: string;
  room_id: string;
  player_token: string;
  symbol: PlayerSymbol;
}

export interface PublicStatus {
  maintenance_mode: boolean;
  maintenance_message: string;
  active_rooms: number;
  games_played_total: number;
  server_now: string;
}

/* ------------------------------- Player / Economy ------------------------------- */

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

/* ------------------------------- Matchmaking ------------------------------- */

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

export interface LeaveResponse {
  ok: boolean;
  action: "room_closed" | "seat_freed" | "left" | "forfeit";
}

/* ------------------------------- Admin ------------------------------- */

export interface AdminSession {
  token: string;
  expires_at: string;
}

export interface AdminOverview {
  rooms_waiting: number;
  rooms_active: number;
  games_finished: number;
  rooms_closed: number;
  rooms_expired: number;
  games_last_24h: number;
  moves_last_24h: number;
  players_online: number;
  games_finished_total_moves: number;
  maintenance_mode: boolean;
  server_now: string;
}

export interface AdminRoomRow {
  room_code: string;
  status: RoomStatus;
  game_number: number;
  move_count: number;
  players: { symbol: PlayerSymbol; name: string; connected: boolean }[] | null;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  expires_in_seconds: number;
}

export interface AdminRoomDetail {
  room_code: string;
  status: RoomStatus;
  board: string;
  current_turn: PlayerSymbol;
  winner: PlayerSymbol | null;
  is_draw: boolean;
  move_count: number;
  game_number: number;
  version: number;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
  expires_in_seconds: number;
  players: {
    symbol: PlayerSymbol;
    name: string;
    joined_at: string;
    last_seen_at: string;
    connected: boolean;
  }[];
  moves: {
    move_number: number;
    game_number: number;
    symbol: PlayerSymbol;
    cell_index: number;
    created_at: string;
  }[];
  events: {
    event_type: string;
    payload: Record<string, unknown>;
    created_at: string;
  }[];
}

export interface AdminGameRow {
  room_code: string;
  game_number: number;
  winner: PlayerSymbol | null;
  is_draw: boolean;
  move_count: number;
  started_at: string | null;
  finished_at: string;
  players: { symbol: PlayerSymbol; name: string }[] | null;
}

export interface PlatformSettings {
  id: number;
  room_ttl_hours: number;
  max_rooms_per_ip_per_hour: number;
  max_joins_per_ip_per_hour: number;
  maintenance_mode: boolean;
  maintenance_message: string;
  updated_at: string;
}

export interface AuditRow {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  result: "success" | "failure";
  details: Record<string, unknown>;
  created_at: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
