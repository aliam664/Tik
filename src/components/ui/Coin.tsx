import type { TierInfoJson } from "@/types/api";

/**
 * SharifCoin — the platform's virtual coin.
 * Design: a golden, milled-edge coin with a lowercase `sh` lettermark
 * dead-center (as specified by the product owner).
 */
export function ShCoin({
  size = 22,
  title = "شریف‌کوین",
}: {
  size?: number;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className="sh-coin"
    >
      <defs>
        <radialGradient id="sh-coin-face" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#FFD966" />
          <stop offset="55%" stopColor="#F5B301" />
          <stop offset="100%" stopColor="#C98A00" />
        </radialGradient>
      </defs>
      {/* milled rim */}
      <circle cx="24" cy="24" r="22.5" fill="#A67300" />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i * Math.PI * 2) / 24;
        return (
          <rect
            key={i}
            x="23.1"
            y="0.6"
            width="1.8"
            height="3.6"
            rx="0.8"
            fill="#8A5F00"
            transform={`rotate(${(a * 180) / Math.PI} 24 24)`}
          />
        );
      })}
      <circle cx="24" cy="24" r="20" fill="url(#sh-coin-face)" />
      <circle
        cx="24"
        cy="24"
        r="16.5"
        fill="none"
        stroke="#C98A00"
        strokeWidth="1.4"
        opacity="0.85"
      />
      {/* the sh lettermark — dead center */}
      <text
        x="24"
        y="24"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Vazirmatn, system-ui, sans-serif"
        fontWeight="700"
        fontSize="15.5"
        letterSpacing="0.5"
        fill="#7A5200"
      >
        sh
      </text>
    </svg>
  );
}

/** Coin + amount in Persian digits (e.g. «۲۵۰ sh»). */
export function CoinAmount({
  amount,
  size = 18,
  signed = false,
}: {
  amount: number;
  size?: number;
  signed?: boolean;
}) {
  const fa = new Intl.NumberFormat("fa-IR").format(Math.abs(amount));
  const sign = signed ? (amount > 0 ? "+" : amount < 0 ? "−" : "") : amount < 0 ? "−" : "";
  return (
    <span className={`coin-amount ${signed ? (amount >= 0 ? "coin-amount--pos" : "coin-amount--neg") : ""}`}>
      <ShCoin size={size} />
      <span className="ltr">
        {sign}
        {fa} sh
      </span>
    </span>
  );
}

const TIER_COLORS: Record<string, string> = {
  bronze: "#A97142",
  silver: "#8FA3B0",
  gold: "#D4A017",
  platinum: "#5BA8A0",
  diamond: "#5B7FD4",
  master: "#B04AC7",
};

const TIER_TITLES: Record<string, string> = {
  bronze: "برنز",
  silver: "نقره",
  gold: "طلا",
  platinum: "پلاتین",
  diamond: "الماس",
  master: "استاد",
};

export function TierBadge({
  tier,
  compact = false,
}: {
  tier: TierInfoJson | { tier: string; division: number } | null;
  compact?: boolean;
}) {
  if (!tier) return null;
  const color = TIER_COLORS[tier.tier] ?? "#888";
  const name = TIER_TITLES[tier.tier] ?? tier.tier;
  const label =
    tier.tier === "master" ? name : `${name} ${["", "I", "II", "III", "IV"][tier.division] ?? ""}`;
  return (
    <span
      className={`tier-badge ${compact ? "tier-badge--compact" : ""}`}
      style={{ ["--tier-color" as string]: color }}
    >
      <span className="tier-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
