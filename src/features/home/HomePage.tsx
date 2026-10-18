import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Gamepad2, LogIn, Plus, ShieldCheck, Swords, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { api } from "@/lib/api";
import { toFaDigits } from "@/lib/format";
import type { PublicStatus } from "@/types/api";

const STEPS = [
  {
    icon: <Plus size={20} aria-hidden="true" />,
    title: "اتاق بساز",
    text: "یک نام نمایشی انتخاب کن و با یک کلیک اتاق اختصاصی خودت را بساز.",
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

export function HomePage() {
  useDocumentTitle("دوز آنلاین | DOZ ONLINE");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getPublicStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        if (alive) setStatusFailed(true);
      });
    return () => {
      alive = false;
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
      <section className="hero">
        <span className="hero__badge">
          <Zap size={14} aria-hidden="true" />
          بدون ثبت‌نام — فقط با کد اتاق
        </span>
        <h1 className="hero__title">
          دوز بازی کن، <span className="hero__accent">زنده</span> با دوستانت
        </h1>
        <p className="hero__sub">
          دوز آنلاین یک میز بازی سریع و امن برای دو نفر است. اتاق بساز، کد را برای دوستت بفرست
          و همان لحظه شروع کنید — حرکت‌ها روی سرور اعتبارسنجی می‌شوند و تقلب ممکن نیست.
        </p>
        <div className="hero__actions">
          <Button size="lg" icon={<Plus size={18} aria-hidden="true" />} onClick={goCreate}>
            ساخت اتاق
          </Button>
          <Button size="lg" variant="secondary" icon={<LogIn size={18} aria-hidden="true" />} onClick={() => navigate("/join")}>
            ورود به اتاق
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
      </section>

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

      <section className="home-notes" aria-label="نکات امنیتی">
        <div className="note-card">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <h2 className="note-card__title">هویت تو فقط یک توکن خصوصی است</h2>
            <p className="note-card__text">
              بعد از ورود به اتاق، یک توکن تصادفی فقط در مرورگر خودت ذخیره می‌شود و هر حرکت با
              آن روی سرور تأیید می‌گردد. هیچ رمزی جایی ثبت نمی‌شود.
            </p>
          </div>
        </div>
        <div className="note-card">
          <Gamepad2 size={20} aria-hidden="true" />
          <div>
            <h2 className="note-card__title">قانون بازی ساده است</h2>
            <p className="note-card__text">
              سه علامت یکسان در یک ردیف، ستون یا قطر یعنی برد. اگر صفحه پر شود و برنده‌ای نباشد،
              بازی مساوی است. <Link className="link" to="/rules">قوانین کامل</Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
