import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  DoorClosed,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldOff,
  Trophy,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount, TierBadge } from "@/components/ui/Coin";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { FormField, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { AdminPlayerRow } from "@/types/api";

const PAGE_SIZE = 50;
const COIN_PRESETS = [100, 500, 1000, 5000, -100, -500] as const;
const XP_PRESETS = [50, 100, 250, -50, -100] as const;
const TIER_PRESETS: { label: string; rating: number }[] = [
  { label: "نقره (۱۰۵۰)", rating: 1050 },
  { label: "طلا (۱۲۵۰)", rating: 1250 },
  { label: "پلاتین (۱۴۵۰)", rating: 1450 },
  { label: "الماس (۱۶۵۰)", rating: 1650 },
  { label: "استاد (۱۸۵۰)", rating: 1850 },
];

type RosterFilter = "all" | "banned" | "frozen" | "in_room" | "active";
type DossierTab = "command" | "ledger" | "matches" | "risk";

interface LedgerRow {
  amount: number;
  balance_after?: number;
  reason: string;
  note?: string | null;
  created_at: string;
}

interface MatchRow {
  room_code: string;
  game_number: number;
  mode: string;
  stake: number;
  winner_symbol: string | null;
  is_draw: boolean;
  forfeit: boolean;
  finished_at: string;
  my_symbol: string;
  coins_x?: number;
  coins_o?: number;
}

interface BanRow {
  id: string;
  scope: string;
  reason: string | null;
  created_at: string;
  expires_at: string;
  active: boolean;
}

interface FlagRow {
  id: string;
  kind: string;
  evidence: unknown;
  status: string;
  created_at: string;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function winRate(wins: number, games: number) {
  if (!games) return 0;
  return Math.round((wins / games) * 100);
}

function parseSignedNumber(raw: string): number | null {
  const n = Number(String(raw).trim().replace(/,/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export function AdminPlayersPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<AdminPlayerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [dossTab, setDossTab] = useState<DossierTab>("command");

  const [actionNote, setActionNote] = useState("");
  const [customCoins, setCustomCoins] = useState("");
  const [customXp, setCustomXp] = useState("");
  const [banScope, setBanScope] = useState<"global" | "queue" | "stakes">("global");
  const [banHours, setBanHours] = useState<number>(24);
  const [busy, setBusy] = useState(false);
  const selectedRef = useRef<string | null>(null);
  const detailReqRef = useRef(0);
  selectedRef.current = selected;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listPlayers(token, { search: query, limit: PAGE_SIZE, offset });
      setRows(res.items ?? []);
      setTotal(res.total ?? 0);
      setError(null);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") onSessionExpired();
      else setError(user.message);
    } finally {
      setLoading(false);
    }
  }, [token, query, offset, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = () => {
    setOffset(0);
    setQuery(searchInput.trim());
  };

  const openDetail = async (id: string) => {
    const req = ++detailReqRef.current;
    setSelected(id);
    selectedRef.current = id;
    setDetail(null);
    setDossTab("command");
    try {
      const res = await adminApi.getPlayer(token, id);
      if (req !== detailReqRef.current) return;
      setDetail(res);
    } catch (err) {
      if (req !== detailReqRef.current) return;
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
      setSelected(null);
      selectedRef.current = null;
    }
  };

  const act = async (fn: () => Promise<unknown>, okMsg: string, targetId?: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(okMsg, "success");
      await load();
      const refreshId = targetId ?? selectedRef.current;
      if (refreshId && selectedRef.current === refreshId) {
        const req = ++detailReqRef.current;
        const res = await adminApi.getPlayer(token, refreshId);
        if (req !== detailReqRef.current) return;
        setDetail(res);
      }
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") onSessionExpired();
      else showToast(user.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    return rows.filter((p) => {
      const banned = p.status === "banned" || !!p.has_active_ban;
      if (filter === "banned") return banned;
      if (filter === "frozen") return p.wallet_frozen;
      if (filter === "in_room") return !!p.active_room_code;
      if (filter === "active") return !banned && !p.wallet_frozen;
      return true;
    });
  }, [rows, filter]);

  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = Math.min(offset + rows.length, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const profileObj = detail?.profile as Record<string, unknown> | undefined;
  const ratingObj = profileObj?.rating as Record<string, unknown> | undefined;
  const statsObj = profileObj?.stats as Record<string, unknown> | undefined;
  const isBanned =
    detail?.status === "banned" ||
    ((detail?.bans as { active?: boolean }[] | undefined)?.some((b) => b.active) ?? false);
  const activeRoomCode = (detail?.active_room_code as string | null) ?? null;
  const ledger = ((detail?.ledger as LedgerRow[]) ?? []);
  const matches = ((detail?.matches as MatchRow[]) ?? []);
  const bans = ((detail?.bans as BanRow[]) ?? []);
  const flags = ((detail?.risk_flags as FlagRow[]) ?? []);

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      showToast("شناسه بازیکن کپی شد", "success");
    } catch {
      showToast("کپی ناموفق بود", "error");
    }
  };

  const filterCounts = {
    all: rows.length,
    banned: rows.filter((p) => p.status === "banned" || p.has_active_ban).length,
    frozen: rows.filter((p) => p.wallet_frozen).length,
    in_room: rows.filter((p) => p.active_room_code).length,
    active: rows.filter((p) => p.status !== "banned" && !p.has_active_ban && !p.wallet_frozen).length,
  };

  return (
    <section className="admin-panel" aria-label="پرونده بازیکنان">
      <div className="card">
        <div className="admin-panel-head">
          <div>
            <h2 className="card__title" style={{ fontSize: "1.15rem" }}>
              بایگانی بازیکنان — بازرسی تکی و کنترل کامل حساب
            </h2>
            <p className="card__sub">
              هر ردیف یک پرونده است. سکه، XP، بن، اخراج، کیف پول، لجر، تاریخچه بازی و پرچم ریسک برای تک‌تک بازیکنان.
            </p>
          </div>

          <div className="admin-panel-head__actions">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
              placeholder="جست‌وجوی نام بازیکن…"
              aria-label="جست‌وجوی بازیکن"
            />
            <Button variant="secondary" size="sm" icon={<Search size={15} />} onClick={applySearch}>
              جست‌وجو
            </Button>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} onClick={() => void load()}>
              تازه‌سازی
            </Button>
          </div>
        </div>

        <div className="ops-filters" role="tablist" aria-label="فیلتر وضعیت">
          {(
            [
              ["all", "همه"],
              ["active", "سالم"],
              ["banned", "مسدود"],
              ["frozen", "کیف قفل"],
              ["in_room", "در اتاق"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`ops-chip ${filter === id ? "ops-chip--on" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label} ({toFaDigits(filterCounts[id])})
            </button>
          ))}
        </div>

        {error && rows.length > 0 ? (
          <p className="inline-warning" role="status">
            به‌روزرسانی ناموفق بود؛ فهرست قبلی نمایش داده می‌شود. {error}
          </p>
        ) : null}
        {error && rows.length === 0 ? (
          <ErrorState title="دریافت بازیکنان ناموفق بود" description={error} onRetry={() => void load()} />
        ) : loading && rows.length === 0 ? (
          <LoadingSpinner size={24} label="در حال بارگذاری بایگانی بازیکنان" />
        ) : visible.length === 0 ? (
          <p className="ops-empty">بازیکنی با این فیلتر در صفحهٔ فعلی نیست. صفحه بعد یا جست‌وجو را امتحان کنید.</p>
        ) : (
          <div className={`table-wrap ${loading ? "ops-table--busy" : ""}`}>
            <table className="admin-data-table admin-data-table--inspect">
              <thead>
                <tr>
                  <th scope="col">بازیکن</th>
                  <th scope="col">شناسه</th>
                  <th scope="col">سکه</th>
                  <th scope="col">رنک / اوج</th>
                  <th scope="col">برد / نرخ</th>
                  <th scope="col">رگه</th>
                  <th scope="col">آخرین حضور</th>
                  <th scope="col">اتاق</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const banned = p.status === "banned" || p.has_active_ban;
                  return (
                    <tr
                      key={p.id}
                      className={banned ? "ops-row--hot" : undefined}
                      onClick={() => void openDetail(p.id)}
                    >
                      <td>
                        <strong>{p.display_name}</strong>
                        {p.wallet_frozen ? <span title="کیف پول قفل"> ❄️</span> : null}
                      </td>
                      <td>
                        <span className="ops-id">{shortId(p.id)}</span>
                      </td>
                      <td>
                        <CoinAmount amount={p.balance} size={14} />
                      </td>
                      <td>
                        <TierBadge tier={p.tier} compact />{" "}
                        <span className="ltr num">{toFaDigits(p.rating)}</span>
                        {p.peak_rating ? (
                          <span className="ops-id"> / {toFaDigits(p.peak_rating)}</span>
                        ) : null}
                      </td>
                      <td className="ltr num">
                        {toFaDigits(p.wins)}/{toFaDigits(p.losses)}/{toFaDigits(p.draws)} ·{" "}
                        {toFaDigits(winRate(p.wins, p.games))}%
                      </td>
                      <td className="ltr num">{toFaDigits(p.win_streak ?? 0)}</td>
                      <td>{formatDateTime(p.last_seen_at)}</td>
                      <td>
                        {p.active_room_code ? (
                          <span className="mono ltr">{p.active_room_code}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span className={`status-pill ${banned ? "status-pill--closed" : "status-pill--active"}`}>
                          {banned ? "مسدود" : p.wallet_frozen ? "قفل کیف" : "فعال"}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Eye size={13} />}
                            onClick={() => void openDetail(p.id)}
                          >
                            پرونده
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            icon={<Coins size={13} />}
                            onClick={() =>
                              void act(
                                () => adminApi.adjustCoins(token, p.id, 500, "پاداش سریع ادمین"),
                                `۵۰۰ سکه به ${p.display_name} داده شد.`,
                                p.id,
                              )
                            }
                          >
                            +۵۰۰
                          </Button>
                          {p.active_room_code ? (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busy}
                              icon={<DoorClosed size={13} />}
                              onClick={() =>
                                void act(
                                  () =>
                                    adminApi.kickPlayer(token, {
                                      playerId: p.id,
                                      roomCode: p.active_room_code,
                                      reason: "اخراج مستقیم توسط ادمین",
                                    }),
                                  `${p.display_name} از اتاق ${p.active_room_code} اخراج شد.`,
                                  p.id,
                                )
                              }
                            >
                              کیک
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="ops-pager">
              <span>
                نمایش {toFaDigits(pageFrom)}–{toFaDigits(pageTo)} از {toFaDigits(total)} بازیکن
                {query ? ` · جست‌وجو: ${query}` : ""}
              </span>
              <div className="row-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canPrev || loading}
                  icon={<ChevronRight size={14} />}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  صفحه قبل
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canNext || loading}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  صفحه بعد
                  <ChevronLeft size={14} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        wide
        open={selected !== null}
        title={`پرونده عملیاتی: ${(profileObj?.display_name as string) ?? "بازیکن"}`}
        onClose={() => {
          detailReqRef.current += 1;
          selectedRef.current = null;
          setSelected(null);
          setDetail(null);
        }}
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            بستن پرونده
          </Button>
        }
      >
        {!detail ? (
          <LoadingSpinner size={22} label="در حال دریافت پرونده بازیکن" />
        ) : !profileObj ? (
          <p className="ops-empty">پرونده این بازیکن در سرور پیدا نشد یا حذف شده است.</p>
        ) : (
          <div className="admin-player-detail">
            <div className="player-modal-summary">
              <div>
                <strong>{String(profileObj.display_name)}</strong>
                <span className="admin-player-detail__ip ltr">
                  {" "}
                  IP {String(detail.register_ip ?? "—")} · وضعیت {String(detail.status ?? "—")}
                </span>
              </div>
              <div className="player-modal-summary__badges">
                <CoinAmount amount={Number(profileObj.balance ?? 0)} size={16} />
                {ratingObj?.tier ? (
                  <TierBadge tier={ratingObj.tier as { tier: string; division: number }} />
                ) : null}
                <span className="ltr">
                  <strong>{toFaDigits(Number(ratingObj?.rating ?? 1200))}</strong> XP
                </span>
                {activeRoomCode ? <span className="mono ltr">ROOM {activeRoomCode}</span> : null}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy size={13} />}
                  onClick={() => void copyId(String(profileObj.id ?? selected))}
                >
                  کپی شناسه
                </Button>
              </div>
            </div>

            <div className="ops-kpi">
              <div className="ops-kpi__cell">
                <small>بازی‌ها</small>
                <strong>{toFaDigits(Number(statsObj?.games ?? 0))}</strong>
              </div>
              <div className="ops-kpi__cell">
                <small>برد / باخت / تساوی</small>
                <strong>
                  {toFaDigits(Number(statsObj?.wins ?? 0))}/{toFaDigits(Number(statsObj?.losses ?? 0))}/
                  {toFaDigits(Number(statsObj?.draws ?? 0))}
                </strong>
              </div>
              <div className="ops-kpi__cell">
                <small>رگه / بهترین</small>
                <strong>
                  {toFaDigits(Number(statsObj?.win_streak ?? 0))} / {toFaDigits(Number(statsObj?.best_win_streak ?? 0))}
                </strong>
              </div>
              <div className="ops-kpi__cell">
                <small>اوج رنک</small>
                <strong>{toFaDigits(Number(ratingObj?.peak_rating ?? ratingObj?.rating ?? 0))}</strong>
              </div>
            </div>

            <div className="ops-doss-tabs" role="tablist">
              {(
                [
                  ["command", "فرمان"],
                  ["ledger", `لجر (${toFaDigits(ledger.length)})`],
                  ["matches", `مسابقات (${toFaDigits(matches.length)})`],
                  ["risk", `ریسک و بن (${toFaDigits(bans.length + flags.length)})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={dossTab === id ? "is-on" : ""}
                  onClick={() => setDossTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {dossTab === "command" ? (
              <>
                <FormField label="یادداشت عملیات (در لاگ ثبت می‌شود)" htmlFor="adj-note">
                  <Input
                    id="adj-note"
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="مثلاً: پاداش ویژه / جریمه تخلف"
                  />
                </FormField>

                <div className="admin-player-actions">
                  <h4 className="modal-sec-title">
                    <Coins size={15} aria-hidden="true" /> ۱. شریف‌کوین
                  </h4>
                  <div className="preset-chips-row">
                    {COIN_PRESETS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        disabled={busy}
                        className={`preset-chip ${amt > 0 ? "preset-chip--pos" : "preset-chip--neg"}`}
                        onClick={() =>
                          void act(
                            () => adminApi.adjustCoins(token, selected!, amt, actionNote),
                            `${amt > 0 ? "افزایش" : "کاهش"} ${toFaDigits(Math.abs(amt))} سکه انجام شد.`,
                          )
                        }
                      >
                        <span className="ltr">
                          {amt > 0 ? `+${amt}` : amt} sh
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="inline-input-row">
                    <Input
                      value={customCoins}
                      onChange={(e) => setCustomCoins(e.target.value)}
                      className="ltr"
                      placeholder="مبلغ دلخواه (مثلاً 2500 یا -300)"
                    />
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={!customCoins}
                      onClick={() => {
                        const amount = parseSignedNumber(customCoins);
                        if (amount === null) {
                          showToast("مبلغ سکه نامعتبر است.", "error");
                          return;
                        }
                        void act(
                          () => adminApi.adjustCoins(token, selected!, amount, actionNote),
                          "موجودی شریف‌کوین به‌روزرسانی شد.",
                        );
                      }}
                    >
                      اعمال سکه
                    </Button>
                  </div>
                </div>

                <div className="admin-player-actions">
                  <h4 className="modal-sec-title">
                    <Trophy size={15} aria-hidden="true" /> ۲. XP و تیر
                  </h4>
                  <div className="preset-chips-row">
                    {XP_PRESETS.map((xp) => (
                      <button
                        key={xp}
                        type="button"
                        disabled={busy}
                        className={`preset-chip ${xp > 0 ? "preset-chip--pos" : "preset-chip--neg"}`}
                        onClick={() =>
                          void act(
                            () => adminApi.adjustRating(token, selected!, { delta: xp, note: actionNote }),
                            `${xp > 0 ? "افزایش" : "کاهش"} ${toFaDigits(Math.abs(xp))} امتیاز رنک انجام شد.`,
                          )
                        }
                      >
                        <span className="ltr">
                          {xp > 0 ? `+${xp}` : xp} XP
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="preset-chips-row">
                    {TIER_PRESETS.map((tp) => (
                      <button
                        key={tp.rating}
                        type="button"
                        disabled={busy}
                        className="preset-chip"
                        onClick={() =>
                          void act(
                            () =>
                              adminApi.adjustRating(token, selected!, {
                                setExact: tp.rating,
                                note: actionNote || `تنظیم تیر روی ${tp.label}`,
                              }),
                            `رنک بازیکن روی ${tp.label} تنظیم شد.`,
                          )
                        }
                      >
                        {tp.label}
                      </button>
                    ))}
                  </div>
                  <div className="inline-input-row">
                    <Input
                      value={customXp}
                      onChange={(e) => setCustomXp(e.target.value)}
                      className="ltr"
                      placeholder="امتیاز دقیق (۱۰۰ تا ۳۰۰۰)"
                    />
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={!customXp}
                      onClick={() => {
                        const rating = Number(String(customXp).trim());
                        if (!Number.isFinite(rating) || rating < 100 || rating > 3000) {
                          showToast("امتیاز باید عددی بین ۱۰۰ تا ۳۰۰۰ باشد.", "error");
                          return;
                        }
                        void act(
                          () =>
                            adminApi.adjustRating(token, selected!, {
                              setExact: rating,
                              note: actionNote,
                            }),
                          "امتیاز رنک بازیکن تنظیم شد.",
                        );
                      }}
                    >
                      ثبت امتیاز دقیق
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      icon={<Award size={14} />}
                      onClick={() =>
                        void act(
                          () =>
                            adminApi.adjustRating(token, selected!, {
                              addGames: 20,
                              addWins: 12,
                              note: "بازکردن قفل شرط‌بندی و لیدربورد توسط ادمین",
                            }),
                          "۲۰ بازی رسمی به سابقه بازیکن اضافه شد.",
                        )
                      }
                    >
                      +۲۰ بازی رسمی
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy}
                      icon={<RotateCcw size={14} />}
                      onClick={() =>
                        void act(
                          () => adminApi.resetRating(token, selected!, actionNote || "ریست رنک"),
                          "رنک بازیکن به ۱۲۰۰ ریست شد.",
                        )
                      }
                    >
                      ریست به ۱۲۰۰
                    </Button>
                  </div>
                </div>

                <div className="admin-player-actions">
                  <h4 className="modal-sec-title">
                    <Ban size={15} aria-hidden="true" /> ۳. اخراج، بن و کیف پول
                  </h4>
                  <div className="admin-player-actions__row">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={busy}
                      icon={<UserX size={14} />}
                      onClick={() =>
                        void act(
                          () =>
                            adminApi.kickPlayer(token, {
                              playerId: selected!,
                              roomCode: activeRoomCode,
                              reason: actionNote || "اخراج از اتاق و صف توسط ادمین",
                            }),
                          "بازیکن از تمام اتاق‌های فعال و صف مسابقه اخراج شد.",
                        )
                      }
                    >
                      کیک فوری {activeRoomCode ? `(${activeRoomCode})` : ""}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy}
                      icon={<ShieldOff size={14} />}
                      onClick={() =>
                        void act(
                          () =>
                            adminApi.setWalletFrozen(
                              token,
                              selected!,
                              !(profileObj.wallet_frozen as boolean),
                              actionNote || undefined,
                            ),
                          "وضعیت قفل کیف پول تغییر کرد.",
                        )
                      }
                    >
                      {(profileObj.wallet_frozen as boolean) ? "آزادسازی کیف پول" : "توقیف کیف پول"}
                    </Button>
                    {isBanned ? (
                      <Button
                        size="sm"
                        loading={busy}
                        icon={<CheckCircle2 size={14} />}
                        onClick={() =>
                          void act(
                            () => adminApi.unbanPlayer(token, selected!, actionNote || "رفع مسدودیت"),
                            "مسدودیت بازیکن به‌طور کامل برداشته شد.",
                          )
                        }
                      >
                        رفع مسدودیت
                      </Button>
                    ) : null}
                  </div>
                  <div className="ban-builder-row">
                    <select
                      className="admin-select"
                      value={banScope}
                      onChange={(e) => setBanScope(e.target.value as "global" | "queue" | "stakes")}
                      aria-label="محدوده مسدودیت"
                    >
                      <option value="global">بن کل حساب</option>
                      <option value="queue">بن صف مسابقه</option>
                      <option value="stakes">بن بازی شرطی</option>
                    </select>
                    <select
                      className="admin-select"
                      value={banHours}
                      onChange={(e) => setBanHours(Number(e.target.value))}
                      aria-label="مدت مسدودیت"
                    >
                      <option value={1}>۱ ساعت</option>
                      <option value={6}>۶ ساعت</option>
                      <option value={24}>۲۴ ساعت</option>
                      <option value={168}>۷ روز</option>
                      <option value={720}>۳۰ روز</option>
                      <option value={8760}>دائمی (۱ سال)</option>
                    </select>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={busy}
                      icon={<Ban size={14} />}
                      onClick={() =>
                        void act(
                          () => adminApi.setBan(token, selected!, banScope, banHours, actionNote),
                          "مسدودیت روی بازیکن اعمال شد.",
                        )
                      }
                    >
                      اعمال بن
                    </Button>
                  </div>
                </div>
              </>
            ) : null}

            {dossTab === "ledger" ? (
              <div className="ops-feed">
                {ledger.length === 0 ? (
                  <p className="ops-empty">تراکنشی ثبت نشده.</p>
                ) : (
                  ledger.map((l, i) => (
                    <div key={`${l.created_at}-${i}`} className="ops-feed__row">
                      <span>
                        {l.reason}
                        {l.note ? ` · ${l.note}` : ""}
                      </span>
                      <CoinAmount amount={Number(l.amount)} signed size={13} />
                      <span>{formatDateTime(l.created_at)}</span>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {dossTab === "matches" ? (
              <div className="ops-feed">
                {matches.length === 0 ? (
                  <p className="ops-empty">مسابقه‌ای ثبت نشده.</p>
                ) : (
                  matches.map((m, i) => (
                    <div key={`${m.room_code}-${m.game_number}-${i}`} className="ops-feed__row">
                      <span>
                        <span className="mono ltr">{m.room_code}</span> · {m.mode} · نقش {m.my_symbol}
                        {m.is_draw ? " · تساوی" : m.forfeit ? " · انصراف" : m.winner_symbol === m.my_symbol ? " · برد" : " · باخت"}
                      </span>
                      <span className="ltr num">{toFaDigits(m.stake)} sh</span>
                      <span>{formatDateTime(m.finished_at)}</span>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {dossTab === "risk" ? (
              <div>
                <h4 className="modal-sec-title">بن‌ها</h4>
                <div className="ops-feed">
                  {bans.length === 0 ? (
                    <p className="ops-empty">بن ثبت‌شده‌ای نیست.</p>
                  ) : (
                    bans.map((b) => (
                      <div key={b.id} className="ops-feed__row">
                        <span>
                          {b.scope} {b.active ? "· فعال" : "· منقضی"} {b.reason ? `· ${b.reason}` : ""}
                        </span>
                        <span>{formatDateTime(b.created_at)}</span>
                        <span>تا {formatDateTime(b.expires_at)}</span>
                      </div>
                    ))
                  )}
                </div>
                <h4 className="modal-sec-title" style={{ marginTop: 16 }}>
                  پرچم‌های ریسک
                </h4>
                <div className="ops-feed">
                  {flags.length === 0 ? (
                    <p className="ops-empty">پرچم ریسکی ثبت نشده.</p>
                  ) : (
                    flags.map((f) => (
                      <div key={f.id} className="ops-feed__row">
                        <span>
                          {f.kind} · {f.status}
                          {f.evidence ? ` · ${typeof f.evidence === "string" ? f.evidence : JSON.stringify(f.evidence)}` : ""}
                        </span>
                        <span />
                        <span>{formatDateTime(f.created_at)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </section>
  );
}
