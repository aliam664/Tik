import { adminApi } from "./api/admin.api";
import { rpc } from "./api/client";
import { codeBreakerApi } from "./api/codeBreaker.api";
import { economyApi } from "./api/economy.api";
import { lastNightApi } from "./api/lastNight.api";
import { matchmakingApi } from "./api/matchmaking.api";
import { roomsApi } from "./api/rooms.api";
import { wordGameApi } from "./api/wordGame.api";

export const api = {
  ...roomsApi,
  ...economyApi,
  ...matchmakingApi,
};

export {
  adminApi,
  codeBreakerApi,
  economyApi,
  lastNightApi,
  matchmakingApi,
  roomsApi,
  rpc,
  wordGameApi,
};

