import { saveCodeBreakerSession } from "@/games/codeBreaker/engine";
import { saveLnSession } from "@/games/lastNight/session";
import { saveWordSession } from "@/games/wordGame/session";
import { getGameById } from "@/games/registry";
import { api, codeBreakerApi, lastNightApi, wordGameApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { playerSession } from "@/lib/session";

function roomPath(gameId: string, roomCode: string): string {
  const game = getGameById(gameId);
  if (!game?.roomRoutePrefix) {
    throw new Error(`Game "${gameId}" is missing roomRoutePrefix`);
  }
  return `${game.roomRoutePrefix}/${roomCode}`;
}

/**
 * Ordered join probes used by `/join`.
 * First adapter that finds the room wins. Keep classic DOZ first.
 * Adding a game: append an adapter that talks to that game's join RPC.
 */
export type RoomJoinHit = { readonly roomPath: string };
export type RoomJoinResult = RoomJoinHit | "not_found";

export interface RoomJoinAdapter {
  readonly id: string;
  tryJoin(roomCode: string, displayName: string, profileToken?: string | null): Promise<RoomJoinResult>;
}

async function notFoundOrThrow(err: unknown): Promise<"not_found"> {
  if (toUserError(err).code === "ROOM_NOT_FOUND") return "not_found";
  throw err;
}

export const ROOM_JOIN_ADAPTERS: readonly RoomJoinAdapter[] = [
  {
    id: "doz",
    async tryJoin(roomCode, displayName) {
      try {
        const res = await api.joinRoom(roomCode, displayName);
        playerSession.save(res.room_code, res.player_token, res.symbol);
        return { roomPath: roomPath("doz", res.room_code) };
      } catch (err) {
        return notFoundOrThrow(err);
      }
    },
  },
  {
    id: "code_breaker",
    async tryJoin(roomCode, displayName, profileToken) {
      try {
        const res = await codeBreakerApi.joinRoom(roomCode, displayName, profileToken ?? undefined);
        saveCodeBreakerSession({
          roomCode: res.room_code,
          playerToken: res.player_token,
          seat: res.seat,
          displayName,
          savedAt: new Date().toISOString(),
        });
        return { roomPath: roomPath("code_breaker", res.room_code) };
      } catch (err) {
        return notFoundOrThrow(err);
      }
    },
  },
  {
    id: "word_cipher",
    async tryJoin(roomCode, displayName, profileToken) {
      try {
        const res = await wordGameApi.joinRoom(roomCode, displayName, profileToken ?? undefined);
        saveWordSession({
          roomCode: res.room_code,
          playerToken: res.player_token,
          seat: res.seat,
          displayName,
          savedAt: new Date().toISOString(),
        });
        return { roomPath: roomPath("word_cipher", res.room_code) };
      } catch (err) {
        return notFoundOrThrow(err);
      }
    },
  },
  {
    id: "last_night",
    async tryJoin(roomCode, displayName) {
      try {
        const res = await lastNightApi.joinRoom(roomCode, displayName);
        saveLnSession({
          roomCode: res.room_code,
          playerId: `${res.room_id}_s${res.seat}`,
          playerToken: res.player_token,
          seat: res.seat,
          displayName,
          savedAt: new Date().toISOString(),
        });
        return { roomPath: roomPath("last_night", res.room_code) };
      } catch (err) {
        return notFoundOrThrow(err);
      }
    },
  },
];
