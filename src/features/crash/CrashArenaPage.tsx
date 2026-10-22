import { useEffect, useRef, useState } from "react";
import { Flame, RefreshCw, ShieldAlert, ShieldCheck, Wifi } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/ui/Coin";
import { useToast } from "@/components/ui/Toast";
import { CrashRenderer, type CrashFrame } from "@/games/crash/renderer";
import {
  BETTING_MS,
  CRASHED_MS,
  HOUSE_EDGE_BPS,
  MAX_BET,
  MIN_BET,
  elapsedAt,
  formatMultiplier,
  multiplierAt,
  payoutFor,
  verifyFair,
} from "@/games/crash/math";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { crashApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { CrashServerState } from "@/types/crash";

const BET_ERROR: Record<string, string> = {
  BETTING_CLOSED: "پنجرهٔ شرط این راند بسته شده.",
  MAX_SLOTS: "حداکثر دو شرط در هر راند.",
  SLOT_TAKEN: "این جایگاه قبلاً پر شده.",
  INVALID_STAKE: `شرط باید بین ${toFaDigits(MIN_BET)} و ${toFaDigits(MAX_BET)} سکه باشد.`,
  INSUFFICIENT_FUNDS: "موجودی شریف‌کوین کافی نیست.",
  NOT_FLYING: "الان در حال پرواز نیست.",
  ALREADY_CASHED: "این شرط قبلاً برداشت شده.",
  ALREADY_CRASHED: "انفجار زودتر رخ داد.",
  DAILY_LOSS_CAP: "به سقف باخت روزانه رسیده‌اید؛ برای امروز استراحت کنید.",
};

type SlotDraft = { stake: number; autoOn: boolean; auto: string };
type BusyAction = `bet-${0 | 1}` | `cash-${string}` | null;

function asMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function frameFromState(state: CrashServerState, now: number): CrashFrame {
  const round = state.round;
  const bettingEnd = asMs(round.betting_ends_at) ?? now;
  if (round.phase === "betting") {
    return {
      kind: "betting",
      closesInMs: bettingEnd - now,
      bettingMs: BETTING_MS,
      lastCrash: state.history[0]?.crash_point ?? null,
    };
  }

  const flyingStart = asMs(round.flying_started_at) ?? bettingEnd;
  if (round.phase === "flying") {
    return { kind: "flying", elapsedMs: now - flyingStart };
  }

  const crashedAt = asMs(round.crashed_at) ?? now;
  const nextAt = asMs(round.next_at) ?? crashedAt + CRASHED_MS;
  return {
    kind: "crashed",
    elapsedMs: round.crash_point ? elapsedAt(round.crash_point) : crashedAt - flyingStart,
    crashPoint: round.crash_point ?? 100,
    sinceCrashMs: now - crashedAt,
    nextInMs: nextAt - now,
  };
}

function liveMult(state: CrashServerState | null, now: number): number | null {
  if (!state) return null;
  if (state.round.phase === "flying") {
    const started = asMs(state.round.flying_started_at);
    return started === null ? 100 : multiplierAt(now - started);
  }
  if (state.round.phase === "crashed") return state.round.crash_point;
  return null;
}

function parseAuto(on: boolean, raw: string): number | null {
  if (!on) return null;
  const n = Number(raw.replace("×", "").trim());
  if (!Number.isFinite(n) || n < 1.01) return null;
  return Math.round(n * 100);
}

function clampStake(n: number, min = MIN_BET, max = MAX_BET): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

const PHASE_LABEL = {
  betting: "شرط‌بندی",
  flying: "پرواز",
  crashed: "انفجار",
} as const;

export function CrashArenaPage() {
  useDocumentTitle("انفجار شریف | Sheriff Blast");
  const { profile, token, loading: profileLoading, refreshProfile } = useEconomyProfile();
  const { showToast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<CrashServerState | null>(null);
  const serverOffsetRef = useRef(0);
  const actionBusyRef = useRef(false);
  const requestRef = useRef(0);

  const [state, setState] = useState<CrashServerState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [fairOpen, setFairOpen] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [slots, setSlots] = useState<[SlotDraft, SlotDraft]>([
    { stake: 20, autoOn: false, auto: "2.00" },
    { stake: 20, autoOn: false, auto: "5.00" },
  ]);

  const acceptState = (next: CrashServerState) => {
    const sampled = asMs(next.round.server_now);
    if (sampled !== null) serverOffsetRef.current = sampled - Date.now();
    stateRef.current = next;
    setState(next);
    setConnectionError(null);
  };

  useEffect(() => {
    let alive = true;
    let fetching = false;

    const pull = async () => {
      if (fetching || actionBusyRef.current) return;
      fetching = true;
      const request = ++requestRef.current;
      try {
        const next = await crashApi.getState(token);
        if (alive && request === requestRef.current) acceptState(next);
      } catch (err) {
        if (alive) setConnectionError(getErrorMessage(err));
      } finally {
        fetching = false;
      }
    };

    void pull();
    const poll = window.setInterval(() => void pull(), 700);
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);

    let cleanupChannel: (() => void) | null = null;
    try {
      const channel = supabase
        .channel("crash:salon")
        .on("broadcast", { event: "state" }, () => void pull())
        .subscribe();
      cleanupChannel = () => void supabase.removeChannel(channel);
    } catch {
      cleanupChannel = null;
    }

    return () => {
      alive = false;
      requestRef.current += 1;
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      cleanupChannel?.();
    };
  }, [token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const renderer = new CrashRenderer(ctx);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      renderer.resize(rect.width, rect.height, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let lastUi = 0;
    const loop = () => {
      const clientTime = Date.now();
      const authoritativeNow = clientTime + serverOffsetRef.current;
      const snapshot = stateRef.current;
      if (snapshot) renderer.draw(frameFromState(snapshot, authoritativeNow));
      if (clientTime - lastUi > 80) {
        lastUi = clientTime;
        setNow(authoritativeNow);
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const shown = liveMult(state, now);
  const phase = state?.round.phase ?? "betting";
  const myOpen = state?.bets.filter((bet) => bet.is_me && bet.cashed_at === null) ?? [];
  const minBet = state?.limits.min_bet ?? MIN_BET;
  const maxBet = state?.limits.max_bet ?? MAX_BET;
  const balance = state?.wallet.balance ?? profile?.coins ?? 0;

  const runServerAction = async (
    action: Exclude<BusyAction, null>,
    request: () => Promise<CrashServerState>,
  ) => {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setBusyAction(action);
    const requestId = ++requestRef.current;
    try {
      const next = await request();
      if (requestId === requestRef.current) acceptState(next);
      void refreshProfile();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      showToast(BET_ERROR[code] ?? getErrorMessage(err), "error");
    } finally {
      actionBusyRef.current = false;
      setBusyAction(null);
    }
  };

  const onBet = (slot: 0 | 1) => {
    if (!token) {
      showToast("کیف پول شریف‌کوین هنوز آماده نیست؛ چند لحظه صبر کنید.", "error");
      return;
    }
    const draft = slots[slot];
    const autoAt = parseAuto(draft.autoOn, draft.auto);
    if (draft.autoOn && autoAt === null) {
      showToast("ضریب برداشت خودکار باید حداقل ۱٫۰۱× باشد.", "error");
      return;
    }
    const amount = clampStake(draft.stake, minBet, maxBet);
    void runServerAction(`bet-${slot}`, () => crashApi.placeBet(token, amount, autoAt, slot));
  };

  const onCash = (id: string) => {
    if (!token) return;
    void runServerAction(`cash-${id}`, () => crashApi.cashOut(token, id));
  };

  const fair =
    state?.round.seed && state.round.crash_point !== null
      ? verifyFair(state.round.seed, state.round.salt, state.round.crash_point)
      : null;

  const patchSlot = (slot: 0 | 1, patch: Partial<SlotDraft>) => {
    setSlots((previous) => {
      const next = [...previous] as [SlotDraft, SlotDraft];
      next[slot] = { ...next[slot], ...patch };
      return next;
    });
  };

  return (
    <div className="crash-page">
      <header className="crash-hero">
        <div>
          <p className="crash-kicker">
            <Flame size={16} aria-hidden="true" /> Sheriff Blast · سالن جهانی سرور
          </p>
          <h1>انفجار شریف</h1>
          <p className="crash-lead">
            همه بازیکنان یک راند جهانی را می‌بینند. قبل از انفجار برداشت کن؛ ثبت شرط، زمان و
            تسویه کیف پول همگی روی سرور انجام می‌شوند.
          </p>
        </div>
        <aside className="crash-wallet" aria-label="کیف پول شریف‌کوین">
          <span>موجودی واقعی کیف پول</span>
          <strong>
            <CoinAmount amount={balance} size={22} />
          </strong>
          <small>
            {profileLoading ? "در حال اتصال…" : "شریف‌کوین مجازی · بدون برداشت نقدی"}
          </small>
        </aside>
      </header>

      <div className="crash-banner" role="note">
        <ShieldAlert size={16} aria-hidden="true" />
        ۱۸+ · RTP نظری {toFaDigits(100 - HOUSE_EDGE_BPS / 100)}٪ · بدون پول واقعی · سقف باخت
        روزانه {toFaDigits(state?.stats.daily_loss_cap ?? 300)} sh · هر راند مستقل است
      </div>

      {connectionError ? (
        <div className="inline-warning" role="alert">
          <RefreshCw size={16} aria-hidden="true" />
          {connectionError} — بازی محلی یا موجودی ساختگی جایگزین نمی‌شود.
        </div>
      ) : (
        <div className="crash-online" role="status">
          <Wifi size={14} aria-hidden="true" /> سرور authoritative متصل · فقط بازیکنان واقعی
        </div>
      )}

      <ol className="crash-history" aria-label="تاریخچه ضرایب سرور">
        {(state?.history ?? []).map((row) => (
          <li
            key={row.index}
            className={row.crash_point >= 200 ? "is-hot" : row.crash_point < 130 ? "is-cold" : ""}
          >
            {toFaDigits(formatMultiplier(row.crash_point))}
          </li>
        ))}
      </ol>

      <div className="crash-stage">
        <div
          className={[
            "crash-stage__chart",
            `is-${phase}`,
            shown !== null && shown >= 200 ? "is-hot" : "",
            shown !== null && shown >= 1000 ? "is-blaze" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="crash-stage__hud">
            <span>راند سرور {toFaDigits(state?.round.index ?? 0)}</span>
            <em className={`crash-phase crash-phase--${phase}`}>{PHASE_LABEL[phase]}</em>
          </div>
          <div
            className={`crash-mult crash-mult--${phase}${shown !== null && shown >= 200 ? " is-hot" : ""}${
              shown !== null && shown >= 1000 ? " is-blaze" : ""
            }`}
            dir="ltr"
          >
            {phase === "betting" ? (
              <>
                <small>شروع تا</small>
                <strong>
                  {toFaDigits(
                    Math.max(0, ((asMs(state?.round.betting_ends_at ?? null) ?? now) - now) / 1000).toFixed(1),
                  )}
                </strong>
              </>
            ) : (
              <>
                <small>{phase === "crashed" ? "منفجر شد" : "ضریب"}</small>
                <strong>{shown !== null ? formatMultiplier(shown) : "1.00×"}</strong>
              </>
            )}
          </div>
          <canvas ref={canvasRef} className="crash-canvas" aria-label="نمودار ضریب انفجار" />
          {phase === "flying" && myOpen.length > 0 ? (
            <div className="crash-cash-bar">
              {myOpen.map((bet) => (
                <Button
                  key={bet.id}
                  type="button"
                  size="lg"
                  loading={busyAction === `cash-${bet.id}`}
                  onClick={() => onCash(bet.id)}
                >
                  برداشت شرط {toFaDigits(bet.slot + 1)}
                  {shown !== null ? ` · ${toFaDigits(payoutFor(bet.amount, shown))} sh` : ""}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="crash-docks">
          {([0, 1] as const).map((slot) => {
            const draft = slots[slot];
            const bet = state?.bets.find((candidate) => candidate.is_me && candidate.slot === slot);
            const canBet = phase === "betting" && !bet && Boolean(token) && !connectionError;
            return (
              <div className="crash-dock" key={slot}>
                <header>
                  <span>شرط {toFaDigits(slot + 1)}</span>
                  {bet && bet.cashed_at !== null ? (
                    <em className="is-up">خروج {formatMultiplier(bet.cashed_at)}</em>
                  ) : bet && phase === "crashed" ? (
                    <em className="is-down">باخت</em>
                  ) : bet ? (
                    <em>در بازی</em>
                  ) : null}
                </header>
                <label>
                  مبلغ
                  <input
                    type="number"
                    min={minBet}
                    max={maxBet}
                    dir="ltr"
                    value={draft.stake}
                    disabled={Boolean(bet)}
                    onChange={(event) => patchSlot(slot, { stake: Number(event.target.value) })}
                    onBlur={() => patchSlot(slot, { stake: clampStake(draft.stake, minBet, maxBet) })}
                  />
                </label>
                <div className="crash-chip-row">
                  {[10, 20, 50, 100].map((amount) => (
                    <button
                      type="button"
                      key={amount}
                      disabled={Boolean(bet)}
                      onClick={() => patchSlot(slot, { stake: amount })}
                    >
                      {toFaDigits(amount)}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={Boolean(bet)}
                    onClick={() => patchSlot(slot, { stake: clampStake(Math.floor(draft.stake / 2), minBet, maxBet) })}
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(bet)}
                    onClick={() => patchSlot(slot, { stake: clampStake(draft.stake * 2, minBet, maxBet) })}
                  >
                    ۲×
                  </button>
                </div>
                <label className="crash-auto">
                  <input
                    type="checkbox"
                    checked={draft.autoOn}
                    disabled={Boolean(bet)}
                    onChange={(event) => patchSlot(slot, { autoOn: event.target.checked })}
                  />
                  خروج خودکار سرور
                  <input
                    dir="ltr"
                    value={draft.auto}
                    disabled={!draft.autoOn || Boolean(bet)}
                    onChange={(event) => patchSlot(slot, { auto: event.target.value })}
                    placeholder="2.00"
                  />
                </label>
                {bet && bet.cashed_at === null && phase === "flying" ? (
                  <Button
                    type="button"
                    size="lg"
                    fullWidth
                    loading={busyAction === `cash-${bet.id}`}
                    onClick={() => onCash(bet.id)}
                  >
                    برداشت
                    {shown !== null ? ` ${toFaDigits(payoutFor(bet.amount, shown))}` : ""}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    fullWidth
                    disabled={!canBet}
                    loading={busyAction === `bet-${slot}`}
                    onClick={() => onBet(slot)}
                  >
                    {bet ? "روی سرور ثبت شد" : "ثبت شرط"}
                  </Button>
                )}
              </div>
            );
          })}
          <dl className="crash-session">
            <div>
              <dt>شرط امروز</dt>
              <dd><CoinAmount amount={state?.stats.wagered_today ?? 0} size={14} /></dd>
            </div>
            <div>
              <dt>سود / زیان امروز</dt>
              <dd className={(state?.stats.pnl_today ?? 0) >= 0 ? "is-up" : "is-down"}>
                <CoinAmount amount={state?.stats.pnl_today ?? 0} signed size={14} />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <section className="crash-feed" aria-label="شرط‌های واقعی سالن زنده">
        <h2>سالن زنده · کاربران واقعی</h2>
        {(state?.bets.length ?? 0) === 0 ? (
          <p className="crash-empty">هنوز شرطی در این راند نیست — پنجرهٔ شرط باز است.</p>
        ) : (
          <ul>
            {(state?.bets ?? []).map((bet) => (
              <li key={bet.id} className={bet.is_me ? "is-me" : ""}>
                <span>{bet.name}{bet.is_me ? " (شما)" : ""}</span>
                <span><CoinAmount amount={bet.amount} size={12} /></span>
                <strong>
                  {bet.cashed_at !== null
                    ? `خروج ${formatMultiplier(bet.cashed_at)} · +${toFaDigits(bet.payout)}`
                    : phase === "crashed"
                      ? "باخت"
                      : bet.auto_at
                        ? `خودکار ${formatMultiplier(bet.auto_at)}`
                        : "در بازی"}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="crash-fair">
        <button type="button" className="crash-fair__toggle" onClick={() => setFairOpen((open) => !open)}>
          <ShieldCheck size={16} aria-hidden="true" />
          تأیید منصفانه (Provably Fair)
        </button>
        {fairOpen && state ? (
          <div className="crash-fair__body">
            <p>
              بذر سرور قبل از شرط با SHA-256 قفل می‌شود. پس از انفجار، بذر فاش و همان نتیجه با
              HMAC-SHA256 روی دستگاه شما دوباره محاسبه می‌شود.
            </p>
            <p><span>تعهد (hash)</span><code dir="ltr">{state.round.seed_hash}</code></p>
            <p><span>salt</span><code dir="ltr">{state.round.salt}</code></p>
            {state.round.seed && state.round.crash_point !== null ? (
              <>
                <p><span>بذر فاش‌شده</span><code dir="ltr">{state.round.seed}</code></p>
                <p className={fair?.ok ? "is-up" : "is-down"}>
                  {fair?.ok
                    ? `تأیید شد — ضریب محاسبه‌شده ${formatMultiplier(fair.computed)}`
                    : `عدم تطابق — محاسبه ${fair ? formatMultiplier(fair.computed) : "—"}`}
                </p>
              </>
            ) : (
              <p>بذر بعد از انفجار این راند فاش می‌شود.</p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
