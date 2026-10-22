/**
 * RAZ-VAJEH (رازواژه — WORD CIPHER)
 * Core TypeScript contracts for the server-authoritative multiplayer & solo
 * word-association and guessing game.
 */

export type WordDifficulty = "easy" | "medium" | "hard";

export type WordLanguage = "fa" | "en";

export type WordPackId = "all" | "classic" | "culture" | "adventure";

export type AnswerOutcome = "correct" | "related" | "incorrect";

export type PlayerRole = "clue_giver" | "guesser";

export type ExtraClueMode = "hybrid" | "clue_giver_only" | "system_hints";

export type GuesserViewMode = "blind_typed" | "categories_visible" | "board_16";

export type WordRoomStatus =
  | "waiting"
  | "active"
  | "finished"
  | "closed"
  | "expired";

export type WordRoundPhase =
  | "selecting_word"
  | "giving_clue"
  | "guessing"
  | "round_result";

/** Metadata for a category in the configurable word bank. */
export interface WordCategorySpec {
  readonly id: string;
  readonly packId: Exclude<WordPackId, "all">;
  readonly lang: WordLanguage;
  readonly titleFa: string;
  readonly titleEn: string;
  readonly color: string;
  readonly icon: string;
}

/** Structured word entry with category, difficulty, accepted synonyms & semantic associations. */
export interface WordEntrySpec {
  readonly id: string;
  readonly categoryId: string;
  readonly lang: WordLanguage;
  readonly word: string;
  readonly wordEn: string;
  readonly difficulty: WordDifficulty;
  /** Alternative spellings / exact synonyms counted as fully `correct`. */
  readonly acceptedAnswers: readonly string[];
  /** Associated concepts & clues counted as `related` when guessed. */
  readonly relatedWords: readonly string[];
  /** Two progressive narrowing words/clues available during a round. */
  readonly hintWords: readonly [string, string];
}

/** Public/clue-giver card view for one of the 16 round cards (4 categories × 4 words). */
export interface RoundWordCard {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryTitleFa: string;
  readonly categoryTitleEn: string;
  readonly categoryColor: string;
  readonly word: string;
  readonly wordEn: string;
  readonly difficulty: WordDifficulty;
  readonly hintWords?: readonly [string, string];
}

/** Configurable game rules stored per room so rule tweaks never require rewriting game flow. */
export interface WordGameRulesConfig {
  readonly totalRounds: number;
  readonly packId: WordPackId;
  readonly difficultyFilter: "all" | WordDifficulty;
  /** Total clues allowed in a round: 1 primary clue + up to 2 additional clues/words (default 3). */
  readonly maxCluesPerRound: number;
  /** Maximum guess submissions allowed per round (default 3). */
  readonly maxGuessesPerRound: number;
  /** How the 2 additional clues/words can be introduced during a round. */
  readonly extraClueMode: ExtraClueMode;
  /** Information shown on the guesser's screen while the round is live. */
  readonly guesserViewMode: GuesserViewMode;
  /** Round time limit in seconds (0 = untimed casual). */
  readonly roundTimerSeconds: number;
  /** Points earned by the guesser for a correct guess after 1, 2, or 3+ clues. */
  readonly pointsCorrectByClue: readonly [number, number, number];
  /** Cooperative/skill points earned by the clue-giver when their clue leads to a correct guess. */
  readonly pointsClueGiverBonus: readonly [number, number, number];
  /** Partial points awarded (max once per round) for a semantically related guess. */
  readonly pointsRelatedBonus: number;
  /** Extra bonus points based on selected target card difficulty. */
  readonly difficultyBonus: Readonly<Record<WordDifficulty, number>>;
  /** Fast-solve bonus ceiling (awarded when solved quickly). */
  readonly speedBonusMax: number;
  /** Platform Sheriff Coin rewards upon completing a match. */
  readonly sheriffCoinWinReward: number;
  readonly sheriffCoinPlayReward: number;
}

export interface RoundClueEntry {
  readonly index: number;
  readonly text: string;
  readonly source: "clue_giver" | "system_hint";
  readonly kind: "association" | "category" | "narrowing";
  readonly created_at: string;
}

