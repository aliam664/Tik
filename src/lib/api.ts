import type {
  AdminGameRow,
  AdminOverview,
  AdminRoomDetail,
  AdminRoomRow,
  AdminSession,
  AuditRow,
  JoinCreateResponse,
  LeaderboardResponse,
  LeaveResponse,
  MyProfileResponse,
  Paged,
  PlatformSettings,
  PublicStatus,
  QueueAcceptResponse,
  QueueStatusResponse,
  RecoverPlayerResponse,
  RegisterPlayerResponse,
  RoomStateResponse,
  ShopItem,
} from "@/types/api";
import { ApiError, ERROR_MESSAGES } from "./errors";
import { env } from "./env";
import { supabase } from "./supabase";

/**
 * Thin typed wrappers over the SECURITY DEFINER RPCs.
 * The server returns clean error codes (e.g. ROOM_NOT_FOUND) inside
 * PostgREST's error.message — we convert them to ApiError.
 */

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!env.isConfigured && env.configIssue) {
    throw new ApiError(env.configIssue.code, true, env.configIssue.message);
  }

  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const businessCode = error.message.trim();
    const known = Boolean(ERROR_MESSAGES[businessCode]);
    const code = known ? businessCode : error.code || "UNKNOWN";
    const technical = [error.message, error.details, error.hint].filter(Boolean).join(" | ");
    throw new ApiError(code, known, technical);
  }
  return data as T;
}

/* ----------------------------- Player API ----------------------------- */

export const api = {
  createRoom(displayName: string) {
    return rpc<JoinCreateResponse>("create_room", { p_display_name: displayName });
  },

  joinRoom(roomCode: string, displayName: string) {
    return rpc<JoinCreateResponse>("join_room", {
      p_room_code: roomCode,
      p_display_name: displayName,
    });
  },

  getRoomState(roomCode: string, token?: string | null, notify = false) {
    return rpc<RoomStateResponse>("get_room_state", {
      p_room_code: roomCode,
      p_token: token ?? null,
      p_notify: notify,
    });
  },

  makeMove(roomCode: string, token: string, cellIndex: number) {
    return rpc<RoomStateResponse>("make_move", {
      p_room_code: roomCode,
      p_token: token,
      p_cell: cellIndex,
    });
  },

  requestRematch(roomCode: string, token: string) {
    return rpc<RoomStateResponse>("request_rematch", {
      p_room_code: roomCode,
      p_token: token,
    });
  },

  leaveRoom(roomCode: string, token: string) {
    return rpc<LeaveResponse>("leave_room", {
      p_room_code: roomCode,
      p_token: token,
    });
  },

  getPublicStatus() {
    return rpc<PublicStatus>("get_public_status", {});
  },

  /* --------------------- Player profile & economy --------------------- */

  registerPlayer(displayName: string) {
    return rpc<RegisterPlayerResponse>("register_player", {
      p_display_name: displayName,
    });
  },

  recoverPlayer(recoveryCode: string) {
    return rpc<RecoverPlayerResponse>("recover_player", {
      p_recovery_code: recoveryCode,
    });
  },

  rotateRecoveryCode(token: string) {
    return rpc<{ recovery_code: string }>("rotate_recovery_code", {
      p_token: token,
    });
  },

  getMyProfile(token: string) {
    return rpc<MyProfileResponse>("get_my_profile", { p_token: token });
  },

  getLeaderboard(period = "season", limit = 50, offset = 0) {
    return rpc<LeaderboardResponse>("get_leaderboard", {
      p_period: period,
      p_limit: limit,
      p_offset: offset,
    });
  },

  listShopItems() {
    return rpc<ShopItem[]>("list_shop_items", {});
  },

  purchaseItem(token: string, itemId: string) {
    return rpc<{ ok: boolean; balance: number; item: string }>("purchase_item", {
      p_token: token,
      p_item_id: itemId,
    });
  },

  getAnnouncements() {
    return rpc<{ body: string; level: string; ends_at: string }[]>(
      "get_active_announcements",
      {},
    );
  },

  /* ---------------------------- Matchmaking ---------------------------- */

  queueJoin(token: string, mode: "ranked" | "stakes", stake = 0) {
    return rpc<QueueStatusResponse>("queue_join", {
      p_token: token,
      p_mode: mode,
      p_stake: stake,
    });
  },

  queueLeave(token: string) {
    return rpc<{ ok: boolean; dodged?: boolean }>("queue_leave", {
      p_token: token,
    });
  },

  queueAccept(token: string) {
    return rpc<QueueAcceptResponse>("queue_accept", { p_token: token });
  },

  queueStatus(token: string) {
    return rpc<QueueStatusResponse>("queue_status", { p_token: token });
  },
};

