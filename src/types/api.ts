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
}

export interface RoomState {
  room_code: string;
  status: RoomStatus;
  board: string; // 9 chars: X / O / .
  current_turn: PlayerSymbol;
  winner: PlayerSymbol | null;
  is_draw: boolean;
  winning_cells: number[];
  move_count: number;
  game_number: number;
  rematch_requested_by: PlayerSymbol | null;
  version: number;
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

export interface LeaveResponse {
  ok: boolean;
  action: "room_closed" | "seat_freed" | "left";
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
