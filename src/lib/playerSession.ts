/**
 * Persistent player identity — localStorage based (Phase 0 design).
 *  • survives tab close & device restart (unlike room tokens in sessionStorage)
 *  • raw player token + recovery code never leave the browser except over
 *    HTTPS RPC payloads; the server stores only SHA-256 hashes
 *  • the recovery code is the ONLY way to restore the wallet/rank on a new
 *    device — the UI must make the user save it
 */

const PLAYER_KEY = "doz:player";

export interface StoredPlayer {
  token: string;
  displayName: string;
  recoveryCode: string;
  createdAt: string;
}

function safeGet(): string | null {
  try {
    return localStorage.getItem(PLAYER_KEY);
  } catch {
    return null;
  }
}

function safeSet(value: string): void {
  try {
    localStorage.setItem(PLAYER_KEY, value);
  } catch {
    /* storage unavailable (private mode) */
  }
}

function safeRemove(): void {
  try {
    localStorage.removeItem(PLAYER_KEY);
  } catch {
    /* noop */
  }
}

export const playerIdentity = {
  save(player: StoredPlayer): void {
    safeSet(JSON.stringify(player));
  },
  load(): StoredPlayer | null {
    const raw = safeGet();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredPlayer;
      if (parsed && typeof parsed.token === "string" && parsed.token.length > 0) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },
  token(): string | null {
    return this.load()?.token ?? null;
  },
  updateRecovery(code: string): void {
    const p = this.load();
    if (p) this.save({ ...p, recoveryCode: code });
  },
  clear(): void {
    safeRemove();
  },
};
