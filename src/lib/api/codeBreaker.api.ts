import type {
  CodeBreakerCreateJoinResponse,
  CodeBreakerStateResponse,
  LeaveResponse,
} from "@/types/api";
import { rpc } from "./client";

export interface CreateCodeBreakerRoomOptions {
  maxAttemptsPerPlayer?: number | null;
  profileToken?: string | null;
}

export const codeBreakerApi = {
  createRoom(displayName: string, opts?: CreateCodeBreakerRoomOptions) {
    return rpc<CodeBreakerCreateJoinResponse>("cb_create_room", {
      p_display_name: displayName,
      p_max_attempts: opts?.maxAttemptsPerPlayer ?? null,
      p_profile_token: opts?.profileToken ?? null,
    });
  },

  joinRoom(roomCode: string, displayName: string, profileToken?: string | null) {
    return rpc<CodeBreakerCreateJoinResponse>("cb_join_room", {
      p_room_code: roomCode,
      p_display_name: displayName,
      p_profile_token: profileToken ?? null,
    });
  },

  getRoomState(roomCode: string, token?: string | null, notify = false) {
    return rpc<CodeBreakerStateResponse>("cb_get_room_state", {
      p_room_code: roomCode,
      p_token: token ?? null,
      p_notify: notify,
    });
  },

  setReady(roomCode: string, token: string, ready: boolean) {
    return rpc<CodeBreakerStateResponse>("cb_set_ready", {
      p_room_code: roomCode,
      p_token: token,
      p_ready: ready,
    });
  },

  submitGuess(roomCode: string, token: string, guessCode: string) {
    return rpc<CodeBreakerStateResponse>("cb_submit_guess", {
      p_room_code: roomCode,
      p_token: token,
      p_guess_code: guessCode,
    });
  },

  rematch(roomCode: string, token: string) {
    return rpc<CodeBreakerStateResponse>("cb_rematch", {
      p_room_code: roomCode,
      p_token: token,
    });
  },

  leaveRoom(roomCode: string, token: string) {
    return rpc<LeaveResponse>("cb_leave_room", {
      p_room_code: roomCode,
      p_token: token,
    });
  },
};
