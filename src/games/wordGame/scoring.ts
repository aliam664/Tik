/**
 * RAZ-VAJEH (رازواژه — WORD CIPHER)
 * Configurable rules & round score calculator.
 * Isolates all point values, round lengths, timer rules, and extra-clue rules
 * so game balance can be tuned without rewriting the round state machine.
 */

import type {
  AnswerOutcome,
  WordDifficulty,
  WordGameRulesConfig,
} from "@/types/wordGame";

export const DEFAULT_WORD_GAME_RULES: WordGameRulesConfig = {
  totalRounds: 4,
  packId: "all",
  difficultyFilter: "all",
  maxCluesPerRound: 3, // 1 initial clue + up to 2 additional clues/words
  maxGuessesPerRound: 3,
  extraClueMode: "hybrid",
  guesserViewMode: "blind_typed",
  roundTimerSeconds: 120,
  pointsCorrectByClue: [12, 9, 6],
  pointsClueGiverBonus: [8, 6, 4],
  pointsRelatedBonus: 2,
  difficultyBonus: {
    easy: 0,
    medium: 2,
    hard: 4,
  },
  speedBonusMax: 3,
  sheriffCoinWinReward: 35,
  sheriffCoinPlayReward: 15,
};

export function resolveRulesConfig(
  partial?: Partial<WordGameRulesConfig>,
): WordGameRulesConfig {
  if (!partial) return DEFAULT_WORD_GAME_RULES;
  return {
    ...DEFAULT_WORD_GAME_RULES,
    ...partial,
    totalRounds: Math.min(8, Math.max(2, partial.totalRounds ?? DEFAULT_WORD_GAME_RULES.totalRounds)),
    maxCluesPerRound: Math.min(4, Math.max(1, partial.maxCluesPerRound ?? DEFAULT_WORD_GAME_RULES.maxCluesPerRound)),
    maxGuessesPerRound: Math.min(5, Math.max(1, partial.maxGuessesPerRound ?? DEFAULT_WORD_GAME_RULES.maxGuessesPerRound)),
    roundTimerSeconds: Math.min(300, Math.max(0, partial.roundTimerSeconds ?? DEFAULT_WORD_GAME_RULES.roundTimerSeconds)),
  };
}

/**
 * Determine which player seats hold `clue_giver` and `guesser` for a given 1-based round.
 * Alternates roles cleanly every round for 2 players and scales naturally to N seats.
 */
export function assignRoundRoles(
  roundNumber: number,
  playerCount = 2,
): { clueGiverSeat: number; guesserSeat: number } {
  const total = Math.max(2, playerCount);
  const clueGiverSeat = ((Math.max(1, roundNumber) - 1) % total) + 1;
  const guesserSeat = (clueGiverSeat % total) + 1;
  return { clueGiverSeat, guesserSeat };
}

export interface RoundScoreInput {
  readonly outcome: AnswerOutcome;
  readonly cluesUsed: number;
  readonly difficulty: WordDifficulty;
  readonly elapsedSeconds: number;
  readonly relatedBonusAlreadyClaimed: boolean;
  readonly rules?: WordGameRulesConfig;
}

export interface RoundScoreResult {
  readonly guesserPoints: number;
  readonly clueGiverPoints: number;
  readonly speedBonus: number;
  readonly difficultyBonus: number;
  readonly grantsRelatedBonus: boolean;
}

export function calculateGuessScore(input: RoundScoreInput): RoundScoreResult {
  const rules = input.rules ?? DEFAULT_WORD_GAME_RULES;
  const clueIdx = Math.min(2, Math.max(0, input.cluesUsed - 1));

  if (input.outcome === "correct") {
    const baseGuesser = rules.pointsCorrectByClue[clueIdx];
    const baseClueGiver = rules.pointsClueGiverBonus[clueIdx];
    const diffBonus = rules.difficultyBonus[input.difficulty] ?? 0;

    let speedBonus = 0;
    if (input.elapsedSeconds <= 20) {
      speedBonus = rules.speedBonusMax;
    } else if (input.elapsedSeconds <= 45) {
      speedBonus = Math.max(1, Math.floor(rules.speedBonusMax / 2));
    }

    return {
      guesserPoints: baseGuesser + diffBonus + speedBonus,
      clueGiverPoints: baseClueGiver + Math.floor(diffBonus / 2),
      speedBonus,
      difficultyBonus: diffBonus,
      grantsRelatedBonus: false,
    };
  }

  if (input.outcome === "related" && !input.relatedBonusAlreadyClaimed) {
    return {
      guesserPoints: rules.pointsRelatedBonus,
      clueGiverPoints: 1,
      speedBonus: 0,
      difficultyBonus: 0,
      grantsRelatedBonus: true,
    };
  }

  return {
    guesserPoints: 0,
    clueGiverPoints: 0,
    speedBonus: 0,
    difficultyBonus: 0,
    grantsRelatedBonus: false,
  };
}
