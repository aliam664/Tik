import type { ReactNode } from "react";
import { AlertCircle, InboxIcon } from "lucide-react";
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

export function ErrorState({
  title = "خطایی رخ داد",
  description,
  onRetry,
  retryLabel = "تلاش مجدد",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="state-card state-card--error" role="alert">
      <span className="state-card__icon">
        <AlertCircle size={26} aria-hidden="true" />
      </span>
      <h3 className="state-card__title">{title}</h3>
      {description ? <p className="state-card__text">{description}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