export interface RoundGuessEntry {
  readonly index: number;
  readonly seat: number;
  readonly player_name: string;
  readonly guess_text: string;
  readonly normalized_guess: string;
  readonly outcome: AnswerOutcome;
  readonly points_awarded: number;
  readonly clue_count_when_guessed: number;
  readonly created_at: string;
}

export interface RoundHistorySummary {
  readonly round_number: number;
  readonly clue_giver_seat: number;
  readonly guesser_seat: number;
  readonly target_word: string;
  readonly target_word_en: string;
  readonly category_title_fa: string;
  readonly difficulty: WordDifficulty;
  readonly outcome: AnswerOutcome | "skipped" | "timeout";
  readonly clues_used: number;
  readonly guesses_count: number;
  readonly guesser_points: number;
  readonly clue_giver_points: number;
}

export interface WordRoomPlayer {
  readonly seat: number;
  readonly name: string;
  readonly score: number;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly is_host: boolean;
  readonly correct_guesses: number;
  readonly related_guesses: number;
  readonly successful_clues: number;
  readonly profile_id?: string | null;
}

export interface WordRoundPublicView {
  readonly round_number: number;
  readonly phase: WordRoundPhase;
  readonly clue_giver_seat: number;
  readonly guesser_seat: number;
  /** Present ONLY when `guesserViewMode === 'categories_visible'` or `'board_16'` or to clue_giver / after reveal. */
  readonly visible_categories: readonly {
    readonly id: string;
    readonly titleFa: string;
    readonly titleEn: string;
    readonly color: string;
  }[];
  /**
   * 16 cards (4 categories × 4 words).
   * SECURITY: Strictly omitted (`null`) for the guesser while `phase !== 'round_result'`
   * unless `guesserViewMode === 'board_16'` (and even then NEVER indicates which card is the target!).
   */
  readonly board_cards: readonly RoundWordCard[] | null;
  /**
   * Secret target card ID & word.
   * SECURITY: Strictly `null` on wire for guesser & public broadcasts until `phase === 'round_result'`.
   */
  readonly target_word_id: string | null;
  readonly target_word: string | null;
  readonly target_word_en: string | null;
  readonly target_category_fa: string | null;
  readonly target_difficulty: WordDifficulty | null;
  /** Optional 2 suggested hint words visible ONLY to clue-giver during live round (or revealed at end). */
  readonly suggested_hints: readonly string[] | null;
  readonly system_hints_used: number;
  readonly clues: readonly RoundClueEntry[];
  readonly guesses: readonly RoundGuessEntry[];
  readonly related_bonus_claimed: boolean;
  readonly round_result_summary: {
    readonly outcome: AnswerOutcome | "skipped" | "timeout";
    readonly guesser_points: number;
    readonly clue_giver_points: number;
    readonly speed_bonus: number;
    readonly difficulty_bonus: number;
  } | null;
  readonly started_at: string;
  readonly deadline_at: string | null;
  readonly remaining_seconds: number | null;
}

export interface WordRoomState {
  readonly room_code: string;
  readonly status: WordRoomStatus;
  readonly max_players: number;
  readonly game_number: number;
  readonly current_round: number;
  readonly total_rounds: number;
  readonly rules: WordGameRulesConfig;
  readonly players: readonly WordRoomPlayer[];
  readonly round: WordRoundPublicView | null;
  readonly history: readonly RoundHistorySummary[];
  readonly winner_seat: number | null;
  readonly is_draw: boolean;
  readonly settlement: {
    readonly settled?: boolean;
    readonly win_reward_sh?: number;
    readonly play_reward_sh?: number;
  };
  readonly version: number;
  readonly created_at: string | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly expires_in_seconds: number;
  readonly server_now: string;
}

export interface WordCreateJoinResponse {
  readonly room_code: string;
  readonly room_id: string;
  readonly player_token: string;
  readonly seat: number;
  readonly my_role: PlayerRole | null;
  readonly state: WordRoomState;
}

export interface WordRoomStateResponse {
  readonly seat: number | null;
  readonly my_role: PlayerRole | null;
  readonly state: WordRoomState;
  readonly evaluation?: {
    readonly outcome: AnswerOutcome;
    readonly points_awarded: number;
    readonly round_ended: boolean;
  };
}
