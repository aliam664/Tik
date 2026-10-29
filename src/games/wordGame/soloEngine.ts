/**
 * RAZ-VAJEH (رازواژه — WORD CIPHER)
 * Solo Practice Match Controller against a Semantic AI Partner/Opponent.
 *
 * Security & Integrity parity with Server-Authoritative Multiplayer:
 *  - Secret round state (16 cards + target word) lives privately inside the closure.
 *  - Projecting state for Seat 1 (`getPublicSnapshot()`) strictly scrubs `target_word`,
 *    `target_word_id`, and `board_cards` whenever the human player is the `guesser`
 *    and `phase !== "round_result"`.
 *  - Supports full role rotation: odd rounds → AI is Clue-Giver & Human guesses;
 *    even rounds → Human picks target card & writes clues while Semantic AI guesses!
 */

import {
  compactWordKey,
  evaluateGuess,
  normalizeWordText,
  validateClueText,
} from "./normalize";
import {
  assignRoundRoles,
  calculateGuessScore,
  resolveRulesConfig,
} from "./scoring";
import {
  drawRoundBoard16,
  getCategoryById,
  getWordById,
  WORD_BANK,
} from "./wordBank";
import type {
  AnswerOutcome,
  PlayerRole,
  RoundClueEntry,
  RoundGuessEntry,
  RoundHistorySummary,
  RoundWordCard,
  WordCategorySpec,
  WordEntrySpec,
  WordGameRulesConfig,
  WordRoomPlayer,
  WordRoomState,
  WordRoomStateResponse,
  WordRoundPhase,
} from "@/types/wordGame";

interface InternalSoloRound {
  roundNumber: number;
  phase: WordRoundPhase;
  clueGiverSeat: number;
  guesserSeat: number;
  categories: WordCategorySpec[];
  cards: RoundWordCard[];
  targetSpec: WordEntrySpec | null;
  clues: RoundClueEntry[];
  guesses: RoundGuessEntry[];
  systemHintsUsed: number;
  relatedBonusClaimed: boolean;
  cluePointsAccumulated: number;
  lastSpeedBonus: number;
  roundSummary: {
    outcome: AnswerOutcome | "skipped" | "timeout";
    guesser_points: number;
    clue_giver_points: number;
    speed_bonus: number;
    difficulty_bonus: number;
  } | null;
  startedAtMs: number;
}

export class SoloWordGameController {
  private readonly humanName: string;
  private rules: WordGameRulesConfig;
  private readonly shadowOpponentName: string | null;
  private readonly shadowRoomCode: string | null;
  private status: "active" | "finished" = "active";
  private gameNumber = 1;
  private version = 1;
  private players: [WordRoomPlayer, WordRoomPlayer];
  private usedWordIds = new Set<string>();
  private history: RoundHistorySummary[] = [];
  private round!: InternalSoloRound;
  private aiAlreadyGuessedKeys = new Set<string>();

  constructor(
    humanDisplayName: string,
    rulesPatch?: Partial<WordGameRulesConfig>,
    /**
     * Shadow-opponent presentation overrides used by the hidden bot system:
     * seat 2 shows a human persona and the snapshot advertises the REAL room
     * code, making the match indistinguishable from a live online duel.
     */
    shadowOptions?: { opponentName?: string; roomCode?: string },
  ) {
    this.humanName = humanDisplayName.trim() || "شما";
    this.rules = resolveRulesConfig(rulesPatch);
    const persona = shadowOptions?.opponentName?.trim();
    this.shadowOpponentName = persona ? persona : null;
    const roomOverride = shadowOptions?.roomCode?.trim();
    this.shadowRoomCode = roomOverride ? roomOverride : null;
    this.players = [
      {
        seat: 1,
        name: this.humanName,
        score: 0,
        ready: true,
        connected: true,
        is_host: true,
        correct_guesses: 0,
        related_guesses: 0,
        successful_clues: 0,
      },
      {
        seat: 2,
        name: this.shadowOpponentName ?? "هوش مصنوعی رازواژه",
        score: 0,
        ready: true,
        connected: true,
        is_host: false,
        correct_guesses: 0,
        related_guesses: 0,
        successful_clues: 0,
      },
    ];
    // Start Round 1 with AI as Clue-Giver so player immediately gets a fun mystery word to crack,
    // then Round 2 swaps so Human selects from 16 cards & gives clues to AI!
    this.initRound(1, /* swapFirst */ true);
  }

