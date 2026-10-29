import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShadowDuel } from "./ShadowDuel";

describe("ShadowDuel — hidden bot duel for Doz Classic", () => {
  it("fills the opponent seat with the persona and marks it online", () => {
    render(
      <ShadowDuel
        roomCode="ABC123"
        mySymbol="X"
        myName="علی"
        opponentName="مهرداد رازی"
        onLeaveRoom={() => undefined}
      />,
    );

    expect(screen.getByText("مهرداد رازی")).toBeInTheDocument();
    expect(screen.getAllByText("آنلاین").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/نوبت شماست/)).toBeInTheDocument();
  });

  it("lets the human play and the hidden bot answers with a move after a human-like delay", async () => {
    vi.useFakeTimers();
    try {
      render(
        <ShadowDuel
          roomCode="ABC123"
          mySymbol="X"
          myName="علی"
          opponentName="کیان نامدار"
          onLeaveRoom={() => undefined}
        />,
      );

      // Human opens center cell
      fireEvent.click(screen.getByRole("button", { name: /خانه مرکز/ }));
      expect(screen.getByLabelText(/خانه مرکز — ایکس/)).toBeInTheDocument();

      // Opponent is "thinking" — no bot move yet (board has only my mark;
      // PlayerCard badges also render marks, so scope to the board itself).
      expect(screen.getByText(/کیان نامدار دارد فکر می‌کند/)).toBeInTheDocument();
      // Real marks are direct children of the cell; playable cells also render
      // a ghost preview mark inside a wrapper span — count only filled cells.
      const realMarks = () => document.querySelectorAll(".board .board__cell > .mark").length;
      expect(realMarks()).toBe(1);

      // Cross the natural human delay window — bot plays a strongest reply
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4500);
      });
      expect(realMarks()).toBe(2);
      expect(screen.getByText(/نوبت شماست/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits the room through the controls", () => {
    const onLeaveRoom = vi.fn();
    render(
      <ShadowDuel
        roomCode="ABC123"
        mySymbol="O"
        myName="علی"
        opponentName="نوبر چوپان"
        onLeaveRoom={onLeaveRoom}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /خروج از اتاق/ }));
    expect(onLeaveRoom).toHaveBeenCalledTimes(1);
  });
});
