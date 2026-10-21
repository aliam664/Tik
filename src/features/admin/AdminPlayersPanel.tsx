import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Ban,
  CheckCircle2,
  Coins,
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

const COIN_PRESETS = [100, 500, 1000, 5000, -100, -500] as const;
const XP_PRESETS = [50, 100, 250, -50, -100] as const;
const TIER_PRESETS: { label: string; rating: number }[] = [
  { label: "نقره (۱۰۵۰)", rating: 1050 },
  { label: "طلا (۱۲۵۰)", rating: 1250 },
  { label: "پلاتین (۱۴۵۰)", rating: 1450 },
  { label: "الماس (۱۶۵۰)", rating: 1650 },
  { label: "استاد (۱۸۵۰)", rating: 1850 },
];

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
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const [actionNote, setActionNote] = useState("");
  const [customCoins, setCustomCoins] = useState("");
  const [customXp, setCustomXp] = useState("");
  const [banScope, setBanScope] = useState<"global" | "queue" | "stakes">("global");
  const [banHours, setBanHours] = useState<number>(24);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listPlayers(token, { search, limit: 50 });
      setRows(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") onSessionExpired();
      else setError(user.message);
    } finally {
      setLoading(false);
    }
  }, [token, search, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    setSelected(id);
    setDetail(null);
    try {
      const res = await adminApi.getPlayer(token, id);
      setDetail(res);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      showToast(user.message, "error");
      setSelected(null);
    }
  };

  const act = async (fn: () => Promise<unknown>, okMsg: string, targetId?: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(okMsg, "success");
      await load();
      const refreshId = targetId ?? selected;
      if (refreshId && selected === refreshId) {
        const res = await adminApi.getPlayer(token, refreshId);
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

  const profileObj = detail?.profile as Record<string, unknown> | undefined;
  const ratingObj = profileObj?.rating as Record<string, unknown> | undefined;
  const statsObj = profileObj?.stats as Record<string, unknown> | undefined;
  const isBanned =
    detail?.status === "banned" ||
    ((detail?.bans as { active?: boolean }[] | undefined)?.some((b) => b.active) ?? false);
  const activeRoomCode = (detail?.active_room_code as string | null) ?? null;

  return (
    <section className="admin-panel" aria-label="مدیریت بازیکنان">
      <div className="card">
        <div className="admin-panel-head">
          <div>
            <h2 className="card__title" style={{ fontSize: "1.15rem" }}>
              مدیریت بازیکنان — سکه، XP/رنک، اخراج (Kick) و مسدودسازی (Ban)
            </h2>
            <p className="card__sub">
              اعطای فوری شریف‌کوین یا امتیاز رنک (XP)، اخراج از بازی زنده و مدیریت بن بازیکنان
            </p>
          </div>

          <div className="admin-panel-head__actions">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جست‌وجوی نام بازیکن…"
              aria-label="جست‌وجوی بازیکن"
            />
            <Button variant="secondary" size="sm" icon={<Search size={15} />} onClick={() => void load()}>
              جست‌وجو
            </Button>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} onClick={() => void load()}>
              تازه‌سازی
            </Button>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner size={24} label="در حال بارگذاری بازیکنان" />
        ) : error ? (
          <ErrorState title="دریافت بازیکنان ناموفق بود" description={error} onRetry={() => void load()} />
        ) : (
          <div className="table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th scope="col">نام بازیکن</th>
                  <th scope="col">موجودی سکه</th>
                  <th scope="col">تیر و امتیاز (XP)</th>
                  <th scope="col">بازی (برد/باخت/مساوی)</th>
                  <th scope="col">اتاق فعال</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">عملیات سریع</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const banned = p.status === "banned" || p.has_active_ban;
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.display_name}</strong>
                        {p.wallet_frozen ? <span title="کیف پول قفل"> ❄️</span> : null}
                      </td>
                      <td>
                        <CoinAmount amount={p.balance} size={14} />
                      </td>
                      <td>
                        <TierBadge tier={p.tier} compact />{" "}
                        <span className="ltr num">{toFaDigits(p.rating)}</span>
                      </td>
                      <td className="ltr num">
                        {toFaDigits(p.games)} ({toFaDigits(p.wins)}/{toFaDigits(p.losses)}/{toFaDigits(p.draws)})
                      </td>
                      <td>
                        {p.active_room_code ? (
                          <span className="mono ltr">{p.active_room_code}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            banned ? "status-pill--closed" : "status-pill--active"
                          }`}
                        >
                          {banned ? "مسدود (Ban)" : "فعال"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Eye size={13} />}
                            onClick={() => void openDetail(p.id)}
                          >
                            مدیریت کامل
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
                            +۵۰۰ سکه
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            icon={<Trophy size={13} />}
                            onClick={() =>
                              void act(
                                () =>
                                  adminApi.adjustRating(token, p.id, {
                                    delta: 100,
                                    note: "اعطای سریع XP توسط ادمین",
                                  }),
                                `۱۰۰ امتیاز XP به ${p.display_name} داده شد.`,
                                p.id,
                              )
                            }
                          >
                            +۱۰۰ XP
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
            <p className="admin-panel__meta">مجموع بازیکنان: {toFaDigits(total)}</p>
          </div>
        )}
      </div>

      {/* Full Player Management Modal */}
      <Modal
        open={selected !== null}
        title={`مدیریت حساب: ${(profileObj?.display_name as string) ?? ""}`}
        onClose={() => {
          setSelected(null);
          setDetail(null);
        }}
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            بستن پنجره
          </Button>
        }
      >
        {!detail || !profileObj ? (
          <LoadingSpinner size={22} label="در حال دریافت پرونده بازیکن" />
        ) : (
          <div className="admin-player-detail">
            <div className="player-modal-summary">
              <div>
                <strong>{String(profileObj.display_name)}</strong>
                <span className="admin-player-detail__ip ltr">
                  {" "}
                  (IP: {String(detail.register_ip ?? "—")})
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
                <span>
                  {toFaDigits(Number(statsObj?.games ?? 0))} بازی ({toFaDigits(Number(statsObj?.wins ?? 0))} برد)
                </span>
              </div>
            </div>

            <FormField label="یادداشت عملیات (اختیاری — در لاگ ثبت می‌شود)" htmlFor="adj-note">
              <Input
                id="adj-note"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="مثلاً: پاداش ویژه / جریمه تخلف"
              />
            </FormField>

            {/* 1. Coins Section */}
            <div className="admin-player-actions">
              <h4 className="modal-sec-title">
                <Coins size={15} aria-hidden="true" /> ۱. اعطا یا کسر شریف‌کوین (Coins)
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
                  disabled={!customCoins || Number(customCoins) === 0}
                  onClick={() =>
                    void act(
                      () => adminApi.adjustCoins(token, selected!, Number(customCoins), actionNote),
                      "موجودی شریف‌کوین به‌روزرسانی شد.",
                    )
                  }
                >
                  اعمال سکه
                </Button>
              </div>
            </div>

            {/* 2. XP & Rating Section */}
            <div className="admin-player-actions">
              <h4 className="modal-sec-title">
                <Trophy size={15} aria-hidden="true" /> ۲. اعطا یا تنظیم XP / امتیاز رنک و تیر (Elo)
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
                  onClick={() =>
                    void act(
                      () =>
                        adminApi.adjustRating(token, selected!, {
                          setExact: Number(customXp),
                          note: actionNote,
                        }),
                      "امتیاز رنک بازیکن تنظیم شد.",
                    )
                  }
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
                      "۲۰ بازی رسمی به سابقه بازیکن اضافه شد (شرط‌بندی و لیدربورد باز شد).",
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

            {/* 3. Kick, Ban, Unban & Freeze Section */}
            <div className="admin-player-actions">
              <h4 className="modal-sec-title">
                <Ban size={15} aria-hidden="true" /> ۳. اخراج فوری (Kick)، مسدودسازی (Ban) و کیف پول
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
                  کیک فوری از بازی و صف {activeRoomCode ? `(${activeRoomCode})` : ""}
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
                  {(profileObj.wallet_frozen as boolean) ? "آزادسازی کیف پول" : "توقیف کیف پول ❄️"}
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
                    رفع مسدودیت (Unban)
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
                  <option value="global">بن کل حساب (Global Ban)</option>
                  <option value="queue">بن صف مسابقه (Queue Ban)</option>
                  <option value="stakes">بن بازی شرطی (Stakes Ban)</option>
                </select>

                <select
                  className="admin-select"
                  value={banHours}
                  onChange={(e) => setBanHours(Number(e.target.value))}
                  aria-label="مدت مسدودیت"
                >
                  <option value={1}>۱ ساعت</option>
                  <option value={6}>۶ ساعت</option>
                  <option value={24}>۲۴ ساعت (۱ روز)</option>
                  <option value={168}>۷ روز (۱ هفته)</option>
                  <option value={720}>۳۰ روز (۱ ماه)</option>
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

            <h3>آخرین تراکنش‌های کیف پول</h3>
            <div className="admin-mini-list">
              {((detail.ledger as Record<string, unknown>[]) ?? []).slice(0, 10).map((l, i) => (
                <div key={i} className="admin-mini-row">
                  <span>
                    {String(l.reason)} {l.note ? `(${String(l.note)})` : ""}
                  </span>
                  <CoinAmount amount={Number(l.amount)} signed size={13} />
                  <span>{formatDateTime(String(l.created_at))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
