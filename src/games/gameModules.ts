import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { getGameById, PLATFORM_GAMES } from "./registry";

/**
 * Lazy route modules for every standalone title. Room-code games provide both
 * Lobby and Room; solo or shared-salon games only provide Lobby.
 * Adding a game: register it in `registry.ts`, then add one row here.
 * Classic DOZ (`id: "doz"`, route `/`) is wired in the app router, not here.
 */
export interface GameRouteModule {
  readonly id: string;
  /** Entry page for every standalone game (lobby, arena, or solo screen). */
  readonly Lobby: LazyExoticComponent<ComponentType>;
  /** Only room-code multiplayer games need a dedicated room page. */
  readonly Room?: LazyExoticComponent<ComponentType>;
}

function lazyNamed<M extends Record<string, unknown>>(
  loader: () => Promise<M>,
  exportName: keyof M & string,
): LazyExoticComponent<ComponentType> {
  return lazy(async () => {
    const mod = await loader();
    const Cmp = mod[exportName];
    if (typeof Cmp !== "function") {
      throw new Error(`Game module export "${exportName}" is missing`);
    }
    return { default: Cmp as ComponentType };
  });
}

export const GAME_ROUTE_MODULES: readonly GameRouteModule[] = [
  {
    id: "last_night",
    Lobby: lazyNamed(
      () => import("@/features/lastNight/LastNightLobbyPage"),
      "LastNightLobbyPage",
    ),
    Room: lazyNamed(
      () => import("@/features/lastNight/LastNightRoomPage"),
      "LastNightRoomPage",
    ),
  },
  {
    id: "word_cipher",
    Lobby: lazyNamed(
      () => import("@/features/wordGame/WordCipherLobbyPage"),
      "WordCipherLobbyPage",
    ),
    Room: lazyNamed(
      () => import("@/features/wordGame/WordCipherRoomPage"),
      "WordCipherRoomPage",
    ),
  },
  {
    id: "code_breaker",
    Lobby: lazyNamed(
      () => import("@/features/codeBreaker/CodeBreakerLobbyPage"),
      "CodeBreakerLobbyPage",
    ),
    Room: lazyNamed(
      () => import("@/features/codeBreaker/CodeBreakerRoomPage"),
      "CodeBreakerRoomPage",
    ),
  },
  {
    id: "sheriff_blast",
    Lobby: lazyNamed(() => import("@/features/crash/CrashArenaPage"), "CrashArenaPage"),
  },
  {
    id: "sheriff_dice",
    Lobby: lazyNamed(() => import("@/features/dice/DiceArenaPage"), "DiceArenaPage"),
  },
];

export function getGameRouteModule(id: string): GameRouteModule | undefined {
  return GAME_ROUTE_MODULES.find((m) => m.id === id);
}

/** Live standalone games that must have both a registry entry and a route module. */
export function listRoutableStandaloneGames() {
  return PLATFORM_GAMES.filter((g) => g.route !== "/" && g.status !== "coming_soon").map((game) => {
    const mod = getGameRouteModule(game.id);
    return { game, mod };
  });
}

export function assertGameModule(id: string): GameRouteModule {
  const game = getGameById(id);
  const mod = getGameRouteModule(id);
  if (!game) throw new Error(`Unknown game id: ${id}`);
  if (!mod && game.route !== "/") {
    throw new Error(`Game "${id}" is in the registry but has no GAME_ROUTE_MODULES entry`);
  }
  return mod as GameRouteModule;
}
