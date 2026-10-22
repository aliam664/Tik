import { useEffect, useRef, useState } from "react";
import { Dices, RefreshCw, ShieldCheck, TimerReset, TrendingUp, Wifi } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/ui/Coin";
import { useToast } from "@/components/ui/Toast";
import {
  DICE_MAX_TARGET,
  DICE_MIN_TARGET,
  diceChanceBps,
  diceMultiplier,
  dicePayout,
  formatDiceRoll,
  formatDiceTarget,
  verifyDiceRound,
  type DiceSide,
} from "@/games/dice/math";
import { formatMultiplier } from "@/games/crash/math";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { diceApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { DiceState } from "@/types/dice";

function asMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampStake(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function DiceArenaPage() {
  useDocumentTitle("تاس شریف | Sheriff Dice");
  const { token, profile, loading: profileLoading, refreshProfile } = useEconomyProfile();
  const { showToast } = useToast();
  const stateRef = useRef<DiceState | null>(null);
  const serverOffsetRef = useRef(0);
  const actionBusyRef = useRef(false);
  const requestRef = useRef(0);

  const [state, setState] = useState<DiceState | null>(null);
  const [sessionStartedAt] = useState(() => Date.now());
  const [clientNow, setClientNow] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [amount, setAmount] = useState(20);
  const [side, setSide] = useState<DiceSide>("under");
  const [target, setTarget] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [fairOpen, setFairOpen] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const acceptState = (next: DiceState) => {
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
        const next = await diceApi.getState(token);
        if (alive && request === requestRef.current) acceptState(next);
      } catch (err) {
        if (alive) setConnectionError(getErrorMessage(err));
      } finally {
        fetching = false;
      }
    };

    void pull();
    const poll = window.setInterval(() => void pull(), 800);
    const clock = window.setInterval(() => {
      const clientTime = Date.now();
      setClientNow(clientTime);
      setNow(clientTime + serverOffsetRef.current);
    }, 100);
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);

    let cleanupChannel: (() => void) | null = null;
    try {
      const channel = supabase
        .channel("dice:salon")
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
      window.clearInterval(clock);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      cleanupChannel?.();
    };
  }, [token]);

  const phase = state?.round.phase ?? "betting";
  const minBet = state?.limits.min_bet ?? 10;
  const maxBet = state?.limits.max_bet ?? 500;
  const currentBet = state?.bets.find((bet) => bet.is_me) ?? null;
  const chance = diceChanceBps(target, side);
  const multiplier = diceMultiplier(target, side);
  const possiblePayout = dicePayout(clampStake(amount, minBet, maxBet), multiplier);
  const balance = state?.wallet.balance ?? profile?.coins ?? 0;
  const bettingEnds = asMs(state?.round.betting_ends_at ?? null) ?? now;
  const nextAt = asMs(state?.round.next_at ?? null) ?? now;
  const countdown = phase === "betting" ? bettingEnds - now : nextAt - now;
  const sessionMs = clientNow - sessionStartedAt;
  const shouldRest = sessionMs >= 20 * 60 * 1000;
  const revealedRoll = state?.round.roll ?? null;
  const fair =
    state?.round.seed && revealedRoll !== null
      ? verifyDiceRound(state.round.seed, state.round.salt, revealedRoll, state.round.seed_hash)
      : null;

  const placeBet = async () => {
    if (!token) {
      showToast("کیف پول شریف‌کوین هنوز آماده نیست؛ چند لحظه صبر کنید.", "error");
      return;
    }
    if (actionBusyRef.current || currentBet || phase !== "betting") return;
    actionBusyRef.current = true;
    setBusy(true);
    const request = ++requestRef.current;
    try {
      const next = await diceApi.placeBet(
        token,
        clampStake(amount, minBet, maxBet),
        side,
        target,
      );
      if (request === requestRef.current) acceptState(next);
      void refreshProfile();
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    } finally {
      actionBusyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="dice-page">
      <header className="dice-hero">
        <div>
          <p className="dice-kicker"><Dices size={17} aria-hidden="true" /> SHERIFF DICE · LIVE</p>
          <h1>تاس شریف</h1>
          <p>
            هدف و جهت را انتخاب کن؛ همه سالن نتیجهٔ جهانی یکسانی می‌بینند و سرور کیف پول را
            اتمیک تسویه می‌کند.
          </p>
        </div>
        <aside className="dice-wallet">
          <span>موجودی کیف پول</span>
          <strong><CoinAmount amount={balance} size={23} /></strong>
          <small>{profileLoading ? "در حال اتصال…" : "شریف‌کوین مجازی · غیرقابل نقد"}</small>
        </aside>
      </header>

      <div className="dice-responsible" role="note">
        <ShieldCheck size={16} aria-hidden="true" />
        ۱۸+ · RTP نظری ۹۹٪ · سقف باخت روزانه {toFaDigits(state?.stats.daily_loss_cap ?? 300)} sh ·
        هر نتیجه مستقل است؛ باخت قبلی شانس راند بعد را تغییر نمی‌دهد.
      </div>

      {connectionError ? (
        <div className="inline-warning" role="alert">
          <RefreshCw size={15} aria-hidden="true" /> {connectionError} — نتیجه یا موجودی ساختگی نمایش داده نمی‌شود.
        </div>
      ) : (
        <div className="dice-connected" role="status">
          <Wifi size={14} aria-hidden="true" /> سالن جهانی متصل · فقط کاربران واقعی
        </div>
      )}

      {shouldRest ? (
        <div className="dice-rest" role="status">
          <TimerReset size={17} aria-hidden="true" /> بیش از ۲۰ دقیقه در این نشست بوده‌اید؛ چند دقیقه استراحت پیشنهاد می‌شود.
        </div>
      ) : null}

      <section className={`dice-arena is-${phase}`} aria-label="راند زنده تاس شریف">
        <div className="dice-round-head">
          <span>راند {toFaDigits(state?.round.index ?? 0)}</span>
          <strong>{phase === "betting" ? "ثبت شرط" : "نتیجه نهایی"}</strong>
          <span dir="ltr">{toFaDigits(Math.max(0, countdown / 1000).toFixed(1))}s</span>
        </div>

        <div className="dice-result" aria-live="polite">
          <Dices size={44} aria-hidden="true" />
          <small>{phase === "betting" ? "تعهد نتیجه ثبت شده" : "ROLL"}</small>
          <strong dir="ltr">
            {phase === "revealed" && revealedRoll !== null ? formatDiceRoll(revealedRoll) : "??.??"}
          </strong>
          {currentBet && phase === "revealed" ? (
            <em className={currentBet.won ? "is-win" : "is-loss"}>
              {currentBet.won
                ? `برد +${toFaDigits(currentBet.payout)} sh`
                : `باخت ${toFaDigits(currentBet.amount)} sh`}
            </em>
          ) : null}
        </div>

        <div className={`dice-scale dice-scale--${side}`}>
          <div className="dice-scale__track">
            <span
              className="dice-scale__zone"
              style={
                side === "under"
                  ? { width: `${target / 100}%` }
                  : { width: `${(10_000 - target) / 100}%`, inset: "0 0 0 auto" }
              }
            />
            <i className="dice-scale__target" style={{ insetInlineStart: `${target / 100}%` }} />
            {revealedRoll !== null ? (
              <b className="dice-scale__roll" style={{ insetInlineStart: `${revealedRoll / 100}%` }} />
            ) : null}
          </div>
          <div className="dice-scale__labels" dir="ltr"><span>0.00</span><span>50.00</span><span>99.99</span></div>
        </div>
      </section>

      <div className="dice-grid">
        <section className="dice-controls">
          <header>
            <div><span>پیش‌بینی شما</span><strong>{side === "under" ? "کمتر از" : "بیشتر یا مساوی"} {formatDiceTarget(target)}</strong></div>
            <div><span>شانس برد</span><strong>{(chance / 100).toFixed(2)}٪</strong></div>
            <div><span>ضریب</span><strong dir="ltr">{formatMultiplier(multiplier)}</strong></div>
          </header>

          <div className="dice-side-switch" role="group" aria-label="جهت شرط">
            <button type="button" className={side === "under" ? "is-active" : ""} disabled={Boolean(currentBet)} onClick={() => setSide("under")}>کمتر از</button>
            <button type="button" className={side === "over" ? "is-active" : ""} disabled={Boolean(currentBet)} onClick={() => setSide("over")}>بیشتر یا مساوی</button>
          </div>

          <label className="dice-slider-label">
            <span>هدف: <b dir="ltr">{formatDiceTarget(target)}</b></span>
            <input
              type="range"
              min={DICE_MIN_TARGET}
              max={DICE_MAX_TARGET}
              step={50}
              value={target}
              disabled={Boolean(currentBet)}
              onChange={(event) => setTarget(Number(event.target.value))}
            />
          </label>

          <label className="dice-amount">
            مبلغ شرط
            <input
              type="number"
              min={minBet}
              max={maxBet}
              value={amount}
              disabled={Boolean(currentBet)}
              onChange={(event) => setAmount(Number(event.target.value))}
              onBlur={() => setAmount((value) => clampStake(value, minBet, maxBet))}
            />
          </label>
          <div className="dice-chips">
            {[10, 20, 50, 100, 250].map((chip) => (
              <button type="button" key={chip} disabled={Boolean(currentBet)} onClick={() => setAmount(clampStake(chip, minBet, maxBet))}>{toFaDigits(chip)}</button>
            ))}
          </div>

          <div className="dice-payout-preview">
            <span>پرداخت احتمالی</span>
            <strong><CoinAmount amount={possiblePayout} size={18} /></strong>
          </div>
          <Button
            type="button"
            size="lg"
            fullWidth
            loading={busy}
            disabled={phase !== "betting" || Boolean(currentBet) || !token || Boolean(connectionError)}
            onClick={() => void placeBet()}
          >
            {currentBet ? "شرط روی سرور ثبت شد" : "ثبت شرط تاس"}
          </Button>
          <small className="dice-no-auto">Auto-bet عمداً فعال نیست؛ هر راند نیاز به تصمیم آگاهانه دارد.</small>
        </section>

        <aside className="dice-stats">
          <h2><TrendingUp size={17} aria-hidden="true" /> آمار شفاف امروز</h2>
          <dl>
            <div><dt>شرط امروز</dt><dd><CoinAmount amount={state?.stats.wagered_today ?? 0} size={14} /></dd></div>
            <div><dt>پرداخت امروز</dt><dd><CoinAmount amount={state?.stats.paid_today ?? 0} size={14} /></dd></div>
            <div><dt>سود / زیان</dt><dd className={(state?.stats.pnl_today ?? 0) >= 0 ? "is-up" : "is-down"}><CoinAmount amount={state?.stats.pnl_today ?? 0} signed size={14} /></dd></div>
            <div><dt>زمان نشست</dt><dd dir="ltr">{formatClock(sessionMs)}</dd></div>
          </dl>
          <h3>نتایج اخیر</h3>
          <ol className="dice-history">
            {(state?.history ?? []).map((row) => (
              <li key={row.index} className={row.roll < 5000 ? "is-low" : "is-high"} dir="ltr">{formatDiceRoll(row.roll)}</li>
            ))}
          </ol>
        </aside>
      </div>

      <section className="dice-feed">
        <h2>شرط‌های واقعی این راند</h2>
        {(state?.bets.length ?? 0) === 0 ? <p>هنوز کسی در این راند شرط ثبت نکرده است.</p> : (
          <ul>
            {(state?.bets ?? []).map((bet) => (
              <li key={bet.id} className={bet.is_me ? "is-me" : ""}>
                <span>{bet.name}{bet.is_me ? " (شما)" : ""}</span>
                <span>{bet.side === "under" ? "<" : "≥"} {formatDiceTarget(bet.target)}</span>
                <span dir="ltr">{formatMultiplier(bet.multiplier)}</span>
                <span><CoinAmount amount={bet.amount} size={12} /></span>
                {bet.won === null ? <strong>منتظر نتیجه</strong> : <strong className={bet.won ? "is-up" : "is-down"}>{bet.won ? `+${toFaDigits(bet.payout)}` : "باخت"}</strong>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dice-fair">
        <button type="button" onClick={() => setFairOpen((open) => !open)}>
          <ShieldCheck size={16} aria-hidden="true" /> راستی‌آزمایی نتیجه
        </button>
        {fairOpen && state ? (
          <div>
            <p>تعهد SHA-256 پیش از شرط منتشر می‌شود؛ بذر پس از پایان راند فاش و HMAC با salt راند محاسبه می‌شود.</p>
            <label>تعهد<code dir="ltr">{state.round.seed_hash}</code></label>
            <label>salt<code dir="ltr">{state.round.salt}</code></label>
            {state.round.seed && revealedRoll !== null ? (
              <>
                <label>بذر<code dir="ltr">{state.round.seed}</code></label>
                <strong className={fair?.ok ? "is-up" : "is-down"}>
                  {fair?.ok ? `تأیید شد — ${formatDiceRoll(fair.computedRoll)}` : `عدم تطابق — ${fair ? formatDiceRoll(fair.computedRoll) : "—"}`}
                </strong>
              </>
            ) : <p>بذر پس از بسته‌شدن شرط‌ها فاش می‌شود.</p>}
          </div>
        ) : null}
      </section>
    </div>
  );
}
