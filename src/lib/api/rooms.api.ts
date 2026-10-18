import type {
  JoinCreateResponse,
  LeaveResponse,
  PublicStatus,
  RoomStateResponse,
} from "@/types/api";
import { rpc } from "./client";

export const roomsApi = {
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
