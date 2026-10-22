import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, ChevronLeft, ChevronRight, Eye, Search, ShieldOff, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { EmptyState, LoadingSpinner } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { adminAiStorage } from "@/game/ai";
import { adminApi, api } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, formatRelativeSeconds, toFaDigits } from "@/lib/format";
import { playerIdentity } from "@/lib/playerSession";
import { playerSession } from "@/lib/session";
import type { AdminRoomRow } from "@/types/api";
import { RoomDetailModal } from "./RoomDetailModal";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "همه" },
  { value: "waiting", label: "در انتظار" },
  { value: "active", label: "زنده" },
  { value: "finished", label: "تمام‌شده" },
  { value: "expired", label: "منقضی" },
  { value: "closed", label: "بسته" },
];

const STATUS_LABELS: Record<string, string> = {
  waiting: "در انتظار",
  active: "زنده",
  finished: "تمام‌شده",
  expired: "منقضی",
  closed: "بسته",
};

const PAGE_SIZE = 50;

export function AdminRoomsPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [items, setItems] = useState<AdminRoomRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<AdminRoomRow | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(
    async (opts?: { search?: string; status?: string; offset?: number }) => {
      setLoading(true);
      const nextOffset = opts?.offset ?? offset;
      try {
        const res = await adminApi.listRooms(token, {
          search: opts?.search ?? search,
          status: (opts?.status ?? status) || null,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
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
    [offset, onSessionExpired, search, showToast, status, token],
  );

  useEffect(() => {
    void load({ search: "", status: "", offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeRoom = async () => {
    if (!closeTarget) return;
    setClosing(true);
    try {
      await adminApi.closeRoom(token, closeTarget.room_code, "closed by admin panel");
      showToast(`اتاق ${closeTarget.room_code} بسته شد`, "success");
      setCloseTarget(null);
      void load({ search, status, offset });
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
    } finally {
      setClosing(false);
    }
  };

  const kickSeat = async (roomCode: string, symbol: "X" | "O") => {
    try {
      await adminApi.kickPlayer(token, {
        roomCode,
        symbol,
        reason: `اخراج بازیکن ${symbol} توسط مدیر`,
      });
      showToast(`بازیکن ${symbol} از اتاق ${roomCode} اخراج شد.`, "success");
      void load({ search, status, offset });
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
    }
  };

  const joinWithAi = async (roomCode: string) => {
    try {
      const name = playerIdentity.load()?.displayName ?? "Admin";
      const res = await api.joinRoom(roomCode, name);
      playerSession.save(res.room_code, res.player_token, res.symbol);
      adminAiStorage.save({ ...adminAiStorage.load(), enabled: true });
      navigate(`/room/${res.room_code}`);
    } catch (err) {
      showToast(toUserError(err).message, "error");
    }
  };

  return (
    <section className="admin-panel" aria-label="مدیریت اتاق‌ها">
      <form
        className="admin-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          void load({ search, status, offset: 0 });
        }}
      >
        <div className="admin-toolbar__search">
          <Search size={15} aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase().replace(/[^A-Z2-9]/gi, "").slice(0, 6))}
            placeholder="جست‌وجوی کد اتاق…"
            dir="ltr"
            className="ltr num"
            aria-label="جست‌وجوی کد اتاق"
          />
        </div>
        <div className="admin-toolbar__filters" role="group" aria-label="فیلتر وضعیت">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`chip ${status === f.value ? "chip--active" : ""}`}
              aria-pressed={status === f.value}
              onClick={() => {
                setStatus(f.value);
                setOffset(0);
                void load({ search, status: f.value, offset: 0 });
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button type="submit" size="sm" variant="secondary" loading={loading}>
          جست‌وجو
        </Button>
      </form>

      {loading && !items ? (
        <div className="room-loading">
          <LoadingSpinner size={24} label="دریافت اتاق‌ها" />
        </div>
      ) : items && items.length === 0 ? (
        <EmptyState title="اتاقی پیدا نشد" description="فیلترها را تغییر دهید یا اتاق جدیدی ساخته شود." />
      ) : items ? (
        <div className="table-wrap" role="region" aria-label="فهرست اتاق‌ها" tabIndex={0}>
          <table className="admin-data-table">
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">وضعیت</th>
                <th scope="col">بازیکنان</th>
                <th scope="col">حرکت‌ها</th>
                <th scope="col">آخرین فعالیت</th>
                <th scope="col">انقضا</th>
                <th scope="col">عملیات و اخراج</th>
              </tr>
            </thead>
            <tbody>
              {items.map((room) => (
                <tr key={room.room_code}>
                  <td className="ltr num mono">{room.room_code}</td>
                  <td>
                    <span className={`status-pill status-pill--${room.status}`}>
                      {STATUS_LABELS[room.status] ?? room.status}
                    </span>
                  </td>
                  <td>
                    {room.players?.length
                      ? room.players
                          .map((p) => `${p.symbol === "X" ? "X" : "O"}: ${p.name}${p.connected ? "" : " (قطع)"}`)
                          .join(" — ")
                      : "—"}
                  </td>
                  <td className="num">{toFaDigits(room.move_count)}</td>
                  <td>{formatDateTime(room.last_activity_at)}</td>
                  <td>{formatRelativeSeconds(room.expires_in_seconds)}</td>
                  <td>
                    <div className="row-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Eye size={14} aria-hidden="true" />}
                        onClick={() => setDetailCode(room.room_code)}
                      >
                        جزئیات
                      </Button>
                      {room.status === "waiting" && (room.players?.length ?? 0) < 2 ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Bot size={13} aria-hidden="true" />}
                          onClick={() => void joinWithAi(room.room_code)}
                        >
                          ورود با AI
                        </Button>
                      ) : null}
                      {room.status === "active" ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            icon={<UserX size={13} />}
                            onClick={() => void kickSeat(room.room_code, "X")}
                          >
                            کیک X
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            icon={<UserX size={13} />}
                            onClick={() => void kickSeat(room.room_code, "O")}
                          >
                            کیک O
                          </Button>
                        </>
                      ) : null}
                      {room.status !== "closed" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          icon={<ShieldOff size={14} aria-hidden="true" />}
                          onClick={() => setCloseTarget(room)}
                        >
                          بستن
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="ops-pager">
        <span>
          نمایش {items ? toFaDigits(total === 0 ? 0 : offset + 1) : "۰"}–
          {items ? toFaDigits(Math.min(offset + items.length, total)) : "۰"} از {toFaDigits(total)} اتاق
        </span>
        <div className="row-actions">
          <Button
            size="sm"
            variant="ghost"
            disabled={offset <= 0 || loading}
            icon={<ChevronRight size={14} />}
            onClick={() => {
              const next = Math.max(0, offset - PAGE_SIZE);
              setOffset(next);
              void load({ offset: next });
            }}
          >
            صفحه قبل
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => {
              const next = offset + PAGE_SIZE;
              setOffset(next);
              void load({ offset: next });
            }}
          >
            صفحه بعد
            <ChevronLeft size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <RoomDetailModal
        token={token}
        roomCode={detailCode}
        onClose={() => setDetailCode(null)}
        onSessionExpired={onSessionExpired}
        onUpdated={() => void load({ search, status, offset })}
      />

      <ConfirmDialog
        open={!!closeTarget}
        title="بستن اتاق"
        description={`اتاق ${closeTarget?.room_code ?? ""} بسته می‌شود و بازیکنان از آن خارج می‌شوند. این عملیات در گزارش ثبت می‌شود.`}
        confirmLabel="بستن اتاق"
        danger
        loading={closing}
        onConfirm={() => void closeRoom()}
        onCancel={() => setCloseTarget(null)}
      />
    </section>
  );
}
