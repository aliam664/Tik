import type { PlayerProfile, TierInfoJson } from "./economy";
import type { PlayerSymbol, RoomStatus } from "./room";

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

export interface DailyActivityPoint {
  day: string;
  games: number;
  moves: number;
  new_players: number;
  issued: number;
  burned: number;
}

export interface AdminDashboardData {
  players_total: number;
  players_active_24h: number;
  players_online: number;
  rooms_waiting: number;
  rooms_active: number;
  rooms_playing: number;
  games_finished: number;
  rooms_closed: number;
  rooms_expired: number;
  games_24h: number;
  moves_24h: number;
  stakes_24h: number;
  queue_searching: number;
  queue_matched: number;
  total_supply: number;
  issued_24h: number;
  burned_24h: number;
  open_risk_flags: number;
  active_bans: number;
  maintenance_mode: boolean;
  daily_activity: DailyActivityPoint[];
  mode_breakdown: {
    friendly: number;
    ranked: number;
    stakes: number;
  };
  tier_distribution: {
    bronze: number;
    silver: number;
    gold: number;
    platinum: number;
    diamond: number;
    master: number;
  };
  outcome_breakdown: {
    x_wins: number;
    o_wins: number;
    draws: number;
    forfeits: number;
  };
  server_now: string;
}

export interface AdminSystemMetrics {
  cpu: {
    usage_percent: number;
    active_workers: number;
    max_workers: number;
    waiting_workers: number;
  };
  ram: {
    usage_percent: number;
    shared_buffers_mb: number;
    used_buffers_mb: number;
    dirty_buffers_mb: number;
    work_mem_mb: number;
    effective_cache_mb: number;
  };
  storage: {
    used_bytes: number;
    used_mb: number;
    quota_mb: number;
    usage_percent: number;
  };
  connections: {
    total: number;
    active: number;
    idle: number;
    max_connections: number;
    usage_percent: number;
  };
  performance: {
    cache_hit_ratio: number;
    xact_commit: number;
    xact_rollback: number;
    tup_inserted: number;
    tup_updated: number;
    tup_deleted: number;
    tup_fetched: number;
    deadlocks: number;
    query_calls: number;
    query_total_ms: number;
    query_avg_ms: number;
  };
  tables: {
    table_name: string;
    row_estimate: number;
    total_bytes: number;
    size_pretty: string;
  }[];
  server_started_at: string;
  uptime_seconds: number;
  pg_version: string;
  server_now: string;
}

export interface AdminPlayerRow {
  id: string;
  display_name: string;
  status: string;
  wallet_frozen: boolean;
  created_at: string | null;
  last_seen_at: string | null;
  balance: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_streak?: number;
  best_win_streak?: number;
  rating: number;
  peak_rating?: number;
  placement_left?: number;
  tier: TierInfoJson;
  has_active_ban?: boolean;
  active_room_code?: string | null;
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

export interface AdminCrashOps {
  ok: boolean;
  source: string;
  server_now?: string;
  round: Record<string, unknown> | null;
  kpis: {
    rounds_total: number;
    rounds_24h: number;
    wagered: number;
    paid: number;
    bets: number;
    cashed: number;
  };
  recent: Record<string, unknown>[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminEnsureProfileResponse {
  player_token: string;
  recovery_code: string | null;
  profile: PlayerProfile;
}
