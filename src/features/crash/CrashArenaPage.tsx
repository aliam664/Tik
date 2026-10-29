import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Flame,
  Keyboard,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinAmount } from "@/components/ui/Coin";
import { useToast } from "@/components/ui/Toast";
import { CrashRenderer } from "@/games/crash/renderer";
import {
  BETTING_MS,
  HOUSE_EDGE_BPS,
  MAX_BET,
  MIN_BET,
  formatMultiplier,
  hashSeed,
  multiplierAt,
  payoutFor,
  verifyFair,
} from "@/games/crash/math";
import {
  isMuted as readMuted,
  playBet,
  playCash,
  playCrash,
  playCountdownTick,
  setMuted as persistMuted,
} from "@/games/crash/sound";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { getErrorMessage } from "@/lib/errors";
import { toFaDigits } from "@/lib/format";
import { frameFromView, liveMultiplier, type CrashLink } from "./crashView";
import {
  buildShadowCrowd,
  shadowGuestCashed,
  type ShadowCrowdBet,
} from "./shadowCrowd";
import { useCrashSalon } from "./useCrashSalon";

type SlotDraft = { stake: number; autoOn: boolean; auto: string };

const PHASE_LABEL: Record<string, string> = {
  betting: "شرط‌بندی",
  flying: "پرواز",
  crashed: "انفجار",
};

const LINK_LABEL: Record<CrashLink, { text: string; cls: string }> = {
  connecting: { text: "در حال اتصال…", cls: "is-wait" },
  live: { text: "سالن مشترک · زنده", cls: "is-live" },
  polling: { text: "سالن مشترک · همگام", cls: "is-live" },
  reconnecting: { text: "تلاش برای اتصال…", cls: "is-wait" },
  local: { text: "حالت محلی · آفلاین", cls: "is-off" },
};

const AUTO_PRESETS = [1.5, 2, 3, 5, 10];

function parseAuto(on: boolean, raw: string): number | null {
  if (!on) return null;
  const n = Number(raw.replace("×", "").trim());
  if (!Number.isFinite(n) || n < 1.01) return null;
  return Math.round(n * 100);
}

