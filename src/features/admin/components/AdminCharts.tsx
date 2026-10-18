import { toFaDigits } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* 1. Radial Resource Gauge (CPU / RAM / Disk / Pool)                         */
/* -------------------------------------------------------------------------- */

export interface ResourceGaugeProps {
  label: string;
  sublabel: string;
  percent: number;
  detail?: string;
  accentColor?: string;
}

export function ResourceGauge({
  label,
  sublabel,
  percent,
  detail,
  accentColor,
}: ResourceGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const toneColor =
    accentColor ??
    (clamped >= 85
      ? "var(--error)"
      : clamped >= 65
        ? "var(--warning)"
        : "var(--success)");

  return (
    <div className="resource-gauge-card">
      <div className="resource-gauge__ring-wrap">
        <svg viewBox="0 0 104 104" width="96" height="96" aria-hidden="true">
          <circle
            cx="52"
            cy="52"
            r={radius}
            fill="none"
            stroke="var(--surface-3, rgba(255,255,255,0.08))"
            strokeWidth="8"
          />
          <circle
            cx="52"
            cy="52"
            r={radius}
            fill="none"
            stroke={toneColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 52 52)"
            style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s ease" }}
          />
        </svg>
        <div className="resource-gauge__center">
          <strong className="ltr">{toFaDigits(Math.round(clamped * 10) / 10)}٪</strong>
        </div>
      </div>
      <div className="resource-gauge__meta">
        <strong className="resource-gauge__title">{label}</strong>
        <span className="resource-gauge__sub">{sublabel}</span>
        {detail ? <span className="resource-gauge__detail ltr">{detail}</span> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Dual/Single SVG Area & Line Trend Chart (7-day activity / economy)      */
/* -------------------------------------------------------------------------- */

export interface TrendSeriesPoint {
  label: string;
  primary: number;
  secondary?: number;
}

export interface ActivityAreaChartProps {
  title: string;
  subtitle?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  data: TrendSeriesPoint[];
}

export function ActivityAreaChart({
  title,
  subtitle,
  primaryLabel,
  secondaryLabel,
  primaryColor = "var(--accent-strong, #8c7dff)",
  secondaryColor = "var(--success, #39c98a)",
  data,
}: ActivityAreaChartProps) {
  const safeData =
    data.length > 0
      ? data
      : Array.from({ length: 7 }, (_, i) => ({
          label: `روز ${toFaDigits(i + 1)}`,
          primary: 0,
          secondary: 0,
        }));

  const width = 560;
  const height = 190;
  const padLeft = 36;
  const padRight = 20;
  const padTop = 22;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(
    4,
    ...safeData.map((d) => Math.max(d.primary || 0, d.secondary || 0)),
  );

  const xAt = (i: number) =>
    safeData.length <= 1
      ? padLeft + plotW / 2
      : padLeft + (i / (safeData.length - 1)) * plotW;

  const yAt = (val: number) => padTop + plotH - (Math.max(0, val) / maxVal) * plotH;

  const primaryPoints = safeData.map((d, i) => `${xAt(i)},${yAt(d.primary)}`).join(" ");
  const primaryArea = `${xAt(0)},${padTop + plotH} ${primaryPoints} ${xAt(safeData.length - 1)},${padTop + plotH}`;

  const hasSecondary = Boolean(secondaryLabel);
  const secondaryPoints = hasSecondary
    ? safeData.map((d, i) => `${xAt(i)},${yAt(d.secondary ?? 0)}`).join(" ")
    : "";

  const gridSteps = [0, 0.5, 1];

  return (
    <div className="chart-card">
      <div className="chart-card__head">
        <div>
          <h3 className="chart-card__title">{title}</h3>
          {subtitle ? <p className="chart-card__sub">{subtitle}</p> : null}
        </div>
        <div className="chart-legend">
          <span className="chart-legend__item">
            <span className="chart-legend__dot" style={{ background: primaryColor }} />
            {primaryLabel}
          </span>
          {hasSecondary ? (
            <span className="chart-legend__item">
              <span className="chart-legend__dot" style={{ background: secondaryColor }} />
              {secondaryLabel}
            </span>
          ) : null}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        role="img"
        aria-label={title}
      >
        <defs>
          <linearGradient id="chartGradPrimary" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {gridSteps.map((step) => {
          const val = Math.round(maxVal * step);
          const y = yAt(val);
          return (
            <g key={step}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--text-3)"
                fontSize="10"
              >
                {toFaDigits(val)}
              </text>
            </g>
          );
        })}

        <polygon points={primaryArea} fill="url(#chartGradPrimary)" />
        <polyline
          fill="none"
          stroke={primaryColor}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={primaryPoints}
        />

        {hasSecondary ? (
          <polyline
            fill="none"
            stroke={secondaryColor}
            strokeWidth="2.2"
            strokeDasharray="5 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={secondaryPoints}
          />
        ) : null}

        {safeData.map((d, i) => {
          const cx = xAt(i);
          const cy = yAt(d.primary);
          return (
            <g key={d.label + i}>
              <circle cx={cx} cy={cy} r="4" fill={primaryColor} />
              {hasSecondary ? (
                <circle
                  cx={cx}
                  cy={yAt(d.secondary ?? 0)}
                  r="3.2"
                  fill={secondaryColor}
                />
              ) : null}
              <text
                x={cx}
                y={height - 10}
                textAnchor="middle"
                fill="var(--text-3)"
                fontSize="10"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Donut Distribution Chart                                                */
/* -------------------------------------------------------------------------- */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  title,
  centerLabel,
  slices,
}: {
  title: string;
  centerLabel: string;
  slices: DonutSlice[];
}) {
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;

  return (
    <div className="chart-card">
      <h3 className="chart-card__title">{title}</h3>
      <div className="donut-layout">
        <div className="donut-ring-wrap">
          <svg viewBox="0 0 116 116" width="116" height="116" aria-hidden="true">
            <circle
              cx="58"
              cy="58"
              r={radius}
              fill="none"
              stroke="var(--surface-3, rgba(255,255,255,0.08))"
              strokeWidth="12"
            />
            {total > 0
              ? slices.map((slice) => {
                  const val = Math.max(0, slice.value);
                  const ratio = val / total;
                  const dash = ratio * circumference;
                  const offset = -accumulated * circumference;
                  accumulated += ratio;
                  if (val === 0) return null;
                  return (
                    <circle
                      key={slice.label}
                      cx="58"
                      cy="58"
                      r={radius}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth="12"
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={offset}
                      transform="rotate(-90 58 58)"
                    />
                  );
                })
              : null}
          </svg>
          <div className="donut-center">
            <strong className="ltr">{toFaDigits(total)}</strong>
            <span>{centerLabel}</span>
          </div>
        </div>
        <div className="donut-legend">
          {slices.map((s) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
            return (
              <div key={s.label} className="donut-legend__row">
                <span className="donut-legend__name">
                  <span className="chart-legend__dot" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="donut-legend__val ltr">
                  {toFaDigits(s.value)} ({toFaDigits(pct)}٪)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Horizontal Distribution Bars (Tiers / Faucets / Sinks)                  */
/* -------------------------------------------------------------------------- */

export interface BarItem {
  label: string;
  value: number;
  color: string;
}

export function HorizontalBarChart({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: BarItem[];
}) {
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((sum, i) => sum + i.value, 0);

  return (
    <div className="chart-card">
      <div className="chart-card__head">
        <div>
          <h3 className="chart-card__title">{title}</h3>
          {subtitle ? <p className="chart-card__sub">{subtitle}</p> : null}
        </div>
        <span className="chart-card__badge ltr">مجموع: {toFaDigits(total)}</span>
      </div>
      <div className="hbar-list">
        {items.map((item) => {
          const widthPct = Math.round((item.value / maxVal) * 100);
          return (
            <div key={item.label} className="hbar-row">
              <div className="hbar-row__top">
                <span>{item.label}</span>
                <strong className="ltr">{toFaDigits(item.value)}</strong>
              </div>
              <div className="hbar-track">
                <div
                  className="hbar-fill"
                  style={{
                    width: `${Math.max(item.value > 0 ? 6 : 0, widthPct)}%`,
                    background: item.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
