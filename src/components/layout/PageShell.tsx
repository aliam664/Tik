import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Gamepad2,
  Home,
  LineChart,
  Menu,
  Shield,
  ShoppingBag,
  Trophy,
  User,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { ConfigurationBanner } from "@/components/ui/ConfigurationBanner";
import { MAIN_NAV_ITEMS } from "@/config/navigation";
import { DESIGNER_CREDIT, SITE_DESIGNER } from "@/games/registry";
import { adminSession } from "@/lib/session";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="logo" aria-label="دوز آنلاین — صفحه اصلی">
      <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true" className="logo__mark">
        <rect x="2" y="2" width="36" height="36" rx="9" fill="var(--surface-2)" stroke="var(--border)" />
        <path d="M10 12 L18 20 M18 12 L10 20" stroke="var(--x-color)" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="26" cy="26" r="5.4" fill="none" stroke="var(--o-color)" strokeWidth="3.4" />
      </svg>
      <span className="logo__text">
        <span className="logo__fa">دوز <em>آنلاین</em></span>
        {!compact ? <span className="logo__en ltr">DOZ ONLINE</span> : null}
      </span>
    </Link>
  );
}

export function DesignerBadge({
  size = "md",
  tone = "gold",
}: {
  size?: "md" | "lg";
  tone?: "gold" | "footer";
}) {
  return (
    <span className={`designer-badge designer-badge--${size} designer-badge--${tone}`}>
      <span aria-hidden="true">◆</span>
      <span>Designed &amp; Engineered by</span>
      <span className="designer-badge__name ltr">{SITE_DESIGNER}</span>
    </span>
  );
}

export function ResponsiveNavigation() {
  const isAdmin = adminSession.load() !== null;

  return (
    <nav className="main-nav" aria-label="ناوبری اصلی">
      {MAIN_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.exact}
          className={({ isActive }) => `main-nav__link ${isActive ? "main-nav__link--active" : ""}`}
        >
          {item.label}
        </NavLink>
      ))}
      {isAdmin ? (
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `main-nav__link main-nav__link--admin ${isActive ? "main-nav__link--active" : ""}`
          }
        >
          <Shield size={14} aria-hidden="true" />
          پنل ادمین
        </NavLink>
      ) : null}
    </nav>
  );
}

/** Five primary destinations for the sticky phone bottom bar. */
const MOBILE_NAV_ITEMS: readonly {
  path: string;
  label: string;
  icon: ReactNode;
}[] = [
  { path: "/", label: "خانه", icon: <Home size={20} aria-hidden="true" /> },
  { path: "/play", label: "رقابتی", icon: <Trophy size={20} aria-hidden="true" /> },
  { path: "/leaderboard", label: "رده‌بندی", icon: <LineChart size={20} aria-hidden="true" /> },
  { path: "/shop", label: "فروشگاه", icon: <ShoppingBag size={20} aria-hidden="true" /> },
  { path: "/profile", label: "پروفایل", icon: <User size={20} aria-hidden="true" /> },
];

export function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav" aria-label="ناوبری پایین موبایل">
      <ol className="mobile-bottom-nav__list">
        {MOBILE_NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `mobile-bottom-nav__link ${isActive ? "mobile-bottom-nav__link--active" : ""}`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const isAdmin = adminSession.load() !== null;

  // Lock body scroll + close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="mobile-drawer-backdrop"
        aria-label="بستن منو"
        onClick={onClose}
      />
      <aside className="mobile-drawer" role="dialog" aria-label="منوی موبایل">
        <div className="mobile-drawer__head">
          <Logo compact />
          <button
            type="button"
            className="icon-btn"
            aria-label="بستن منو"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="mobile-drawer__links" aria-label="منوی موبایل">
          {MAIN_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `mobile-drawer__link ${isActive ? "mobile-drawer__link--active" : ""}`
              }
              onClick={onClose}
            >
              {item.label}
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `mobile-drawer__link ${isActive ? "mobile-drawer__link--active" : ""}`
              }
              onClick={onClose}
            >
              <Shield size={16} aria-hidden="true" />
              پنل ادمین
            </NavLink>
          ) : null}
        </nav>

        <div className="mobile-drawer__foot">
          <DesignerBadge size="lg" />
          <span className="mobile-drawer__game">
            <Gamepad2 size={14} aria-hidden="true" />
            DOZ ONLINE — موتور بازی ۲بعدی ۶۰FPS
          </span>
        </div>
      </aside>
    </>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes.
  const { pathname } = useLocation();
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Logo />
          <ResponsiveNavigation />
          <span className="site-header__credit">
            <DesignerBadge />
          </span>
          <button
            type="button"
            className="icon-btn mobile-drawer-toggle"
            aria-label="باز کردن منو"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      <ConfigurationBanner />
      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__row">
            <p className="site-footer__brand">
              <span className="logo__en ltr">DOZ ONLINE</span> — دوز آنلاین دو نفره، بدون ثبت‌نام
            </p>
            <DesignerBadge tone="footer" />
          </div>
          <nav className="site-footer__links" aria-label="پیوندهای پایین صفحه">
            <Link to="/rules">قوانین بازی</Link>
            <Link to="/privacy">حریم خصوصی</Link>
            <Link to="/admin">مدیریت</Link>
          </nav>
          <p className="site-footer__copy">
            ساخته‌شده با React و Supabase — تمام حرکت‌ها روی سرور اعتبارسنجی می‌شوند. {DESIGNER_CREDIT}.
          </p>
        </div>
      </footer>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <MobileBottomNav />
    </div>
  );
}