/* ------------------------------ Admin API ----------------------------- */

export const adminApi = {
  login(username: string, password: string) {
    return rpc<AdminSession>("admin_login", {
      p_username: username,
      p_password: password,
    });
  },

  verify(token: string) {
    return rpc<{ ok: boolean; username: string }>("admin_verify", {
      p_admin_token: token,
    });
  },

  logout(token: string) {
    return rpc<{ ok: boolean }>("admin_logout", { p_admin_token: token });
  },

  changePassword(token: string, current: string, next: string) {
    return rpc<{ ok: boolean }>("admin_change_password", {
      p_admin_token: token,
      p_current_password: current,
      p_new_password: next,
    });
  },

  overview(token: string) {
    return rpc<AdminOverview>("admin_get_overview", { p_admin_token: token });
  },

  listRooms(
    token: string,
    opts: { search?: string; status?: string | null; limit?: number; offset?: number } = {},
  ) {
    return rpc<Paged<AdminRoomRow>>("admin_list_rooms", {
      p_admin_token: token,
      p_search: opts.search ?? null,
      p_status: opts.status ?? null,
      p_limit: opts.limit ?? 50,
      p_offset: opts.offset ?? 0,
    });
  },

  roomDetail(token: string, roomCode: string) {
    return rpc<AdminRoomDetail>("admin_get_room", {
      p_admin_token: token,
      p_room_code: roomCode,
    });
  },

  closeRoom(token: string, roomCode: string, reason?: string) {
    return rpc<{ ok: boolean }>("admin_close_room", {
      p_admin_token: token,
      p_room_code: roomCode,
      p_reason: reason ?? null,
    });
  },

  listGames(token: string, limit = 50, offset = 0) {
    return rpc<Paged<AdminGameRow>>("admin_list_games", {
      p_admin_token: token,
      p_limit: limit,
      p_offset: offset,
    });
  },

  getSettings(token: string) {
    return rpc<PlatformSettings>("admin_get_settings", { p_admin_token: token });
  },

  updateSettings(
    token: string,
    patch: {
      room_ttl_hours?: number | null;
      max_rooms_per_ip_per_hour?: number | null;
      max_joins_per_ip_per_hour?: number | null;
      maintenance_mode?: boolean | null;
      maintenance_message?: string | null;
    },
  ) {
    return rpc<PlatformSettings>("admin_update_settings", {
      p_admin_token: token,
      p_room_ttl_hours: patch.room_ttl_hours ?? null,
      p_max_rooms_per_ip_per_hour: patch.max_rooms_per_ip_per_hour ?? null,
      p_max_joins_per_ip_per_hour: patch.max_joins_per_ip_per_hour ?? null,
      p_maintenance_mode: patch.maintenance_mode ?? null,
      p_maintenance_message: patch.maintenance_message ?? null,
    });
  },

  audit(token: string, limit = 50, offset = 0) {
    return rpc<Paged<AuditRow>>("admin_get_audit", {
      p_admin_token: token,
      p_limit: limit,
      p_offset: offset,
    });
  },

  /* --------------------- Professional admin suite --------------------- */

  dashboard(token: string) {
    return rpc<Record<string, number | string | null>>("admin_get_dashboard", {
      p_admin_token: token,
    });
  },

  listPlayers(
    token: string,
    opts: { search?: string; limit?: number; offset?: number } = {},
  ) {
    return rpc<{
      total: number;
      items: Record<string, unknown>[];
      limit: number;
      offset: number;
    }>("admin_list_players", {
      p_admin_token: token,
      p_search: opts.search && opts.search.trim() ? opts.search.trim() : null,
      p_limit: opts.limit ?? 25,
      p_offset: opts.offset ?? 0,
    });
  },

  getPlayer(token: string, playerId: string) {
    return rpc<Record<string, unknown>>("admin_get_player", {
      p_admin_token: token,
      p_player_id: playerId,
    });
  },

  adjustCoins(token: string, playerId: string, amount: number, note: string) {
    return rpc<{ ok: boolean; balance: number }>("admin_adjust_coins", {
      p_admin_token: token,
      p_player_id: playerId,
      p_amount: amount,
      p_reason: "panel",
      p_note: note,
    });
  },

  setWalletFrozen(token: string, playerId: string, frozen: boolean, reason?: string) {
    return rpc<{ ok: boolean }>("admin_set_wallet_frozen", {
      p_admin_token: token,
      p_player_id: playerId,
      p_frozen: frozen,
      p_reason: reason ?? null,
    });
  },

  setBan(
    token: string,
    playerId: string,
    scope: "queue" | "stakes" | "global",
    hours: number,
    reason?: string,
  ) {
    return rpc<{ ok: boolean }>("admin_set_ban", {
      p_admin_token: token,
      p_player_id: playerId,
      p_scope: scope,
      p_hours: hours,
      p_reason: reason ?? null,
    });
  },

  resetRating(token: string, playerId: string, reason?: string) {
    return rpc<{ ok: boolean }>("admin_reset_rating", {
      p_admin_token: token,
      p_player_id: playerId,
      p_reason: reason ?? null,
    });
  },

  getEconomy(token: string) {
    return rpc<Record<string, unknown>>("admin_get_economy", {
      p_admin_token: token,
    });
  },

  updateEconomyConfig(token: string, key: string, value: string, reason: string) {
    return rpc<{ ok: boolean }>("admin_update_economy_config", {
      p_admin_token: token,
      p_key: key,
      p_value: value,
      p_reason: reason,
    });
  },

  rollbackEconomyConfig(token: string, historyId: number, reason?: string) {
    return rpc<{ ok: boolean }>("admin_rollback_economy_config", {
      p_admin_token: token,
      p_history_id: historyId,
      p_reason: reason ?? null,
    });
  },

  listRiskFlags(token: string, status = "open", limit = 50, offset = 0) {
    return rpc<{
      total: number;
      items: Record<string, unknown>[];
      limit: number;
      offset: number;
    }>("admin_list_risk_flags", {
      p_admin_token: token,
      p_status: status || null,
      p_limit: limit,
      p_offset: offset,
    });
  },

  resolveRiskFlag(token: string, flagId: string, resolution: "resolved" | "dismissed", note?: string) {
    return rpc<{ ok: boolean }>("admin_resolve_risk_flag", {
      p_admin_token: token,
      p_flag_id: flagId,
      p_resolution: resolution,
      p_note: note ?? null,
    });
  },

  matchmakingStats(token: string) {
    return rpc<Record<string, unknown>>("admin_matchmaking_stats", {
      p_admin_token: token,
    });
  },

  listSeasons(token: string) {
    return rpc<Record<string, unknown>[]>("admin_list_seasons", {
      p_admin_token: token,
    });
  },

  createSeason(
    token: string,
    name: string,
    startsAt: string,
    endsAt: string,
    resetFactor = 0.7,
  ) {
    return rpc<{ ok: boolean }>("admin_create_season", {
      p_admin_token: token,
      p_name: name,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_reset_factor: resetFactor,
    });
  },

  endSeason(token: string, seasonId: string) {
    return rpc<{ ok: boolean; players: number }>("admin_end_season", {
      p_admin_token: token,
      p_season_id: seasonId,
    });
  },

  listMatches(token: string, mode: string | null, limit = 50, offset = 0) {
    return rpc<{
      total: number;
      items: Record<string, unknown>[];
      limit: number;
      offset: number;
    }>("admin_list_matches", {
      p_admin_token: token,
      p_mode: mode,
      p_limit: limit,
      p_offset: offset,
    });
  },
};
