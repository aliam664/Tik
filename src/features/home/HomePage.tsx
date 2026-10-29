import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Compass,
  Crown,
  KeyRound,
  Layers,
  Lock,
  Plus,
  Radio,
  ShieldCheck,
  ShoppingBag,
  Swords,
  Terminal,
  Trophy,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ShCoin } from "@/components/ui/Coin";
import { DesignerBadge } from "@/components/layout/PageShell";
import { useToast } from "@/components/ui/Toast";
import { GameIcon } from "@/games/GameIcon";
import {
  DESIGNER_CREDIT,
  PLATFORM_GAMES,
  getActiveGames,
  type PlatformGame,
} from "@/games/registry";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { api } from "@/lib/api";
import { toFaDigits } from "@/lib/format";
import { normalizeRoomCode } from "@/lib/session";
import type { PublicStatus } from "@/types/room";
import { GameMicroVisual } from "./GameMicroVisuals";
import { HeroTacticalBoard } from "./HeroTacticalBoard";

/* ------------------------------------------------------------------ */
/* Static architectural specifications                                 */
/* ------------------------------------------------------------------ */

type CatalogFilter = "all" | "strategy" | "realtime" | "salon";

const CATALOG_FILTERS: readonly { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "همهٔ میدان‌ها" },
  { id: "strategy", label: "فکری و استنتاجی" },
  { id: "realtime", label: "بلادرنگ ۶۰FPS" },
  { id: "salon", label: "همکاری و سالن زنده" },
];

function matchesCatalogFilter(game: PlatformGame, filter: CatalogFilter): boolean {
  if (filter === "all") return true;
  if (filter === "strategy") {
    return game.id === "doz" || game.id === "word_cipher" || game.id === "code_breaker";
  }
  if (filter === "realtime") {
    return game.frameRate === 60 || game.id === "code_breaker";
  }
  return game.id === "last_night" || game.id === "sheriff_blast";
}

const MARQUEE_SPECS: readonly { en: string; fa: string }[] = [
  { en: "SERVER-AUTHORITATIVE", fa: "داوری ۱۰۰٪ سمت سرور" },
  { en: "HMAC-SHA256 FAIRNESS", fa: "تأیید رمزنگاری منصفانه" },
  { en: "60 FPS CANVAS 2D", fa: "موتور گرافیکی ۶۰ فریم" },
  { en: "ZERO-SIGNUP ACCESS", fa: "ورود آنی بدون ثبت‌نام" },
  { en: "SHERIFF COIN WALLET", fa: "کیف‌پول یکپارچه شریف‌کوین" },
  { en: "ATOMIC RACE LOCK", fa: "قفل اتمیک ضدتقلب" },
  { en: "ELO TIER LADDER", fa: "۶ تیر رقابتی استاندارد" },
];

const LAUNCH_STEPS = [
  {
    num: "01",
    code: "SELECT // INIT",
    title: "میدان نبرد را انتخاب کن",
    text: "از دوز کلاسیک و رمزگشای ۴ رقمی تا بقای دونفرهٔ Last Night و سالن زندهٔ انفجار — همه با یک هویت یکپارچه روی مرورگرت آماده‌اند.",
  },
  {
    num: "02",
    code: "PAIR // 6-CHAR KEY",
    title: "کد ۶ نویسه‌ای بفرست یا وارد صف شو",
    text: "کد اختصاصی میز را برای دوستت بفرست تا بی‌درنگ بنشیند، یا مستقیم وارد صف هم‌تیر شو تا حریف آماده مقابلت قرار بگیرد.",
  },
  {
    num: "03",
    code: "VERIFY // SETTLE",
    title: "داوری اتمیک و تسویهٔ آنی سکه",
    text: "هر حرکت، تایمر و ضریب روی سرور مرکزی امضا می‌شود؛ امتیاز Elo و جایزهٔ شریف‌کوین بلافاصله در پرونده‌ات می‌نشیند.",
  },
] as const;

interface TierSpec {
  id: string;
  tier: string;
  tierEn: string;
  range: string;
  divisions: string;
  kFactor: string;
  kNote: string;
  stakeNum: number;
  stakeCeiling: string;
  gaugePct: number;
  color: string;
}

