import type {
  ExtraClueMode,
  GuesserViewMode,
  LeaveResponse,
  WordCreateJoinResponse,
  WordDifficulty,
  WordPackId,
  WordRoomStateResponse,
} from "@/types/api";
import { rpc } from "./client";

export interface CreateWordRoomOptions {
  totalRounds?: number;
  packId?: WordPackId;
  difficultyFilter?: "all" | WordDifficulty;
  extraClueMode?: ExtraClueMode;
  guesserViewMode?: GuesserViewMode;
  roundTimerSeconds?: number;
  profileToken?: string | null;
}

export const wordGameApi = {
  createRoom(displayName: string, opts?: CreateWordRoomOptions) {
    return rpc<WordCreateJoinResponse>("wg_create_room", {
      p_display_name: displayName,
      p_rules: {
        totalRounds: opts?.totalRounds ?? 4,
        packId: opts?.packId ?? "all",
        difficultyFilter: opts?.difficultyFilter ?? "all",
        extraClueMode: opts?.extraClueMode ?? "hybrid",
        guesserViewMode: opts?.guesserViewMode ?? "blind_typed",
        roundTimerSeconds: opts?.roundTimerSeconds ?? 120,
      },
      p_profile_token: opts?.profileToken ?? null,
    });
  },

  joinRoom(roomCode: string, displayName: string, profileToken?: string | null) {
    return rpc<WordCreateJoinResponse>("wg_join_room", {
      p_room_code: roomCode,
      p_display_name: displayName,
      p_profile_token: profileToken ?? null,
    });
  },

  getRoomState(roomCode: string, token?: string | null, notify = false) {
    return rpc<WordRoomStateResponse>("wg_get_room_state", {
      p_room_code: roomCode,
      p_token: token ?? null,
      p_notify: notify,
    });
  },

  setReady(roomCode: string, token: string, ready: boolean) {
    return rpc<WordRoomStateResponse>("wg_set_ready", {
      p_room_code: roomCode,
      p_token: token,
      p_ready: ready,
    });
  },

  selectTargetWord(roomCode: string, token: string, wordId: string) {
    return rpc<WordRoomStateResponse>("wg_select_target", {
      p_room_code: roomCode,
      p_token: token,
      p_word_id: wordId,
    });
  },

  submitClue(
    roomCode: string,
    token: string,
    clueText: string,
    kind: "association" | "category" | "narrowing" = "association",
    requestId?: string,
  ) {
    return rpc<WordRoomStateResponse>("wg_submit_clue", {
      p_room_code: roomCode,
      p_token: token,
      p_clue_text: clueText,
      p_kind: kind,
      p_request_id: requestId ?? null,
    });
  },

  requestHint(roomCode: string, token: string, requestId?: string) {
    return rpc<WordRoomStateResponse>("wg_request_hint", {
      p_room_code: roomCode,
      p_token: token,
      p_request_id: requestId ?? null,
    });
  },

  submitGuess(
    roomCode: string,
    token: string,
    guessText: string,
    requestId?: string,
  ) {
    return rpc<WordRoomStateResponse>("wg_submit_guess", {
      p_room_code: roomCode,
      p_token: token,
      p_guess_text: guessText,
      p_request_id: requestId ?? null,
    });
  },

  nextRound(roomCode: string, token: string, expectedRound: number) {
    return rpc<WordRoomStateResponse>("wg_next_round", {
      p_room_code: roomCode,
      p_token: token,
      p_expected_round: expectedRound,
    });
  },

  rematch(roomCode: string, token: string) {
    return rpc<WordRoomStateResponse>("wg_rematch", {
      p_room_code: roomCode,
      p_token: token,
    });
  },

  leaveRoom(roomCode: string, token: string) {
    return rpc<LeaveResponse>("wg_leave_room", {
      p_room_code: roomCode,
      p_token: token,
    });
  },
};
