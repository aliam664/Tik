import { describe, expect, it } from "vitest";
import {
  compactWordKey,
  evaluateGuess,
  normalizeWordText,
  validateClueText,
} from "./normalize";
import { assignRoundRoles, calculateGuessScore } from "./scoring";
import { SoloWordGameController } from "./soloEngine";
import {
  drawRoundBoard16,
  getWordById,
  WORD_BANK,
  WORD_CATEGORIES,
} from "./wordBank";

describe("RAZ-VAJEH Word Bank & 16-Card Round Generator", () => {
  it("contains at least 12 categories and 72 rich metadata entries without duplicate IDs", () => {
    expect(WORD_CATEGORIES.length).toBeGreaterThanOrEqual(12);
    expect(WORD_BANK.length).toBeGreaterThanOrEqual(72);

    const uniqueIds = new Set(WORD_BANK.map((w) => w.id));
    expect(uniqueIds.size).toBe(WORD_BANK.length);

    for (const entry of WORD_BANK) {
      expect(entry.relatedWords.length).toBeGreaterThanOrEqual(4);
      expect(entry.hintWords).toHaveLength(2);
    }
  });

  it("draws exactly 4 distinct categories × 4 distinct words = 16 unique cards per round", () => {
    for (let trial = 0; trial < 10; trial += 1) {
      const { categories, cards } = drawRoundBoard16({
        packId: "all",
        difficultyFilter: "all",
      });
      expect(categories).toHaveLength(4);
      expect(new Set(categories.map((c) => c.id)).size).toBe(4);
      expect(cards).toHaveLength(16);
      expect(new Set(cards.map((c) => c.id)).size).toBe(16);
      expect(new Set(cards.map((c) => c.word)).size).toBe(16);
    }
  });
});

describe("Persian & English Normalization + 3-Outcome Answer Evaluation", () => {
  it("normalizes Arabic Yeh/Kaf, ZWNJ half-spaces, punctuation, diacritics, and digits", () => {
    expect(compactWordKey("  رنگين‌كمان! ")).toBe(compactWordKey("رنگین کمان"));
    expect(compactWordKey("سیاه‌چاله")).toBe(compactWordKey("سیاه چاله"));
    expect(compactWordKey("آیینه")).toBe(compactWordKey("آینه"));
    expect(compactWordKey("چایی")).toBe(compactWordKey("چای"));
    expect(normalizeWordText("  قُطب‌نَما  ")).toBe("قطب نما");
  });

  it("distinguishes exact/synonym `correct`, semantic `related`, and `incorrect` answers accurately", () => {
    const volcano = getWordById("nat_volcano")!;
    // Exact, English equivalent, Arabic kaf/alef variations, accepted synonym -> `correct`
    expect(evaluateGuess("آتشفشان", { target: volcano })).toBe("correct");
    expect(evaluateGuess("اتشفشان", { target: volcano })).toBe("correct");
    expect(evaluateGuess("کوه آتشفشان", { target: volcano })).toBe("correct");
    expect(evaluateGuess("  VOLCANO ", { target: volcano })).toBe("correct");

    // Curated associations (`گدازه`, `فوران`, `ماگما`) -> strictly `related`, NEVER `correct`
    expect(evaluateGuess("گدازه", { target: volcano })).toBe("related");
    expect(evaluateGuess("فوران", { target: volcano })).toBe("related");

    // Unrelated words -> `incorrect`
    expect(evaluateGuess("دوچرخه", { target: volcano })).toBe("incorrect");
    expect(evaluateGuess("پیتزا", { target: volcano })).toBe("incorrect");
  });

  it("prevents clue-giver from leaking the target word even with Arabic characters or spacing tricks", () => {
    const compass = getWordById("obj_compass")!;
    expect(
      validateClueText("یک قطب نما قدیمی", compass.word, compass.acceptedAnswers),
    ).toEqual({ valid: false, code: "CLUE_CONTAINS_TARGET" });

    expect(
      validateClueText("عقربه مغناطیسی رو به شمال", compass.word, compass.acceptedAnswers),
    ).toEqual({ valid: true, cleaned: "عقربه مغناطیسی رو به شمال" });
  });
});

