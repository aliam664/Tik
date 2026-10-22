import { describe, expect, it } from "vitest";
import {
  PLATFORM_GAMES,
  getActiveGames,
  getGameById,
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
});