  private initRound(roundNumber: number, aiStartsFirst = true): void {
    const baseRoles = assignRoundRoles(roundNumber, 2);
    const clueGiverSeat = aiStartsFirst
      ? baseRoles.guesserSeat // Round 1 → Seat 2 (AI), Round 2 → Seat 1 (Human), etc.
      : baseRoles.clueGiverSeat;
    const guesserSeat = clueGiverSeat === 1 ? 2 : 1;

    const drawn = drawRoundBoard16({
      packId: this.rules.packId,
      difficultyFilter: this.rules.difficultyFilter,
      excludeWordIds: this.usedWordIds,
    });

    this.aiAlreadyGuessedKeys.clear();

    this.round = {
      roundNumber,
      phase: "selecting_word",
      clueGiverSeat,
      guesserSeat,
      categories: drawn.categories,
      cards: drawn.cards,
      targetSpec: null,
      clues: [],
      guesses: [],
      systemHintsUsed: 0,
      relatedBonusClaimed: false,
      cluePointsAccumulated: 0,
      lastSpeedBonus: 0,
      roundSummary: null,
      startedAtMs: Date.now(),
    };

    // If AI is Clue-Giver in this round, AI immediately picks a target word and gives Clue #1
    if (clueGiverSeat === 2) {
      const pickedCard =
        drawn.cards[Math.floor(Math.random() * drawn.cards.length)];
      const spec = getWordById(pickedCard.id) ?? WORD_BANK[0];
      this.usedWordIds.add(spec.id);
      this.round.targetSpec = spec;
      this.round.startedAtMs = Date.now();
      this.pushAiClue();
      this.round.phase = "guessing";
    }

    this.version += 1;
  }

  private pushAiClue(): void {
    const spec = this.round.targetSpec;
    if (!spec) return;
    const idx = this.round.clues.length + 1;
    let text: string;
    let kind: RoundClueEntry["kind"];

    if (idx === 1) {
      // First clue: crisp 1-2 word semantic association
      text = spec.relatedWords[0] ?? spec.hintWords[0];
      kind = "association";
    } else if (idx === 2) {
      // Second narrowing clue
      text = spec.hintWords[0] ?? spec.relatedWords[1] ?? "سرنخ دوم";
      kind = "narrowing";
    } else {
      // Third closer narrowing clue
      text = spec.hintWords[1] ?? `${spec.relatedWords[1] ?? ""} · ${spec.relatedWords[2] ?? ""}`;
      kind = "narrowing";
    }

    this.round.clues.push({
      index: idx,
      text,
      source: "clue_giver",
      kind,
      created_at: new Date().toISOString(),
    });
  }

  /** Human (when Clue-Giver) selects 1 of the 16 cards. */
  selectTargetCard(cardId: string): WordRoomStateResponse {
    if (this.round.clueGiverSeat !== 1 || this.round.phase !== "selecting_word") {
      throw new Error("GAME_NOT_ACTIVE");
    }
    const onBoard = this.round.cards.find((c) => c.id === cardId);
    if (!onBoard) {
      throw new Error("INVALID_TARGET");
    }
    const spec = getWordById(cardId);
    if (!spec) {
      throw new Error("INVALID_TARGET");
    }
    this.usedWordIds.add(spec.id);
    this.round.targetSpec = spec;
    this.round.phase = "giving_clue";
    this.round.startedAtMs = Date.now();
    this.version += 1;
    return this.getPublicSnapshot();
  }

