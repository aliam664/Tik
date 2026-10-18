import type { GameMode, SettlementResult } from "./economy";

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

export interface LeaveResponse {
  ok: boolean;
  action: "room_closed" | "seat_freed" | "left" | "forfeit";
}
