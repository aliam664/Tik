import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { PLATFORM_GAMES } from "@/games/registry";
import { HomePage } from "./HomePage";

const getPublicStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getPublicStatus: (...args: unknown[]) => getPublicStatus(...args),
  },
}));

function LocationEcho() {
  const loc = useLocation();
  return <div data-testid="route-echo">{`${loc.pathname}${loc.search}`}</div>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/join" element={<LocationEcho />} />
          <Route path="/play" element={<LocationEcho />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getPublicStatus.mockReset();
  getPublicStatus.mockResolvedValue({
    maintenance_mode: false,
    maintenance_message: "",
    active_rooms: 7,
    games_played_total: 412,
    server_now: "12:30:00",
  });
});

describe("HomePage — editorial & interactive command arena", () => {
  it("renders all live platform games and polls live server telemetry", async () => {
    renderHome();

    expect(await screen.findByText("هستهٔ سرور فعال")).toBeInTheDocument();
    expect(getPublicStatus).toHaveBeenCalledTimes(1);

    const catalog = screen.getByRole("region", { name: /کاتالوگ بازی‌های پلتفرم/ });
    for (const game of PLATFORM_GAMES) {
      expect(within(catalog).getByText(game.title)).toBeInTheDocument();
    }
  });

  it("filters the Bento game catalog by category and restores all games", () => {
    renderHome();

    const filterTabs = screen.getByRole("tablist", { name: /فیلتر سبک بازی‌ها/ });
    fireEvent.click(within(filterTabs).getByRole("tab", { name: /همکاری و سالن زنده/ }));

    const catalog = screen.getByRole("region", { name: /کاتالوگ بازی‌های پلتفرم/ });
    expect(within(catalog).getByText(/Last Night/)).toBeInTheDocument();
    expect(within(catalog).getByText(/انفجار شریف/)).toBeInTheDocument();
    expect(within(catalog).queryByText("دوز کلاسیک")).not.toBeInTheDocument();

    fireEvent.click(within(filterTabs).getByRole("tab", { name: /همهٔ میدان‌ها/ }));
    expect(within(catalog).getByText("دوز کلاسیک")).toBeInTheDocument();
  });

  it("normalizes room codes in the quick-join terminal and navigates to /join?code=...", () => {
    renderHome();

    const input = screen.getByLabelText("کد ۶ نویسه‌ای اتاق") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "k7q-m2p!" } });
    expect(input.value).toBe("K7QM2P");

    fireEvent.click(screen.getByRole("button", { name: /ورود به میز/ }));
    expect(screen.getByTestId("route-echo")).toHaveTextContent("/join?code=K7QM2P");
  });

  it("switches the hero tactical board into a live playable duel on cell click and AI replies", async () => {
    vi.useFakeTimers();
    try {
      renderHome();

      const board = screen.getByRole("group", { name: /صفحه دوز آزمایشی/ });
      const centerCell = within(board).getByRole("button", { name: /خانه مرکز \(B2\)/ });
      fireEvent.click(centerCell);

      expect(screen.getByText("میز آزمایشی زنده")).toBeInTheDocument();
      expect(document.querySelectorAll(".hp-board .hp-mark").length).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });

      expect(document.querySelectorAll(".hp-board .hp-mark").length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("calibrates competitive tier specs and stake pot when selecting a tier", () => {
    renderHome();

    const tierRail = screen.getByRole("tablist", { name: /انتخاب تیر رقابتی/ });
    fireEvent.click(within(tierRail).getByRole("tab", { name: /استاد/ }));

    expect(screen.getByText("MASTER TIER")).toBeInTheDocument();
    expect(screen.getByText("تیر استاد")).toBeInTheDocument();
    expect(screen.getByText("۲۰۰ sh")).toBeInTheDocument();
  });
});
