import type {
  LeaderboardResponse,
  MyProfileResponse,
  RecoverPlayerResponse,
  RegisterPlayerResponse,
  ShopItem,
} from "@/types/api";
import { rpc } from "./client";

export const economyApi = {
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
};
