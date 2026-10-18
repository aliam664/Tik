import { ApiError, ERROR_MESSAGES } from "../errors";
import { env } from "../env";
import { supabase } from "../supabase";

/**
 * Thin typed wrapper over the SECURITY DEFINER RPCs.
 * The server returns clean error codes (e.g. ROOM_NOT_FOUND) inside
 * PostgREST's error.message — we convert them to ApiError.
 */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!env.isConfigured && env.configIssue) {
    throw new ApiError(env.configIssue.code, true, env.configIssue.message);
  }

  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const businessCode = error.message.trim();
    const known = Boolean(ERROR_MESSAGES[businessCode]);
    const code = known ? businessCode : error.code || "UNKNOWN";
    const technical = [error.message, error.details, error.hint].filter(Boolean).join(" | ");
    throw new ApiError(code, known, technical);
  }
  return data as T;
}
