import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "چه داده‌ای ذخیره می‌کنیم؟",
    paragraphs: [
      "برای بازی، هیچ حساب کاربری و رمز عبوری لازم نیست. تنها داده‌هایی که نگه‌داری می‌شوند عبارت‌اند از: نام نمایشی انتخابی شما، کد اتاق، وضعیت بازی (خانه‌ها و نوبت‌ها) و زمان آخرین حضور شما.",
      "هویت شما در اتاق یک توکن تصادفی و غیرقابل حدس است که فقط در حافظه‌ی مرورگر خودتان (sessionStorage) ذخیره می‌شود؛ روی سرور فقط نسخه‌ی هش‌شده‌ی آن نگه‌داری می‌شود و اتصال آن به هویت واقعی شما ممکن نیست.",
    ],
  },
  {
    title: "توکن در URL یا لاگ قرار نمی‌گیرد",
    paragraphs: [
      "کد اتاق در لینک دعوت دیده می‌شود (برای این است که دوستتان بتواند وارد شود)، اما توکن خصوصی شما هرگز در آدرس صفحات، پیام‌های زنده یا لاگ‌ها منتشر نمی‌شود و به بازیکن دیگری ارسال نمی‌گردد.",
      "با بستن مرتبه‌ی مرورگر، توکن به‌صورت خودکار از حافظه پاک می‌شود.",
    ],
  },
  {
    title: "پاک‌سازی داده‌ها",
    paragraphs: [
      "اتاق‌ها پس از چند ساعت بی‌فعالیت منقضی می‌شوند و فرایند خودکار، اتاق، بازیکنان و تاریخچه‌ی حرکت‌ها را حذف می‌کند. داده‌ی دائمی برای بازیکنان نگه‌داری نمی‌شود.",
      "لاگ عملیات مدیریتی فقط شامل زمان، نوع عملیات و نتیجه است و هیچ رمز یا توکنی در آن ثبت نمی‌شود.",
    ],
  },
  {
    title: "امنیت فنی",
    paragraphs: [
      "تمام ارتباط‌ها با پروتکل امن HTTPS انجام می‌شود. دسترسی به داده‌ها در پایگاه‌داده با سیاست‌های سطح ردیف (RLS) محدود شده و هیچ کلاینتی اجازه‌ی خواندن یا نوشتن مستقیم جداول را ندارد؛ همه‌چیز از توابع امن سمت سرور می‌گذرد.",
      "برای جلوگیری از سوءاستفاده، ساخت اتاق و ورود به آن برای هر IP محدودیت تعداد درخواست دارد.",
    ],
  },
];

export function PrivacyPage() {
  useDocumentTitle("حریم خصوصی | دوز آنلاین");
  const navigate = useNavigate();

  return (
    <div className="page page--narrow">
      <button type="button" className="back-link" onClick={() => navigate("/")}>
        <ArrowLeft size={16} aria-hidden="true" />
        بازگشت
      </button>
      <section className="card">
        <h1 className="card__title">حریم خصوصی</h1>
        <p className="card__sub">
          سیاست داده‌ی دوز آنلاین به زبان ساده: کمترین داده، کوتاه‌ترین عمر.
        </p>
        {SECTIONS.map((section) => (
          <section key={section.title} className="privacy-section">
            <h2 className="privacy-section__title">{section.title}</h2>
            {section.paragraphs.map((p) => (
              <p key={p.slice(0, 24)} className="privacy-section__text">
                {p}
              </p>
            ))}
          </section>
        ))}
      </section>
    </div>
  );
}
