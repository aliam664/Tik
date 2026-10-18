import type {
  AdminDashboardData,
  AdminEnsureProfileResponse,
  AdminGameRow,
  AdminOverview,
  AdminPlayerRow,
  AdminRoomDetail,
  AdminRoomRow,
  AdminSession,
  AdminSystemMetrics,
  AuditRow,
  Paged,
  PlatformSettings,
  QueueStatusResponse,
  TierInfoJson,
} from "@/types/api";
import { rpc } from "./client";

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

  dashboard(token: string) {
    return rpc<AdminDashboardData>("admin_get_dashboard", {
      p_admin_token: token,
    });
  },

  systemMetrics(token: string) {
    return rpc<AdminSystemMetrics>("admin_get_system_metrics", {
      p_admin_token: token,
    });
  },

  maintenanceAction(
    token: string,
    action: "cleanup" | "snapshot" | "matchmaking_tick" | "clear_stale_queue" | "close_expired_rooms",
  ) {
    return rpc<{ ok: boolean; action: string; affected: number }>("admin_maintenance_action", {
      p_admin_token: token,
      p_action: action,
    });
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

  /* --------------------- Player management --------------------- */

  listPlayers(
    token: string,
    opts: { search?: string; limit?: number; offset?: number } = {},
  ) {
    return rpc<{
      total: number;
      items: AdminPlayerRow[];
      limit: number;
      offset: number;
    }>("admin_list_players", {
      p_admin_token: token,
      p_search: opts.search && opts.search.trim() ? opts.search.trim() : null,
      p_limit: opts.limit ?? 50,
      p_offset: opts.offset ?? 0,
    });
  },

  getPlayer(token: string, playerId: string) {
    return rpc<Record<string, unknown>>("admin_get_player", {
      p_admin_token: token,
      p_player_id: playerId,
    });
  },

  adjustCoins(token: string, playerId: string, amount: number, note?: string) {
    return rpc<{ ok: boolean; balance: number }>("admin_adjust_coins", {
      p_admin_token: token,
      p_player_id: playerId,
      p_amount: amount,
      p_reason: "panel",
      p_note: note?.trim() || "اعطا/اصلاح توسط مدیر",
    });
  },

  adjustRating(
    token: string,
    playerId: string,
    opts: {
      delta?: number;
      setExact?: number | null;
      addGames?: number;
      addWins?: number;
      note?: string;
    },
  ) {
    return rpc<{ ok: boolean; rating: number; tier: TierInfoJson }>("admin_adjust_rating", {
      p_admin_token: token,
      p_player_id: playerId,
      p_delta: opts.delta ?? 0,
      p_set_exact: opts.setExact ?? null,
      p_add_games: opts.addGames ?? 0,
      p_add_wins: opts.addWins ?? 0,
      p_note: opts.note?.trim() || "ویرایش XP و رنک توسط مدیر",
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

  unbanPlayer(token: string, playerId: string, reason?: string) {
    return rpc<{ ok: boolean }>("admin_unban_player", {
      p_admin_token: token,
      p_player_id: playerId,
      p_reason: reason ?? null,
    });
  },

  kickPlayer(
    token: string,
    opts: {
      playerId?: string | null;
      roomCode?: string | null;
      symbol?: string | null;
      reason?: string;
    },
  ) {
    return rpc<{ ok: boolean; kicked_rooms: number; kicked_tickets: number }>("admin_kick_player", {
      p_admin_token: token,
      p_player_id: opts.playerId ?? null,
      p_room_code: opts.roomCode ?? null,
      p_symbol: opts.symbol ?? null,
      p_reason: opts.reason ?? null,
    });
  },

  resetRating(token: string, playerId: string, reason?: string) {
    return rpc<{ ok: boolean }>("admin_reset_rating", {
      p_admin_token: token,
      p_player_id: playerId,
      p_reason: reason ?? null,
    });
  },

  /* --------------------- Economy, Shop & Live Ops --------------------- */

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

  createShopItem(
    token: string,
    item: { sku: string; name: string; kind: string; price: number; rarity?: string },
  ) {
    return rpc<{ ok: boolean; item: Record<string, unknown> }>("admin_create_shop_item", {
      p_admin_token: token,
      p_sku: item.sku,
      p_name: item.name,
      p_kind: item.kind,
      p_price: item.price,
      p_rarity: item.rarity ?? "common",
    });
  },

  createAnnouncement(token: string, body: string, level: "info" | "warn" | "event", hours = 24) {
    return rpc<{ ok: boolean; id: string }>("admin_create_announcement", {
      p_admin_token: token,
      p_body: body,
      p_level: level,
      p_hours: hours,
    });
  },

  /* --------------------- Integrity, Seasons & RBAC --------------------- */

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

  listAdmins(token: string) {
    return rpc<
      {
        id: string;
        username: string;
        role: string;
        is_active: boolean;
        created_at: string;
      }[]
    >("admin_list_admins", {
      p_admin_token: token,
    });
  },

  setRole(token: string, targetUsername: string, role: string) {
    return rpc<{ ok: boolean }>("admin_set_role", {
      p_admin_token: token,
      p_target_username: targetUsername,
      p_role: role,
    });
  },

  /* --------------------- Admin AI Arena & Matchmaking --------------------- */

  ensureProfile(token: string, displayName?: string, existingPlayerToken?: string | null) {
    return rpc<AdminEnsureProfileResponse>("admin_ensure_profile", {
      p_admin_token: token,
      p_display_name: displayName ?? null,
      p_existing_token: existingPlayerToken ?? null,
    });
  },

  adminQueueJoin(
    adminToken: string,
    playerToken: string,
    mode: "ranked" | "stakes",
    stake = 0,
  ) {
    return rpc<QueueStatusResponse>("admin_queue_join", {
      p_admin_token: adminToken,
      p_player_token: playerToken,
      p_mode: mode,
      p_stake: stake,
    });
  },
};
