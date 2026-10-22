import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/ui/Coin";
import { useToast } from "@/components/ui/Toast";
import type { CrashSalonState } from "@/games/crash/engine";
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
import { getSharedSalon } from "@/games/crash/salon";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { getErrorMessage } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";

const BET_ERROR: Record<string, string> = {
  BETTING_CLOSED: "پنجرهٔ شرط این راند بسته شده.",
  MAX_SLOTS: "حداکثر دو شرط در هر راند.",
  SLOT_TAKEN: "این جایگاه قبلاً پر شده.",
  INVALID_STAKE: `شرط باید بین ${toFaDigits(MIN_BET)} و ${toFaDigits(MAX_BET)} سکه باشد.`,
  INSUFFICIENT_FUNDS: "موجودی شریف‌کوین کافی نیست.",
  NOT_FLYING: "الان در حال پرواز نیست.",
  ALREADY_CASHED: "این شرط قبلاً برداشت شده.",
  ALREADY_CRASHED: "انفجار زودتر رخ داد.",
};

type SlotDraft = { stake: number; autoOn: boolean; auto: string };

function frameFromState(state: CrashSalonState, now: number): CrashFrame {
  const r = state.round;
  if (r.phase === "betting") {
    return {
      kind: "betting",
      closesInMs: r.bettingEndsAt - now,
      bettingMs: BETTING_MS,
      lastCrash: r.history[r.history.length - 1] ?? null,
    };
  }
  if (r.phase === "flying" && r.flyingStartedAt !== null) {
    return { kind: "flying", elapsedMs: now - r.flyingStartedAt };
  }
  const crashedAt = r.crashedAt ?? now;
  const flyStart = r.flyingStartedAt ?? crashedAt;
  return {
    kind: "crashed",
    elapsedMs: r.crashPoint ? elapsedAt(r.crashPoint) : crashedAt - flyStart,
    crashPoint: r.crashPoint ?? 100,
    sinceCrashMs: now - crashedAt,
    nextInMs: (r.nextAt ?? crashedAt + CRASHED_MS) - now,
  };
}

function liveMult(state: CrashSalonState | null, now: number): number | null {
  if (!state) return null;
  if (state.round.phase === "flying" && state.round.flyingStartedAt !== null) {
    return multiplierAt(now - state.round.flyingStartedAt);
  }
  if (state.round.phase === "crashed") return state.round.crashPoint;
  return null;
}

function parseAuto(on: boolean, raw: string): number | null {
  if (!on) return null;
  const n = Number(raw.replace("×", "").trim());
  if (!Number.isFinite(n) || n < 1.01) return null;
  return Math.round(n * 100);
}

function clampStake(n: number): number {
  if (!Number.isFinite(n)) return MIN_BET;
  return Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(n)));
}

const PHASE_LABEL: Record<string, string> = {
  betting: "شرط‌بندی",
  flying: "پرواز",
  crashed: "انفجار",
};