const TIER_SPECS: readonly TierSpec[] = [
  {
    id: "bronze",
    tier: "برنز",
    tierEn: "BRONZE",
    range: "زیر ۱۰۰۰",
    divisions: "IV → I",
    kFactor: "K = ۳۲",
    kNote: "شتاب صعود بالا برای جهش سریع از رده‌های پایه",
    stakeNum: 25,
    stakeCeiling: "۲۵ sh",
    gaugePct: 18,
    color: "#cd7f32",
  },
  {
    id: "silver",
    tier: "نقره",
    tierEn: "SILVER",
    range: "۱۰۰۰ – ۱۱۹۹",
    divisions: "IV → I",
    kFactor: "K = ۳۲",
    kNote: "نوسان استاندارد برای تثبیت مهارت تاکتیکی",
    stakeNum: 50,
    stakeCeiling: "۵۰ sh",
    gaugePct: 34,
    color: "#b8c0cc",
  },
  {
    id: "gold",
    tier: "طلا",
    tierEn: "GOLD",
    range: "۱۲۰۰ – ۱۳۹۹",
    divisions: "IV → I",
    kFactor: "K = ۲۴",
    kNote: "تعادل دقیق ریسک و پاداش در میانهٔ جدول رقابتی",
    stakeNum: 50,
    stakeCeiling: "۵۰ sh",
    gaugePct: 52,
    color: "#e5a93c",
  },
  {
    id: "platinum",
    tier: "پلاتین",
    tierEn: "PLATINUM",
    range: "۱۴۰۰ – ۱۵۹۹",
    divisions: "IV → I",
    kFactor: "K = ۲۴",
    kNote: "سقف کامل شرط‌بندی باز می‌شود؛ نبردهای دقیق و کم‌خطا",
    stakeNum: 100,
    stakeCeiling: "۱۰۰ sh",
    gaugePct: 70,
    color: "#4dd0c4",
  },
  {
    id: "diamond",
    tier: "الماس",
    tierEn: "DIAMOND",
    range: "۱۶۰۰ – ۱۷۹۹",
    divisions: "IV → I",
    kFactor: "K = ۱۶",
    kNote: "ضریب K فشرده برای محافظت از امتیاز نخبگان",
    stakeNum: 100,
    stakeCeiling: "۱۰۰ sh",
    gaugePct: 86,
    color: "#8f7bff",
  },
  {
    id: "master",
    tier: "استاد",
    tierEn: "MASTER",
    range: "۱۸۰۰+",
    divisions: "بدون زیربخش",
    kFactor: "K = ۱۶",
    kNote: "بالاترین سطح پلتفرم — رقابت مستقیم روی جدول برترین‌ها",
    stakeNum: 100,
    stakeCeiling: "۱۰۰ sh",
    gaugePct: 100,
    color: "#ffdf6e",
  },
];

const QUICK_PORTALS = [
  {
    to: "/leaderboard",
    title: "تالار افتخارات",
    sub: "رتبه‌بندی زندهٔ Elo و رکوردداران",
    code: "RANK // TOP",
    icon: <Trophy size={18} aria-hidden="true" />,
  },
  {
    to: "/shop",
    title: "خزانه و فروشگاه",
    sub: "آیتم‌ها، ارتقاها و شریف‌کوین",
    code: "VAULT // SH",
    icon: <ShoppingBag size={18} aria-hidden="true" />,
  },
  {
    to: "/profile",
    title: "پروندهٔ بازیکن",
    sub: "کارنامهٔ برد، تیر فعلی و تاریخچه",
    code: "ID // DOSSIER",
    icon: <User size={18} aria-hidden="true" />,
  },
  {
    to: "/rules",
    title: "مستندات و قوانین",
    sub: "مکانیک دقیق هر ۵ بازی و فرمول Elo",
    code: "SPEC // RULES",
    icon: <Compass size={18} aria-hidden="true" />,
  },
] as const;

/* ------------------------------------------------------------------ */
/* Purposeful motion hooks (progressive, reduced-motion safe)          */
/* ------------------------------------------------------------------ */

function useAnimatedCount(target: number | null, durationMs = 620): number | null {
  const [display, setDisplay] = useState<number | null>(target);
  const currentRef = useRef<number>(target ?? 0);

  useEffect(() => {
    if (target === null) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      currentRef.current = target;
      setDisplay(target);
      return;
    }

    const from = currentRef.current;
    const delta = target - from;
    if (delta === 0) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(from + delta * eased);
      currentRef.current = val;
      setDisplay(val);
      if (t < 1) {
        raf = window.requestAnimationFrame(step);
      }
    };

    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

function useScrollReveal(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!targets.length) return;

    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.setAttribute("data-revealed", "true"));
      return;
    }

    document.documentElement.classList.add("hp-motion-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "true");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -32px 0px" },
    );

    for (const el of targets) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [rootRef]);
}

