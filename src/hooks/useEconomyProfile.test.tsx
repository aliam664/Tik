import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { playerIdentity } from "@/lib/playerSession";
import { useEconomyProfile } from "./useEconomyProfile";

const getMyProfile = vi.fn();
const registerPlayer = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getMyProfile: (...args: unknown[]) => getMyProfile(...args),
    registerPlayer: (...args: unknown[]) => registerPlayer(...args),
  },
}));

describe("useEconomyProfile", () => {
  beforeEach(() => {
    localStorage.clear();
    getMyProfile.mockReset();
    registerPlayer.mockReset();
  });

  it("clears a stale PLAYER_UNAUTHORIZED token and auto-registers a fresh wallet profile", async () => {
    playerIdentity.save({
      token: "expired-token",
      displayName: "قدیمی",
      recoveryCode: "OLD-CODE",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    getMyProfile.mockRejectedValueOnce(new ApiError("PLAYER_UNAUTHORIZED", true));
    registerPlayer.mockResolvedValueOnce({
      player_token: "fresh-wallet-token",
      recovery_code: "NEW-CODE",
      profile: {
        id: "prof-new",
        display_name: "شوالیه شب",
        balance: 150,
        rating: { rating: 1000, peak_rating: 1000, tier: "bronze", placement_left: 5 },
        stats: { games: 0, wins: 0, losses: 0, draws: 0 },
      },
    });

    const { result } = renderHook(() => useEconomyProfile());

    await waitFor(() => expect(result.current.profile?.id).toBe("prof-new"));
    expect(result.current.token).toBe("fresh-wallet-token");
    expect(result.current.profile?.coins).toBe(150);
    expect(playerIdentity.token()).toBe("fresh-wallet-token");
  });
});
