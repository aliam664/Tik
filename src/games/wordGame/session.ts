export interface StoredWordRoomSession {
  roomCode: string;
  playerToken: string;
  seat: number;
  displayName: string;
  savedAt: string;
}

const WG_STORAGE_PREFIX = "doz_wg_session_v1_";

export function saveWordSession(session: StoredWordRoomSession): void {
  try {
    const key = `${WG_STORAGE_PREFIX}${session.roomCode.toUpperCase()}`;
    window.localStorage.setItem(key, JSON.stringify(session));
  } catch {
    // Ignore private-browsing quota errors
  }
}

export function loadWordSession(roomCode: string): StoredWordRoomSession | null {
  try {
    const key = `${WG_STORAGE_PREFIX}${roomCode.toUpperCase()}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWordRoomSession>;
    if (!parsed.roomCode || !parsed.playerToken) return null;
    return {
      roomCode: parsed.roomCode.toUpperCase(),
      playerToken: parsed.playerToken,
      seat: Number(parsed.seat ?? 1),
      displayName: parsed.displayName ?? "بازیکن",
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearWordSession(roomCode: string): void {
  try {
    const key = `${WG_STORAGE_PREFIX}${roomCode.toUpperCase()}`;
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
