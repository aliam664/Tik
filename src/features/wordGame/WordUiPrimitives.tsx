import type { HTMLAttributes, ReactNode } from "react";

export type WgBadgeTone =
  | "gold"
  | "info"
  | "success"
  | "danger"
  | "neutral";

export interface WgBadgeProps {
  tone?: WgBadgeTone;
  children: ReactNode;
}

export function Badge({ tone = "neutral", children }: WgBadgeProps) {
  return <span className={`wg-badge wg-badge--${tone}`}>{children}</span>;
}

export interface WgCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  framed?: boolean;
}

export function Card({ className = "", framed = false, children, ...rest }: WgCardProps) {
  return (
    <div className={`wg-panel ${framed ? "g-frame" : ""} ${className}`.trim()} {...rest}>
      {framed ? (
        <>
          <span className="g-frame__c g-frame__c--tl" aria-hidden="true" />
          <span className="g-frame__c g-frame__c--tr" aria-hidden="true" />
          <span className="g-frame__c g-frame__c--bl" aria-hidden="true" />
          <span className="g-frame__c g-frame__c--br" aria-hidden="true" />
        </>
      ) : null}
      {children}
    </div>
  );
}
