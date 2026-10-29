import { useCallback, useEffect, useState } from "react";
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

const DIST_BUCKETS = ["< ۱.۲۰×", "۱.۲۰–۲×", "۲–۵×", "۵–۱۰×", "۱۰×+"] as const;

function bucketLabel(point: number): string {
  if (point < 120) return "< ۱.۲۰×";
  if (point < 200) return "۱.۲۰–۲×";
  if (point < 500) return "۲–۵×";
  if (point < 1000) return "۵–۱۰×";
  return "۱۰×+";
}

interface NormalizedRecentRow {
  index: number;
  phase: string;
  crashPoint: number | null;
  seedHash: string;
  seed: string | null;
  salt: string;
  volume: number;
  paid: number;
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
  const [rpcSyncedAt, setRpcSyncedAt] = useState<string | null>(null);
  const [rpcNote, setRpcNote] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [clockOffsetMs, setClockOffsetMs] = useState<number>(0);

  const pullRpc = useCallback(async () => {
    const clientMid = Date.now();
    try {
      const data = await adminApi.crashOps(token);
      setRpc(data);
      const serverTs = data.server_now ? Date.parse(data.server_now) : NaN;
      if (Number.isFinite(serverTs) && data.server_now) {
        setClockOffsetMs(serverTs - clientMid);
        setRpcSyncedAt(data.server_now);
      } else {
        setRpcSyncedAt(new Date(clientMid).toISOString());
      }
      setNow(Date.now());
      setRpcNote(null);
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        onSessionExpired();
        return;
      }
      setRpc(null);
      setRpcNote("RPC انفجار در دسترس نیست — تله‌متری سالن محلی نمایش داده می‌شود.");
    }
  }, [onSessionExpired, token]);

  useEffect(() => {
    void pullRpc();
  }, [pullRpc]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(id);
  }, []);

  const salon = getSharedSalon();
  const local = salon.getState(now);
  const tel = salon.getTelemetry();

  const serverRound = rpc?.round;
  const activePhase =
    typeof serverRound?.phase === "string" ? serverRound.phase : local.round.phase;
  const activeIndex =
    typeof serverRound?.index === "number" ? serverRound.index : local.round.index;
  const activeSeedHash =
    typeof serverRound?.seed_hash === "string"
      ? serverRound.seed_hash
      : local.round.seedHash;
  const serverFlyingStart =
    typeof serverRound?.flying_started_at === "string"
      ? Date.parse(serverRound.flying_started_at)
      : null;
  const serverCrashPoint =
    typeof serverRound?.crash_point === "number" ? serverRound.crash_point : null;

  const live = rpc
    ? activePhase === "flying" && serverFlyingStart !== null && Number.isFinite(serverFlyingStart)
      ? multiplierAt(Math.max(0, now + clockOffsetMs - serverFlyingStart))
      : serverCrashPoint
    : local.round.phase === "flying" && local.round.flyingStartedAt
      ? multiplierAt(Math.max(0, now - local.round.flyingStartedAt))
      : local.round.crashPoint;

  const recentRows: NormalizedRecentRow[] = rpc
    ? rpc.recent.map((r) => ({
        index: Number(r.index ?? 0),
        phase: typeof r.phase === "string" ? r.phase : "crashed",
        crashPoint: typeof r.crash_point === "number" ? r.crash_point : null,
        seedHash: typeof r.seed_hash === "string" ? r.seed_hash : "",
        seed: typeof r.seed === "string" ? r.seed : null,
        salt: typeof r.salt === "string" ? r.salt : "",
        volume: Number(r.volume ?? 0),
        paid: Number(r.paid ?? 0),
      }))
    : tel.recent.map((r) => ({
        index: r.index,
        phase: "crashed",
        crashPoint: r.crashPoint,
        seedHash: r.seedHash,
        seed: r.seed,
        salt: r.salt,
        volume: r.playerStake,
        paid: r.playerPayout,
      }));

  const crashedRecent = recentRows.filter(
    (r): r is NormalizedRecentRow & { crashPoint: number } =>
      r.phase === "crashed" && r.crashPoint !== null,
  );

  const counts = Object.fromEntries(DIST_BUCKETS.map((b) => [b, 0])) as Record<string, number>;
  for (const row of crashedRecent) {
    counts[bucketLabel(row.crashPoint)] += 1;
  }
  const distMax = Math.max(1, ...Object.values(counts));
  const dist = DIST_BUCKETS.map((label) => ({ label, value: counts[label], max: distMax }));

  const totalWagered = rpc ? Number(rpc.kpis.wagered ?? 0) : tel.playerWagered;
  const totalPaid = rpc ? Number(rpc.kpis.paid ?? 0) : tel.playerPaid;
  const totalRounds = rpc ? Number(rpc.kpis.rounds_total ?? 0) : tel.rounds;
  const hold = totalWagered - totalPaid;
  const rtp = totalWagered > 0 ? totalPaid / totalWagered : 0;
  const biggestCrash = crashedRecent.reduce((mx, r) => Math.max(mx, r.crashPoint), 0);

  const kpis = [
    { label: "راند جاری", value: toFaDigits(activeIndex), icon: <Flame size={16} /> },
    { label: rpc ? "کل راندهای سرور" : "راندهای نشست", value: toFaDigits(totalRounds), icon: <Activity size={16} /> },
    { label: "حجم شرط بازیکن", value: totalWagered, coin: true },
    { label: "پرداخت بازیکن", value: totalPaid, coin: true },
    { label: "هلد خانه", value: hold, coin: true, signed: true },
    {
      label: "RTP تحقق‌یافته",
      value: totalWagered ? `${(rtp * 100).toFixed(1)}٪` : "—",
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
            setNow(Date.now());
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
      ) : rpc && rpcSyncedAt ? (
        <p className="card__sub">منبع سرور فعال — {formatDateTime(rpcSyncedAt)}</p>
      ) : null}

      <div className="blast-live">
        <div>
          <small>فاز</small>
          <strong className={`crash-phase crash-phase--${activePhase}`}>
            {PHASE_FA[activePhase] ?? activePhase}
          </strong>
        </div>
        <div>
          <small>ضریب زنده</small>
          <strong dir="ltr">{live !== null ? formatMultiplier(live) : "۱.۰۰×"}</strong>
        </div>
        <div>
          <small>تعهد راند</small>
          <code className="ops-id">{activeSeedHash.slice(0, 16)}…</code>
        </div>
        <div>
          <small>{rpc ? "کل شرط‌های ثبت‌شده" : "شرط‌های این راند"}</small>
          <strong>{toFaDigits(rpc ? rpc.kpis.bets : local.round.bets.length)}</strong>
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
            توزیع ضرایب اخیر
          </h3>
          <p className="card__sub">سطل‌بندی آخرین راندهای پایان‌یافته</p>
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
              <dt>بزرگ‌ترین انفجار اخیر</dt>
              <dd dir="ltr">{biggestCrash ? formatMultiplier(biggestCrash) : "—"}</dd>
            </div>
            <div>
              <dt>{rpc ? "راندهای ۲۴ ساعت اخیر" : "بزرگ‌ترین برد بازیکن"}</dt>
              <dd>
                {rpc ? (
                  toFaDigits(rpc.kpis.rounds_24h)
                ) : (
                  <CoinAmount amount={tel.biggestWin} signed size={14} />
                )}
              </dd>
            </div>
            <div>
              <dt>{rpc ? "شرط‌های برداشت‌شده / کل" : "خروج / باخت بازیکن"}</dt>
              <dd>
                {rpc
                  ? `${toFaDigits(rpc.kpis.cashed)} / ${toFaDigits(rpc.kpis.bets)}`
                  : `${toFaDigits(tel.playerCashes)} / ${toFaDigits(tel.playerBusts)}`}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="card">
        <h3 className="card__title" style={{ fontSize: "1rem", marginBottom: 10 }}>
          راندهای اخیر و راستی‌آزمایی
        </h3>
        {crashedRecent.length === 0 ? (
          <p className="ops-empty">هنوز راند پایان‌یافته‌ای ثبت نشده است. از هاب وارد سالن شوید.</p>
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
                {crashedRecent.slice(0, 24).map((row) => {
                  const check = row.seed ? verifyFair(row.seed, row.salt, row.crashPoint) : null;
                  return (
                    <tr key={row.index}>
                      <td className="num">{toFaDigits(row.index)}</td>
                      <td dir="ltr">{formatMultiplier(row.crashPoint)}</td>
                      <td>
                        <CoinAmount amount={row.volume} size={12} />
                      </td>
                      <td>
                        <CoinAmount amount={row.paid} size={12} />
                      </td>
                      <td>
                        {check?.ok ? (
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
