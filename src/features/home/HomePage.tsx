import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Gamepad2,
  Grid3X3,
  LogIn,
  Plus,
  Rocket,
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
            بدون ثبت‌نام — فقط با کد اتاق
          </span>
          <h1 className="hero__title" style={{ textAlign: "right" }}>
            دوز بازی کن، <span className="hero__accent">زنده</span> با دوستانت
          </h1>
          <p className="hero__sub">
            دوز آنلاین یک میز بازی سریع و امن برای دو نفر است. اتاق بساز، کد را برای
            دوستت بفرست و همان لحظه شروع کنید — حرکت‌ها روی سرور اعتبارسنجی می‌شوند
            و تقلب ممکن نیست.
          </p>
          <div className="hero__actions">
            <Button size="lg" icon={<Plus size={18} aria-hidden="true" />} onClick={goCreate}>
              ساخت اتاق
            </Button>
            <Button
              size="lg"
              variant="secondary"
              icon={<LogIn size={18} aria-hidden="true" />}
              onClick={() => navigate("/join")}
            >
              ورود به اتاق
            </Button>
            <Button
              size="lg"
              variant="secondary"
              icon={<Swords size={18} aria-hidden="true" />}
              onClick={() => navigate("/play")}
            >
              بازی رقابتی و شرط
            </Button>
            <Button
              size="lg"
              variant="secondary"
              icon={<Rocket size={18} aria-hidden="true" />}
              onClick={() => navigate("/games/last-night")}
            >
              Last Night — بقای قرون‌وسطایی
            </Button>
          </div>

          <div className="hero__status" aria-live="polite">
            {status ? (
              <span className="service-pill service-pill--ok">
                <span className="service-pill__dot" aria-hidden="true" />
                سرویس فعال — {toFaDigits(status.active_rooms)} اتاق بازی زنده
              </span>
            ) : statusFailed ? (
              <span className="service-pill service-pill--unknown">وضعیت سرویس در دسترس نیست</span>
            ) : (
              <span className="service-pill service-pill--loading">در حال بررسی وضعیت…</span>
            )}
          </div>

          <div className="home-notes" style={{ marginTop: 26 }}>
            <div className="note-card">
              <ShCoin size={22} />
              <div>
                <h2 className="note-card__title">شریف‌کوین (Sheriff Coin) و اقتصاد یکپارچه</h2>
                <p className="note-card__text">
                  در بخش <Link className="link" to="/play">دوز رقابتی</Link> و کمپین{" "}
                  <Link className="link" to="/games/last-night">Last Night — Medieval Survival</Link>{" "}
                  بازی کن و <strong>Sheriff Coin</strong> جمع کن.{" "}
                  <Link className="link" to="/leaderboard">جدول رده‌بندی</Link> و{" "}
                  <Link className="link" to="/shop">فروشگاه</Link> را هم ببین.
                </p>
              </div>
            </div>
            <div className="note-card">
              <ShieldCheck size={20} aria-hidden="true" />
              <div>
                <h2 className="note-card__title">هویت تو فقط یک توکن خصوصی است</h2>
                <p className="note-card__text">
                  بعد از ورود به اتاق، یک توکن تصادفی فقط در مرورگر خودت ذخیره می‌شود و هر
                  حرکت با آن روی سرور تأیید می‌گردد. هیچ رمزی جایی ثبت نمی‌شود.
                </p>
              </div>
            </div>
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
        <h2 className="section-head__title">کاتالوگ بازی‌های پلتفرم</h2>
        <span className="section-head__sub">
          Multi-Game Hub — {toFaDigits(PLATFORM_GAMES.length)} عنوان، {toFaDigits(getActiveGames().length)} عنوان فعال
        </span>
      </div>
      <section className="game-hub" aria-label="کاتالوگ بازی‌ها">
        {PLATFORM_GAMES.map((game) => (
          <article className="game-card" key={game.id} style={{ "--game-accent": game.accent } as React.CSSProperties}>
            <div className="game-card__top">
              <span className="game-card__icon" style={{ color: game.accent, borderColor: `${game.accent}66`, background: `${game.accent}14` }}>
                {game.icon === "grid" ? <Gamepad2 size={22} aria-hidden="true" /> : <Rocket size={22} aria-hidden="true" />}
              </span>
              <span className={`game-card__tag ${game.status === "live" ? "game-card__tag--live" : "game-card__tag--soon"}`}>
                {game.status === "live" ? "فعال" : "به‌زودی"}
              </span>
            </div>
            <h3 className="game-card__title">
              {game.title}
              <small>{game.titleEn}</small>
            </h3>
            <p className="game-card__text">{game.tagline}</p>
            <p className="game-card__text" style={{ color: "var(--text-3)", fontSize: 12.5 }}>
              {game.description}
            </p>
            <div className="game-card__specs">
              <span className="game-card__spec">{game.players}</span>
              <span className="game-card__spec">{game.genre}</span>
              {game.frameRate ? <span className="game-card__spec">{toFaDigits(game.frameRate)} FPS</span> : null}
              {game.engine ? <span className="game-card__spec">{game.engine}</span> : null}
            </div>
            {game.status === "live" ? (
              <Link className="btn btn--secondary btn--sm" to={game.route} style={{ alignSelf: "flex-start" }}>
                بازی کن
                <ArrowLeft size={14} aria-hidden="true" />
              </Link>
            ) : (
              <span className="game-card__spec" style={{ alignSelf: "flex-start", color: "var(--gold)" }}>
                موتور Canvas 2D · حلقهٔ قطعی ۶۰ هرتز
              </span>
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
            <h2 className="note-card__title">قانون بازی ساده است</h2>
            <p className="note-card__text">
              سه علامت یکسان در یک ردیف، ستون یا قطر یعنی برد. اگر صفحه پر شود و برنده‌ای
              نباشد، بازی مساوی است. <Link className="link" to="/rules">قوانین کامل</Link>
            </p>
          </div>
        </div>
        <div className="note-card" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 className="note-card__title">هویت بصری تاکتیکال</h2>
            <p className="note-card__text">
              کربن عمیق و طلای مسدود — تم رابط توسط {DESIGNER_CREDIT}.
            </p>
          </div>
          <DesignerBadge size="lg" />
        </div>
      </section>
    </div>
  );
}
