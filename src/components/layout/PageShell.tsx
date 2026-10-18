import { Link, NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { ConfigurationBanner } from "@/components/ui/ConfigurationBanner";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="logo" aria-label="دوز آنلاین — صفحه اصلی">
      <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true" className="logo__mark">
        <rect x="2" y="2" width="36" height="36" rx="9" fill="var(--surface-2)" stroke="var(--border)" />
        <path d="M10 12 L18 20 M18 12 L10 20" stroke="var(--x-color)" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="26" cy="26" r="5.4" fill="none" stroke="var(--o-color)" strokeWidth="3.4" />
      </svg>
      <span className="logo__text">
        <span className="logo__fa">دوز آنلاین</span>
        {!compact ? <span className="logo__en ltr">DOZ ONLINE</span> : null}
      </span>
    </Link>
  );
}

export function ResponsiveNavigation() {
  return (
    <nav className="main-nav" aria-label="ناوبری اصلی">
      <NavLink to="/" end className={({ isActive }) => `main-nav__link ${isActive ? "main-nav__link--active" : ""}`}>
        خانه
      </NavLink>
      <NavLink to="/play" className={({ isActive }) => `main-nav__link ${isActive ? "main-nav__link--active" : ""}`}>
        بازی رقابتی
      </NavLink>
      <NavLink to="/leaderboard" className={({ isActive }) => `main-nav__link ${isActive ? "main-nav__link--active" : ""}`}>
        رده‌بندی
      </NavLink>
      <NavLink to="/shop" className={({ isActive }) => `main-nav__link ${isActive ? "main-nav__link--active" : ""}`}>
        فروشگاه
      </NavLink>
      <NavLink to="/profile" className={({ isActive }) => `main-nav__link ${isActive ? "main-nav__link--active" : ""}`}>
        پروفایل
      </NavLink>
      <NavLink to="/rules" className={({ isActive }) => `main-nav__link ${isActive ? "main-nav__link--active" : ""}`}>
        قوانین
      </NavLink>
      <NavLink to="/join" className={({ isActive }) => `main-nav__link ${isActive ? "main-nav__link--active" : ""}`}>
        ورود به اتاق
      </NavLink>
    </nav>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Logo />
          <ResponsiveNavigation />
        </div>
      </header>

      <ConfigurationBanner />
      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <p className="site-footer__brand">
            <span className="logo__en ltr">DOZ ONLINE</span> — دوز آنلاین دو نفره، بدون ثبت‌نام
          </p>
          <nav className="site-footer__links" aria-label="پیوندهای پایین صفحه">
            <Link to="/rules">قوانین بازی</Link>
            <Link to="/privacy">حریم خصوصی</Link>
          </nav>
          <p className="site-footer__copy">
            ساخته‌شده با React و Supabase — تمام حرکت‌ها روی سرور اعتبارسنجی می‌شوند.
          </p>
        </div>
      </footer>
    </div>
  );
}
