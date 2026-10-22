import { describe, expect, it } from "vitest";
import { GAME_ROUTE_MODULES } from "./gameModules";
import { ROOM_JOIN_ADAPTERS } from "./joinAdapters";
import {
  PLATFORM_GAMES,
  getActiveGames,
  getGameById,
  getHeaderNavGames,
  getStandaloneGames,
} from "./registry";

describe("platform game registry", () => {
  it("lists unique ids and valid routes for all registered titles", () => {
    const ids = new Set<string>();
    for (const game of PLATFORM_GAMES) {
      expect(ids.has(game.id)).toBe(false);
      ids.add(game.id);
      expect(game.route.startsWith("/")).toBe(true);
      expect(game.features.length).toBeGreaterThan(0);
    }
  });

  it("resolves games case-insensitively including legacy arena2d alias", () => {
    expect(getGameById("DOZ")?.id).toBe("doz");
    expect(getGameById("last_night")?.id).toBe("last_night");
    expect(getGameById("arena2d")?.id).toBe("last_night");
    expect(getGameById("")).toBeUndefined();
  });

  it("filters active and standalone games cleanly", () => {
    const active = getActiveGames();
    expect(active.length).toBeGreaterThanOrEqual(2);
    const standalone = getStandaloneGames();
    expect(standalone.every((g) => g.route !== "/")).toBe(true);
  });

  it("wires a lazy route module for every live standalone title", () => {
    const moduleIds = GAME_ROUTE_MODULES.map((m) => m.id);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    for (const game of getStandaloneGames()) {
      expect(moduleIds).toContain(game.id);
      const mod = GAME_ROUTE_MODULES.find((candidate) => candidate.id === game.id);
      if (game.roomRoutePrefix) expect(mod?.Room).toBeDefined();
      else expect(mod?.Room).toBeUndefined();
    }
  });

  it("keeps a join adapter for every live room-code title including doz, doz first", () => {
    expect(ROOM_JOIN_ADAPTERS[0]?.id).toBe("doz");
    const adapterIds = ROOM_JOIN_ADAPTERS.map((a) => a.id);
    expect(new Set(adapterIds).size).toBe(adapterIds.length);
    for (const game of getActiveGames()) {
      if (!game.roomRoutePrefix) continue;
      expect(adapterIds).toContain(game.id);
    }
  });

  it("exposes header nav games in navOrder without doz", () => {
    const nav = getHeaderNavGames();
    expect(nav.every((item) => item.path !== "/")).toBe(true);
    expect(nav.map((item) => item.path)).toEqual([
      "/games/blast",
      "/games/dice",
      "/games/code-breaker",
      "/games/word-cipher",
      "/games/last-night",
    ]);
  });
});
