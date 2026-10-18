import { useState } from "react";
import type { ReactNode } from "react";
import { Activity, AlertCircle, InboxIcon } from "lucide-react";
import { runConnectionDiagnostics } from "@/lib/diagnostics";
import type { UserError } from "@/lib/errors";
import { Button } from "./Button";

export function LoadingSpinner({ size = 22, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role="status">
      <span className="sr-only">{label ?? "در حال بارگذاری"}</span>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="state-card">
      <span className="state-card__icon">{icon ?? <InboxIcon size={26} aria-hidden="true" />}</span>
      <h3 className="state-card__title">{title}</h3>
      {description ? <p className="state-card__text">{description}</p> : null}
    </div>
  );
}

function ConnectionDiagnosticButton() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof runConnectionDiagnostics>> | null>(null);

  const runCheck = async () => {
    setChecking(true);
    try {
      setResult(await runConnectionDiagnostics());
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="connection-diagnostic">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={checking}
        icon={<Activity size={15} aria-hidden="true" />}
        onClick={() => void runCheck()}
      >
        عیب‌یابی اتصال
      </Button>
      {result ? (
        <div
          className={`connection-diagnostic__result ${result.ok ? "connection-diagnostic__result--ok" : "connection-diagnostic__result--error"}`}
          role="status"
          aria-live="polite"
        >
          <p>{result.message}</p>
          <span className="connection-diagnostic__code ltr">{result.code}</span>
          <p className="connection-diagnostic__solution">{result.solution}</p>
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "خطایی رخ داد",
  description,
  details,
  onRetry,
  retryLabel = "تلاش مجدد",
  showDiagnostics = true,
}: {
  title?: string;
  description?: string;
  details?: UserError | null;
  onRetry?: () => void;
  retryLabel?: string;
  showDiagnostics?: boolean;
}) {
  const visibleDescription = details?.message ?? description;

  return (
    <div className="state-card state-card--error" role="alert">
      <span className="state-card__icon">
        <AlertCircle size={26} aria-hidden="true" />
      </span>
      <h3 className="state-card__title">{title}</h3>
      {visibleDescription ? <p className="state-card__text">{visibleDescription}</p> : null}
      {details ? (
        <div className="error-state__details">
          <div className="error-state__code-row">
            <span>کد خطا</span>
            <code className="error-state__code ltr">{details.code}</code>
          </div>
          <p className="error-state__solution">
            <strong>راه‌حل پیشنهادی:</strong> {details.solution}
          </p>
        </div>
      ) : null}
      <div className="error-state__actions">
        {onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
        {showDiagnostics ? <ConnectionDiagnosticButton /> : null}
      </div>
    </div>
  );
}
