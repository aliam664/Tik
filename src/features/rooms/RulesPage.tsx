import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const RULES: { title: string; text: string }[] = [
  {
    title: "۱. صفحه بازی",
    text: "بازی روی صفحه ۳×۳ با ۹ خانه انجام می‌شود. یک بازیکن علامت X و بازیکن دیگر علامت O دارد.",
  },
  {
    title: "۲. نوبت‌ها",
    text: "در بازی اول، بازیکن X شروع می‌کند و نوبت‌ها یکی‌درمیان عوض می‌شود. در بازی‌های بعدی، نوبت شروع بین دو بازیکن عوض می‌شود.",
  },
  {
    title: "۳. حرکت معتبر",
    text: "هر بازیکن فقط در نوبت خودش و فقط در خانه‌ی خالی می‌تواند علامت بگذارد. خانه‌های پر و حرکت خارج از نوبت توسط سرور رد می‌شوند.",
  },
  {
    title: "۴. برد",
    text: "هر بازیکنی که سه علامت یکسان در یک ردیف، ستون یا قطر بسازد برنده است. خانه‌های خط برد در صفحه هایلایت می‌شوند.",
  },
  {
    title: "۵. مساوی",
    text: "اگر هر ۹ خانه پر شود و هیچ برنده‌ای وجود نداشته باشد، بازی مساوی است.",
  },
  {
    title: "۶. بازی مجدد",
    text: "بعد از پایان بازی، هر دو بازیکن می‌توانند «بازی مجدد» را درخواست کنند. بازی جدید وقتی شروع می‌شود که هر دو طرف درخواست را تأیید کنند.",
  },
  {
    title: "۷. اعتبار نتیجه",
    text: "نتیجه هر بازی روی سرور و با همین قوانین محاسبه می‌شود؛ مرورگر فقط نمایش‌دهنده است. حرکت‌های خلاف قواعد ثبت نمی‌شوند.",
  },
  {
    title: "۸. عمر اتاق",
    text: "هر اتاق چند ساعت پس از آخرین فعالیت منقضی می‌شود و داده‌های آن به‌صورت خودکار پاک می‌گردد.",
  },
];

export function RulesPage() {
  useDocumentTitle("قوانین بازی | دوز آنلاین");
  const navigate = useNavigate();

  return (
    <div className="page page--narrow">
      <button type="button" className="back-link" onClick={() => navigate("/")}>
        <ArrowLeft size={16} aria-hidden="true" />
        بازگشت
      </button>
      <section className="card">
        <h1 className="card__title">قوانین رسمی بازی دوز</h1>
        <p className="card__sub">قوانینی که موتور بازی روی سرور دقیقاً بر اساس آن‌ها داوری می‌کند.</p>
        <ol className="rules-list">
          {RULES.map((rule) => (
            <li key={rule.title} className="rules-item">
              <h2 className="rules-item__title">{rule.title}</h2>
              <p className="rules-item__text">{rule.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
