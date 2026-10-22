import { describe, expect, it } from "vitest";
import {
  evaluateCodeGuess,
  formatElapsedMs,
  generateSecretCode4,
  normalizeFourDigitCode,
  SoloCodeBreakerController,
} from "./engine";
import { validateClueText } from "@/games/wordGame/normalize";
import { SoloWordGameController } from "@/games/wordGame/soloEngine";

describe("Code Breaker (رمزگشا) — 4-Digit String Rules, Feedback & Race Logic", () => {
  it("preserves leading zeros and repeated digits across all canonical 4-digit strings", () => {
    expect(normalizeFourDigitCode("0000")).toBe("0000");
    expect(normalizeFourDigitCode("0072")).toBe("0072");
    expect(normalizeFourDigitCode("1111")).toBe("1111");
    expect(normalizeFourDigitCode("9090")).toBe("9090");
    expect(normalizeFourDigitCode("1234")).toBe("1234");
    // Persian & Arabic-Indic digits convert cleanly while preserving leading zero
    expect(normalizeFourDigitCode("۰۰۷۲")).toBe("0072");
    expect(normalizeFourDigitCode("٠٩٠٩")).toBe("0909");
  });

  it("rejects non-4-digit, alphabetic, negative, or malformed inputs strictly", () => {
    expect(normalizeFourDigitCode("72")).toBeNull();
    expect(normalizeFourDigitCode("123")).toBeNull();
    expect(normalizeFourDigitCode("12345")).toBeNull();
    expect(normalizeFourDigitCode("12a4")).toBeNull();
    expect(normalizeFourDigitCode("-123")).toBeNull();
    expect(normalizeFourDigitCode("")).toBeNull();
  });

  it("generates uniform 4-character strings in [0000..9999] without integer truncation", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateSecretCode4();
      expect(typeof code).toBe("string");
      expect(code).toMatch(/^[0-9]{4}$/);
      expect(code.length).toBe(4);
    }
  });

  it("evaluates all-green, all-red, and mixed green/yellow/red positions accurately", () => {
    // All green (exact match) including leading zeros "0072"
    const allGreen = evaluateCodeGuess("0072", "0072");
    expect(allGreen.is_exact_match).toBe(true);
    expect(allGreen.green_count).toBe(4);
    expect(allGreen.yellow_count).toBe(0);
    expect(allGreen.red_count).toBe(0);
    expect(allGreen.digits.map((d) => d.color)).toEqual(["green", "green", "green", "green"]);

    // All red
    const allRed = evaluateCodeGuess("0072", "5891");
    expect(allRed.is_exact_match).toBe(false);
    expect(allRed.green_count).toBe(0);
    expect(allRed.yellow_count).toBe(0);
    expect(allRed.red_count).toBe(4);
    expect(allRed.digits.map((d) => d.color)).toEqual(["red", "red", "red", "red"]);

    // Mixed green/yellow/red: secret "1234", guess "1492" -> P0:'1'(green), P1:'4'(yellow), P2:'9'(red), P3:'2'(yellow)
    const mixed = evaluateCodeGuess("1234", "1492");
    expect(mixed.digits.map((d) => d.color)).toEqual(["green", "yellow", "red", "yellow"]);
    expect(mixed.green_count).toBe(1);
    expect(mixed.yellow_count).toBe(2);
    expect(mixed.red_count).toBe(1);
  });

  it("handles duplicate digits deterministically without double-counting yellow feedback", () => {
    // Secret has ONE '9' ("9123"), player guesses THREE '9's ("9994"):
    // P0 matches exact '9' -> GREEN, leaving ZERO unmatched '9's -> P1 & P2 MUST be RED!
    const exactConsumed = evaluateCodeGuess("9123", "9994");
    expect(exactConsumed.digits.map((d) => d.color)).toEqual(["green", "red", "red", "red"]);
    expect(exactConsumed.green_count).toBe(1);
    expect(exactConsumed.yellow_count).toBe(0);
    expect(exactConsumed.red_count).toBe(3);

    // Secret "9090", guess "0999":
    // Pass 1: P2 ('9'==='9') -> GREEN; unmatched pool has {'9':1, '0':2}
    // Pass 2: P0='0' -> YELLOW (pool '0'->1), P1='9' -> YELLOW (pool '9'->0), P3='9' -> RED!
    const dup9090 = evaluateCodeGuess("9090", "0999");
    expect(dup9090.digits.map((d) => d.color)).toEqual(["yellow", "yellow", "green", "red"]);
    expect(dup9090.green_count).toBe(1);
    expect(dup9090.yellow_count).toBe(2);
    expect(dup9090.red_count).toBe(1);

    // Secret "1111", guess "1111" -> 4 greens; guess "1219" -> green, red, green, red
    const quad = evaluateCodeGuess("1111", "1219");
    expect(quad.digits.map((d) => d.color)).toEqual(["green", "red", "green", "red"]);
  });

  it("keeps secret_code hidden during active play, records full dual histories, rejects post-win guesses, and preserves past_rounds on rematch", () => {
    const ctrl = new SoloCodeBreakerController("علی", null, "0072");
    const lobbySnap = ctrl.getSnapshot();
    expect(lobbySnap.state.status).toBe("waiting");
    expect(lobbySnap.state.secret_code).toBeNull();

    // Confirm readiness -> round starts, secret STILL hidden from snapshot!
    const activeSnap = ctrl.setReady(true);
    expect(activeSnap.state.status).toBe("active");
    expect(activeSnap.state.secret_code).toBeNull();
    expect(activeSnap.state.round_started_at).not.toBeNull();

    // Submit non-winning guess + AI step -> both histories grow independently & never overwrite!
    const afterG1 = ctrl.submitGuess("9090");
    expect(afterG1.state.secret_code).toBeNull();
    expect(afterG1.state.my_guesses).toHaveLength(1);
    expect(afterG1.state.my_guesses[0].guess_code).toBe("9090");

    const afterAi = ctrl.triggerAiStep();
    expect(afterAi?.state.opponent_guesses).toHaveLength(1);
    expect(afterAi?.state.all_guesses).toHaveLength(2);

    // Submit exact winning code "0072" -> wins immediately & reveals secret_code!
    const winSnap = ctrl.submitGuess("0072");
    expect(winSnap.state.status).toBe("finished");
    expect(winSnap.state.winner_seat).toBe(1);
    expect(winSnap.state.secret_code).toBe("0072");
    expect(winSnap.state.my_guesses).toHaveLength(2);
    expect(winSnap.state.opponent_guesses).toHaveLength(1);

    // Submissions after round end are strictly rejected!
    expect(() => ctrl.submitGuess("1234")).toThrow("ROUND_ALREADY_FINISHED");

    // Rematch archives previous round without mutating its record and resets new secret to null!
    const rematchSnap = ctrl.rematch("9090");
    expect(rematchSnap.state.current_round).toBe(2);
    expect(rematchSnap.state.status).toBe("waiting");
    expect(rematchSnap.state.secret_code).toBeNull();
    expect(rematchSnap.state.my_guesses).toHaveLength(0);
    expect(rematchSnap.state.past_rounds).toHaveLength(1);
    expect(rematchSnap.state.past_rounds[0].secret_code).toBe("0072");
    expect(rematchSnap.state.past_rounds[0].winner_seat).toBe(1);
    expect(rematchSnap.state.past_rounds[0].total_guesses).toBe(3);

    expect(formatElapsedMs(65430)).toBe("01:05.43");
  });
});

