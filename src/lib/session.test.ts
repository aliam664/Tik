import { afterEach, describe, expect, it } from "vitest";
import { adminSession, inviteLink, normalizeRoomCode, playerSession } from "./session";

afterEach(() => {
  sessionStorage.clear();
});

describe("normalizeRoomCode", () => {
  it("uppercases and strips noise", () => {
    expect(normalizeRoomCode(" ab-c234 ")).toBe("ABC234");
    expect(normalizeRoomCode("k7qm2p")).toBe("K7QM2P");
  });

  it("rejects wrong lengths and invalid chars", () => {
    expect(normalizeRoomCode("ABC12")).toBeNull();
    expect(normalizeRoomCode("ABC120!")).toBeNull();
    expect(normalizeRoomCode(null)).toBeNull();
  });
});

describe("playerSession", () => {
  it("saves, reads and clears per-room credentials", () => {
    playerSession.save("abc123", "tok-1", "X");
    expect(playerSession.getToken("ABC123")).toBe("tok-1");
    expect(playerSession.getSymbol("abc123")).toBe("X");
    playerSession.clear("ABC123");
    expect(playerSession.getToken("ABC123")).toBeNull();
  });

  it("keeps rooms isolated from each other", () => {
    playerSession.save("AAAAAA", "tok-a", "X");
    playerSession.save("BBBBBB", "tok-b", "O");
    expect(playerSession.getToken("AAAAAA")).toBe("tok-a");
    expect(playerSession.getToken("BBBBBB")).toBe("tok-b");
  });
});

describe("adminSession", () => {
  it("round-trips a session and drops expired ones", () => {
    adminSession.save({ token: "adm-tok", expires_at: new Date(Date.now() + 60_000).toISOString() });
    expect(adminSession.load()?.token).toBe("adm-tok");

    adminSession.save({ token: "old", expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(adminSession.load()).toBeNull();
  });

  it.each([
    "{bad json",
    JSON.stringify({ token: "", expires_at: new Date(Date.now() + 60_000).toISOString() }),
    JSON.stringify({ token: "ok", expires_at: "not-a-date" }),
    JSON.stringify({ token: "ok" }),
  ])("clears malformed or incomplete stored sessions (%s)", (serialized) => {
    sessionStorage.setItem("doz:admin-session", serialized);
    expect(adminSession.load()).toBeNull();
    expect(sessionStorage.getItem("doz:admin-session")).toBeNull();
  });
});

describe("inviteLink", () => {
  it("puts the room code in the query string — never any token", () => {
    const link = inviteLink("ABC123");
    expect(link).toContain("/join?code=ABC123");
    expect(link).not.toContain("token");
  });
});
