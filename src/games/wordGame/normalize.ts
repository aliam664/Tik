/**
 * RAZ-VAJEH (رازواژه — WORD CIPHER)
 * Deterministic Persian & English text normalization and 3-outcome answer evaluation:
 *   - "correct"   → exact normalized match, accepted synonym/variant, or minor 1-char typo on long words
 *   - "related"   → matches a curated semantic association, hint word, category concept, or sibling card
 *   - "incorrect" → unrelated guess
 *
 * Character folding rules match PostgreSQL `public.wg_normalize_text` and `public.wg_compact_text`
 * so server-side evaluation and solo/offline evaluation produce consistent results.
 */

import type { AnswerOutcome, WordEntrySpec } from "@/types/wordGame";

const ARABIC_DIACRITICS_AND_TATWEEL = /[\u064B-\u065F\u0670\u0640]/g;
const INVISIBLE_JOINERS_AND_BIDI = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const PUNCTUATION_STRIP = /[.,/#!$%^&*;:{}=\-_`~()«»؟،؛"'[\]\\|<>+]/g;

/**
 * Normalize Persian and Latin text into canonical spaced form:
 *  - Unifies Arabic/Persian Yeh (`ي`, `ى`, `ئ` → `ی`) and Kaf (`ك` → `ک`)
 *  - Unifies Teh Marbuta / Heh (`ة`, `ۀ` → `ه`) and Alef forms (`آ`, `أ`, `إ`, `ٱ` → `ا`)
 *  - Converts Persian (`۰-۹`) and Arabic-Indic (`٠-٩`) digits to ASCII `0-9`
 *  - Converts ZWNJ (`\u200c`) and bidi control marks to plain spaces and collapses whitespace
 */
export function normalizeWordText(raw: string): string {
  if (!raw) return "";
  return raw
    .normalize("NFC")
    .toLowerCase()
    .replace(ARABIC_DIACRITICS_AND_TATWEEL, "")
    .replace(/[\u064A\u0649\u0626]/g, "ی")
    .replace(/\u0643/g, "ک")
    .replace(/[\u0629\u06C0]/g, "ه")
    .replace(/هٔ/g, "ه")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "ا")
    .replace(/\u0624/g, "و")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(INVISIBLE_JOINERS_AND_BIDI, " ")
    .replace(PUNCTUATION_STRIP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Aggressively compacted comparison key:
 *  - Removes all spaces/half-spaces so "قطب‌نما", "قطب نما", and "قطبنما" compare equal
 *  - Collapses repeated "یی" → "ی" so Persian spelling pairs like "آیینه" / "آینه" compare equal
 */
export function compactWordKey(raw: string): string {
  return normalizeWordText(raw)
    .replace(/\s+/g, "")
    .replace(/یی+/g, "ی");
}

/** Bounded Levenshtein edit distance for gentle typo forgiveness on longer words. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (Math.abs(la - lb) > 2) return Math.abs(la - lb);

  const prev = new Array<number>(lb + 1);
  const curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return prev[lb];
}

function isNearTypoMatch(guessKey: string, candidateKey: string): boolean {
  if (!guessKey || !candidateKey) return false;
  if (guessKey === candidateKey) return true;
  // Only allow 1-character typo tolerance when both forms have at least 5 letters
  // so short distinct Persian words (like "باد" vs "برف" or "مار" vs "ماست") never collide.
  const minLen = Math.min(guessKey.length, candidateKey.length);
  if (minLen >= 5 && editDistance(guessKey, candidateKey) <= 1) {
    return true;
  }
  return false;
}

export interface AnswerEvaluationContext {
  readonly target: WordEntrySpec;
  readonly categoryTitleFa?: string;
  readonly categoryTitleEn?: string;
  /** Other words from the same category present on this round's 16-card board. */
  readonly sameCategoryWords?: readonly string[];
}

/**
 * Evaluate a player's submitted guess against the secret target word:
 *  1. `correct`: Matches `target.word`, `target.wordEn`, or any entry in `target.acceptedAnswers`
 *     (under full Persian normalization + ZWNJ folding + safe 1-char typo tolerance on 5+ char words).
 *  2. `related`: Matches any curated `target.relatedWords`, `target.hintWords`, category name,
 *     same-category sibling word, or meaningful multi-letter token overlap with a curated association.
 *  3. `incorrect`: Everything else.
 */
export function evaluateGuess(
  rawGuess: string,
  context: AnswerEvaluationContext,
): AnswerOutcome {
  const guessNorm = normalizeWordText(rawGuess);
  const guessKey = compactWordKey(rawGuess);
  if (!guessKey) return "incorrect";

  const { target, categoryTitleFa, categoryTitleEn, sameCategoryWords = [] } = context;

  // 1. Check exact / synonym / accepted-answer match
  const exactPool = [target.word, target.wordEn, ...target.acceptedAnswers];
  for (const exact of exactPool) {
    const candKey = compactWordKey(exact);
    if (candKey && isNearTypoMatch(guessKey, candKey)) {
      return "correct";
    }
  }

  // Also strip leading/trailing common Persian indefinite/plural affixes ("ها", "ی") when checking exact match
  const strippedGuessKey = guessKey.replace(/ها$/, "");
  if (strippedGuessKey.length >= 3 && strippedGuessKey !== guessKey) {
    for (const exact of exactPool) {
      if (strippedGuessKey === compactWordKey(exact)) {
        return "correct";
      }
    }
  }

  // 2. Check semantic / category relatedness (never marks partial associations as fully correct)
  const relatedPool = [
    ...target.relatedWords,
    ...target.hintWords,
    ...sameCategoryWords,
    categoryTitleFa ?? "",
    categoryTitleEn ?? "",
  ];

  for (const rel of relatedPool) {
    const relKey = compactWordKey(rel);
    if (!relKey) continue;
    if (isNearTypoMatch(guessKey, relKey)) {
      return "related";
    }
    if (strippedGuessKey.length >= 3 && strippedGuessKey === relKey) {
      return "related";
    }
    // Multi-word descriptive guesses (e.g. "کوه آتشی" matching "کوه" or "آتش")
    if (guessNorm.includes(" ") && relKey.length >= 3) {
      const tokens = guessNorm.split(" ").map((t) => compactWordKey(t));
      if (tokens.some((tok) => tok.length >= 3 && tok === relKey)) {
        return "related";
      }
    }
  }

  return "incorrect";
}

/**
 * Validate a clue written by the clue-giver so they cannot directly leak the target word
 * or its exact accepted synonyms inside the clue string.
 */
export function validateClueText(
  rawClue: string,
  targetWord: string,
  acceptedAnswers: readonly string[] = [],
): { valid: true; cleaned: string } | { valid: false; code: "CLUE_EMPTY" | "CLUE_TOO_LONG" | "CLUE_CONTAINS_TARGET" } {
  const cleaned = rawClue.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2) {
    return { valid: false, code: "CLUE_EMPTY" };
  }
  if (cleaned.length > 60) {
    return { valid: false, code: "CLUE_TOO_LONG" };
  }

  const clueNorm = normalizeWordText(cleaned);
  const clueTokens = clueNorm.split(" ").map((t) => compactWordKey(t)).filter(Boolean);
  const clueCompact = compactWordKey(cleaned);
  const forbidden = [targetWord, ...acceptedAnswers];
  const suffixes = ["", "ها", "های", "ی", "ش", "ت", "م", "ان"];

  for (const word of forbidden) {
    const targetCompact = compactWordKey(word);
    if (!targetCompact) continue;

    // 1. Word-level match (catches 2-3 char target words like "مه" or "دف" + inflections
    //    WITHOUT falsely blocking innocent words like "نم هوا" or "هدف"!)
    const leakedAsToken = clueTokens.some((tok) =>
      suffixes.some((sfx) => tok === `${targetCompact}${sfx}`),
    );
    if (leakedAsToken) {
      return { valid: false, code: "CLUE_CONTAINS_TARGET" };
    }

    // 2. Substring match across spaces for 4+ char roots (catches "قطب نما", "آتش فشان")
    if (targetCompact.length >= 4 && clueCompact.includes(targetCompact)) {
      return { valid: false, code: "CLUE_CONTAINS_TARGET" };
    }
  }

  return { valid: true, cleaned };
}
