import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Gamepad2,
  Grid3X3,
  LogIn,
  Plus,
  ShieldCheck,
  Swords,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ShCoin } from "@/components/ui/Coin";
import { DesignerBadge } from "@/components/layout/PageShell";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { api } from "@/lib/api";
import { toFaDigits } from "@/lib/format";
import { GameIcon } from "@/games/GameIcon";
import {
  DESIGNER_CREDIT,
  PLATFORM_GAMES,
  getActiveGames,
} from "@/games/registry";
import type { PublicStatus } from "@/types/room";

/* ------------------------------------------------------------------ */
/* Static content                                                      */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    icon: <Plus size={20} aria-hidden="true" />,
    title: "اتاق بساز",
    text: "یک نام نمایشی انتخاب کن و با یک کلید اتاق اختصاصی خودت را بساز.",
  },
  {
    icon: <Users size={20} aria-hidden="true" />,
    title: "دوستت را دعوت کن",
    text: "کد ۶ نویسه‌ای اتاق را برایش بفرست؛ بدون ثبت‌نام وارد می‌شود.",
  },
  {
    icon: <Swords size={20} aria-hidden="true" />,
    title: "زنده بازی کن",
    text: "حرکت‌ها هر دو دستگاه همزمان دیده می‌شوند؛ برد و مساوی روی سرور محاسبه می‌شود.",
  },
];

/** 3×3 schematic matrix cells, row-major A1..C3. */
const MATRIX_CELLS = [
  "A1", "A2", "A3",
  "B1", "B2", "B3",
  "C1", "C2", "C3",
] as const;

/** Tactical demo state: X takes the diagonal, O answers, A2 is scanning. */
const MATRIX_MARKS: Record<string, "x" | "o"> = {
  A1: "x",
  B2: "x",
  C3: "x",
  A3: "o",
  C1: "o",
};