export function CrashArenaPage() {
  useDocumentTitle("انفجار شریف | Sheriff Blast");
  const { profile } = useEconomyProfile();
  const { showToast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const salonRef = useRef(getSharedSalon(profile?.coins ?? 250));
  const [state, setState] = useState<CrashSalonState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [fairOpen, setFairOpen] = useState(false);
  const [slots, setSlots] = useState<[SlotDraft, SlotDraft]>([
    { stake: 20, autoOn: false, auto: "2.00" },
    { stake: 20, autoOn: false, auto: "5.00" },
  ]);

  useEffect(() => {
    if (profile?.coins === undefined) return;
    salonRef.current.seedBalance(profile.coins);
  }, [profile?.coins]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const salon = salonRef.current;
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

    setState(salon.getState());
    let raf = 0;
    let lastUi = 0;
    const loop = () => {
      const t = Date.now();
      const snap = salon.getState(t);
      renderer.draw(frameFromState(snap, t));
      if (t - lastUi > 80) {
        lastUi = t;
        setNow(t);
        setState(snap);
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
  const myOpen = state?.round.bets.filter((b) => b.isMe && b.cashedAt === null) ?? [];

  const onBet = useCallback(
    (slot: 0 | 1) => {
      const draft = slots[slot];
      try {
        salonRef.current.placeBet(
          clampStake(draft.stake),
          parseAuto(draft.autoOn, draft.auto),
          profile?.display_name ?? "شوالیه",
          Date.now(),
          slot,
        );
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        showToast(BET_ERROR[code] ?? getErrorMessage(err), "error");
      }
    },
    [profile?.display_name, showToast, slots],
  );

  const onCash = useCallback(
    (id: string) => {
      try {
        salonRef.current.cashOut(id);
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        showToast(BET_ERROR[code] ?? getErrorMessage(err), "error");
      }
    },
    [showToast],
  );

  const fair = useMemo(() => {
    if (!state?.round.seed || state.round.crashPoint === null) return null;
    return verifyFair(state.round.seed, state.round.salt, state.round.crashPoint);
  }, [state?.round.crashPoint, state?.round.salt, state?.round.seed]);

  const patchSlot = (slot: 0 | 1, patch: Partial<SlotDraft>) => {
    setSlots((prev) => {
      const next = [...prev] as [SlotDraft, SlotDraft];
      next[slot] = { ...next[slot], ...patch };
      return next;
    });
  };

  return (
    <div className="crash-page">
      <header className="crash-hero">
        <div>
          <p className="crash-kicker">
            <Flame size={16} aria-hidden="true" /> Sheriff Blast · سالن زنده
          </p>
          <h1>انفجار شریف</h1>
          <p className="crash-lead">
            ضریب از ۱.۰۰× اوج می‌گیرد. قبل از انفجار برداشت کن تا شرط در همان ضریب ضرب شود. سکه
            مجازی است و نقد نمی‌شود.
          </p>
        </div>
        <aside className="crash-wallet" aria-label="کیف پول شریف‌کوین">
          <span>موجودی</span>
          <strong>
            <CoinAmount amount={state?.balance ?? profile?.coins ?? 0} size={22} />
          </strong>
          <small>شریف‌کوین · بدون برداشت نقدی</small>
        </aside>
      </header>

      <div className="crash-banner" role="note">
        <ShieldAlert size={16} aria-hidden="true" />
        ۱۸+ · RTP حدود {toFaDigits(100 - HOUSE_EDGE_BPS / 100)}٪ (لبهٔ خانه شفاف ۱٪) · بدون پول
        واقعی · هر راند مستقل است
      </div>

      <ol className="crash-history" aria-label="تاریخچه ضرایب">
        {[...(state?.round.history ?? [])].reverse().map((h, i) => (
          <li key={`${h}-${i}`} className={h >= 200 ? "is-hot" : h < 130 ? "is-cold" : ""}>
            {toFaDigits(formatMultiplier(h))}
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
            <span>راند {toFaDigits(state?.round.index ?? 1)}</span>
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
                    Math.max(0, ((state?.round.bettingEndsAt ?? now) - now) / 1000).toFixed(1),
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
                <Button key={bet.id} type="button" size="lg" onClick={() => onCash(bet.id)}>
                  برداشت شرط {toFaDigits(bet.slot + 1)}
                  {shown !== null
                    ? ` · ${toFaDigits(payoutFor(bet.amount, shown))} sh`
                    : ""}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="crash-docks">
          {([0, 1] as const).map((slot) => {
            const draft = slots[slot];
            const bet = state?.round.bets.find((b) => b.isMe && b.slot === slot);
            const canBet = phase === "betting" && !bet;
            return (
              <div className="crash-dock" key={slot}>
                <header>
                  <span>شرط {toFaDigits(slot + 1)}</span>
                  {bet?.cashedAt !== null && bet ? (
                    <em className="is-up">خروج {formatMultiplier(bet.cashedAt)}</em>
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
                    min={MIN_BET}
                    max={MAX_BET}
                    dir="ltr"
                    value={draft.stake}
                    onChange={(e) => patchSlot(slot, { stake: Number(e.target.value) })}
                    onBlur={() => patchSlot(slot, { stake: clampStake(draft.stake) })}
                  />
                </label>
                <div className="crash-chip-row">
                  {[10, 20, 50, 100].map((n) => (
                    <button type="button" key={n} onClick={() => patchSlot(slot, { stake: n })}>
                      {toFaDigits(n)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchSlot(slot, { stake: clampStake(Math.floor(draft.stake / 2)) })}
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    onClick={() => patchSlot(slot, { stake: clampStake(draft.stake * 2) })}
                  >
                    ۲×
                  </button>
                </div>
                <label className="crash-auto">
                  <input
                    type="checkbox"
                    checked={draft.autoOn}
                    onChange={(e) => patchSlot(slot, { autoOn: e.target.checked })}
                  />
                  خروج خودکار
                  <input
                    dir="ltr"
                    value={draft.auto}
                    disabled={!draft.autoOn}
                    onChange={(e) => patchSlot(slot, { auto: e.target.value })}
                    placeholder="2.00"
                  />
                </label>
                {bet && bet.cashedAt === null && phase === "flying" ? (
                  <Button type="button" size="lg" fullWidth onClick={() => onCash(bet.id)}>
                    برداشت
                    {shown !== null ? ` ${toFaDigits(payoutFor(bet.amount, shown))}` : ""}
                  </Button>
                ) : (
                  <Button type="button" size="lg" fullWidth disabled={!canBet} onClick={() => onBet(slot)}>
                    {bet ? "ثبت شد" : "ثبت شرط"}
                  </Button>
                )}
              </div>
            );
          })}
          <dl className="crash-session">
            <div>
              <dt>شرط نشست</dt>
              <dd>
                <CoinAmount amount={state?.sessionWagered ?? 0} size={14} />
              </dd>
            </div>
            <div>
              <dt>سود / زیان</dt>
              <dd className={(state?.sessionPnL ?? 0) >= 0 ? "is-up" : "is-down"}>
                <CoinAmount amount={state?.sessionPnL ?? 0} signed size={14} />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <section className="crash-feed" aria-label="سالن زنده">
        <h2>سالن زنده</h2>
        {(state?.round.bets.length ?? 0) === 0 ? (
          <p className="crash-empty">هنوز شرطی در این راند نیست — پنجرهٔ شرط باز است.</p>
        ) : (
          <ul>
            {(state?.round.bets ?? []).map((bet) => (
              <li key={bet.id} className={bet.isMe ? "is-me" : ""}>
                <span>{bet.name}{bet.isMe ? " (شما)" : ""}</span>
                <span>
                  <CoinAmount amount={bet.amount} size={12} />
                </span>
                <strong>
                  {bet.cashedAt !== null
                    ? `خروج ${formatMultiplier(bet.cashedAt)} · +${toFaDigits(bet.payout)}`
                    : phase === "crashed"
                      ? "باخت"
                      : bet.autoAt
                        ? `خودکار ${formatMultiplier(bet.autoAt)}`
                        : "در بازی"}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="crash-fair">
        <button type="button" className="crash-fair__toggle" onClick={() => setFairOpen((v) => !v)}>
          <ShieldCheck size={16} aria-hidden="true" />
          تأیید منصفانه (Provably Fair)
        </button>
        {fairOpen && state ? (
          <div className="crash-fair__body">
            <p>
              نقطهٔ انفجار قبل از قبول شرط با HMAC-SHA256 قفل می‌شود. بعد از راند، بذر فاش می‌شود تا
              همان ضریب را روی دستگاه خودت حساب کنی.
            </p>
            <p>
              <span>تعهد (hash)</span>
              <code dir="ltr">{state.round.seedHash}</code>
            </p>
            <p>
              <span>salt</span>
              <code dir="ltr">{state.round.salt}</code>
            </p>
            {state.round.seed && state.round.crashPoint !== null ? (
              <>
                <p>
                  <span>بذر فاش‌شده</span>
                  <code dir="ltr">{state.round.seed}</code>
                </p>
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
