import type {
  AdminGameRow,
  AdminOverview,
  AdminRoomDetail,
  AdminRoomRow,
  AdminSession,
  AuditRow,
  JoinCreateResponse,
  LeaveResponse,
  Paged,
  PlatformSettings,
  PublicStatus,
  RoomStateResponse,
} from "@/types/api";
import { ApiError } from "./errors";
import { supabase } from "./supabase";

/**
 * Thin typed wrappers over the SECURITY DEFINER RPCs.
 * The server returns clean error codes (e.g. ROOM_NOT_FOUND) inside
 * PostgREST's error.message — we convert them to ApiError.
 */

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    throw new ApiError(error.message, false, error.details ?? undefined);
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
};
