import type {
  LeaveResponse,
  LnCreateJoinResponse,
  LnRoomStateResponse,
  MagicBookId,
  MedievalShopItemId,
  MedievalWeaponId,
} from "@/types/api";
import { rpc } from "./client";

export const lastNightApi = {
  createRoom(
    displayName: string,
    opts?: {
      maxPlayers?: 2 | 3;
      mode?: "coop" | "ranked" | "stakes";
      stake?: number;
      profileToken?: string | null;
    },
  ) {
    return rpc<LnCreateJoinResponse>("ln_create_room", {
      p_display_name: displayName,
      p_max_players: opts?.maxPlayers ?? 2,
      p_mode: opts?.mode ?? "coop",
      p_stake: opts?.stake ?? 0,
      p_profile_token: opts?.profileToken ?? null,
    });
  },

  joinRoom(roomCode: string, displayName: string, profileToken?: string | null) {
    return rpc<LnCreateJoinResponse>("ln_join_room", {
      p_room_code: roomCode,
      p_display_name: displayName,
      p_profile_token: profileToken ?? null,
    });
  },

  getRoomState(roomCode: string, token?: string | null, notify = false) {
    return rpc<LnRoomStateResponse>("ln_get_room_state", {
      p_room_code: roomCode,
      p_token: token ?? null,
      p_notify: notify,
    });
  },

  shopBuy(
    roomCode: string,
    token: string,
    category: "weapon" | "spellbook" | "item",
    itemId: MedievalWeaponId | MagicBookId | MedievalShopItemId,
  ) {
    return rpc<LnRoomStateResponse>("ln_shop_buy", {
      p_room_code: roomCode,
      p_token: token,
      p_category: category,
      p_item_id: itemId,
    });
  },

  equipLoadout(
    roomCode: string,
    token: string,
    opts: {
      weapon?: MedievalWeaponId | null;
      spells?: MagicBookId[] | null;
    },
  ) {
    return rpc<LnRoomStateResponse>("ln_equip_loadout", {
      p_room_code: roomCode,
      p_token: token,
      p_weapon: opts.weapon ?? null,
      p_spells: opts.spells ?? null,
    });
  },

  castSpell(
    roomCode: string,
    token: string,
    spellId: MagicBookId,
    targetX = 0,
    targetY = 0,
  ) {
    return rpc<LnRoomStateResponse>("ln_cast_spell", {
      p_room_code: roomCode,
      p_token: token,
      p_spell_id: spellId,
      p_target_x: Math.round(targetX),
      p_target_y: Math.round(targetY),
    });
  },

  useItem(roomCode: string, token: string, itemId: MedievalShopItemId) {
    return rpc<LnRoomStateResponse>("ln_use_item", {
      p_room_code: roomCode,
      p_token: token,
      p_item_id: itemId,
    });
  },

  syncAction(
    roomCode: string,
    token: string,
    action:
      | "start_wave"
      | "combat_sync"
      | "complete_objective"
      | "open_chest"
      | "revive_ally"
      | "wave_cleared",
    payload: Record<string, unknown> = {},
  ) {
    return rpc<LnRoomStateResponse>("ln_sync_action", {
      p_room_code: roomCode,
      p_token: token,
      p_action: action,
      p_payload: payload,
    });
  },

  leaveRoom(roomCode: string, token: string) {
    return rpc<LeaveResponse>("ln_leave_room", {
      p_room_code: roomCode,
      p_token: token,
    });
  },
};
