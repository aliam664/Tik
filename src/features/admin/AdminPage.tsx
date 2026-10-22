import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  Bot,
  Calendar,
  Coins,
  Cpu,
  DoorOpen,
  Flame,
  History,
  KeyRound,
  LogOut,
  Settings,
  Shield,
  ShieldAlert,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ADMIN_TABS_META, type AdminTabId } from "@/config/navigation";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { adminApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { adminSession } from "@/lib/session";
import { DesignerBadge } from "@/components/layout/PageShell";
import { AdminOverviewPanel } from "./AdminOverviewPanel";
import { AdminSystemPanel } from "./AdminSystemPanel";
import { AdminArenaPanel } from "./AdminArenaPanel";
import { AdminPlayersPanel } from "./AdminPlayersPanel";
import { AdminEconomyPanel } from "./AdminEconomyPanel";
import { AdminIntegrityPanel } from "./AdminIntegrityPanel";
import { AdminSeasonsPanel } from "./AdminSeasonsPanel";
import { AdminRoomsPanel } from "./AdminRoomsPanel";
import { AdminGamesPanel } from "./AdminGamesPanel";
import { AdminBlastPanel } from "./AdminBlastPanel";
import { AdminSettingsPanel } from "./AdminSettingsPanel";
import { AdminAuditPanel } from "./AdminAuditPanel";

const TAB_ICONS: Record<AdminTabId, ReactNode> = {
  overview: <Activity size={16} aria-hidden="true" />,
  system: <Cpu size={16} aria-hidden="true" />,
  arena: <Bot size={16} aria-hidden="true" />,
  blast: <Flame size={16} aria-hidden="true" />,
  players: <Users size={16} aria-hidden="true" />,
  rooms: <DoorOpen size={16} aria-hidden="true" />,
  games: <Trophy size={16} aria-hidden="true" />,
  economy: <Coins size={16} aria-hidden="true" />,
  integrity: <ShieldAlert size={16} aria-hidden="true" />,
  seasons: <Calendar size={16} aria-hidden="true" />,
  settings: <Settings size={16} aria-hidden="true" />,
  audit: <History size={16} aria-hidden="true" />,
};

function OpsClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const label = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return (
    <time className={className} dateTime={now.toISOString()}>
      {label}
    </time>
  );
}

