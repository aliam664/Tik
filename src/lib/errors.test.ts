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

  it("does not echo raw SQL-ish messages even inside known code shape", () => {
    const res = toUserError({ message: "permission denied for table rooms" });
    expect(res.known).toBe(false);
    expect(res.message).toBe(GENERIC_ERROR);
  });
});
