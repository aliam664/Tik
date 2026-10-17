import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, DoorClosed, LayoutDashboard, LogOut, Settings2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingSpinner } from "@/components/ui/Feedback";
import { FormField, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { adminSession } from "@/lib/session";
import { AdminAuditPanel } from "./AdminAuditPanel";
import { AdminGamesPanel } from "./AdminGamesPanel";
import { AdminOverviewPanel } from "./AdminOverviewPanel";
import { AdminRoomsPanel } from "./AdminRoomsPanel";
import { AdminSettingsPanel } from "./AdminSettingsPanel";

type Tab = "overview" | "rooms" | "games" | "settings" | "audit";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "نمای کلی", icon: <LayoutDashboard size={15} aria-hidden="true" /> },
  { id: "rooms", label: "اتاق‌ها", icon: <DoorClosed size={15} aria-hidden="true" /> },
  { id: "games", label: "بازی‌ها", icon: <Trophy size={15} aria-hidden="true" /> },
  { id: "settings", label: "تنظیمات", icon: <Settings2 size={15} aria-hidden="true" /> },
  { id: "audit", label: "گزارش عملیات", icon: <ClipboardList size={15} aria-hidden="true" /> },
];

export function AdminPage() {
  useDocumentTitle("پنل مدیریت | دوز آنلاین");
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(() => adminSession.load()?.token ?? null);
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState<boolean>(() => adminSession.load() !== null);
  const [tab, setTab] = useState<Tab>("overview");

  const logout = useCallback(
    async (silent = false) => {
      const t = token;
      setToken(null);
      setUsername(null);
      adminSession.clear();
      if (t && !silent) {
        try {
          await adminApi.logout(t);
        } catch {
          /* session already dead server-side */
        }
      }
    },
    [token],
  );

  /* validate persisted session on load */
  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    let alive = true;
    adminApi
      .verify(token)
      .then((res) => {
        if (alive) setUsername(res.username);
      })
      .catch(() => {
        if (alive) {
          adminSession.clear();
          setToken(null);
        }
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (checking) {
    return (
      <div className="page page--narrow admin-page">
        <div className="room-loading">
          <LoadingSpinner size={26} label="بررسی نشست مدیر" />
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <AdminLoginPage
        onSuccess={(t, u) => {
          setToken(t);
          setUsername(u);
          setTab("overview");
        }}
      />
    );
  }

  return (
    <div className="page admin-page">
      <header className="admin-head">
        <div>
          <h1 className="admin-head__title">پنل مدیریت</h1>
          <p className="admin-head__user">
            ورود با: <strong>{username}</strong>
          </p>
        </div>
        <div className="admin-head__actions">
          <Button variant="secondary" size="sm" onClick={() => navigate("/")}>
            مشاهده سایت
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<LogOut size={14} aria-hidden="true" />}
            onClick={() => void logout()}
          >
            خروج
          </Button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="بخش‌های پنل مدیریت">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`admin-tab ${tab === t.id ? "admin-tab--active" : ""}`}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <AdminTabContent token={token} tab={tab} onSessionExpired={() => void logout(true)} />
    </div>
  );
}

function AdminTabContent({
  token,
  tab,
  onSessionExpired,
}: {
  token: string;
  tab: Tab;
  onSessionExpired: () => void;
}) {
  const handle = useCallback(
    (err: unknown) => toUserError(err),
    [],
  );
  void handle;

  switch (tab) {
    case "overview":
      return <AdminOverviewPanel token={token} onSessionExpired={onSessionExpired} />;
    case "rooms":
      return <AdminRoomsPanel token={token} onSessionExpired={onSessionExpired} />;
    case "games":
      return <AdminGamesPanel token={token} onSessionExpired={onSessionExpired} />;
    case "settings":
      return <AdminSettingsPanel token={token} onSessionExpired={onSessionExpired} />;
    case "audit":
      return <AdminAuditPanel token={token} onSessionExpired={onSessionExpired} />;
  }
}

function AdminLoginPage({ onSuccess }: { onSuccess: (token: string, username: string) => void }) {
  const { showToast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="page page--narrow admin-page">
      <section className="card">
        <h1 className="card__title">ورود مدیر</h1>
        <p className="card__sub">این بخش خصوصی است و فقط برای حساب مدیر مجاز است.</p>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError(null);
            try {
              const res = await adminApi.login(username.trim(), password);
              adminSession.save(res);
              const v = await adminApi.verify(res.token);
              onSuccess(res.token, v.username);
            } catch (err) {
              const user = toUserError(err);
              setError(user.message);
              showToast(user.message, "error");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <FormField label="نام کاربری" htmlFor="admin-username">
            <Input
              id="admin-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              dir="ltr"
              className="ltr"
              autoFocus
            />
          </FormField>
          <FormField label="رمز عبور" htmlFor="admin-password" error={error}>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
              className="ltr"
              invalid={!!error}
            />
          </FormField>
          <Button type="submit" size="lg" fullWidth loading={submitting}>
            ورود به پنل
          </Button>
        </form>
      </section>
    </div>
  );
}

/** shared error boundary per panel */
export function PanelError({ description, onRetry }: { description: string; onRetry: () => void }) {
  return <ErrorState title="دریافت داده ناموفق بود" description={description} onRetry={onRetry} />;
}