export function AdminPage() {
  useDocumentTitle("مرکز عملیات دوز");
  const { showToast } = useToast();

  const [session, setSession] = useState(() => adminSession.load());
  const [verifying, setVerifying] = useState<boolean>(() => !!adminSession.load());
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [tab, setTab] = useState<AdminTabId>("overview");

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [pwModal, setPwModal] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const handleSessionExpired = useCallback(() => {
    adminSession.clear();
    setSession(null);
    setVerificationError(null);
    showToast("نشست مدیریت منقضی شد. دوباره وارد شوید.", "info");
  }, [showToast]);

  useEffect(() => {
    const existing = adminSession.load();
    if (!existing) {
      setVerifying(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await adminApi.verify(existing.token);
        if (cancelled) return;
        if (!res.ok) {
          adminSession.clear();
          setSession(null);
        } else {
          setAdminUsername(res.username);
          setVerificationError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const user = toUserError(err);
          if (user.code === "ADMIN_UNAUTHORIZED") {
            adminSession.clear();
            setSession(null);
          } else {
            setVerificationError(user.message);
          }
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const retrySessionVerification = async () => {
    if (!session) return;
    setVerifying(true);
    setVerificationError(null);
    try {
      const res = await adminApi.verify(session.token);
      if (!res.ok) {
        adminSession.clear();
        setSession(null);
      } else {
        setAdminUsername(res.username);
      }
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") {
        adminSession.clear();
        setSession(null);
      } else {
        setVerificationError(user.message);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!username.trim() || !password) {
      setLoginError("نام کاربری و رمز عبور را وارد کنید.");
      return;
    }
    setLoginLoading(true);
    try {
      const res = await adminApi.login(username.trim(), password);
      adminSession.save(res);
      setSession(res);
      setVerificationError(null);
      setAdminUsername(username.trim());
      setPassword("");
      showToast("دسترسی تأیید شد — مرکز عملیات فعال است", "success");
    } catch (err) {
      const user = toUserError(err);
      setLoginError(user.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    if (session) {
      try {
        await adminApi.logout(session.token);
      } catch {
        // Clear local session regardless.
      }
    }
    adminSession.clear();
    setSession(null);
    showToast("نشست عملیات بسته شد", "info");
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setPwError(null);
    if (newPw.length < 10) {
      setPwError("رمز عبور جدید باید حداقل ۱۰ کاراکتر باشد.");
      return;
    }
    setPwLoading(true);
    try {
      await adminApi.changePassword(session.token, curPw, newPw);
      showToast("رمز عبور مدیر تغییر کرد", "success");
      setPwModal(false);
      setCurPw("");
      setNewPw("");
    } catch (err) {
      const user = toUserError(err);
      if (user.code === "ADMIN_UNAUTHORIZED") handleSessionExpired();
      setPwError(user.message);
    } finally {
      setPwLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="room-loading">
        <LoadingSpinner size={28} label="در حال احراز نشست عملیات…" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="ops-login-wrap">
        <form className="ops-login" onSubmit={(e) => void handleLogin(e)} noValidate>
          <p className="ops-login__prompt">ACCESS GATE · CLEARANCE REQUIRED</p>
          <div className="ops-login__head">
            <span className="ops-login__icon" aria-hidden="true">
              <Shield size={22} />
            </span>
            <div>
              <h1>ورود به مرکز عملیات دوز</h1>
              <p className="card__sub">احراز هویت اپراتور — نشست محدود، تمام اقدامات ثبت می‌شود</p>
            </div>
          </div>

          <FormField label="شناسه اپراتور" htmlFor="admin-username">
            <Input
              id="admin-username"
              dir="ltr"
              className="ltr"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </FormField>

          <FormField label="عبارت عبور" htmlFor="admin-password" error={loginError}>
            <Input
              id="admin-password"
              type="password"
              dir="ltr"
              className="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={!!loginError}
            />
          </FormField>

          <Button type="submit" size="lg" fullWidth loading={loginLoading}>
            تأیید دسترسی و ورود
          </Button>
          <div className="ops-login__meta">
            <span>CHANNEL SECURE</span>
            <OpsClock />
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="page admin-page admin-layout ops-console">
      <header className="ops-topbar">
        <div className="ops-topbar__brand">
          <span className="ops-mark" aria-hidden="true">
            <Shield size={20} />
          </span>
          <div>
            <h1>مرکز عملیات دوز</h1>
            <p>
              اپراتور <span className="ltr num">{adminUsername}</span>
              {" · "}
              <span className="ops-clearance">CLEARANCE LVL-A</span>
            </p>
          </div>
        </div>
        <OpsClock className="ops-clock" />
        <DesignerBadge />
        <div className="ops-topbar__actions">
          <Button
            variant={tab === "arena" ? "primary" : "secondary"}
            size="sm"
            icon={<Bot size={15} aria-hidden="true" />}
            onClick={() => setTab("arena")}
          >
            عرصه AI
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<KeyRound size={15} aria-hidden="true" />}
            onClick={() => setPwModal(true)}
          >
            تغییر رمز
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<LogOut size={15} aria-hidden="true" />}
            onClick={() => void handleLogout()}
          >
            قطع نشست
          </Button>
        </div>
      </header>

      {verificationError ? (
        <div className="inline-warning" role="status">
          <ShieldAlert size={16} aria-hidden="true" />
          <span>بررسی نشست به‌دلیل خطای ارتباطی کامل نشد؛ نشست محلی پاک نشده است. {verificationError}</span>
          <Button size="sm" variant="secondary" loading={verifying} onClick={() => void retrySessionVerification()}>
            تلاش دوباره
          </Button>
        </div>
      ) : null}

      <div className="ops-body">
        <nav className="ops-rail" aria-label="بخش‌های مرکز عملیات">
          {ADMIN_TABS_META.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`admin-tab ${tab === t.id ? "admin-tab--active" : ""} ${
                t.badge ? "admin-tab--featured" : ""
              }`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {TAB_ICONS[t.id]}
              <span>{t.label}</span>
              {t.badge ? <em className="admin-tab__badge">{t.badge}</em> : null}
            </button>
          ))}
        </nav>

        <div className="ops-stage admin-content">
          {tab === "overview" ? (
            <AdminOverviewPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "system" ? (
            <AdminSystemPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "arena" ? (
            <AdminArenaPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "blast" ? (
            <AdminBlastPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "players" ? (
            <AdminPlayersPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "rooms" ? (
            <AdminRoomsPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "games" ? (
            <AdminGamesPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "economy" ? (
            <AdminEconomyPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "integrity" ? (
            <AdminIntegrityPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "seasons" ? (
            <AdminSeasonsPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "settings" ? (
            <AdminSettingsPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
          {tab === "audit" ? (
            <AdminAuditPanel token={session.token} onSessionExpired={handleSessionExpired} />
          ) : null}
        </div>
      </div>

      <Modal open={pwModal} title="تغییر رمز عبور مدیر" onClose={() => setPwModal(false)}>
        <form className="pw-form" onSubmit={(e) => void changePassword(e)}>
          <FormField label="رمز عبور فعلی" htmlFor="cur-pw">
            <Input
              id="cur-pw"
              type="password"
              dir="ltr"
              className="ltr"
              autoComplete="current-password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
            />
          </FormField>
          <FormField label="رمز عبور جدید" htmlFor="new-pw" hint="حداقل ۱۰ کاراکتر" error={pwError}>
            <Input
              id="new-pw"
              type="password"
              dir="ltr"
              className="ltr"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              invalid={!!pwError}
            />
          </FormField>
          <Button type="submit" loading={pwLoading} fullWidth>
            ذخیره رمز جدید
          </Button>
        </form>
      </Modal>
    </div>
  );
}
