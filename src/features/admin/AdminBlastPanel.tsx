import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Flame,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/ui/Coin";
import { useToast } from "@/components/ui/Toast";
import {
  BETTING_MS,
  CRASHED_MS,
  HOUSE_EDGE_BPS,
  MAX_BET,
  MIN_BET,
  formatMultiplier,
  multiplierAt,
  verifyFair,
} from "@/games/crash/math";
import { getSharedSalon } from "@/games/crash/salon";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { AdminCrashOps } from "@/types/admin";

const PHASE_FA: Record<string, string> = {
  betting: "شرط‌بندی",
  flying: "پرواز",
  crashed: "انفجار",
};

function bucketLabel(point: number): string {
  if (point < 120) return "< ۱.۲۰×";
  if (point < 200) return "۱.۲۰–۲×";
  if (point < 500) return "۲–۵×";
  if (point < 1000) return "۵–۱۰×";
  return "۱۰×+";
}

export function AdminBlastPanel({
  token,
  onSessionExpired,
}: {
  token: string;
  onSessionExpired: () => void;
}) {
  const { showToast } = useToast();
  const [rpc, setRpc] = useState<AdminCrashOps | null>(null);
  const [rpcNote, setRpcNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const pullRpc = useCallback(async () => {
    try {
      const data = await adminApi.crashOps(token);
      setRpc(data);
      setRpcNote(null);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      setRpc(null);
      setRpcNote("RPC انفجار هنوز روی سرور نیست — تله‌متری سالن محلی نمایش داده می‌شود.");
    }
  }, [onSessionExpired, token]);

  useEffect(() => {
    void pullRpc();
  }, [pullRpc]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 400);
    return () => window.clearInterval(id);
  }, []);

  const salon = getSharedSalon();
  const local = salon.getState();
  const tel = salon.getTelemetry();
  void tick;

  const now = Date.now();
  const live =
    local.round.phase === "flying" && local.round.flyingStartedAt
      ? multiplierAt(now - local.round.flyingStartedAt)
      : local.round.crashPoint;

  const hold = tel.playerWagered - tel.playerPaid;
  const rtp = tel.playerWagered > 0 ? tel.playerPaid / tel.playerWagered : 0;

  const dist = useMemo(() => {
    const buckets = ["< ۱.۲۰×", "۱.۲۰–۲×", "۲–۵×", "۵–۱۰×", "۱۰×+"] as const;
    const counts = Object.fromEntries(buckets.map((b) => [b, 0])) as Record<string, number>;
    for (const row of tel.recent) counts[bucketLabel(row.crashPoint)] += 1;
    const max = Math.max(1, ...Object.values(counts));
    return buckets.map((label) => ({ label, value: counts[label], max }));
  }, [tel.recent]);

  const kpis = [
    { label: "راند جاری", value: toFaDigits(local.round.index), icon: <Flame size={16} /> },
    { label: "راندهای نشست", value: toFaDigits(tel.rounds), icon: <Activity size={16} /> },
    { label: "حجم شرط بازیکن", value: tel.playerWagered, coin: true },
    { label: "پرداخت بازیکن", value: tel.playerPaid, coin: true },
    { label: "هلد خانه", value: hold, coin: true, signed: true },
    {
      label: "RTP تحقق‌یافته",
      value: tel.playerWagered ? `${(rtp * 100).toFixed(1)}٪` : "—",
      icon: <TrendingUp size={16} />,
    },
  ];

  return (
    <section className="admin-panel blast-ops" aria-label="عملیات انفجار شریف">
      <div className="admin-panel-head">
        <div>
          <h2 className="card__title" style={{ fontSize: "1.15rem" }}>
            سالن عملیات — انفجار شریف
          </h2>
          <p className="card__sub">
            سالن زنده جهانی · HMAC-SHA256 · لبهٔ خانه {toFaDigits(HOUSE_EDGE_BPS / 100)}٪ · RTP هدف ۹۹٪ ·
            شریف‌کوین مجازی، بدون نقد
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={14} aria-hidden="true" />}
          onClick={() => {
            setTick((n) => n + 1);
            void pullRpc();
            showToast("تله‌متری انفجار تازه‌سازی شد", "info");
          }}
        >
          همگام‌سازی
        </Button>
      </div>

      <div className="inline-warning" role="note">
        <ShieldAlert size={16} aria-hidden="true" />
        ۱۸+ · این عنوان جایزهٔ پولی ندارد. هلد خانه فقط روی شریف‌کوین مجازی محاسبه می‌شود.
      </div>

      {rpcNote ? (
        <p className="card__sub" role="status">
          {rpcNote}
        </p>
      ) : rpc ? (
        <p className="card__sub">منبع سرور فعال — {formatDateTime(new Date().toISOString())}</p>
      ) : null}

      <div className="blast-live">
        <div>
          <small>فاز</small>
          <strong className={`crash-phase crash-phase--${local.round.phase}`}>
            {PHASE_FA[local.round.phase]}
          </strong>
        </div>
        <div>
          <small>ضریب زنده</small>
          <strong dir="ltr">{live !== null ? formatMultiplier(live) : "۱.۰۰×"}</strong>
        </div>
        <div>
          <small>تعهد راند</small>
          <code className="ops-id">{local.round.seedHash.slice(0, 16)}…</code>
        </div>
        <div>
          <small>شرط‌های این راند</small>
          <strong>{toFaDigits(local.round.bets.length)}</strong>
        </div>
      </div>

      <div className="stat-grid">
        {kpis.map((card) => (
          <div className="stat-card" key={card.label}>
            {card.icon ? <span className="stat-card__icon">{card.icon}</span> : null}
            <span className="stat-card__value num">
              {card.coin ? (
                <CoinAmount amount={Number(card.value)} signed={card.signed} size={16} />
              ) : (
                card.value
              )}
            </span>
            <span className="stat-card__label">{card.label}</span>
          </div>
        ))}
      </div>

      <div className="charts-grid-2">
        <div className="card">
          <h3 className="card__title" style={{ fontSize: "1rem" }}>
            توزیع ضرایب نشست
          </h3>
          <p className="card__sub">سطل‌بندی آخرین راندهای همین سالن</p>
          <ul className="blast-bars">
            {dist.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <i style={{ width: `${Math.max(4, (row.value / row.max) * 100)}%` }} />
                <em>{toFaDigits(row.value)}</em>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 className="card__title" style={{ fontSize: "1rem" }}>
            پیکربندی میز
          </h3>
          <dl className="blast-config">
            <div>
              <dt>حداقل / حداکثر شرط</dt>
              <dd>
                {toFaDigits(MIN_BET)} — {toFaDigits(MAX_BET)} sh
              </dd>
            </div>
            <div>
              <dt>پنجرهٔ شرط</dt>
              <dd>{toFaDigits(BETTING_MS / 1000)} ثانیه</dd>
            </div>
            <div>
              <dt>مکث پس از انفجار</dt>
              <dd>{toFaDigits(CRASHED_MS / 1000)} ثانیه</dd>
            </div>
            <div>
              <dt>بزرگ‌ترین انفجار نشست</dt>
              <dd dir="ltr">{tel.biggestCrash ? formatMultiplier(tel.biggestCrash) : "—"}</dd>
            </div>
            <div>
              <dt>بزرگ‌ترین برد بازیکن</dt>
              <dd>
                <CoinAmount amount={tel.biggestWin} signed size={14} />
              </dd>
            </div>
            <div>
              <dt>خروج / باخت بازیکن</dt>
              <dd>
                {toFaDigits(tel.playerCashes)} / {toFaDigits(tel.playerBusts)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {rpc?.kpis ? (
        <div className="ops-kpi" aria-label="KPI سرور">
          <div className="ops-kpi__cell">
            <small>راند سرور</small>
            <strong>{toFaDigits(rpc.kpis.rounds_total)}</strong>
          </div>
          <div className="ops-kpi__cell">
            <small>۲۴ ساعت</small>
            <strong>{toFaDigits(rpc.kpis.rounds_24h)}</strong>
          </div>
          <div className="ops-kpi__cell">
            <small>حجم کل</small>
            <strong>{toFaDigits(rpc.kpis.wagered)}</strong>
          </div>
          <div className="ops-kpi__cell">
            <small>پرداخت کل</small>
            <strong>{toFaDigits(rpc.kpis.paid)}</strong>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3 className="card__title" style={{ fontSize: "1rem", marginBottom: 10 }}>
          راندهای اخیر و راستی‌آزمایی
        </h3>
        {tel.recent.length === 0 ? (
          <p className="ops-empty">هنوز راندی در این نشست تمام نشده. از هاب وارد سالن شوید.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th scope="col">راند</th>
                  <th scope="col">ضریب</th>
                  <th scope="col">حجم بازیکن</th>
                  <th scope="col">پرداخت</th>
                  <th scope="col">تأیید</th>
                  <th scope="col">salt</th>
                </tr>
              </thead>
              <tbody>
                {tel.recent.slice(0, 24).map((row) => {
                  const check = verifyFair(row.seed, row.salt, row.crashPoint);
                  return (
                    <tr key={row.index}>
                      <td className="num">{toFaDigits(row.index)}</td>
                      <td dir="ltr">{formatMultiplier(row.crashPoint)}</td>
                      <td>
                        <CoinAmount amount={row.playerStake} size={12} />
                      </td>
                      <td>
                        <CoinAmount amount={row.playerPayout} size={12} />
                      </td>
                      <td>
                        {check.ok ? (
                          <span className="is-up">
                            <ShieldCheck size={14} aria-hidden="true" /> معتبر
                          </span>
                        ) : (
                          <span className="is-down">نامعتبر</span>
                        )}
                      </td>
                      <td className="ops-id">{row.salt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
