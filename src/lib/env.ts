import { ApiError, toUserError, type UserError } from "./errors";

const PLACEHOLDER_PATTERN = /(?:\byour(?:[_ -]|\b)|\bplaceholder\b|\bexample\b|\breplace[_ -]?me\b|\bchange[_ -]?me\b|<[^>]+>)/i;
const FALLBACK_URL = "https://configuration-missing.invalid";
const FALLBACK_KEY = "configuration-missing";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

const rawUrl = clean(import.meta.env.VITE_SUPABASE_URL);
const rawAnonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

let configErrorCode: "ENV_MISSING" | "ENV_PLACEHOLDER" | "ENV_INVALID" | null = null;
if (!rawUrl || !rawAnonKey) {
  configErrorCode = "ENV_MISSING";
} else if (PLACEHOLDER_PATTERN.test(rawUrl) || PLACEHOLDER_PATTERN.test(rawAnonKey)) {
  configErrorCode = "ENV_PLACEHOLDER";
} else if (!validHttpsUrl(rawUrl)) {
  configErrorCode = "ENV_INVALID";
}

const configIssue: UserError | null = configErrorCode
  ? toUserError(new ApiError(configErrorCode, true))
  : null;

/**
 * A safe fallback lets React render its configuration banner instead of
 * crashing during module import. RPC and realtime calls are blocked while the
 * config is invalid, so this reserved .invalid host is never contacted.
 */
export const env = {
  supabaseUrl: configErrorCode ? FALLBACK_URL : rawUrl,
  supabaseAnonKey: configErrorCode ? FALLBACK_KEY : rawAnonKey,
  isConfigured: configErrorCode === null,
  configIssue,
} as const;
