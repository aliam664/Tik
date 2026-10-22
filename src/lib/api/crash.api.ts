import type { CrashServerState } from "@/types/crash";
import { rpc } from "./client";

export const crashApi = {
  getState(token?: string | null) {
    return rpc<CrashServerState>("crash_get_state", { p_token: token ?? null });
  },

  placeBet(token: string, amount: number, autoAt: number | null, slot: 0 | 1) {
    return rpc<CrashServerState>("crash_place_bet", {
      p_token: token,
      p_amount: amount,
      p_auto_at: autoAt,
      p_slot: slot,
    });
  },

  cashOut(token: string, betId: string) {
    return rpc<CrashServerState>("crash_cash_out", {
      p_token: token,
      p_bet_id: betId,
    });
  },
};
