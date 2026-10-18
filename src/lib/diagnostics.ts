import { api } from "./api";
import { toUserError, type UserError } from "./errors";
import { env } from "./env";

export interface ConnectionDiagnosticResult extends UserError {
  ok: boolean;
}

/** Checks local configuration, browser connectivity, then the public status RPC. */
export async function runConnectionDiagnostics(): Promise<ConnectionDiagnosticResult> {
  if (!env.isConfigured && env.configIssue) {
    return { ...env.configIssue, ok: false };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ...toUserError({ code: "NETWORK", message: "Browser is offline" }), ok: false };
  }

  try {
    await api.getPublicStatus();
    return {
      ok: true,
      known: true,
      code: "OK",
      message: "اتصال به Supabase برقرار است و RPC وضعیت پاسخ داد.",
      solution: "تنظیمات و دسترسی عمومی پایگاه داده سالم به نظر می‌رسند.",
    };
  } catch (error) {
    return { ...toUserError(error), ok: false };
  }
}
