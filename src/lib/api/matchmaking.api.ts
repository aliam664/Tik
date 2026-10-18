import type {
  QueueAcceptResponse,
  QueueStatusResponse,
} from "@/types/api";
import { rpc } from "./client";

export const matchmakingApi = {
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