/* ------------------------------------------------------------------ */
/* Geometric SVG Crest for Ranked Tiers                                */
/* ------------------------------------------------------------------ */

function TierCrest({ tierId, color }: { tierId: string; color: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      width={28}
      height={28}
      className="hp-crest"
      style={{ "--crest-color": color } as CSSProperties}
      aria-hidden="true"
    >
      <polygon
        points="18,2 32,10 32,26 18,34 4,26 4,10"
        fill="rgba(9, 11, 16, 0.85)"
        stroke={color}
        strokeWidth="1.6"
      />
      {tierId === "master" || tierId === "diamond" ? (
        <polygon points="18,8 26,18 18,28 10,18" fill={color} fillOpacity="0.88" />
      ) : tierId === "platinum" || tierId === "gold" ? (
        <>
          <polygon points="18,8 25,22 11,22" fill={color} fillOpacity="0.85" />
          <circle cx="18" cy="25" r="2.2" fill={color} />
        </>
      ) : (
        <circle cx="18" cy="18" r="5.5" fill={color} fillOpacity="0.8" />
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Main Page                                                           */
/* ------------------------------------------------------------------ */

export function HomePage() {
  useDocumentTitle("دوز آنلاین | DOZ ONLINE — میدان نبرد بازی‌های دونفره");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const pageRef = useRef<HTMLDivElement | null>(null);

  useScrollReveal(pageRef);

  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [pingBars, setPingBars] = useState<readonly number[]>([38, 44, 34, 42, 36, 40, 35, 38]);

  const [quickCode, setQuickCode] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");
  const [selectedTierIdx, setSelectedTierIdx] = useState<number>(2); // Gold default focal point

  /* ---------------- Live Server Telemetry Polling ---------------- */
  useEffect(() => {
    let alive = true;
    const poll = () => {
      const t0 = performance.now();
      api
        .getPublicStatus()
        .then((s) => {
          if (!alive) return;
          const rtt = Math.max(8, Math.round(performance.now() - t0));
          setStatus(s);
          setStatusFailed(false);
          setLatencyMs(rtt);
          setPingBars((prev) => [...prev.slice(-7), Math.min(100, Math.max(18, rtt))]);
        })
        .catch(() => {
          if (alive) setStatusFailed(true);
        });
    };
    poll();
    const id = window.setInterval(poll, 8000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const animatedRooms = useAnimatedCount(status ? status.active_rooms : null);
  const animatedTotalGames = useAnimatedCount(status ? status.games_played_total : null);
  const activeGamesCount = getActiveGames().length;

  const filteredGames = useMemo(
    () => PLATFORM_GAMES.filter((g) => matchesCatalogFilter(g, catalogFilter)),
    [catalogFilter],
  );

  const activeTier = TIER_SPECS[selectedTierIdx] ?? TIER_SPECS[2];

  /* ---------------- Navigation & Quick-Join Handlers ---------------- */
  const goCreate = () => {
    if (status?.maintenance_mode) {
      showToast(status.maintenance_message || "سرویس موقتاً در حال نگهداری است.", "error");
      return;
    }
    navigate("/create");
  };

  const handleQuickJoin = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = quickCode.trim();
    if (!trimmed) {
      navigate("/join");
      return;
    }
    const normalized = normalizeRoomCode(trimmed);
    if (!normalized || normalized.length < 4) {
      showToast("کد اتاق ۶ نویسه‌ای را کامل وارد کن (مثلاً K7QM2P).", "error");
      return;
    }
    navigate(`/join?code=${encodeURIComponent(normalized)}`);
  };

  const handleCardSpotlight = (e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    el.style.setProperty("--spot-x", `${(e.clientX - rect.left).toFixed(0)}px`);
    el.style.setProperty("--spot-y", `${(e.clientY - rect.top).toFixed(0)}px`);
  };

  return (
    <div className="hp-root" ref={pageRef}>
      {/* Subtle architectural carbon backdrop (grid + warm brass horizon, zero purple orbs) */}
      <div className="hp-atmosphere" aria-hidden="true">
        <div className="hp-atmosphere__grid" />
        <div className="hp-atmosphere__horizon" />
      </div>

      <div className="hp-container">
        {/* ================================================================ */}
        {/* 00 // LIVE SERVER TELEMETRY & OSCILLOSCOPE                       */}
        {/* ================================================================ */}
        <aside className="hp-telemetry" aria-label="وضعیت زنده سرور">
          <div className="hp-telemetry__status">
            {status ? (
              status.maintenance_mode ? (
                <>
                  <span className="hp-radar hp-radar--warn" aria-hidden="true" />
                  <span>حالت نگهداری</span>
                </>
              ) : (
                <>
                  <span className="hp-radar hp-radar--ok" aria-hidden="true" />
                  <span>هستهٔ سرور فعال</span>
                </>
              )
            ) : statusFailed ? (
              <>
                <span className="hp-radar hp-radar--dead" aria-hidden="true" />
                <span>آفلاین / حالت محلی</span>
              </>
            ) : (
              <>
                <span className="hp-radar hp-radar--sync" aria-hidden="true" />
                <span>همگام‌سازی…</span>
              </>
            )}
          </div>

          <div className="hp-telemetry__metrics">
            <span className="hp-metric">
              <span className="hp-metric__label">اتاق زنده</span>
              <strong className="hp-metric__val">
                {animatedRooms !== null ? toFaDigits(animatedRooms) : "—"}
              </strong>
            </span>

            <span className="hp-telemetry__div" aria-hidden="true" />

            <span className="hp-metric">
              <span className="hp-metric__label">نبردهای ثبت‌شده</span>
              <strong className="hp-metric__val">
                {animatedTotalGames !== null ? toFaDigits(animatedTotalGames) : "—"}
              </strong>
            </span>

            <span className="hp-telemetry__div" aria-hidden="true" />

            <span className="hp-metric hp-metric--ping">
              <span className="hp-metric__label">تأخیر</span>
              <strong className="hp-metric__val ltr">
                {latencyMs !== null ? `${latencyMs} ms` : "—"}
              </strong>
              <span className="hp-sparkline" aria-hidden="true">
                {pingBars.map((val, i) => (
                  <i
                    key={i}
                    style={{ height: `${Math.max(22, Math.min(100, Math.round(110 - val * 0.6)))}%` }}
                  />
                ))}
              </span>
            </span>

            <span className="hp-telemetry__div hp-hide-sm" aria-hidden="true" />

            <span className="hp-metric hp-hide-sm">
              <span className="hp-metric__label">ساعت سرور</span>
              <strong className="hp-metric__val ltr">{status?.server_now ?? "SYNC"}</strong>
            </span>
          </div>
        </aside>

        {/* ================================================================ */}
        {/* 01 // ASYMMETRIC EDITORIAL HERO + LIVE TACTICAL DECK             */}
        {/* ================================================================ */}
        <section className="hp-hero" aria-label="معرفی پلتفرم دوز آنلاین">
          <div className="hp-hero__editorial">
            <div className="hp-eyebrow hp-enter hp-enter--1">
              <span className="hp-eyebrow__code ltr">01 // COMMAND ARENA</span>
              <span className="hp-eyebrow__sep" aria-hidden="true" />
              <span className="hp-eyebrow__text">بدون ثبت‌نام · ورود در چند ثانیه</span>
            </div>

            <h1 className="hp-headline hp-enter hp-enter--2">
              <span className="hp-headline__line">پنج میدان نبرد زنده،</span>
              <span className="hp-headline__line">
                روی یک{" "}
                <span className="hp-headline__accent">
                  میزِ ضدتقلب
                  <svg
                    viewBox="0 0 260 12"
                    preserveAspectRatio="none"
                    className="hp-headline__underline"
                    aria-hidden="true"
                  >
                    <path
                      d="M 3 9 Q 130 2, 257 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      pathLength={100}
                    />
                  </svg>
                </span>
              </span>
            </h1>

            <p className="hp-lead hp-enter hp-enter--3">
              اتاق خصوصی بساز، کد ۶ رقمی را برای دوستت بفرست یا مستقیم وارد صف رقابتی شو. از دوز کلاسیک،
              رازواژه و رمزگشا تا بقای دونفرهٔ Last Night و سالن زندهٔ انفجار — هر حرکت روی سرور مرکزی امضا
              می‌شود.
            </p>

            {/* Primary CTA Row */}
            <div className="hp-cta-row hp-enter hp-enter--4">
              <Button
                size="lg"
                className="hp-btn-sheen"
                icon={<Swords size={18} aria-hidden="true" />}
                onClick={() => navigate("/play")}
              >
                شروع رقابت آنلاین
              </Button>
              <Button
                size="lg"
                variant="secondary"
                icon={<Plus size={18} aria-hidden="true" />}
                onClick={goCreate}
              >
                ساخت اتاق دوستانه
              </Button>
              <Link to="/games/blast" className="hp-salon-pill">
                <Radio size={14} aria-hidden="true" />
                <span>سالن زندهٔ انفجار</span>
                <ArrowLeft size={14} aria-hidden="true" />
              </Link>
            </div>

            {/* Inline Quick-Join Room Terminal */}
            <form
              className="hp-terminal hp-enter hp-enter--5"
              onSubmit={handleQuickJoin}
              aria-label="ورود سریع با کد اتاق"
            >
              <label htmlFor="hp-quick-room-code" className="hp-terminal__label">
                <KeyRound size={15} aria-hidden="true" />
                <span>کد دعوت داری؟</span>
              </label>
              <input
                id="hp-quick-room-code"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={6}
                placeholder="K7QM2P"
                value={quickCode}
                onChange={(e) =>
                  setQuickCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z2-9]/g, "")
                      .slice(0, 6),
                  )
                }
                className="hp-terminal__input ltr"
                aria-label="کد ۶ نویسه‌ای اتاق"
              />
              <button type="submit" className="hp-terminal__submit">
                <span>ورود به میز</span>
                <ArrowLeft size={15} aria-hidden="true" />
              </button>
            </form>

            {/* Concrete Platform Proof Strip */}
            <div className="hp-proof-strip hp-enter hp-enter--6" aria-label="مشخصات کلیدی پلتفرم">
              <div className="hp-proof-item">
                <span className="hp-proof-item__num">{toFaDigits(activeGamesCount)}</span>
                <span className="hp-proof-item__txt">بازی آنلاین فعال</span>
              </div>
              <div className="hp-proof-item">
                <ShCoin size={18} />
                <span className="hp-proof-item__txt">اقتصاد واحد شریف‌کوین</span>
              </div>
              <div className="hp-proof-item">
                <Lock size={15} aria-hidden="true" />
                <span className="hp-proof-item__txt">بدون رمز و ثبت‌نام</span>
              </div>
              <div className="hp-proof-item" aria-live="polite">
                <span
                  className={`hp-proof-dot ${
                    status && !status.maintenance_mode
                      ? "hp-proof-dot--ok"
                      : statusFailed
                        ? "hp-proof-dot--off"
                        : ""
                  }`}
                  aria-hidden="true"
                />
                <span className="hp-proof-item__txt">
                  {status
                    ? status.maintenance_mode
                      ? "در حال نگهداری"
                      : "سرور آنلاین"
                    : statusFailed
                      ? "وضعیت نامشخص"
                      : "بررسی اتصال…"}
                </span>
              </div>
            </div>
          </div>

          <div className="hp-hero__stage hp-enter hp-enter--3">
            <HeroTacticalBoard />
          </div>
        </section>
      </div>

      {/* ================================================================ */}
      {/* FULL-BLEED KINETIC SPECS MARQUEE                                  */}
      {/* ================================================================ */}
      <div className="hp-marquee" aria-label="تکنولوژی‌ها و ویژگی‌های زیرساخت">
        <div className="hp-marquee__track">
          {[0, 1].map((copy) => (
            <div
              className="hp-marquee__group"
              key={copy}
              aria-hidden={copy === 1 ? "true" : undefined}
            >
              {MARQUEE_SPECS.map((item) => (
                <span className="hp-marquee__item" key={`${copy}-${item.en}`}>
                  <i className="hp-marquee__diamond" aria-hidden="true">◆</i>
                  <strong className="ltr">{item.en}</strong>
                  <span>{item.fa}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="hp-container">
        {/* ================================================================ */}
        {/* 02 // INTERACTIVE GAME ARCHIVE & ASYMMETRIC BENTO CATALOG        */}
        {/* ================================================================ */}
        <section className="hp-section" data-reveal aria-label="کاتالوگ بازی‌های پلتفرم">
          <header className="hp-sec-head">
            <div>
              <span className="hp-sec-head__index ltr">02 // MULTI-GAME ARCHIVE</span>
              <h2 className="hp-sec-head__title">انتخاب میدان نبرد</h2>
            </div>

            <div className="hp-filter-bar" role="tablist" aria-label="فیلتر سبک بازی‌ها">
              {CATALOG_FILTERS.map((f) => {
                const active = catalogFilter === f.id;
                const count = PLATFORM_GAMES.filter((g) => matchesCatalogFilter(g, f.id)).length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`hp-filter-tab ${active ? "hp-filter-tab--active" : ""}`}
                    onClick={() => setCatalogFilter(f.id)}
                  >
                    <span>{f.label}</span>
                    <small>{toFaDigits(count)}</small>
                  </button>
                );
              })}
            </div>
          </header>

          <div
            className={`hp-bento ${catalogFilter !== "all" ? "hp-bento--filtered" : ""}`}
          >
            {filteredGames.map((game, idx) => {
              const targetHref = game.route === "/" ? "/play" : game.route;
              const isFlagshipWide = catalogFilter === "all" && game.id === "last_night";
              const isFlagshipSide = catalogFilter === "all" && game.id === "sheriff_blast";

              return (
                <article
                  key={game.id}
                  onPointerMove={handleCardSpotlight}
                  style={
                    {
                      "--game-accent": game.accent,
                      "--stagger-i": idx,
                    } as CSSProperties
                  }
                  className={[
                    "hp-game-card",
                    isFlagshipWide ? "hp-game-card--span-7" : "",
                    isFlagshipSide ? "hp-game-card--span-5" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* Bespoke live micro-schematic per game */}
                  <GameMicroVisual gameId={game.id} bannerUrl={game.bannerUrl} />

                  <div className="hp-game-card__body">
                    <div className="hp-game-card__meta">
                      <span className="hp-game-card__serial ltr">
                        {String(idx + 1).padStart(2, "0")} // {game.genre}
                      </span>
                      <span
                        className={`hp-game-card__badge ${
                          game.status === "live" ? "hp-game-card__badge--live" : ""
                        }`}
                      >
                        <i aria-hidden="true" />
                        {game.status === "live"
                          ? "آماده بازی"
                          : game.status === "beta"
                            ? "بتا"
                            : "به‌زودی"}
                      </span>
                    </div>

                    <div className="hp-game-card__title-row">
                      <span className="hp-game-card__icon">
                        <GameIcon icon={game.icon} size={20} />
                      </span>
                      <div>
                        <h3 className="hp-game-card__title">{game.title}</h3>
                        <span className="hp-game-card__en ltr">{game.titleEn}</span>
                      </div>
                    </div>

                    <p className="hp-game-card__desc">{game.tagline}</p>

                    <div className="hp-game-card__chips">
                      <span className="hp-spec-chip">{game.players}</span>
                      {game.frameRate ? (
                        <span className="hp-spec-chip ltr">{game.frameRate} FPS</span>
                      ) : null}
                      {game.features.slice(0, 2).map((feat) => (
                        <span className="hp-spec-chip" key={feat}>
                          {feat}
                        </span>
                      ))}
                    </div>

                    <div className="hp-game-card__foot">
                      {game.engine ? (
                        <span className="hp-game-card__engine ltr">
                          <Terminal size={12} aria-hidden="true" />
                          {game.engine}
                        </span>
                      ) : (
                        <span />
                      )}

                      {game.status === "live" || game.status === "beta" ? (
                        <Link to={targetHref} className="hp-game-card__cta">
                          <span>ورود به بازی</span>
                          <ArrowLeft size={15} aria-hidden="true" />
                        </Link>
                      ) : (
                        <span className="hp-spec-chip">به‌زودی</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ================================================================ */}
        {/* 03 // 10-SECOND OPERATIONAL LAUNCH BLUEPRINT                     */}
        {/* ================================================================ */}
        <section className="hp-section" data-reveal aria-label="مراحل شروع بازی">
          <header className="hp-sec-head">
            <div>
              <span className="hp-sec-head__index ltr">03 // ZERO-FRICTION FLOW</span>
              <h2 className="hp-sec-head__title">از کلیک تا نبرد در ۱۰ ثانیه</h2>
            </div>
            <p className="hp-sec-head__note">
              بدون فرم ثبت‌نام، بدون ایمیل و بدون نصب — معماری اتصال مستقیم با توکن مرورگر
            </p>
          </header>

          <div className="hp-blueprint">
            {/* Animated circuit connector line across desktop columns */}
            <svg
              viewBox="0 0 900 18"
              preserveAspectRatio="none"
              className="hp-blueprint__wire"
              aria-hidden="true"
            >
              <line x1="880" y1="9" x2="20" y2="9" className="hp-blueprint__rail" />
              <line
                x1="880"
                y1="9"
                x2="20"
                y2="9"
                pathLength={100}
                className="hp-blueprint__pulse"
              />
            </svg>

            <div className="hp-blueprint__grid">
              {LAUNCH_STEPS.map((step) => (
                <article className="hp-step" key={step.num}>
                  <div className="hp-step__head">
                    <span className="hp-step__num ltr">{step.num}</span>
                    <span className="hp-step__code ltr">{step.code}</span>
                  </div>
                  <h3 className="hp-step__title">{step.title}</h3>
                  <p className="hp-step__text">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 04 // INTERACTIVE COMPETITIVE ELO & STAKE CALIBRATOR             */}
        {/* ================================================================ */}
        <section className="hp-section" data-reveal aria-label="تیرهای رقابتی و سقف شرط‌بندی">
          <header className="hp-sec-head">
            <div>
              <span className="hp-sec-head__index ltr">04 // ELO &amp; STAKES CALIBRATION</span>
              <h2 className="hp-sec-head__title">تیرهای رقابتی و سقف شریف‌کوین</h2>
            </div>
            <p className="hp-sec-head__note">
              روی هر تیر کلیک کن تا ضریب K، زیربخش‌ها و بانک شرط دونفره را زنده ببینی
            </p>
          </header>

          {/* Interactive Tier Selector Pills */}
          <div className="hp-tier-rail" role="tablist" aria-label="انتخاب تیر رقابتی">
            {TIER_SPECS.map((t, idx) => {
              const selected = idx === selectedTierIdx;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setSelectedTierIdx(idx)}
                  style={{ "--tier-c": t.color } as CSSProperties}
                  className={`hp-tier-pill ${selected ? "hp-tier-pill--active" : ""}`}
                >
                  <TierCrest tierId={t.id} color={t.color} />
                  <span className="hp-tier-pill__info">
                    <strong>{t.tier}</strong>
                    <small className="ltr">{t.range}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hp-tier-layout">
            {/* Live Calibration Console */}
            <div
              className="hp-calibrator"
              style={{ "--tier-c": activeTier.color } as CSSProperties}
              aria-live="polite"
            >
              <div className="hp-calibrator__head">
                <div className="hp-calibrator__badge">
                  <TierCrest tierId={activeTier.id} color={activeTier.color} />
                  <div>
                    <span className="hp-calibrator__en ltr">{activeTier.tierEn} TIER</span>
                    <h3 className="hp-calibrator__name">تیر {activeTier.tier}</h3>
                  </div>
                </div>
                <span className="hp-calibrator__k ltr">{activeTier.kFactor}</span>
              </div>

              {/* Animated Elo Gauge */}
              <div className="hp-gauge">
                <div className="hp-gauge__labels">
                  <span>بازهٔ Elo: <strong>{activeTier.range}</strong></span>
                  <span>زیربخش‌ها: <strong>{activeTier.divisions}</strong></span>
                </div>
                <div className="hp-gauge__track" aria-hidden="true">
                  <div
                    className="hp-gauge__fill"
                    style={{ width: `${activeTier.gaugePct}%` }}
                  />
                </div>
                <p className="hp-gauge__note">{activeTier.kNote}</p>
              </div>

              {/* 2-Player Stake Pot Simulation */}
              <div className="hp-pot-box">
                <div className="hp-pot-box__col">
                  <span className="hp-pot-box__lbl">سقف ورودی هر بازیکن</span>
                  <strong className="hp-pot-box__val">
                    <ShCoin size={18} />
                    <span>{toFaDigits(activeTier.stakeNum)} sh</span>
                  </strong>
                </div>
                <span className="hp-pot-box__mul" aria-hidden="true">× ۲</span>
                <div className="hp-pot-box__col hp-pot-box__col--pot">
                  <span className="hp-pot-box__lbl">حداکثر بانک میز برنده</span>
                  <strong className="hp-pot-box__val hp-pot-box__val--gold">
                    <Crown size={16} aria-hidden="true" />
                    <span>{toFaDigits(activeTier.stakeNum * 2)} sh</span>
                  </strong>
                </div>
              </div>
            </div>

            {/* Complete 6-Tier Specification Table */}
            <div className="hp-table-card">
              <table className="hp-tier-table">
                <thead>
                  <tr>
                    <th scope="col">تیر</th>
                    <th scope="col">بازهٔ امتیاز (Elo)</th>
                    <th scope="col">زیربخش</th>
                    <th scope="col">ضریب K</th>
                    <th scope="col">سقف شرط</th>
                  </tr>
                </thead>
                <tbody>
                  {TIER_SPECS.map((row, idx) => {
                    const isSelected = idx === selectedTierIdx;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedTierIdx(idx)}
                        className={isSelected ? "hp-tier-row--active" : ""}
                        style={{ "--tier-c": row.color } as CSSProperties}
                      >
                        <td>
                          <span className="hp-tier-cell">
                            <i className="hp-tier-cell__dot" aria-hidden="true" />
                            <strong>{row.tier}</strong>
                          </span>
                        </td>
                        <td className="ltr">{row.range}</td>
                        <td>{row.divisions}</td>
                        <td className="ltr hp-mono">{row.kFactor}</td>
                        <td>
                          <span className="hp-stake-cell">
                            <ShCoin size={14} />
                            <strong>{row.stakeCeiling}</strong>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="hp-table-foot">
                <ShieldCheck size={14} aria-hidden="true" />
                صف مچ‌میکینگ همیشه شما را مقابل حریف هم‌بازه قرار می‌دهد تا رقابت منصفانه بماند.
              </p>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 05 // QUICK PORTALS, SECURITY ARCHITECTURE & DESIGNER COLOPHON   */}
        {/* ================================================================ */}
        <section className="hp-section hp-section--last" data-reveal aria-label="دسترسی سریع و امنیت">
          <div className="hp-portals" aria-label="بخش‌های پلتفرم">
            {QUICK_PORTALS.map((p) => (
              <Link to={p.to} key={p.to} className="hp-portal-card">
                <div className="hp-portal-card__top">
                  <span className="hp-portal-card__icon">{p.icon}</span>
                  <span className="hp-portal-card__code ltr">{p.code}</span>
                </div>
                <h3 className="hp-portal-card__title">{p.title}</h3>
                <p className="hp-portal-card__sub">{p.sub}</p>
                <span className="hp-portal-card__go" aria-hidden="true">
                  <span>مشاهده</span>
                  <ArrowLeft size={14} />
                </span>
              </Link>
            ))}
          </div>

          <div className="hp-colophon">
            <div className="hp-colophon__item">
              <Activity size={18} className="hp-colophon__ico" aria-hidden="true" />
              <div>
                <h3 className="hp-colophon__title">داوری اتمیک سمت سرور</h3>
                <p className="hp-colophon__text">
                  هیچ برد، مساوی یا ضریبی روی مرورگر محاسبه نمی‌شود؛ تمام منطق بازی‌ها روی PostgreSQL و
                  موتور سرور اعتبارسنجی می‌گردد.
                </p>
              </div>
            </div>

            <div className="hp-colophon__item">
              <Layers size={18} className="hp-colophon__ico" aria-hidden="true" />
              <div>
                <h3 className="hp-colophon__title">هویت بدون رمز و ردپا</h3>
                <p className="hp-colophon__text">
                  توکن رمزنگاری‌شده فقط روی دستگاه خودت ذخیره می‌شود؛ بدون نیاز به شماره یا ایمیل.{" "}
                  <Link className="link" to="/privacy">
                    حریم خصوصی
                  </Link>
                </p>
              </div>
            </div>

            <div className="hp-colophon__item hp-colophon__item--sig">
              <div>
                <span className="hp-colophon__tag ltr">CARBON &amp; BRUSHED GOLD SYSTEM</span>
                <h3 className="hp-colophon__title">زبان طراحی کربن و طلای برس‌خورده</h3>
                <p className="hp-colophon__text">{DESIGNER_CREDIT}</p>
              </div>
              <DesignerBadge size="lg" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
