/**
 * Guest player credentials — sessionStorage based.
 *  • scoped per room code (two rooms / two tabs never collide)
 *  • survives refresh in the same tab, cleared when the tab closes
 *  • never placed in URLs, never logged, never sent to other players
 *  • the raw token only travels inside RPC payloads over HTTPS
 */

const TOKEN_KEY = (code: string) => `doz:token:${code.toUpperCase()}`;
const SYMBOL_KEY = (code: string) => `doz:symbol:${code.toUpperCase()}`;
export const ADMIN_TOKEN_KEY = "doz:admin-session";

function safeGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — session recovery won't work */
  }
}

function safeRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export const playerSession = {
  save(roomCode: string, token: string, symbol: string): void {
    safeSet(TOKEN_KEY(roomCode), token);
    safeSet(SYMBOL_KEY(roomCode), symbol);
  },
  getToken(roomCode: string): string | null {
    return safeGet(TOKEN_KEY(roomCode));
  },
  getSymbol(roomCode: string): string | null {
    return safeGet(SYMBOL_KEY(roomCode));
  },
  clear(roomCode: string): void {
    safeRemove(TOKEN_KEY(roomCode));
    safeRemove(SYMBOL_KEY(roomCode));
  },
};

export const adminSession = {
  save(session: { token: string; expires_at: string }): void {
    safeSet(ADMIN_TOKEN_KEY, JSON.stringify(session));
  },
  load(): { token: string; expires_at: string } | null {
    const raw = safeGet(ADMIN_TOKEN_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { token: string; expires_at: string };
      if (new Date(parsed.expires_at).getTime() < Date.now()) {
        adminSession.clear();
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },
  clear(): void {
    safeRemove(ADMIN_TOKEN_KEY);
  },
};

/** Extract and normalize the room code from a /room/:code URL param. */
export function normalizeRoomCode(input: string | undefined | null): string | null {
  if (!input) return null;
  const code = input.toUpperCase().replace(/[^A-Z2-9]/g, "");
  return /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

/** Build the share/invite link for a room (uses the room code in the URL —
 * the code alone grants NO gameplay authority; tokens do). */
export function inviteLink(roomCode: string): string {
  const url = new URL(window.location.origin);
  url.pathname = "/join";
  url.searchParams.set("code", roomCode);
  return url.toString();
}
