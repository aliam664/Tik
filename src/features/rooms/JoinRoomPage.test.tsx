import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { JoinRoomPage } from "./JoinRoomPage";
import { ToastProvider } from "@/components/ui/Toast";
import { playerIdentity } from "@/lib/playerSession";

const joinRoom = vi.fn();
const cbJoinRoom = vi.fn();
const wgJoinRoom = vi.fn();
const lnJoinRoom = vi.fn();
const getMyProfile = vi.fn();
const registerPlayer = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    joinRoom: (...args: unknown[]) => joinRoom(...args),
    getMyProfile: (...args: unknown[]) => getMyProfile(...args),
    registerPlayer: (...args: unknown[]) => registerPlayer(...args),
  },
  codeBreakerApi: {
    joinRoom: (...args: unknown[]) => cbJoinRoom(...args),
  },
  wordGameApi: {
    joinRoom: (...args: unknown[]) => wgJoinRoom(...args),
  },
  lastNightApi: {
    joinRoom: (...args: unknown[]) => lnJoinRoom(...args),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/join"]}>
      <ToastProvider>
        <JoinRoomPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** the code input transforms its value (uppercase + strip), so we set it
 * directly to keep the test deterministic — userEvent's correction loop
 * fights value-transforming controlled inputs. */
function setCode(value: string) {
  fireEvent.change(screen.getByLabelText(/کد اتاق/), { target: { value } });
}

beforeEach(() => {
  localStorage.clear();
  joinRoom.mockReset();
  cbJoinRoom.mockReset();
  wgJoinRoom.mockReset();
  lnJoinRoom.mockReset();
  getMyProfile.mockReset();
  registerPlayer.mockReset();
  registerPlayer.mockRejectedValue(new Error("OFFLINE"));
});

describe("JoinRoomPage", () => {
  it("shows a validation error for a short room code without calling the API", async () => {
    const user = userEvent.setup();
    renderPage();

    setCode("AB1");
    await user.type(screen.getByLabelText(/نام نمایشی/), "سارا");
    await user.click(screen.getByRole("button", { name: /ورود و شروع بازی/ }));

    expect(screen.getByText(/کد اتاق ۶ نویسه/)).toBeInTheDocument();
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it("shows a validation error for an invalid display name", async () => {
    const user = userEvent.setup();
    renderPage();

    setCode("ABC234");
    await user.type(screen.getByLabelText(/نام نمایشی/), "x");
    await user.click(screen.getByRole("button", { name: /ورود و شروع بازی/ }));

    expect(screen.getByText(/حداقل ۲ کاراکتر/)).toBeInTheDocument();
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it("uppercases and strips non-alphanumeric characters from the code input", () => {
    renderPage();

    setCode("  ab!@c234 ");
    const codeInput = screen.getByLabelText(/کد اتاق/) as HTMLInputElement;
    expect(codeInput.value).toBe("ABC234");
  });

  it("calls the join API with normalized data on a valid submit", async () => {
    joinRoom.mockResolvedValue({
      room_code: "ABC234",
      room_id: "id",
      player_token: "tok",
      symbol: "O",
    });
    const user = userEvent.setup();
    renderPage();

    setCode("abc234");
    await user.type(screen.getByLabelText(/نام نمایشی/), "سارا");
    await user.click(screen.getByRole("button", { name: /ورود و شروع بازی/ }));

    expect(joinRoom).toHaveBeenCalledWith("ABC234", "سارا");
  });

  it("forwards the player profileToken across cross-game room adapters including Last Night", async () => {
    playerIdentity.save({
      token: "prof-tok-99",
      displayName: "آرش",
      recoveryCode: "REC-1",
      createdAt: "2026-10-29T00:00:00.000Z",
    });
    getMyProfile.mockResolvedValue({
      profile: {
        id: "p1",
        display_name: "آرش",
        balance: 250,
        rating: { rating: 1200, peak_rating: 1200, tier: "silver", placement_left: 0 },
        stats: { games: 5, wins: 3, losses: 2, draws: 0 },
      },
      ledger: [],
    });
    const notFound = { message: "ROOM_NOT_FOUND", code: "P0001" };
    joinRoom.mockRejectedValue(notFound);
    cbJoinRoom.mockRejectedValue(notFound);
    wgJoinRoom.mockRejectedValue(notFound);
    lnJoinRoom.mockResolvedValue({
      room_code: "LN7788",
      room_id: "ln-id-1",
      player_token: "ln-seat-tok",
      seat: 2,
      state: {},
    });

    const user = userEvent.setup();
    renderPage();

    setCode("ln7788");
    const nameInput = screen.getByLabelText(/نام نمایشی/) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe("آرش"));
    await user.click(screen.getByRole("button", { name: /ورود و شروع بازی/ }));

    expect(lnJoinRoom).toHaveBeenCalledWith("LN7788", "آرش", "prof-tok-99");
  });
});
