import { adminApi } from "./api/admin.api";
import { rpc } from "./api/client";
import { economyApi } from "./api/economy.api";
import { matchmakingApi } from "./api/matchmaking.api";
import { roomsApi } from "./api/rooms.api";

export const api = {
  ...roomsApi,
  ...economyApi,
  ...matchmakingApi,
};

export { adminApi, economyApi, matchmakingApi, roomsApi, rpc };
