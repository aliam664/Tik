import type { DiceSide } from "@/games/dice/math";
import type { DiceState } from "@/types/dice";
import { rpc } from "./client";

export const diceApi = {
  getState(token?: string | null) {
    return rpc<DiceState>("dice_get_state", { p_token: token ?? null });
  },

  placeBet(token: string, amount: number, side: DiceSide, target: number) {
    return rpc<DiceState>("dice_place_bet", {
      p_token: token,
      p_amount: amount,
      p_side: side,
      p_target: target,
    });
  },
};
