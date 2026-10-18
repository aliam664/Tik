import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameBoard } from "./GameBoard";
import { boardFromString } from "@/game/engine";

const empty = boardFromString(".........");
const mid = boardFromString("XO.......");

describe("GameBoard", () => {
  it("renders 9 cells", () => {
    render(<GameBoard board={empty} winningCells={[]} mySymbol="X" interactive={false} pendingCell={null} onPlay={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(9);
  });

  it("calls onPlay with the right index for an enabled empty cell", async () => {
    const onPlay = vi.fn();
    const user = userEvent.setup();
    render(<GameBoard board={empty} winningCells={[]} mySymbol="X" interactive onPlay={onPlay} pendingCell={null} />);

    await user.click(screen.getByRole("button", { name: /مرکز/ }));
    expect(onPlay).toHaveBeenCalledWith(4);
  });

  it("disables occupied and non-interactive cells", () => {
    render(<GameBoard board={mid} winningCells={[]} mySymbol="X" interactive={false} pendingCell={null} onPlay={() => {}} />);
    const xCell = screen.getByRole("button", { name: /بالا-چپ.*ایکس/ });
    expect(xCell).toBeDisabled();
  });

  it("highlights winning cells", () => {
    const { container } = render(
      <GameBoard board={boardFromString("XXX.OO...")} winningCells={[0, 1, 2]} mySymbol={null} interactive={false} pendingCell={null} onPlay={() => {}} />,
    );
    const winCells = container.querySelectorAll(".board__cell--win");
    expect(winCells).toHaveLength(3);
  });

  it("shows X and O marks from the board", () => {
    render(<GameBoard board={mid} winningCells={[]} mySymbol={null} interactive={false} pendingCell={null} onPlay={() => {}} />);
    expect(screen.getByRole("button", { name: /ایکس/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /او/ })).toBeInTheDocument();
  });
});
