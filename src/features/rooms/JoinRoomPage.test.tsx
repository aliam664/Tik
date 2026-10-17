import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { JoinRoomPage } from "./JoinRoomPage";
import { ToastProvider } from "@/components/ui/Toast";

const joinRoom = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    joinRoom: (...args: unknown[]) => joinRoom(...args),
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
  joinRoom.mockReset();
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
});