function clampStake(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function faNum(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}

interface HistorySummary {
  count: number;
  max: number;
  avg: number;
  bustRate: number;
  dblRate: number;
  buckets: { label: string; n: number }[];
}

function summarize(history: number[]): HistorySummary | null {
  const last = history.slice(-20);
  if (last.length === 0) return null;
  const bucketOf = (h: number) =>
    h < 120 ? 0 : h < 200 ? 1 : h < 500 ? 2 : h < 1000 ? 3 : 4;
  const counts = [0, 0, 0, 0, 0];
  for (const h of last) counts[bucketOf(h)] += 1;
  const labels = ["< ۱.۲×", "۱.۲–۲×", "۲–۵×", "۵–۱۰×", "۱۰×+"];
  return {
    count: last.length,
    max: Math.max(...last),
    avg: last.reduce((a, b) => a + b, 0) / last.length,
    bustRate: counts[0] / last.length,
    dblRate: (counts[1] + counts[2] + counts[3] + counts[4]) / last.length,
    buckets: labels.map((label, i) => ({ label, n: counts[i] ?? 0 })),
  };
}

export function CrashArenaPage() {
  useDocumentTitle("انفجار شریف | Sheriff Blast");
  const { profile, refreshProfile } = useEconomyProfile();
  const { showToast } = useToast();

  const salon = useCrashSalon({
    coins: profile?.coins,
    playerName: profile?.display_name,
    onWalletChanged: () => void refreshProfile(),
  });
  const view = salon.view;

  /* Refs for the animation loop + non-React HUD text (60 fps, no re-render). */
  const handleRef = useRef(salon);
  const viewRef = useRef(view);
  useEffect(() => {
    handleRef.current = salon;
    viewRef.current = view;
  }, [salon, view]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const multLabelRef = useRef<HTMLSpanElement | null>(null);
  const multValueRef = useRef<HTMLElement | null>(null);
  const elapsedRef = useRef<HTMLSpanElement | null>(null);
  const nextRef = useRef<HTMLElement | null>(null);

  /* Secondary tick — keeps payouts / counters fresh a few times per second. */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => (n + 1) % 10_000), 220);
    return () => window.clearInterval(id);
  }, []);

  /* ---------------- canvas + rAF loop ---------------- */
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
    let tickRound = -1;
    const loop = () => {
      const handle = handleRef.current;
      const t = handle.serverNow();
      const v = viewRef.current;
      const frame = v
        ? frameFromView(v, t)
        : { kind: "betting" as const, closesInMs: BETTING_MS, bettingMs: BETTING_MS, lastCrash: null };
      renderer.draw(frame);

      const labelEl = multLabelRef.current;
      const valueEl = multValueRef.current;
      if (labelEl && valueEl) {
        if (frame.kind === "betting") {
          labelEl.textContent = "شروع تا";
          valueEl.textContent = toFaDigits(Math.max(0, frame.closesInMs / 1000).toFixed(1));
          if (elapsedRef.current) elapsedRef.current.textContent = "—";
          if (frame.closesInMs <= 1000 && frame.closesInMs > 0 && v && tickRound !== v.round.index) {
            tickRound = v.round.index;
            playCountdownTick();
          }
        } else if (frame.kind === "flying") {
          labelEl.textContent = "ضریب";
          valueEl.textContent = formatMultiplier(multiplierAt(frame.elapsedMs));
          if (elapsedRef.current) {
            elapsedRef.current.textContent = `${(frame.elapsedMs / 1000).toFixed(1)}s`;
          }
        } else {
          labelEl.textContent = "منفجر شد";
          valueEl.textContent = formatMultiplier(frame.crashPoint);
          if (elapsedRef.current) {
            elapsedRef.current.textContent = `${(frame.elapsedMs / 1000).toFixed(1)}s`;
          }
          if (nextRef.current) {
            nextRef.current.textContent = toFaDigits(Math.max(0, frame.nextInMs / 1000).toFixed(1));
          }
        }
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  /* ---------------- session counters + audio cues ---------------- */
  const settledRef = useRef(new Map<string, "cashed" | "busted">());
  const primedRef = useRef(false);
  const prevPhaseRef = useRef<string>("betting");
  const [session, setSession] = useState({
    cashes: 0,
    busts: 0,
    wagered: 0,
    paid: 0,
    bestWin: 0,
    bestMult: 0,
  });

  useEffect(() => {
    const v = view;
    if (!v) return;
    const first = !primedRef.current;
    if (first) primedRef.current = true;
    // First observation after loading only seeds counters — no audio cues.
    if (!first && prevPhaseRef.current !== "crashed" && v.round.phase === "crashed") playCrash();
    prevPhaseRef.current = v.round.phase;

    for (const b of v.round.bets) {
      if (!b.isMe) continue;
      const seen = settledRef.current.get(b.id);
      if (seen) continue;
      if (b.cashedAt !== null) {
        settledRef.current.set(b.id, "cashed");
        if (first) continue;
        const cashed = b.cashedAt;
        playCash();
        setSession((s) => ({
          ...s,
          cashes: s.cashes + 1,
          wagered: s.wagered + b.amount,
          paid: s.paid + b.payout,
          bestWin: Math.max(s.bestWin, b.payout - b.amount),
          bestMult: Math.max(s.bestMult, cashed),
        }));
      } else if (v.round.phase === "crashed") {
        settledRef.current.set(b.id, "busted");
        if (first) continue;
        const stake = b.amount;
        setSession((s) => ({ ...s, busts: s.busts + 1, wagered: s.wagered + stake }));
      }
    }
  }, [view]);

  /* ---------------- mute ---------------- */
  const [muted, setMutedState] = useState(() => readMuted());
  const toggleMute = () => {
    const next = !muted;
    persistMuted(next);
    setMutedState(next);
    if (!next) playBet();
  };

  /* ---------------- bet drafts & actions ---------------- */
  const [slots, setSlots] = useState<[SlotDraft, SlotDraft]>([
    { stake: 20, autoOn: false, auto: "2.00" },
    { stake: 20, autoOn: false, auto: "5.00" },
  ]);

  const patchSlot = (slot: 0 | 1, patch: Partial<SlotDraft>) => {
    setSlots((prev) => {
      const next = [...prev] as [SlotDraft, SlotDraft];
      const cur = next[slot];
      if (cur) next[slot] = { ...cur, ...patch };
      return next;
    });
  };

  const onBet = useCallback(
    async (slot: 0 | 1) => {
      const draft = slots[slot];
      if (!draft) return;
      const limits = viewRef.current?.limits;
      try {
        await salon.placeBet(
          clampStake(draft.stake, limits?.minBet ?? MIN_BET, limits?.maxBet ?? MAX_BET),
          parseAuto(draft.autoOn, draft.auto),
          slot,
        );
        playBet();
      } catch (err) {
        showToast(getErrorMessage(err), "error");
      }
    },
    [salon, showToast, slots],
  );

  const onCash = useCallback(
    async (betId: string) => {
      try {
        await salon.cashOut(betId);
      } catch (err) {
        showToast(getErrorMessage(err), "error");
      }
    },
    [salon, showToast],
  );

  /* ---------------- keyboard shortcut: Space = cash-out / bet ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || target?.isContentEditable) return;
      const v = viewRef.current;
      if (!v) return;
      const myOpen = v.round.bets.filter((b) => b.isMe && b.cashedAt === null);
      if (v.round.phase === "flying" && myOpen[0]) {
        e.preventDefault();
        void onCash(myOpen[0].id);
      } else if (v.round.phase === "betting") {
        e.preventDefault();
        void onBet(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBet, onCash]);

  /* ---------------- derived ---------------- */
  const now = salon.serverNow();
  const phase = view?.round.phase ?? "betting";
  const shown = view ? liveMultiplier(view, now) : null;
  const myOpen = view?.round.bets.filter((b) => b.isMe && b.cashedAt === null) ?? [];
  const stats = view?.stats;
  const link = LINK_LABEL[salon.link];
  const summary = useMemo(() => summarize(view?.round.history ?? []), [view]);

  const verifiedRows = useMemo(() => {
    const rows = view?.round.historyRows ?? [];
    return rows
      .filter((r) => r.seed.length > 0)
      .slice(0, 6)
      .map((r) => ({
        ...r,
        ok: hashSeed(r.seed) === r.seedHash && verifyFair(r.seed, r.salt, r.crashPoint).ok,
      }));
  }, [view]);

  const [fairOpen, setFairOpen] = useState(false);
  const fair = useMemo(() => {
    const r = view?.round;
    if (!r?.seed || r.crashPoint === null) return null;
    return verifyFair(r.seed, r.salt, r.crashPoint);
  }, [view]);

  // Hidden virtual guests keep the live salon alive when real bettors are
  // scarce — feed display only (no wallet / round-math impact).
  const feedBets = useMemo(() => {
    const real = view?.round.bets ?? [];
    if (!view || view.mode !== "live") return real;
    const others = real.filter((b) => !b.isMe).length;
    const need = Math.max(0, 3 - others);
    if (need === 0) return real;
    return [...real, ...buildShadowCrowd(view.round.index, need)];
  }, [view]);

  const roundVolume = useMemo(
    () => feedBets.reduce((s, b) => s + b.amount, 0),
    [feedBets],
  );

  const category =
    view &&
    [
      "crash-page",
      `is-${phase}`,
      shown !== null && shown >= 200 ? "is-hot" : "",
      shown !== null && shown >= 1000 ? "is-blaze" : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div className={category ?? "crash-page"}>
      <header className="crash-hero">
        <div className="crash-hero__text">
          <p className="crash-kicker">
            <Flame size={16} aria-hidden="true" /> Sheriff Blast · سالن مشترک زنده
          </p>
          <h1>انفجار شریف</h1>
          <p className="crash-lead">
            یک نمودار زنده برای همهٔ دستگاه‌ها — موبایل، دسکتاپ، هر سیستم‌عامل؛ همه یک راند را هم‌زمان
            می‌بینند. ضریب از ۱.۰۰× بالا می‌رود؛ قبل از انفجار برداشت کن. سکه مجازی است و نقد نمی‌شود.
          </p>
        </div>
        <aside className="crash-hero__side">
          <span className={`crash-link ${link.cls}`} role="status" aria-live="polite">
            <span className="crash-link__dot" aria-hidden="true" />
            {link.text}
          </span>
          <div className="crash-wallet" aria-label="کیف پول شریف‌کوین">
            <span>موجودی</span>
            <strong>
              <CoinAmount amount={view?.balance ?? profile?.coins ?? 0} size={22} />
            </strong>
            <small>شریف‌کوین · بدون برداشت نقدی</small>
            <button
              type="button"
              className="crash-wallet__sync"
              onClick={() => void salon.refresh()}
              aria-label="تازه‌سازی کیف پول"
              title="تازه‌سازی"
            >
              <RefreshCw size={13} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="crash-mute"
            onClick={toggleMute}
            aria-pressed={muted}
            title={muted ? "روشن کردن صدا" : "قطع صدا"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            {muted ? "صدا خام" : "صدا روشن"}
          </button>
        </aside>
      </header>

      <div className="crash-banner" role="note">
        <ShieldAlert size={16} aria-hidden="true" />
        ۱۸+ · RTP حدود {toFaDigits(100 - HOUSE_EDGE_BPS / 100)}٪ (لبهٔ خانه شفاف ۱٪) · بدون پول واقعی ·
        هر راند مستقل است · نمودار مشترک زنده برای همه
      </div>

      <section className="crash-history-wrap" aria-label="تاریخچه ضرایب">
        <div className="crash-history-head">
          <h2>تاریخچهٔ ضرایب</h2>
          {summary ? (
            <div className="crash-history-stats">
              <span title="بیشترین ضریب اخیر">
                بیشترین <strong>{toFaDigits(formatMultiplier(summary.max))}</strong>
              </span>
              <span title="میانگین ۲۰ راند اخیر">
                میانگین <strong>{(summary.avg / 100).toFixed(2)}×</strong>
              </span>
              <span title="سهم انفجار زیر ۱.۲۰×">
                انفجار زود <strong>{toFaDigits(Math.round(summary.bustRate * 100))}٪</strong>
              </span>
              <span title="سهم ۲× به بالا">
                ۲×+ <strong>{toFaDigits(Math.round(summary.dblRate * 100))}٪</strong>
              </span>
            </div>
          ) : null}
        </div>
        <ol className="crash-history">
          {[...(view?.round.history ?? [])].reverse().map((h, i) => (
            <li
              key={`${h}-${i}`}
              className={h >= 200 ? "is-hot" : h < 130 ? "is-cold" : ""}
            >
              {toFaDigits(formatMultiplier(h))}
            </li>
          ))}
          {(view?.round.history.length ?? 0) === 0 ? (
            <li className="is-empty">هنوز راندی تمام نشده</li>
          ) : null}
        </ol>
        {summary ? (
          <div className="crash-buckets" aria-label="توزیع ضرایب ۲۰ راند اخیر">
            {summary.buckets.map((b) => (
              <div key={b.label} className="crash-bucket">
                <div
                  className="crash-bucket__bar"
                  style={{
                    height: `${Math.max(
                      8,
                      (b.n / Math.max(1, ...summary.buckets.map((x) => x.n))) * 100,
                    )}%`,
                  }}
                  title={`${b.label}: ${b.n}`}
                />
                <span>{b.label}</span>
                <em>{toFaDigits(b.n)}</em>
              </div>
            ))}
          </div>
        ) : null}
      </section>

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
            <span className="crash-hud-round">راند {toFaDigits(view?.round.index ?? 1)}</span>
            <em className={`crash-phase crash-phase--${phase}`}>{PHASE_LABEL[phase]}</em>
            <span className="crash-hud-stat" title="شرط‌های این راند">
              <Users size={13} aria-hidden="true" />
              {toFaDigits(feedBets.length)}
            </span>
            <span className="crash-hud-stat" title="حجم این راند">
              <Activity size={13} aria-hidden="true" />
              {faNum(roundVolume)}
            </span>
            <span className="crash-hud-stat" dir="ltr" ref={elapsedRef} title="زمان پرواز">
              —
            </span>
            {phase === "crashed" ? (
              <span className="crash-hud-stat crash-hud-next">
                <Timer size={13} aria-hidden="true" />
                راند بعدی تا <b dir="ltr" ref={nextRef} />
              </span>
            ) : null}
          </div>

          <div
            className={`crash-mult crash-mult--${phase}${
              shown !== null && shown >= 200 ? " is-hot" : ""
            }${shown !== null && shown >= 1000 ? " is-blaze" : ""}`}
            dir="ltr"
            aria-live="off"
          >
            <span ref={multLabelRef} className="crash-mult__label" />
            <strong
              ref={(el) => {
                multValueRef.current = el;
                if (el && !el.textContent) el.textContent = "1.00×";
              }}
            />
          </div>

          <canvas ref={canvasRef} className="crash-canvas" aria-label="نمودار زندهٔ ضریب انفجار" />

          <div className="crash-legend" aria-hidden="true">
            <span className="crash-legend__item crash-legend__target">خط طلایی = خروج خودکار شما</span>
            <span className="crash-legend__item crash-legend__marker">نقطهٔ سبز = برداشت انجام‌شده</span>
          </div>

          {phase === "flying" && myOpen.length > 0 ? (
            <div className="crash-cash-bar">
              {myOpen.map((bet) => (
                <Button
                  key={bet.id}
                  type="button"
                  size="lg"
                  disabled={salon.busy}
                  onClick={() => void onCash(bet.id)}
                >
                  برداشت شرط {toFaDigits(bet.slot + 1)}
                  {shown !== null ? ` · ${faNum(payoutFor(bet.amount, shown))} sh` : ""}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="crash-docks">
          {([0, 1] as const).map((slot) => {
            const draft = slots[slot];
            if (!draft) return null;
            const bet = view?.round.bets.find((b) => b.isMe && b.slot === slot);
            const canBet = phase === "betting" && !bet;
            const autoHundredths = parseAuto(draft.autoOn, draft.auto);
            const previewMult = autoHundredths ?? shown ?? 200;
            const limits = view?.limits;
            return (
              <div className="crash-dock" key={slot}>
                <header>
                  <span>شرط {toFaDigits(slot + 1)}</span>
                  {bet && bet.cashedAt !== null ? (
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
                    min={limits?.minBet ?? MIN_BET}
                    max={limits?.maxBet ?? MAX_BET}
                    dir="ltr"
                    value={draft.stake}
                    onChange={(e) => patchSlot(slot, { stake: Number(e.target.value) })}
                    onBlur={() =>
                      patchSlot(slot, {
                        stake: clampStake(draft.stake, limits?.minBet ?? MIN_BET, limits?.maxBet ?? MAX_BET),
                      })
                    }
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
                    onClick={() =>
                      patchSlot(slot, {
                        stake: clampStake(
                          Math.floor(draft.stake / 2),
                          limits?.minBet ?? MIN_BET,
                          limits?.maxBet ?? MAX_BET,
                        ),
                      })
                    }
                    title="نصف"
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchSlot(slot, {
                        stake: clampStake(
                          draft.stake * 2,
                          limits?.minBet ?? MIN_BET,
                          limits?.maxBet ?? MAX_BET,
                        ),
                      })
                    }
                    title="دو برابر"
                  >
                    ۲×
                  </button>
                </div>
                <div className="crash-auto-row">
                  <label className="crash-auto">
                    <input
                      type="checkbox"
                      checked={draft.autoOn}
                      onChange={(e) => patchSlot(slot, { autoOn: e.target.checked })}
                    />
                    خروج خودکار
                  </label>
                  <input
                    className="crash-auto-input"
                    dir="ltr"
                    value={draft.auto}
                    disabled={!draft.autoOn}
                    onChange={(e) => patchSlot(slot, { auto: e.target.value })}
                    placeholder="2.00"
                    aria-label="ضریب خروج خودکار"
                  />
                </div>
                <div className="crash-chip-row crash-auto-presets">
                  {AUTO_PRESETS.map((n) => (
                    <button
                      type="button"
                      key={n}
                      className={draft.autoOn && Number(draft.auto) === n ? "is-active" : ""}
                      onClick={() => patchSlot(slot, { autoOn: true, auto: n.toFixed(2) })}
                    >
                      {toFaDigits(n.toFixed(2))}×
                    </button>
                  ))}
                </div>
                <p className="crash-dock__hint">
                  سود پیش‌بینی‌شده در {toFaDigits((previewMult / 100).toFixed(2))}× ⇒{" "}
                  <strong>{faNum(payoutFor(clampStake(draft.stake, limits?.minBet ?? MIN_BET, limits?.maxBet ?? MAX_BET), previewMult))}</strong> sh
                </p>
                {bet && bet.cashedAt === null && phase === "flying" ? (
                  <Button
                    type="button"
                    size="lg"
                    fullWidth
                    loading={salon.busy}
                    onClick={() => void onCash(bet.id)}
                  >
                    برداشت
                    {shown !== null ? ` ${faNum(payoutFor(bet.amount, shown))}` : ""}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    fullWidth
                    disabled={!canBet || salon.busy}
                    onClick={() => void onBet(slot)}
                  >
                    {bet ? "ثبت شد" : "ثبت شرط"}
                  </Button>
                )}
              </div>
            );
          })}

          <section className="crash-session" aria-label="آمار امروز و نشست">
            <h3>
              <Activity size={14} aria-hidden="true" /> آمار
            </h3>
            <dl className="crash-session__grid">
              <div>
                <dt>واریز {view?.mode === "live" ? "امروز" : "نشست"}</dt>
                <dd>
                  <CoinAmount amount={stats?.wagered ?? 0} size={13} />
                </dd>
              </div>
              <div>
                <dt>برداشت {view?.mode === "live" ? "امروز" : "نشست"}</dt>
                <dd>
                  <CoinAmount amount={stats?.paid ?? 0} size={13} />
                </dd>
              </div>
              <div>
                <dt>خالص</dt>
                <dd className={(stats?.pnl ?? 0) >= 0 ? "is-up" : "is-down"}>
                  <CoinAmount amount={stats?.pnl ?? 0} signed size={13} />
                </dd>
              </div>
              <div>
                <dt>بهترین ضریب من</dt>
                <dd className="is-up">
                  {session.bestMult > 0 ? toFaDigits(formatMultiplier(session.bestMult)) : "—"}
                </dd>
              </div>
              <div>
                <dt>برداشت / سوختن</dt>
                <dd>
                  {toFaDigits(session.cashes)} / {toFaDigits(session.busts)}
                </dd>
              </div>
              <div>
                <dt>سود نشست</dt>
                <dd className={session.paid - session.wagered >= 0 ? "is-up" : "is-down"}>
                  <CoinAmount amount={session.paid - session.wagered} signed size={13} />
                </dd>
              </div>
            </dl>
            {stats && stats.lossCap > 0 ? (
              <div className="crash-cap" title="سقف باخت روزانه">
                <div className="crash-cap__row">
                  <span>سقف باخت روزانه</span>
                  <strong>
                    {toFaDigits(stats.lossToday)} / {toFaDigits(stats.lossCap)}
                  </strong>
                </div>
                <div className="crash-cap__track">
                  <div
                    className="crash-cap__fill"
                    style={{
                      width: `${Math.min(100, (stats.lossToday / Math.max(1, stats.lossCap)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
            <p className="crash-keyhint">
              <Keyboard size={13} aria-hidden="true" /> میان‌بر <kbd>Space</kbd> = برداشت / ثبت شرط
            </p>
          </section>
        </div>
      </div>

      <div className="crash-bottom">
        <section className="crash-feed" aria-label="سالن زنده">
          <h2>
            <Users size={15} aria-hidden="true" /> سالن زنده
            <em>{toFaDigits(feedBets.length)} شرط</em>
          </h2>
          {feedBets.length === 0 ? (
            <p className="crash-empty">
              {phase === "betting"
                ? "پنجرهٔ شرط باز است — اولین نفر باش!"
                : "برای این راند شرطی ثبت نشده."}
            </p>
          ) : (
            <ul>
              {feedBets.map((bet) => {
                const guest = bet as ShadowCrowdBet;
                const shadowCashed =
                  guest.shadow === true &&
                  shadowGuestCashed(guest, shown, phase);
                const cashedAt = shadowCashed ? guest.cashTarget : bet.cashedAt;
                const cashedPayout =
                  cashedAt !== null ? payoutFor(bet.amount, cashedAt) : 0;
                return (
                  <li key={bet.id} className={bet.isMe ? "is-me" : ""}>
                    <span className="crash-feed__name">
                      <i aria-hidden="true">{bet.name.slice(0, 1)}</i>
                      {bet.name}
                      {bet.isMe ? <em>(شما)</em> : null}
                    </span>
                    <span className="crash-feed__stake">
                      <CoinAmount amount={bet.amount} size={12} />
                    </span>
                    <span className="crash-feed__auto">
                      {bet.autoAt !== null
                        ? `خودکار ${toFaDigits(formatMultiplier(bet.autoAt))}`
                        : "دستی"}
                    </span>
                    <strong>
                      {cashedAt !== null
                        ? `خروج ${toFaDigits(formatMultiplier(cashedAt))} · +${faNum(cashedPayout)}`
                        : phase === "crashed"
                          ? "باخت"
                          : phase === "flying" && shown !== null
                            ? `در بازی · ${faNum(payoutFor(bet.amount, shown))} sh`
                            : "در بازی"}
                    </strong>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="crash-fair">
          <button type="button" className="crash-fair__toggle" onClick={() => setFairOpen((v) => !v)}>
            <ShieldCheck size={16} aria-hidden="true" />
            تأیید منصفانه (Provably Fair)
            <span className="crash-fair__chev">{fairOpen ? "−" : "+"}</span>
          </button>
          {fairOpen && view ? (
            <div className="crash-fair__body">
              <p>
                نقطهٔ انفجار قبل از قبول شرط با HMAC-SHA256 قفل می‌شود. بعد از راند، بذر فاش می‌شود تا
                همان ضریب را روی دستگاه خودت حساب کنی — و چون نمودار مشترک است، همه دقیقاً همان
                نتیجه را می‌بینند.
              </p>
              <p>
                <span>تعهد (hash)</span>
                <code dir="ltr">{view.round.seedHash}</code>
              </p>
              <p>
                <span>salt</span>
                <code dir="ltr">{view.round.salt}</code>
              </p>
              {view.round.seed && view.round.crashPoint !== null ? (
                <>
                  <p>
                    <span>بذر فاش‌شده</span>
                    <code dir="ltr">{view.round.seed}</code>
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
              {verifiedRows.length > 0 ? (
                <div className="crash-fair__rows">
                  <h4>بررسی راندهای اخیر</h4>
                  <ul>
                    {verifiedRows.map((r) => (
                      <li key={r.seedHash} className={r.ok ? "is-up" : "is-down"}>
                        <span>راند {toFaDigits(r.index)}</span>
                        <b dir="ltr">{toFaDigits(formatMultiplier(r.crashPoint))}</b>
                        <span>{r.ok ? "✓ تأیید شد" : "✗ مغایرت"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
