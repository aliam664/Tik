import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SoloWordGameController } from "@/games/wordGame/soloEngine";
import { WordCipherArenaView } from "./WordCipherArenaView";

const noopActions = {
  onSelectTarget: vi.fn(),
  onSubmitClue: vi.fn(),
  onRequestHint: vi.fn(),
  onSubmitGuess: vi.fn(),
  onNextRound: vi.fn(),
  onRematch: vi.fn(),
  onLeave: vi.fn(),
};

describe("WordCipherArenaView UI component", () => {
  it("renders Guesser view with live clues and answer input without exposing secret target word", () => {
    const ctrl = new SoloWordGameController("سارا", { totalRounds: 2 });
    const guesserSnapshot = ctrl.getPublicSnapshot();

    render(<WordCipherArenaView snapshot={guesserSnapshot} actions={noopActions} />);

    expect(screen.getByText(/راند 1 از 2/)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/واژه مورد نظر را به فارسی یا انگلیسی بنویسید/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/واژه مخفی انتخابی شما/)).not.toBeInTheDocument();
  });

  it("renders Clue-Giver 16-card 4×4 board selection UI after roles rotate in Round 2", () => {
    const ctrl = new SoloWordGameController("سارا", { totalRounds: 2 });
    ctrl.submitHumanGuess("حدس اول");
    ctrl.submitHumanGuess("حدس دوم");
    ctrl.submitHumanGuess("حدس سوم");
    const round2Snapshot = ctrl.nextRound();

    render(<WordCipherArenaView snapshot={round2Snapshot} actions={noopActions} />);

    expect(
      screen.getByText(/یکی از ۱۶ واژه زیر را به‌عنوان «واژه مخفی» انتخاب کنید/),
    ).toBeInTheDocument();
    const cardButtons = screen.getAllByRole("button");
    // 16 word cards + HUD controls + confirm target button
    expect(cardButtons.length).toBeGreaterThanOrEqual(17);
  });
});