describe("Word Cipher (رازواژه) — Regression Tests for Audited Bug Fixes", () => {
  it("allows unrelated words containing short 2-letter character pairs ('نم هوا' for 'مه', 'هدف' for 'دف') while still blocking actual target leaks", () => {
    expect(validateClueText("نم هوا در صبح", "مه", []).valid).toBe(true);
    expect(validateClueText("هدف اصلی بازی", "دف", []).valid).toBe(true);

    // Actual leaks & Persian inflections are still strictly caught!
    const leakExact = validateClueText("مه غلیظ صبحگاهی", "مه", []);
    expect(leakExact.valid).toBe(false);
    const leakPlural = validateClueText("صدای دف‌ها در جشن", "دف", []);
    expect(leakPlural.valid).toBe(false);
  });

  it("blocks duplicate guesses in the same round without wasting guess slots in SoloWordGameController", () => {
    const solo = new SoloWordGameController("تستر", { totalRounds: 2 });
    const snap = solo.getPublicSnapshot();
    expect(snap.my_role).toBe("guesser");
    // Board cards are hidden from human guesser under blind_typed zero-leak mode!
    expect(snap.state.round?.board_cards).toBeNull();
    solo.submitHumanGuess("واژه اول آزمایشی");
    expect(() => solo.submitHumanGuess("واژه اول آزمایشی")).toThrow("DUPLICATE_GUESS");
  });
});
