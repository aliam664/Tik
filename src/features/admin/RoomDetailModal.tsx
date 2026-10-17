import { useCallback, useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import { boardFromString } from "@/game/engine";
import type { AdminRoomDetail } from "@/types/api";

export function RoomDetailModal({
  token,
  roomCode,
  onClose,
  onSessionExpired,
}: {
  token: string;
  roomCode: string | null;
  onClose: () => void;
  onSessionExpired: () => void;
}) {
  const [detail, setDetail] = useState<AdminRoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!roomCode) return;
    setError(null);
    setDetail(null);
    try {
      setDetail(await adminApi.roomDetail(token, roomCode));
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      setError(user.message);
    }
  }, [onSessionExpired, roomCode, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const board = detail ? boardFromString(detail.board) : [];

  return (
    <Modal open={!!roomCode} title={`جزئیات اتاق ${roomCode ?? ""}`} onClose={onClose}>
      {error ? (
        <p className="form-field__error" role="alert">{error}</p>
      ) : !detail ? (
        <div className="room-loading">
          <LoadingSpinner size={22} label="دریافت جزئیات" />
        </div>
      ) : (
        <div className="room-detail">
          <dl className="detail-grid">
            <div>
              <dt>وضعیت</dt>
              <dd>{detail.status}</dd>
            </div>
            <div>
              <dt>بازی شماره</dt>
              <dd className="num">{toFaDigits(detail.game_number)}</dd>
            </div>
            <div>
              <dt>ایجاد</dt>
              <dd>{formatDateTime(detail.created_at)}</dd>
            </div>
            <div>
              <dt>انقضا</dt>
              <dd>{formatDateTime(detail.expires_at)}</dd>
            </div>
            <div>
              <dt>برد</dt>
              <dd>{detail.winner ?? (detail.is_draw ? "مساوی" : "—")}</dd>
            </div>
            <div>
              <dt>نسخه وضعیت</dt>
              <dd className="num">{toFaDigits(detail.version)}</dd>
            </div>
          </dl>

          <h3>بازیکنان</h3>
          <ul className="mini-list">
            {detail.players.map((p) => (
              <li key={p.symbol}>
                <strong>{p.symbol === "X" ? "X" : "O"}</strong> — {p.name}{" "}
                <span className={`presence-dot ${p.connected ? "presence-dot--on" : "presence-dot--off"}`} aria-hidden="true" />
                <span className="mini-list__meta">آخرین حضور: {formatDateTime(p.last_seen_at)}</span>
              </li>
            ))}
          </ul>

          <h3>صفحه فعلی</h3>
          <div className="mini-board ltr" dir="ltr" aria-hidden="true">
            {board.map((cell, i) => (
              <span key={i} className={`mini-board__cell ${cell ? `mini-board__cell--${cell.toLowerCase()}` : ""}`}>
                {cell ?? "·"}
              </span>
            ))}
          </div>

          <h3>حرکت‌ها ({toFaDigits(detail.moves.length)})</h3>
          {detail.moves.length === 0 ? (
            <p className="mini-list__meta">حرکتی ثبت نشده است.</p>
          ) : (
            <ol className="mini-list mini-list--moves">
              {detail.moves.slice(0, 30).map((m) => (
                <li key={`${m.game_number}-${m.move_number}`} className="num">
                  بازی {toFaDigits(m.game_number)} — حرکت {toFaDigits(m.move_number)}:{" "}
                  {m.symbol === "X" ? "X" : "O"} → خانه {toFaDigits(m.cell_index)}{" "}
                  <span className="mini-list__meta">{formatDateTime(m.created_at)}</span>
                </li>
              ))}
            </ol>
          )}

          <h3>رویدادها</h3>
          <ul className="mini-list">
            {detail.events.slice(0, 15).map((e, i) => (
              <li key={i}>
                <span className="mono ltr">{e.event_type}</span>{" "}
                <span className="mini-list__meta">{formatDateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
