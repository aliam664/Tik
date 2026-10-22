import { useCallback, useEffect, useState } from "react";
import { Activity, Flame, RefreshCw, ShieldAlert, ShieldCheck, TrendingUp } from "lucide-react";
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
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { formatDateTime, toFaDigits } from "@/lib/format";
import type { AdminCrashOps } from "@/types/admin";

const PHASE_FA = {
  betting: "شرط‌بندی",
  flying: "پرواز",
  crashed: "انفجار",
} as const;

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
  const [now, setNow] = useState(() => Date.now());

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
      setRpcNote(user.message);
    }
  }, [onSessionExpired, token]);

  useEffect(() => {
    void pullRpc();
    const poll = window.setInterval(() => void pullRpc(), 2500);
    const clock = window.setInterval(() => setNow(Date.now()), 400);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [pullRpc]);

  const round = rpc?.round ?? null;
  const flyingStart = round?.flying_started_at ? Date.parse(round.flying_started_at) : null;
  const live =
    round?.phase === "flying" && flyingStart !== null
      ? multiplierAt(now - flyingStart)
      : round?.crash_point ?? null;
  const hold = (rpc?.kpis.wagered ?? 0) - (rpc?.kpis.paid ?? 0);
  const rtp = rpc?.kpis.wagered ? rpc.kpis.paid / rpc.kpis.wagered : 0;

  const buckets = ["< ۱.۲۰×", "۱.۲۰–۲×", "۲–۵×", "۵–۱۰×", "۱۰×+"] as const;
  const counts = Object.fromEntries(buckets.map((bucket) => [bucket, 0])) as Record<string, number>;
  for (const row of rpc?.recent ?? []) counts[bucketLabel(row.crash_point)] += 1;
  const maxBucketCount = Math.max(1, ...Object.values(counts));
  const dist = buckets.map((label) => ({ label, value: counts[label], max: maxBucketCount }));

  const kpis = [
    { label: "راند جاری", value: toFaDigits(round?.index ?? 0), icon: <Flame size={16} /> },
    { label: "راندهای کل", value: toFaDigits(rpc?.kpis.rounds_total ?? 0), icon: <Activity size={16} /> },
    { label: "حجم شرط واقعی", value: rpc?.kpis.wagered ?? 0, coin: true },
    { label: "پرداخت واقعی", value: rpc?.kpis.paid ?? 0, coin: true },
    { label: "هلد خانه", value: hold, coin: true, signed: true },
    {
      label: "RTP تحقق‌یافته",
      value: rpc?.kpis.wagered ? `${(rtp * 100).toFixed(1)}٪` : "—",
      icon: <TrendingUp size={16} />,
    },
  ];

  return (
    <section className="admin-panel blast-ops" aria-label="عملیات انفجار شریف">
      <div className="admin-panel-head">
        <div>
          <h2 className="card__title" style={{ fontSize: "1.15rem" }}>سالن عملیات — انفجار شریف</h2>
          <p className="card__sub">
            منبع canonical سرور · HMAC-SHA256 · لبهٔ خانه {toFaDigits(HOUSE_EDGE_BPS / 100)}٪ ·
            کیف پول و تسویه اتمیک شریف‌کوین
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={14} aria-hidden="true" />}
          onClick={() => {
            void pullRpc();
            showToast("تله‌متری سرور تازه‌سازی شد", "info");
          }}
        >
          همگام‌سازی
        </Button>
      </div>

      <div className="inline-warning" role="note">
        <ShieldAlert size={16} aria-hidden="true" />
        ۱۸+ · بدون جایزهٔ پولی · داده‌های این پنل فقط از RPC سرور می‌آیند و بات نمایشی ندارند.
      </div>

      {rpcNote ? <p className="card__sub is-down" role="alert">{rpcNote}</p> : null}
      {rpc ? <p className="card__sub">آخرین پاسخ سرور: {formatDateTime(rpc.server_now)}</p> : null}

      <div className="blast-live">
        <div><small>فاز</small><strong className={`crash-phase crash-phase--${round?.phase ?? "betting"}`}>{round ? PHASE_FA[round.phase] : "—"}</strong></div>
        <div><small>ضریب زنده</small><strong dir="ltr">{live !== null ? formatMultiplier(live) : "—"}</strong></div>
        <div><small>تعهد راند</small><code className="ops-id">{round?.seed_hash ? `${round.seed_hash.slice(0, 16)}…` : "—"}</code></div>
        <div><small>شرط‌های کل</small><strong>{toFaDigits(rpc?.kpis.bets ?? 0)}</strong></div>
      </div>

      <div className="stat-grid">
        {kpis.map((card) => (
          <div className="stat-card" key={card.label}>
            {card.icon ? <span className="stat-card__icon">{card.icon}</span> : null}
            <span className="stat-card__value num">
              {card.coin ? <CoinAmount amount={Number(card.value)} signed={card.signed} size={16} /> : card.value}
            </span>
            <span className="stat-card__label">{card.label}</span>
          </div>
        ))}
      </div>

      <div className="charts-grid-2">
        <div className="card">
          <h3 className="card__title" style={{ fontSize: "1rem" }}>توزیع ضرایب سرور</h3>
          <p className="card__sub">آخرین راندهای ثبت‌شده در دیتابیس</p>
          <ul className="blast-bars">
            {dist.map((row) => (
              <li key={row.label}><span>{row.label}</span><i style={{ width: `${Math.max(4, (row.value / row.max) * 100)}%` }} /><em>{toFaDigits(row.value)}</em></li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 className="card__title" style={{ fontSize: "1rem" }}>پیکربندی میز</h3>
          <dl className="blast-config">
            <div><dt>حداقل / حداکثر شرط</dt><dd>{toFaDigits(MIN_BET)} — {toFaDigits(MAX_BET)} sh</dd></div>
            <div><dt>پنجرهٔ شرط</dt><dd>{toFaDigits(BETTING_MS / 1000)} ثانیه</dd></div>
            <div><dt>مکث پس از انفجار</dt><dd>{toFaDigits(CRASHED_MS / 1000)} ثانیه</dd></div>
            <div><dt>راندهای ۲۴ ساعت</dt><dd>{toFaDigits(rpc?.kpis.rounds_24h ?? 0)}</dd></div>
            <div><dt>برداشت‌های موفق</dt><dd>{toFaDigits(rpc?.kpis.cashed ?? 0)}</dd></div>
            <div><dt>هلد سرور</dt><dd><CoinAmount amount={hold} signed size={14} /></dd></div>
          </dl>
        </div>
      </div>

      <div className="card">
        <h3 className="card__title" style={{ fontSize: "1rem", marginBottom: 10 }}>راندهای اخیر و راستی‌آزمایی</h3>
        {(rpc?.recent.length ?? 0) === 0 ? <p className="ops-empty">هنوز راندی روی سرور تمام نشده است.</p> : (
          <div className="table-wrap">
            <table className="admin-data-table">
              <thead><tr><th>راند</th><th>ضریب</th><th>حجم</th><th>پرداخت</th><th>تأیید</th><th>salt</th></tr></thead>
              <tbody>
                {(rpc?.recent ?? []).slice(0, 24).map((row) => {
                  const check = row.seed ? verifyFair(row.seed, row.salt, row.crash_point) : null;
                  return (
                    <tr key={row.index}>
                      <td className="num">{toFaDigits(row.index)}</td>
                      <td dir="ltr">{formatMultiplier(row.crash_point)}</td>
                      <td><CoinAmount amount={row.volume} size={12} /></td>
                      <td><CoinAmount amount={row.paid} size={12} /></td>
                      <td>{check?.ok ? <span className="is-up"><ShieldCheck size={14} /> معتبر</span> : <span>در انتظار افشا</span>}</td>
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
