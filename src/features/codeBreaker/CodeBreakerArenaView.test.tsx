import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SoloCodeBreakerController } from "@/games/codeBreaker/engine";
import { getActiveGames, PLATFORM_GAMES } from "@/games/registry";
import { CodeBreakerArenaView } from "./CodeBreakerArenaView";

describe("CodeBreakerArenaView UI & Platform Integration", () => {
  it("keeps all 4 games (Doz Classic, Last Night, Word Cipher, Code Breaker) active side-by-side in PLATFORM_GAMES", () => {
    const ids = PLATFORM_GAMES.map((g) => g.id);
    expect(ids).toEqual(["doz", "last_night", "word_cipher", "code_breaker", "sheriff_blast"]);
    expect(getActiveGames()).toHaveLength(5);
  });

  it("renders dual guess history panels, position tiles, counts, timestamps, handles synchronous keyboard burst, and reveals secret only on finish", () => {
    const ctrl = new SoloCodeBreakerController("آرش", null, "0072");
    ctrl.setReady(true);
    ctrl.submitGuess("0291");
    ctrl.triggerAiStep();

    const onSubmitGuess = vi.fn();
    const { rerender } = render(
      <CodeBreakerArenaView
        snapshot={ctrl.getSnapshot()}
        isSolo={true}
        actions={{
          onSetReady: vi.fn(),
          onSubmitGuess,
          onRematch: vi.fn(),
          onLeave: vi.fn(),
        }}
      />,
    );

    // Secret must NOT be rendered while round is active
    expect(screen.queryByTestId("revealed-secret-code")).toBeNull();
    // Both player history panels & attempt metadata are rendered
    expect(screen.getByTestId("my-history-panel")).toBeTruthy();
    expect(screen.getByTestId("opponent-history-panel")).toBeTruthy();
    expect(screen.getByText("[0291]")).toBeTruthy();

    // Synchronous 4-key physical keyboard burst ('۰', '۰', '۷', '۲' Persian digits!) in a single tick
    fireEvent.keyDown(window, { key: "۰" });
    fireEvent.keyDown(window, { key: "۰" });
    fireEvent.keyDown(window, { key: "۷" });
    fireEvent.keyDown(window, { key: "۲" });
    fireEvent.click(screen.getByTestId("submit-guess-btn"));
    expect(onSubmitGuess).toHaveBeenCalledWith("0072");

    // Finish round in controller and verify secret code reveal + preserved history
    const finishedSnap = ctrl.submitGuess("0072");
    rerender(
      <CodeBreakerArenaView
        snapshot={finishedSnap}
        isSolo={true}
        actions={{
          onSetReady: vi.fn(),
          onSubmitGuess,
          onRematch: vi.fn(),
          onLeave: vi.fn(),
        }}
      />,
    );

    expect(screen.getByTestId("revealed-secret-code").textContent).toBe("0072");
    expect(screen.getByText("[0291]")).toBeTruthy();
    expect(screen.getByText("[0072]")).toBeTruthy();
  });
});
