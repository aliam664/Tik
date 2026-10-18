import { AlertTriangle } from "lucide-react";
import { env } from "@/lib/env";

export function ConfigurationBanner() {
  const issue = env.configIssue;
  if (!issue) return null;

  return (
    <aside className="config-banner" role="alert" aria-live="assertive">
      <AlertTriangle size={20} aria-hidden="true" className="config-banner__icon" />
      <div className="config-banner__content">
        <div className="config-banner__heading">
          <strong>خطای پیکربندی سرویس</strong>
          <code className="config-banner__code ltr">{issue.code}</code>
        </div>
        <p>{issue.message}</p>
        <p className="config-banner__solution">{issue.solution}</p>
      </div>
    </aside>
  );
}
