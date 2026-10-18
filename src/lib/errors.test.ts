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

  it("maps network failures", () => {
    const res = toUserError({ message: "TypeError: Failed to fetch" });
    expect(res.message).toBe(NETWORK_ERROR);
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
});