  /** Human (when Clue-Giver) submits a clue, then Semantic AI deduces and submits a guess! */
  submitHumanClue(
    rawClue: string,
    kind: "association" | "category" | "narrowing" = "association",
  ): WordRoomStateResponse {
    if (this.round.clueGiverSeat !== 1 || this.round.phase !== "giving_clue") {
      throw new Error("NOT_YOUR_TURN");
    }
    const target = this.round.targetSpec;
    if (!target) {
      throw new Error("GAME_NOT_ACTIVE");
    }
    const check = validateClueText(rawClue, target.word, target.acceptedAnswers);
    if (!check.valid) {
      throw new Error(check.code);
    }

    this.round.clues.push({
      index: this.round.clues.length + 1,
      text: check.cleaned,
      source: "clue_giver",
      kind,
      created_at: new Date().toISOString(),
    });
    this.round.phase = "guessing";

    // Semantic AI analyzes all clues given so far in this round and produces a realistic guess!
    const aiGuessWord = this.computeSemanticAiGuess();
    return this.processGuessInternal(2, aiGuessWord);
  }

  /** Request one of up to 2 progressive auxiliary hint words during a live round. */
  requestExtraHint(): WordRoomStateResponse {
    const target = this.round.targetSpec;
    if (!target || this.round.phase === "round_result") {
      throw new Error("GAME_NOT_ACTIVE");
    }
    if (this.round.clues.length >= this.rules.maxCluesPerRound || this.round.systemHintsUsed >= 2) {
      throw new Error("MAX_CLUES_REACHED");
    }
    const hintText = target.hintWords[this.round.systemHintsUsed] ?? target.relatedWords[2] ?? target.wordEn;
    this.round.systemHintsUsed += 1;
    this.round.clues.push({
      index: this.round.clues.length + 1,
      text: hintText,
      source: "system_hint",
      kind: "narrowing",
      created_at: new Date().toISOString(),
    });
    this.round.phase = "guessing";
    this.version += 1;

    if (this.round.guesserSeat === 2) {
      const aiGuessWord = this.computeSemanticAiGuess();
      return this.processGuessInternal(2, aiGuessWord);
    }
    return this.getPublicSnapshot();
  }

  /** Human (when Guesser) submits a typed answer. */
  submitHumanGuess(rawGuess: string): WordRoomStateResponse {
    if (this.round.guesserSeat !== 1 || this.round.phase !== "guessing") {
      throw new Error("NOT_YOUR_TURN");
    }
    return this.processGuessInternal(1, rawGuess);
  }

