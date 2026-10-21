import { describe, expect, it } from "vitest";
import { ApiError, GENERIC_ERROR, NETWORK_ERROR, toUserError } from "./errors";

describe("toUserError", () => {
  it("maps known server codes to Persian messages", () => {
    const res = toUserError(new ApiError("ROOM_NOT_FOUND", true));
    expect(res.known).toBe(true);
    expect(res.message).toContain("پیدا نشد");
  });

  it("maps supabase-style error objects with known codes", () => {
    const res = toUserError({ message: "RATE_LIMITED" });
    expect(res.known).toBe(true);
    expect(res.message).toContain("تعداد درخواست");
  });

  it("explains why legacy admin profiles require a secure token-and-recovery link", () => {
    const res = toUserError(new ApiError("ADMIN_PROFILE_SETUP_REQUIRED", true));
    expect(res.known).toBe(true);
    expect(res.message).toContain("کد بازیابی");
  });

  it("maps network failures", () => {
    const res = toUserError({ message: "TypeError: Failed to fetch" });
    expect(res.message).toBe(NETWORK_ERROR);
  });

  it("maps Last Night movement, interaction, and transition errors safely", () => {
    const tooFar = toUserError(new ApiError("INTERACTABLE_TOO_FAR", true));
    expect(tooFar.message).toContain("نزدیک‌تر");

    const invalidMovement = toUserError(new ApiError("PLAYER_MOVED_TOO_FAST", true));
    expect(invalidMovement.message).toContain("سرعت مجاز");

    const earlyClear = toUserError(new ApiError("WAVE_NOT_COMPLETE", true));
    expect(earlyClear.message).toContain("حداقل زمان");
  });

  it("falls back to a generic message and never leaks technical detail", () => {
    const res = toUserError(new Error("PG::something internal at /db/secret"));
    expect(res.message).toBe(GENERIC_ERROR);
    expect(res.known).toBe(false);
    expect(res.message).not.toContain("PG::");
  });

  it("maps a PostgREST missing-RPC code with a migration remedy", () => {
    const res = toUserError({
      code: "PGRST202",
      message: "Could not find the function public.register_player in the schema cache",
    });
    expect(res.code).toBe("PGRST202");
    expect(res.known).toBe(true);
    expect(res.solution).toContain("مایگریشن");
    expect(res.message).not.toContain("schema cache");
  });

  it("reports placeholder environment configuration without leaking raw values", () => {
    const res = toUserError(new ApiError("ENV_PLACEHOLDER", true));
    expect(res.code).toBe("ENV_PLACEHOLDER");
    expect(res.message).toContain("مقدار نمونه");
    expect(res.solution).toContain("Cloudflare");
  });

  it("maps permission failures to a safe actionable message", () => {
    const res = toUserError({ code: "42501", message: "permission denied for table rooms" });
    expect(res.known).toBe(true);
    expect(res.code).toBe("42501");
    expect(res.message).not.toContain("table rooms");
    expect(res.solution).toContain("GRANT");
  });

  it("maps request timeouts to an actionable diagnostic", () => {
    const res = toUserError({ name: "AbortError", message: "Request timed out" });
    expect(res.code).toBe("TIMEOUT");
    expect(res.message).toContain("طول کشید");
    expect(res.solution).toContain("دیتابیس");
  });

  it("recognizes a missing function even when PostgREST omitted its code", () => {
    const res = toUserError({ message: "Function public.get_public_status does not exist" });
    expect(res.code).toBe("PGRST202");
    expect(res.solution).toContain("schema cache");
  });

  it("preserves unknown PostgREST codes without showing technical response text", () => {
    const res = toUserError({ code: "PGRST204", message: "internal details: secret table name" });
    expect(res.code).toBe("PGRST204");
    expect(res.message).toBe(GENERIC_ERROR);
    expect(res.message).not.toContain("secret table name");
  });
});
