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
}

export function Card({ className = "", children, ...rest }: WgCardProps) {
  return (
    <div className={`wg-panel ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