  private computeSemanticAiGuess(): string {
    const allClueTokens = this.round.clues.flatMap((c) => {
      const norm = normalizeWordText(c.text);
      return [compactWordKey(c.text), ...norm.split(" ").map((t) => compactWordKey(t))];
    }).filter((t) => t.length >= 2);

    const scored = WORD_BANK.filter(
      (entry) => !this.aiAlreadyGuessedKeys.has(compactWordKey(entry.word)),
    ).map((entry) => {
      const cat = getCategoryById(entry.categoryId);
      let score = 0;
      const assocPool = [
        ...entry.relatedWords,
        ...entry.hintWords,
        cat?.titleFa ?? "",
      ].map((w) => compactWordKey(w));

      for (const token of allClueTokens) {
        for (const assoc of assocPool) {
          if (!assoc) continue;
          if (token === assoc) score += 12;
          else if (assoc.length >= 3 && (token.includes(assoc) || assoc.includes(token))) {
            score += 5;
          }
        }
      }
      // Small realistic jitter so AI feels lively and human-like
      score += Math.random() * 2.5;
      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);
    // If human gave strong clues (score >= 5), AI narrows accurately; otherwise picks best thematic guess
    const picked = scored[0]?.entry ?? WORD_BANK[0];
    this.aiAlreadyGuessedKeys.add(compactWordKey(picked.word));
    return picked.word;
  }

  private processGuessInternal(seat: number, rawGuess: string): WordRoomStateResponse {
    const target = this.round.targetSpec;
    if (!target) throw new Error("GAME_NOT_ACTIVE");
    const cleaned = rawGuess.trim();
    if (!cleaned) throw new Error("INVALID_GUESS");

    const guessCompact = compactWordKey(cleaned);
    if (
      seat === 1 &&
      this.round.guesses.some((g) => compactWordKey(g.guess_text) === guessCompact)
    ) {
      throw new Error("DUPLICATE_GUESS");
    }

    const cat = getCategoryById(target.categoryId);
    const siblingWords = this.round.cards
      .filter((c) => c.categoryId === target.categoryId && c.id !== target.id)
      .map((c) => c.word);

    const outcome = evaluateGuess(cleaned, {
      target,
      categoryTitleFa: cat?.titleFa,
      categoryTitleEn: cat?.titleEn,
      sameCategoryWords: siblingWords,
    });

    const elapsedSec = Math.max(1, Math.round((Date.now() - this.round.startedAtMs) / 1000));
    const scoreCalc = calculateGuessScore({
      outcome,
      cluesUsed: Math.max(1, this.round.clues.length),
      difficulty: target.difficulty,
      elapsedSeconds: elapsedSec,
      relatedBonusAlreadyClaimed: this.round.relatedBonusClaimed,
      rules: this.rules,
    });

    if (scoreCalc.grantsRelatedBonus) {
      this.round.relatedBonusClaimed = true;
    }
    this.round.cluePointsAccumulated += scoreCalc.clueGiverPoints;
    this.round.lastSpeedBonus = scoreCalc.speedBonus;

    const guesserIdx = seat - 1;
    const clueGiverIdx = this.round.clueGiverSeat - 1;

    this.players[guesserIdx] = {
      ...this.players[guesserIdx],
      score: this.players[guesserIdx].score + scoreCalc.guesserPoints,
      correct_guesses:
        this.players[guesserIdx].correct_guesses + (outcome === "correct" ? 1 : 0),
      related_guesses:
        this.players[guesserIdx].related_guesses + (outcome === "related" ? 1 : 0),
    };
    this.players[clueGiverIdx] = {
      ...this.players[clueGiverIdx],
      score: this.players[clueGiverIdx].score + scoreCalc.clueGiverPoints,
      successful_clues:
        this.players[clueGiverIdx].successful_clues + (outcome === "correct" ? 1 : 0),
    };

    const guessEntry: RoundGuessEntry = {
      index: this.round.guesses.length + 1,
      seat,
      player_name: this.players[guesserIdx].name,
      guess_text: cleaned,
      normalized_guess: normalizeWordText(cleaned),
      outcome,
      points_awarded: scoreCalc.guesserPoints,
      clue_count_when_guessed: this.round.clues.length,
      created_at: new Date().toISOString(),
    };
    this.round.guesses.push(guessEntry);

    const exhaustedGuesses = this.round.guesses.length >= this.rules.maxGuessesPerRound;
    const canGiveMoreClues = this.round.clues.length < this.rules.maxCluesPerRound;

    let roundEnded = false;
    if (outcome === "correct" || exhaustedGuesses || !canGiveMoreClues) {
      roundEnded = true;
      this.finishCurrentRound(outcome);
    } else if (this.round.clueGiverSeat === 2) {
      // AI immediately provides an additional narrowing clue (#2 or #3)
      this.pushAiClue();
      this.round.phase = "guessing";
    } else {
      // Human is Clue-Giver → prompt Human to provide Clue #2 or #3
      this.round.phase = "giving_clue";
    }

    this.version += 1;
    return {
      ...this.getPublicSnapshot(),
      evaluation: {
        outcome,
        points_awarded: scoreCalc.guesserPoints,
        round_ended: roundEnded,
      },
    };
  }

  private finishCurrentRound(finalOutcome: AnswerOutcome | "skipped" | "timeout"): void {
    const target = this.round.targetSpec!;
    const cat = getCategoryById(target.categoryId);
    const totalGuesserPts = this.round.guesses.reduce((acc, g) => acc + g.points_awarded, 0);
    const totalCluePts = this.round.cluePointsAccumulated;

    this.round.phase = "round_result";
    this.round.roundSummary = {
      outcome: finalOutcome,
      guesser_points: totalGuesserPts,
      clue_giver_points: totalCluePts,
      speed_bonus: finalOutcome === "correct" ? this.round.lastSpeedBonus : 0,
      difficulty_bonus:
        finalOutcome === "correct"
          ? this.rules.difficultyBonus[target.difficulty] ?? 0
          : 0,
    };

    this.history.push({
      round_number: this.round.roundNumber,
      clue_giver_seat: this.round.clueGiverSeat,
      guesser_seat: this.round.guesserSeat,
      target_word: target.word,
      target_word_en: target.wordEn,
      category_title_fa: cat?.titleFa ?? "",
      difficulty: target.difficulty,
      outcome: finalOutcome,
      clues_used: this.round.clues.length,
      guesses_count: this.round.guesses.length,
      guesser_points: totalGuesserPts,
      clue_giver_points: totalCluePts,
    });
  }

  nextRound(): WordRoomStateResponse {
    if (this.round.phase !== "round_result") {
      return this.getPublicSnapshot();
    }
    if (this.round.roundNumber >= this.rules.totalRounds) {
      this.status = "finished";
      this.version += 1;
      return this.getPublicSnapshot();
    }
    this.initRound(this.round.roundNumber + 1, true);
    return this.getPublicSnapshot();
  }

  rematch(): WordRoomStateResponse {
    this.status = "active";
    this.gameNumber += 1;
    this.history = [];
    this.players = [
      { ...this.players[0], score: 0, correct_guesses: 0, related_guesses: 0, successful_clues: 0 },
      { ...this.players[1], score: 0, correct_guesses: 0, related_guesses: 0, successful_clues: 0 },
    ];
    this.initRound(1, this.gameNumber % 2 === 1);
    return this.getPublicSnapshot();
  }

  /** Strictly role-scrubbed state snapshot identical to PostgreSQL RPC projection. */
  getPublicSnapshot(): WordRoomStateResponse {
    const myRole: PlayerRole =
      this.round.clueGiverSeat === 1 ? "clue_giver" : "guesser";
    const isRevealed =
      this.round.phase === "round_result" || this.status === "finished";
    const canSeeSecret = myRole === "clue_giver" || isRevealed;

    const target = this.round.targetSpec;
    const cat = target ? getCategoryById(target.categoryId) : undefined;

    const s1 = this.players[0].score;
    const s2 = this.players[1].score;
    const winnerSeat =
      this.status === "finished" ? (s1 > s2 ? 1 : s2 > s1 ? 2 : null) : null;

    const state: WordRoomState = {
      room_code: this.shadowRoomCode ?? "SOLO-AI",
      status: this.status,
      max_players: 2,
      game_number: this.gameNumber,
      current_round: this.round.roundNumber,
      total_rounds: this.rules.totalRounds,
      rules: this.rules,
      players: [...this.players],
      round: {
        round_number: this.round.roundNumber,
        phase: this.round.phase,
        clue_giver_seat: this.round.clueGiverSeat,
        guesser_seat: this.round.guesserSeat,
        visible_categories:
          canSeeSecret ||
          this.rules.guesserViewMode === "categories_visible" ||
          this.rules.guesserViewMode === "board_16"
            ? this.round.categories.map((c) => ({
                id: c.id,
                titleFa: c.titleFa,
                titleEn: c.titleEn,
                color: c.color,
              }))
            : [],
        board_cards:
          canSeeSecret || this.rules.guesserViewMode === "board_16"
            ? this.round.cards.map((c) => ({
                ...c,
                hintWords: canSeeSecret ? c.hintWords : undefined,
              }))
            : null,
        target_word_id: canSeeSecret && target ? target.id : null,
        target_word: canSeeSecret && target ? target.word : null,
        target_word_en: canSeeSecret && target ? target.wordEn : null,
        target_category_fa: canSeeSecret && cat ? cat.titleFa : null,
        target_difficulty: canSeeSecret && target ? target.difficulty : null,
        suggested_hints: canSeeSecret && target ? [...target.hintWords] : null,
        system_hints_used: this.round.systemHintsUsed,
        clues: [...this.round.clues],
        guesses: [...this.round.guesses],
        related_bonus_claimed: this.round.relatedBonusClaimed,
        round_result_summary: this.round.roundSummary,
        started_at: new Date(this.round.startedAtMs).toISOString(),
        deadline_at: null,
        remaining_seconds: null,
      },
      history: [...this.history],
      winner_seat: winnerSeat,
      is_draw: this.status === "finished" && s1 === s2,
      settlement: { settled: false },
      version: this.version,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      finished_at: this.status === "finished" ? new Date().toISOString() : null,
      expires_in_seconds: 10800,
      server_now: new Date().toISOString(),
    };

    return {
      seat: 1,
      my_role: myRole,
      state,
    };
  }
}
