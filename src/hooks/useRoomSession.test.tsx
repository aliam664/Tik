import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerSession } from "@/lib/session";
import type { RoomState } from "@/types/api";
import { useRoomSession } from "./useRoomSession";

const getRoomState = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getRoomState: (...args: unknown[]) => getRoomState(...args),
    makeMove: vi.fn(),
    requestRematch: vi.fn(),
    leaveRoom: vi.fn(),
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    supabaseUrl: "https://configuration-missing.invalid",
    supabaseAnonKey: "configuration-missing",
    isConfigured: false,
    configIssue: null,
  },
}));

function makeRoomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    room_code: "K7QM2P",
    status: "waiting",
    mode: "friendly",
    stake: 0,
    board: ".........",
    current_turn: "X",
    winner: null,
    is_draw: false,
    winning_cells: [],
    move_count: 0,
    game_number: 1,
    rematch_requested_by: null,
    version: 0,
    settlement: null,
    forfeit: false,
    players: [{ symbol: "X", name: "میزبان", connected: true }],
    created_at: null,
    started_at: null,
    finished_at: null,
    expires_in_seconds: 3600,
    server_now: "2026-10-29T10:00:00.000Z",
    ...overrides,
  };
}

describe("useRoomSession", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    getRoomState.mockReset();
  });

  it("picks up a newly saved token on refresh() after a direct-link join", async () => {
    getRoomState
      .mockResolvedValueOnce({
        role: null,
        state: makeRoomState({ version: 0, status: "waiting" }),
      })
      .mockResolvedValueOnce({
        role: "O",
        state: makeRoomState({
          version: 1,
          status: "active",
          players: [
            { symbol: "X", name: "میزبان", connected: true },
            { symbol: "O", name: "میهمان", connected: true },
          ],
        }),
      });

    const { result } = renderHook(() => useRoomSession({ roomCode: "K7QM2P" }));

    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    expect(result.current.role).toBeNull();
    expect(result.current.token).toBeNull();
    expect(getRoomState).toHaveBeenNthCalledWith(1, "K7QM2P", null, true);

    // Simulate RoomPage direct-join saving the player token then calling refresh(true)
    playerSession.save("K7QM2P", "seat-o-token", "O");
    await act(async () => {
      await result.current.refresh(true);
    });

    expect(getRoomState).toHaveBeenNthCalledWith(2, "K7QM2P", "seat-o-token", true);
    expect(result.current.token).toBe("seat-o-token");
    expect(result.current.role).toBe("O");
    expect(result.current.state?.status).toBe("active");
  });

  it("resets version and loads the target room token when navigating between room codes", async () => {
    playerSession.save("ROOM22", "tok-22", "X");
    playerSession.save("ROOM33", "tok-33", "O");

    getRoomState
      .mockResolvedValueOnce({
        role: "X",
        state: makeRoomState({ room_code: "ROOM22", version: 9 }),
      })
      .mockResolvedValueOnce({
        role: "O",
        state: makeRoomState({ room_code: "ROOM33", version: 1, status: "active" }),
      });

    const { result, rerender } = renderHook(
      ({ code }: { code: string }) => useRoomSession({ roomCode: code }),
      { initialProps: { code: "ROOM22" } },
    );

    await waitFor(() => expect(result.current.state?.room_code).toBe("ROOM22"));
    expect(result.current.role).toBe("X");

    // Room ROOM33 has a lower version (1 < 9) — versionRef must reset on roomCode change!
    rerender({ code: "ROOM33" });

    await waitFor(() => expect(result.current.state?.room_code).toBe("ROOM33"));
    expect(result.current.token).toBe("tok-33");
    expect(result.current.role).toBe("O");
  });
});