describe("Scoring, Role Rotation & Zero-Leak Round State Machine", () => {
  it("awards descending points as extra narrowing clues are used and rotates seats cleanly", () => {
    const firstClueWin = calculateGuessScore({
      outcome: "correct",
      cluesUsed: 1,
      difficulty: "medium",
      elapsedSeconds: 15,
      relatedBonusAlreadyClaimed: false,
    });
    const thirdClueWin = calculateGuessScore({
      outcome: "correct",
      cluesUsed: 3,
      difficulty: "medium",
      elapsedSeconds: 60,
      relatedBonusAlreadyClaimed: false,
    });
    expect(firstClueWin.guesserPoints).toBeGreaterThan(thirdClueWin.guesserPoints);
    expect(firstClueWin.clueGiverPoints).toBeGreaterThan(thirdClueWin.clueGiverPoints);

    expect(assignRoundRoles(1, 2)).toEqual({ clueGiverSeat: 1, guesserSeat: 2 });
    expect(assignRoundRoles(2, 2)).toEqual({ clueGiverSeat: 2, guesserSeat: 1 });
  });

  it("never exposes `target_word` or `board_cards` to Guesser before round ends, reveals on `round_result`, and swaps roles next round", () => {
    const match = new SoloWordGameController("آرش", {
      totalRounds: 2,
      guesserViewMode: "blind_typed",
    });

    // Round 1: Seat 1 (Human) is Guesser -> secret MUST be scrubbed!
    const initialSnap = match.getPublicSnapshot();
    expect(initialSnap.my_role).toBe("guesser");
    expect(initialSnap.state.round?.phase).toBe("guessing");
    expect(initialSnap.state.round?.target_word).toBeNull();
    expect(initialSnap.state.round?.target_word_id).toBeNull();
    expect(initialSnap.state.round?.board_cards).toBeNull();
    expect(initialSnap.state.round?.clues).toHaveLength(1);

    // Exhaust 3 wrong guesses to reach `round_result` -> secret target word is NOW revealed!
    match.submitHumanGuess("واژه نامربوط اول");
    match.submitHumanGuess("واژه نامربوط دوم");
    const revealed = match.submitHumanGuess("واژه نامربوط سوم");
    expect(revealed.state.round?.phase).toBe("round_result");
    expect(revealed.state.round?.target_word).toBeTruthy();
    expect(revealed.state.round?.board_cards).toHaveLength(16);

    // Advance to Round 2 -> Human swaps to `clue_giver` and sees 16 fresh cards!
    const round2 = match.nextRound();
    expect(round2.state.current_round).toBe(2);
    expect(round2.my_role).toBe("clue_giver");
    expect(round2.state.round?.phase).toBe("selecting_word");
    expect(round2.state.round?.board_cards).toHaveLength(16);

    // Pick a card, submit clue, advance to end of 2-round match
    const chosenCard = round2.state.round!.board_cards![0];
    const afterPick = match.selectTargetCard(chosenCard.id);
    expect(afterPick.state.round?.phase).toBe("giving_clue");
    expect(afterPick.state.round?.target_word).toBe(chosenCard.word);
  });
});

describe("Shadow Opponent presentation overrides (hidden bot matchmaking)", () => {
  it("keeps the default AI practice persona and SOLO-AI code without overrides", () => {
    const solo = new SoloWordGameController("آرش", { totalRounds: 1 });
    const snap = solo.getPublicSnapshot();
    expect(snap.state.players[1].name).toBe("هوش مصنوعی رازواژه");
    expect(snap.state.room_code).toBe("SOLO-AI");
  });

  it("presents a human persona and the REAL room code when shadow options are set", () => {
    const solo = new SoloWordGameController(
      "علی",
      { totalRounds: 1 },
      { opponentName: "سیمین اندیشه", roomCode: "K7Q2XZ" },
    );
    const snap = solo.getPublicSnapshot();
    expect(snap.state.players[1].name).toBe("سیمین اندیشه");
    expect(snap.state.players[1].connected).toBe(true);
    expect(snap.state.room_code).toBe("K7Q2XZ");
    // Rematch keeps the same persona & room (no AI-name leak mid-match).
    const afterRematch = solo.rematch();
    expect(afterRematch.state.players[1].name).toBe("سیمین اندیشه");
    expect(afterRematch.state.room_code).toBe("K7Q2XZ");
  });
});
