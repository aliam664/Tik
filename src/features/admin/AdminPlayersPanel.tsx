import { useCallback, useEffect, useState } from "react";
import { Ban, Coins, Eye, Search, ShieldOff, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount, TierBadge } from "@/components/ui/Coin";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { FormField, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";

interface PlayerRow {
  id: string;
  display_name: string;
  status: string;
  wallet_frozen: boolean;
  created_at: string | null;
  last_seen_at: string | null;
  balance: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  tier: { tier: string; division: number };
}

export function AdminPlayersPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<PlayerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [actionAmount, setActionAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listPlayers(token, { search, limit: 50 });
      setRows(res.items as unknown as PlayerRow[]);
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
      showToast(toUserError(err).message, "error");
      setSelected(null);
    }
  };

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(okMsg, "success");
      await load();
      if (selected) await openDetail(selected);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") onSessionExpired();
      else if (user.code === "ADMIN_FORBIDDEN") showToast("سطح دسترسی شما اجازه این عمل را نمی‌دهد.", "error");
      else if (user.code === "REASON_REQUIRED") showToast("دلیل عملیات الزامی است.", "error");
      else showToast(user.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="admin-panel-head">
        <h2 className="card__title" style={{ fontSize: "1.1rem" }}>
          مدیریت بازیکنان
        </h2>
        <div className="admin-panel-head__actions">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جست‌وجوی نام…"
            aria-label="جست‌وجوی بازیکن"
          />
          <Button variant="ghost" size="sm" icon={<Search size={15} />} onClick={() => void load()}>
            جست‌وجو
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner size={24} label="در حال بارگذاری بازیکنان" />
      ) : error ? (
        <ErrorState title="دریافت داده ناموفق بود" description={error} onRetry={() => void load()} />
      ) : (
        <div className="admin-table">
          <div className="admin-table__row admin-table__row--head">
            <span>نام</span>
            <span>موجودی</span>
            <span>رنک</span>
            <span>بازی (ب/ش/م)</span>
            <span>وضعیت</span>
            <span />
          </div>
          {rows.map((p) => (
            <div key={p.id} className="admin-table__row">
              <span>
                {p.display_name}
                {p.wallet_frozen ? " ❄️" : ""}
              </span>
              <span>
                <CoinAmount amount={p.balance} size={14} />
              </span>
              <span>
                <TierBadge tier={p.tier} compact /> <span className="ltr">{toFaDigits(p.rating)}</span>
              </span>
              <span className="ltr">
                {toFaDigits(p.games)} ({toFaDigits(p.wins)}/{toFaDigits(p.losses)}/{toFaDigits(p.draws)})
              </span>
              <span>{p.status === "banned" ? "مسدود" : "فعال"}</span>
              <span>
                <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => void openDetail(p.id)}>
                  جزئیات
                </Button>
              </span>
            </div>
          ))}
          <p className="admin-table__foot">مجموع: {toFaDigits(total)}</p>
        </div>
      )}

      <Modal
        open={selected !== null}
        title="پروفایل بازیکن"
        onClose={() => {
          setSelected(null);
          setDetail(null);
        }}
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            بستن
          </Button>
        }
      >
        {!detail ? (
          <LoadingSpinner size={22} label="در حال بارگذاری" />
        ) : (
          <div className="admin-player-detail">
            <p>
              <strong>{(detail.profile as Record<string, unknown>)?.display_name as string}</strong> — موجودی:{" "}
              <CoinAmount amount={Number((detail.profile as Record<string, unknown>)?.balance ?? 0)} size={15} />
            </p>
            <p className="admin-player-detail__ip ltr">
              IP ثبت‌نام: {String(detail.register_ip ?? "—")}
            </p>

            <div className="admin-player-actions">
              <FormField label="مبلغ (+ افزایش / − کاهش)" htmlFor="adj-amount">
                <Input
                  id="adj-amount"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  className="ltr"
                  placeholder="مثلاً 100 یا -50"
                />
              </FormField>
              <FormField label="دلیل عملیات (الزامی)" htmlFor="adj-note">
                <Input
                  id="adj-note"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="مثلاً پس‌گیری سکه تقلبی"
                />
              </FormField>
              <Button
                icon={<Coins size={15} />}
                loading={busy}
                disabled={!actionAmount || !actionNote.trim()}
                onClick={() =>
                  void act(
                    () =>
                      adminApi.adjustCoins(token, selected!, Number(actionAmount), actionNote.trim()),
                    "موجودی اصلاح شد.",
                  )
                }
              >
                اعمال اصلاح موجودی
              </Button>
              <div className="admin-player-actions__row">
                <Button
                  variant="secondary"
                  icon={<ShieldOff size={15} />}
                  loading={busy}
                  onClick={() =>
                    void act(
                      () =>
                        adminApi.setWalletFrozen(
                          token,
                          selected!,
                          !((detail.profile as Record<string, unknown>)?.wallet_frozen as boolean),
                          actionNote.trim() || undefined,
                        ),
                      "وضعیت توقیف کیف تغییر کرد.",
                    )
                  }
                >
                  توقیف / آزادسازی کیف
                </Button>
                <Button
                  variant="danger"
                  icon={<Ban size={15} />}
                  loading={busy}
                  onClick={() =>
                    void act(
                      () => adminApi.setBan(token, selected!, "global", 24, actionNote.trim() || "بن ۲۴ ساعته"),
                      "بازیکن ۲۴ ساعته مسدود شد.",
                    )
                  }
                >
                  بن ۲۴ ساعته
                </Button>
                <Button
                  variant="danger"
                  icon={<UserX size={15} />}
                  loading={busy}
                  onClick={() =>
                    void act(
                      () => adminApi.setBan(token, selected!, "queue", 24, actionNote.trim() || "جریمه صف"),
                      "دسترسی صف ۲۴ ساعته مسدود شد.",
                    )
                  }
                >
                  بن صف ۲۴ ساعته
                </Button>
              </div>
            </div>

            <h3>آخرین تراکنش‌ها</h3>
            <div className="admin-mini-list">
              {((detail.ledger as Record<string, unknown>[]) ?? []).map((l, i) => (
                <div key={i} className="admin-mini-row">
                  <span>{String(l.reason)}</span>
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
