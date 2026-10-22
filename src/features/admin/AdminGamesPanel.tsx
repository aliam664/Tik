import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/ui/Coin";
import { EmptyState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { AdminGameRow } from "@/types/api";

const PAGE_SIZE = 50;

export function AdminGamesPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [matches, setMatches] = useState<Record<string, unknown>[]>([]);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [rooms, setRooms] = useState<AdminGameRow[] | null>(null);
  const [roomsTotal, setRoomsTotal] = useState(0);
  const [modeFilter, setModeFilter] = useState<string>("");
  const [matchOffset, setMatchOffset] = useState(0);
  const [roomOffset, setRoomOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (modeVal = modeFilter, nextMatchOffset = matchOffset, nextRoomOffset = roomOffset) => {
      setLoading(true);
      try {
        const [mRes, gRes] = await Promise.all([
          adminApi.listMatches(token, modeVal || null, PAGE_SIZE, nextMatchOffset),
          adminApi.listGames(token, PAGE_SIZE, nextRoomOffset),
        ]);
        setMatches(mRes.items ?? []);
        setMatchesTotal(mRes.total ?? 0);
        setRooms(gRes.items ?? []);
        setRoomsTotal(gRes.total ?? 0);
      } catch (err) {
        const user = toUserError(err);
        if (user.code === "ADMIN_UNAUTHORIZED") {
          onSessionExpired();
          return;
        }
        showToast(user.message, "error");
      } finally {
        setLoading(false);
      }
    },
    [matchOffset, modeFilter, onSessionExpired, roomOffset, showToast, token],
  );

  useEffect(() => {
    void load("", 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !rooms) {
    return (
      <div className="room-loading">
        <LoadingSpinner size={24} label="دریافت تاریخچه بازی‌ها" />
      </div>
    );
  }

  return (
    <section className="admin-panel" aria-label="بازی‌های تمام‌شده">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-head">
          <div>
            <h2 className="card__title" style={{ fontSize: "1.1rem" }}>
              مسابقات رسمی و شرطی ثبت‌شده ({toFaDigits(matchesTotal)})
            </h2>
            <p className="card__sub">تاریخچه دائمی بازی‌های رده‌بندی‌شده (Ranked) و شرطی (Stakes)</p>
          </div>
          <div className="admin-panel-head__actions">
            {[
              { id: "", label: "همه" },
              { id: "ranked", label: "رده‌بندی‌شده" },
              { id: "stakes", label: "شرطی" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`chip ${modeFilter === f.id ? "chip--active" : ""}`}
                onClick={() => {
                  setModeFilter(f.id);
                  setMatchOffset(0);
                  void load(f.id, 0, roomOffset);
                }}
              >
                {f.label}
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => void load(modeFilter, matchOffset, roomOffset)}
            >
              تازه‌سازی
            </Button>
          </div>
        </div>

        {matches.length === 0 ? (
          <p className="card__sub">هنوز مسابقه رسمی با این فیلتر ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th scope="col">کد اتاق</th>
                  <th scope="col">حالت</th>
                  <th scope="col">بازیکنان (X / O)</th>
                  <th scope="col">نتیجه</th>
                  <th scope="col">تغییر رنک (X / O)</th>
                  <th scope="col">سکه (X / O)</th>
                  <th scope="col">زمان پایان</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={`${String(m.room_code)}-${String(m.finished_at)}-${i}`}>
                    <td className="ltr mono">{String(m.room_code ?? "—")}</td>
                    <td>
                      {m.mode === "stakes" ? `شرطی (${toFaDigits(Number(m.stake))} sh)` : "رده‌بندی"}
                    </td>
                    <td>
                      X: {String(m.player_x_name ?? "—")} — O: {String(m.player_o_name ?? "—")}
                    </td>
                    <td>
                      {m.is_draw
                        ? "مساوی"
                        : `برد ${String(m.winner_symbol)}${m.forfeit ? " (فنی)" : ""}`}
                    </td>
                    <td className="ltr num">
                      {String(m.rating_x_before ?? "—")}→{String(m.rating_x_after ?? "—")} /{" "}
                      {String(m.rating_o_before ?? "—")}→{String(m.rating_o_after ?? "—")}
                    </td>
                    <td>
                      <CoinAmount amount={Number(m.coins_x ?? 0)} signed size={12} /> /{" "}
                      <CoinAmount amount={Number(m.coins_o ?? 0)} signed size={12} />
                    </td>
                    <td>{formatDateTime(String(m.finished_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ops-pager">
              <span>
                نمایش {toFaDigits(matchesTotal === 0 ? 0 : matchOffset + 1)}–
                {toFaDigits(Math.min(matchOffset + matches.length, matchesTotal))} از {toFaDigits(matchesTotal)}
              </span>
              <div className="row-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={matchOffset <= 0 || loading}
                  icon={<ChevronRight size={14} />}
                  onClick={() => {
                    const next = Math.max(0, matchOffset - PAGE_SIZE);
                    setMatchOffset(next);
                    void load(modeFilter, next, roomOffset);
                  }}
                >
                  صفحه قبل
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={matchOffset + PAGE_SIZE >= matchesTotal || loading}
                  onClick={() => {
                    const next = matchOffset + PAGE_SIZE;
                    setMatchOffset(next);
                    void load(modeFilter, next, roomOffset);
                  }}
                >
                  صفحه بعد
                  <ChevronLeft size={14} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card__title" style={{ fontSize: "1.1rem", marginBottom: 10 }}>
          اتاق‌های تمام‌شده اخیر ({toFaDigits(roomsTotal)})
        </h2>
        {rooms && rooms.length === 0 ? (
          <EmptyState title="هنوز بازی‌ای تمام نشده" description="با شروع بازی کاربران، نتایج اینجا ثبت می‌شود." />
        ) : rooms ? (
          <div className="table-wrap" role="region" aria-label="فهرست بازی‌ها" tabIndex={0}>
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th scope="col">اتاق</th>
                  <th scope="col">نتیجه</th>
                  <th scope="col">بازیکنان</th>
                  <th scope="col">حرکت‌ها</th>
                  <th scope="col">شروع</th>
                  <th scope="col">پایان</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((g) => (
                  <tr key={`${g.room_code}-${g.finished_at}`}>
                    <td className="ltr num">{g.room_code}</td>
                    <td>
                      {g.is_draw ? "مساوی" : `برد ${g.winner === "X" ? "X" : "O"}`}
                      <span className="mini-list__meta"> — بازی {toFaDigits(g.game_number)}</span>
                    </td>
                    <td>
                      {g.players?.map((p) => `${p.symbol}: ${p.name}`).join(" — ") || "—"}
                    </td>
                    <td className="num">{toFaDigits(g.move_count)}</td>
                    <td>{formatDateTime(g.started_at)}</td>
                    <td>{formatDateTime(g.finished_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ops-pager">
              <span>
                نمایش {toFaDigits(roomsTotal === 0 ? 0 : roomOffset + 1)}–
                {toFaDigits(Math.min(roomOffset + (rooms?.length ?? 0), roomsTotal))} از {toFaDigits(roomsTotal)}
              </span>
              <div className="row-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={roomOffset <= 0 || loading}
                  icon={<ChevronRight size={14} />}
                  onClick={() => {
                    const next = Math.max(0, roomOffset - PAGE_SIZE);
                    setRoomOffset(next);
                    void load(modeFilter, matchOffset, next);
                  }}
                >
                  صفحه قبل
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={roomOffset + PAGE_SIZE >= roomsTotal || loading}
                  onClick={() => {
                    const next = roomOffset + PAGE_SIZE;
                    setRoomOffset(next);
                    void load(modeFilter, matchOffset, next);
                  }}
                >
                  صفحه بعد
                  <ChevronLeft size={14} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