const TIER_TABLE: {
  tier: string;
  range: string;
  divisions: string;
  kFactor: string;
  stakeCeiling: string;
  color: string;
}[] = [
  { tier: "برنز", range: "زیر ۱۰۰۰", divisions: "IV → I", kFactor: "K = ۳۲", stakeCeiling: "۲۵ sh", color: "#cd7f32" },
  { tier: "نقره", range: "۱۰۰۰ – ۱۱۹۹", divisions: "IV → I", kFactor: "K = ۳۲", stakeCeiling: "۵۰ sh", color: "#b8c0cc" },
  { tier: "طلا", range: "۱۲۰۰ – ۱۳۹۹", divisions: "IV → I", kFactor: "K = ۲۴", stakeCeiling: "۵۰ sh", color: "#e5a93c" },
  { tier: "پلاتین", range: "۱۴۰۰ – ۱۵۹۹", divisions: "IV → I", kFactor: "K = ۲۴", stakeCeiling: "۱۰۰ sh", color: "#4dd0c4" },
  { tier: "الماس", range: "۱۶۰۰ – ۱۷۹۹", divisions: "IV → I", kFactor: "K = ۱۶", stakeCeiling: "۱۰۰ sh", color: "#8f7bff" },
  { tier: "استاد", range: "۱۸۰۰+", divisions: "بدون زیربخش", kFactor: "K = ۱۶", stakeCeiling: "۱۰۰ sh", color: "#ffdf6e" },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function HomePage() {
  useDocumentTitle("دوز آنلاین | DOZ ONLINE");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = () => {
      const t0 = performance.now();
      api
        .getPublicStatus()
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          setStatusFailed(false);
          setLatencyMs(Math.round(performance.now() - t0));
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

  const goCreate = () => {
    if (status?.maintenance_mode) {
      showToast(status.maintenance_message || "سرویس موقتاً در حال نگهداری است.", "error");
      return;
    }
    navigate("/create");
  };

  return (
    <div className="page">
      {/* --------------------- Live server telemetry --------------------- */}
      <div className="telemetry-bar" aria-label="وضعیت زنده سرور">
        <span className="telemetry-bar__item">
          {status ? (
            status.maintenance_mode ? (
              <>
                <span className="telemetry-bar__dot telemetry-bar__dot--warn" aria-hidden="true" />
                نگهداری
              </>
            ) : (
              <>
                <span className="telemetry-bar__dot" aria-hidden="true" />
                سرور فعال
              </>
            )
          ) : (
            <>
              <span className="telemetry-bar__dot telemetry-bar__dot--dead" aria-hidden="true" />
              بررسی…
            </>
          )}
        </span>
        <span className="telemetry-bar__sep" aria-hidden="true" />
        <span className="telemetry-bar__item">
          اتاق زنده:{" "}
          <strong>{status ? toFaDigits(status.active_rooms) : "—"}</strong>
        </span>
        <span className="telemetry-bar__item">
          بازی کل:{" "}
          <strong>{status ? toFaDigits(status.games_played_total) : "—"}</strong>
        </span>
        <span className="telemetry-bar__item">
          تأخیر:{" "}
          <strong>{latencyMs !== null ? `${toFaDigits(latencyMs)} ms` : "—"}</strong>
        </span>
        <span className="telemetry-bar__item">
          ساعت سرور:{" "}
          <strong className="ltr">{status?.server_now ?? "—"}</strong>
        </span>
      </div>

      {/* --------------------- Two-column hero --------------------- */}
      <section className="hero-grid">
        <div>
          <span className="hero__badge">
            <Zap size={14} aria-hidden="true" />
            بدون ثبت‌نام — همین حالا بازی کن
          </span>
          <h1 className="hero__title">
            میز زنده دوز، <span className="hero__accent">با دوستت</span>
          </h1>
          <p className="hero__sub">
            اتاق بساز، کد را بفرست، شروع کنید. حرکت‌ها روی سرور چک می‌شوند — تقلب راه ندارد.
          </p>
          <div className="hero__actions">
            <Button size="lg" icon={<Swords size={18} aria-hidden="true" />} onClick={() => navigate("/play")}>
              شروع بازی
            </Button>
            <Button
              size="lg"
              variant="secondary"
              icon={<LogIn size={18} aria-hidden="true" />}
              onClick={() => navigate("/join")}
            >
              ورود با کد
            </Button>
            <Button size="lg" variant="ghost" icon={<Plus size={18} aria-hidden="true" />} onClick={goCreate}>
              ساخت اتاق دوستانه
            </Button>
          </div>

          <div className="hero__proof" aria-label="چرا دوز آنلاین">
            <span className="proof-chip">بدون حساب کاربری</span>
            <span className="proof-chip">
              <strong>{status ? toFaDigits(status.active_rooms) : "—"}</strong> اتاق زنده
            </span>
            <span className="proof-chip">
              <ShCoin size={14} /> شریف‌کوین
            </span>
            <span className="proof-chip">
              {toFaDigits(getActiveGames().length)} بازی فعال
            </span>
          </div>

          <div className="hero__status" aria-live="polite">
            {status ? (
              <span className="service-pill service-pill--ok">
                <span className="service-pill__dot" aria-hidden="true" />
                سرور آنلاین
              </span>
            ) : statusFailed ? (
              <span className="service-pill service-pill--unknown">وضعیت سرویس در دسترس نیست</span>
            ) : (
              <span className="service-pill service-pill--loading">در حال بررسی وضعیت…</span>
            )}
          </div>
        </div>

        {/* ------------- 3×3 schematic matrix (A1..C3) ------------- */}
        <div className="schematic" aria-label="شماتیک میز بازی">
          <span className="schematic__frame" aria-hidden="true" />
          <div className="schematic__head">
            <span className="schematic__title">
              <Grid3X3 size={15} aria-hidden="true" />
              ماتریس شماتیک میز
            </span>
            <span className="schematic__tag">GRID 3×3 · A1..C3</span>
          </div>
          <div className="schematic-grid">
            {MATRIX_CELLS.map((cell) => {
              const mark = MATRIX_MARKS[cell];
              const hot = cell === "B2";
              return (
                <span
                  key={cell}
                  className={`schematic-cell ${hot ? "schematic-cell--hot" : ""} ${
                    mark ? `schematic-cell--${mark}` : ""
                  }`}
                  data-cell={cell}
                >
                  {mark === "x" ? "✕" : mark === "o" ? "◯" : cell}
                </span>
              );
            })}
          </div>
          <div className="schematic__legend">
            <span>
              <i style={{ background: "var(--x-color)" }} /> نشانهٔ X — حرکت اول
            </span>
            <span>
              <i style={{ background: "var(--o-color)" }} /> نشانهٔ O — پاسخ
            </span>
            <span>
              <i style={{ background: "var(--gold)" }} /> سلول فعال (اسکن زنده)
            </span>
          </div>
        </div>
      </section>

      {/* --------------------- How it works --------------------- */}
      <section className="steps" aria-label="مراحل شروع بازی">
        {STEPS.map((step, i) => (
          <article className="step-card" key={step.title}>
            <span className="step-card__num" aria-hidden="true">{toFaDigits(i + 1)}</span>
            <span className="step-card__icon">{step.icon}</span>
            <h2 className="step-card__title">{step.title}</h2>
            <p className="step-card__text">{step.text}</p>
          </article>
        ))}
      </section>

      {/* --------------------- Multi-Game Hub --------------------- */}
      <div className="section-head">
        <h2 className="section-head__title">انتخاب بازی</h2>
        <span className="section-head__sub">
          {toFaDigits(getActiveGames().length)} عنوان آماده بازی
        </span>
      </div>
      <section className="game-hub" aria-label="کاتالوگ بازی‌ها">
        {PLATFORM_GAMES.map((game) => (
          <article className="game-card" key={game.id} style={{ "--game-accent": game.accent } as React.CSSProperties}>
            {game.bannerUrl ? (
              <div className="game-card__banner">
                <img src={game.bannerUrl} alt="" loading="lazy" />
              </div>
            ) : null}
            <div className="game-card__top">
              <span className="game-card__icon" style={{ color: game.accent, borderColor: `${game.accent}66`, background: `${game.accent}14` }}>
                <GameIcon icon={game.icon} size={22} />
              </span>
              <span className={`game-card__tag ${game.status === "live" ? "game-card__tag--live" : "game-card__tag--soon"}`}>
                {game.status === "live" ? "آماده بازی" : game.status === "beta" ? "بتا" : "به‌زودی"}
              </span>
            </div>
            <h3 className="game-card__title">
              {game.title}
              <small>{game.titleEn}</small>
            </h3>
            <p className="game-card__text">{game.tagline}</p>
            <div className="game-card__specs">
              <span className="game-card__spec">{game.players}</span>
              <span className="game-card__spec">{game.genre}</span>
              {game.features.slice(0, 2).map((feat) => (
                <span className="game-card__spec" key={feat}>{feat}</span>
              ))}
            </div>
            {game.status === "live" || game.status === "beta" ? (
              <Link className="btn btn--primary btn--md game-card__cta" to={game.route === "/" ? "/play" : game.route}>
                بازی کن
                <ArrowLeft size={16} aria-hidden="true" />
              </Link>
            ) : (
              <span className="game-card__spec">به‌زودی</span>
            )}
          </article>
        ))}
      </section>

      {/* --------------------- Competitive tiers --------------------- */}
      <div className="section-head">
        <h2 className="section-head__title">تیرهای رقابتی و سقف شرط‌بندی</h2>
        <span className="section-head__sub">
          شش تیر از برنز تا استاد — سقف ورودی شرط بر اساس تیر
        </span>
      </div>
      <section aria-label="مشخصات تیرهای رقابتی">
        <div className="tier-table-wrap">
          <table className="tier-table">
            <thead>
              <tr>
                <th scope="col">تیر</th>
                <th scope="col">بازهٔ امتیاز (Elo)</th>
                <th scope="col">زیربخش‌ها</th>
                <th scope="col">ضریب K</th>
                <th scope="col">سقف شرط‌بندی</th>
              </tr>
            </thead>
            <tbody>
              {TIER_TABLE.map((row) => (
                <tr key={row.tier}>
                  <td>
                    <span className="tier-cell" style={{ "--tier-color": row.color } as React.CSSProperties}>
                      <span className="tier-cell__gem" aria-hidden="true" />
                      {row.tier}
                    </span>
                  </td>
                  <td className="ltr num">{row.range}</td>
                  <td>{row.divisions}</td>
                  <td className="mono ltr">{row.kFactor}</td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <ShCoin size={15} />
                      <strong>{row.stakeCeiling}</strong>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tier-table__foot">
          <ShieldCheck size={14} aria-hidden="true" />
          بازیکنان تیر پایین‌تر حداکثر {toFaDigits(25)} sh و تیرهای بالاتر تا {toFaDigits(100)} sh ورودی شرط دارند؛
          همیشه با حریف هم‌بازه رنک صف می‌شوید.
        </p>
      </section>

      {/* --------------------- Third note + credit --------------------- */}
      <section className="home-notes" style={{ marginTop: 26 }} aria-label="نکات امنیتی">
        <div className="note-card">
          <Gamepad2 size={20} aria-hidden="true" />
          <div>
            <h2 className="note-card__title">سه تا در یک خط، بردی</h2>
            <p className="note-card__text">
              ردیف، ستون یا قطر. صفحه پر شد و برنده‌ای نبود؟ مساوی.{" "}
              <Link className="link" to="/rules">قوانین کامل</Link>
            </p>
          </div>
        </div>
        <div className="note-card">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <h2 className="note-card__title">بدون رمز، فقط توکن مرورگر</h2>
            <p className="note-card__text">
              هویتت روی دستگاه خودت می‌ماند. هر حرکت روی سرور امضا می‌شود.
            </p>
          </div>
        </div>
        <div className="note-card" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 className="note-card__title">تم کربن و طلا</h2>
            <p className="note-card__text">{DESIGNER_CREDIT}</p>
          </div>
          <DesignerBadge size="lg" />
        </div>
      </section>
    </div>
  );
}
