export interface StoredLnRoomSession {
  roomCode: string;
  playerToken: string;
  playerId: string;
  seat: number;
  displayName: string;
  savedAt: string;
}

const LN_STORAGE_PREFIX = "doz_ln_session_v1_";

export function saveLnSession(session: StoredLnRoomSession): void {
  try {
    const key = `${LN_STORAGE_PREFIX}${session.roomCode.toUpperCase()}`;
    window.localStorage.setItem(key, JSON.stringify(session));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLnSession(roomCode: string): StoredLnRoomSession | null {
  try {
    const key = `${LN_STORAGE_PREFIX}${roomCode.toUpperCase()}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLnRoomSession>;
    if (!parsed.roomCode || !parsed.playerToken || !parsed.playerId) return null;
    return {
      roomCode: parsed.roomCode,
      playerToken: parsed.playerToken,
      playerId: parsed.playerId,
      seat: Number(parsed.seat ?? 1),
      displayName: parsed.displayName ?? "شوالیه",
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearLnSession(roomCode: string): void {
  try {
    const key = `${LN_STORAGE_PREFIX}${roomCode.toUpperCase()}`;
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
