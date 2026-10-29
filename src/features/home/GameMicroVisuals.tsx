import { useEffect, useState, type MouseEvent } from "react";
import { Lock, Radio, ShieldCheck } from "lucide-react";
import { toFaDigits } from "@/lib/format";

const LAST_NIGHT_MAPS = [
  {
    id: "village",
    name: "دهکده نفرین‌شده",
    wave: "موج ۱–۳",
    src: "/assets/last-night/map-cursed-village.png",
  },
  {
    id: "forest",
    name: "جنگل تاریک",
    wave: "موج ۴–۶",
    src: "/assets/last-night/map-cursed-forest.png",
  },
  {
    id: "snow",
    name: "جنگل برفی",
    wave: "موج ۷–۸",
    src: "/assets/last-night/map-snowy-forest.png",
  },
  {
    id: "catacombs",
    name: "دخمه‌های باستانی",
    wave: "موج ۹–۱۰",
    src: "/assets/last-night/map-ancient-catacombs.png",
  },
] as const;

const CIPHER_ATTEMPTS: readonly {
  digits: readonly [string, string, string, string];
  pins: readonly ("exact" | "near" | "miss")[];
  tag: string;
}[] = [
  { digits: ["4", "8", "1", "5"], pins: ["miss", "miss", "miss", "miss"], tag: "TRY 01" },
  { digits: ["0", "2", "7", "9"], pins: ["exact", "near", "exact", "miss"], tag: "TRY 02" },
  { digits: ["0", "0", "7", "2"], pins: ["exact", "exact", "exact", "exact"], tag: "UNLOCKED" },
];

const WORD_MATRIX: readonly {
  word: string;
  role: "idle" | "related" | "clue" | "target";
}[] = [
  { word: "سحابی", role: "related" },
  { word: "قطب‌نما", role: "idle" },
  { word: "مدار", role: "clue" },
  { word: "آیینه", role: "idle" },
  { word: "فانوس", role: "idle" },
  { word: "کهکشان", role: "target" },
  { word: "رصد", role: "related" },
  { word: "ساعت", role: "idle" },
];

/* ------------------------------------------------------------------ */
/* 1. Last Night — Interactive 4-Map Medieval Pixel Showcase           */
/* ------------------------------------------------------------------ */

export function LastNightVisual() {
  const [mapIdx, setMapIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMapIdx((prev) => (prev + 1) % LAST_NIGHT_MAPS.length);
    }, 3800);
    return () => window.clearInterval(id);
  }, []);

  const activeMap = LAST_NIGHT_MAPS[mapIdx];

  const selectMap = (idx: number, e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setMapIdx(idx);
  };

  return (
    <div className="hp-vis hp-vis--ln" aria-hidden="true">
      <img
        key={activeMap.src}
        src={activeMap.src}
        alt=""
        className="hp-vis__bg hp-vis__bg--pixel"
        loading="lazy"
      />
      <div className="hp-vis__scrim" />

      {/* Floating medieval embers */}
      <span className="hp-ember hp-ember--1" />
      <span className="hp-ember hp-ember--2" />
      <span className="hp-ember hp-ember--3" />
      <span className="hp-ember hp-ember--4" />

      <div className="hp-ln-hud">
        <div className="hp-ln-hud__top">
          <span className="hp-ln-chip ltr">60 FPS · CO-OP</span>
          <span className="hp-ln-boss">
            <img
              src="/assets/last-night/boss-cursed-king.png"
              alt=""
              width={22}
              height={22}
              loading="lazy"
            />
            <span>۳ غول چندفازی</span>
          </span>
        </div>

        <div className="hp-ln-maps">
          {LAST_NIGHT_MAPS.map((m, idx) => (
            <button
              key={m.id}
              type="button"
              tabIndex={-1}
              onClick={(e) => selectMap(idx, e)}
              className={`hp-ln-map-pill ${idx === mapIdx ? "hp-ln-map-pill--active" : ""}`}
            >
              <span className="hp-ln-map-pill__wave">{m.wave}</span>
              <span className="hp-ln-map-pill__name">{m.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Sheriff Blast — Live Exponential Curve Oscilloscope              */
/* ------------------------------------------------------------------ */

const BLAST_TICKS = [124, 168, 219, 287, 364, 428] as const;

export function SheriffBlastVisual() {
  const [tickIdx, setTickIdx] = useState(4);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTickIdx((prev) => (prev + 1) % BLAST_TICKS.length);
    }, 1150);
    return () => window.clearInterval(id);
  }, []);

  const multHundredths = BLAST_TICKS[tickIdx];
  const whole = Math.floor(multHundredths / 100);
  const frac = String(multHundredths % 100).padStart(2, "0");

  return (
    <div className="hp-vis hp-vis--blast" aria-hidden="true">
      <div className="hp-blast-head">
        <span className="hp-blast-live">
          <Radio size={12} />
          سالن هم‌زمان
        </span>
        <span className="hp-blast-hash ltr">
          <ShieldCheck size={12} />
          HMAC-SHA256
        </span>
      </div>

      <div className="hp-blast-mult ltr">
        <span className="hp-blast-mult__val">
          {whole}.{frac}
        </span>
        <span className="hp-blast-mult__x">×</span>
      </div>

      <svg viewBox="0 0 280 110" className="hp-blast-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hp-blast-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e85d4c" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#e85d4c" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="hp-blast-stroke" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#e5a93c" />
            <stop offset="65%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ff6b57" />
          </linearGradient>
        </defs>
        {/* Reference hairlines */}
        <line x1="0" y1="28" x2="280" y2="28" className="hp-blast-grid" />
        <line x1="0" y1="60" x2="280" y2="60" className="hp-blast-grid" />
        <line x1="0" y1="92" x2="280" y2="92" className="hp-blast-grid" />

        <path
          d="M 8 98 Q 118 94, 182 64 T 266 16 L 266 104 L 8 104 Z"
          fill="url(#hp-blast-area)"
        />
        <path
          d="M 8 98 Q 118 94, 182 64 T 266 16"
          fill="none"
          stroke="url(#hp-blast-stroke)"
          strokeWidth="2.8"
          strokeLinecap="round"
          pathLength={100}
          className="hp-blast-curve"
        />
        <circle cx="266" cy="16" r="4.5" className="hp-blast-tip" />
        <circle cx="266" cy="16" r="10" className="hp-blast-tip-ring" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Code Breaker — Live 4-Digit Cipher Lock Tumbler                  */
/* ------------------------------------------------------------------ */

export function CodeBreakerVisual({ bannerUrl }: { bannerUrl?: string }) {
  const [step, setStep] = useState(2);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((prev) => (prev + 1) % CIPHER_ATTEMPTS.length);
    }, 2100);
    return () => window.clearInterval(id);
  }, []);

  const attempt = CIPHER_ATTEMPTS[step];

  return (
    <div className="hp-vis hp-vis--cipher" aria-hidden="true">
      {bannerUrl ? <img src={bannerUrl} alt="" className="hp-vis__bg" loading="lazy" /> : null}
      <div className="hp-vis__scrim hp-vis__scrim--heavy" />

      <div className="hp-cipher-box">
        <div className="hp-cipher-head ltr">
          <span>
            <Lock size={11} /> ATOMIC RACE
          </span>
          <span className={`hp-cipher-status ${step === 2 ? "hp-cipher-status--win" : ""}`}>
            {attempt.tag}
          </span>
        </div>
        <div className="hp-cipher-slots ltr">
          {attempt.digits.map((d, i) => (
            <div key={i} className={`hp-cipher-slot hp-cipher-slot--${attempt.pins[i]}`}>
              <span className="hp-cipher-digit">{d}</span>
              <i className="hp-cipher-pin" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Word Cipher (رازواژه) — Semantic Clue Association Matrix          */
/* ------------------------------------------------------------------ */

export function WordCipherVisual({ bannerUrl }: { bannerUrl?: string }) {
  return (
    <div className="hp-vis hp-vis--words" aria-hidden="true">
      {bannerUrl ? <img src={bannerUrl} alt="" className="hp-vis__bg" loading="lazy" /> : null}
      <div className="hp-vis__scrim hp-vis__scrim--heavy" />

      <div className="hp-words-wrap">
        <div className="hp-words-clue">
          <span className="hp-words-clue__tag">سرنخ راهنما:</span>
          <strong>«چرخشی در دل شبِ بی‌انتها»</strong>
        </div>
        <div className="hp-words-grid">
          {WORD_MATRIX.map((item) => (
            <span
              key={item.word}
              className={`hp-word-chip hp-word-chip--${item.role}`}
            >
              {item.word}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Doz Classic — Precision 3×3 Brass Schematic                      */
/* ------------------------------------------------------------------ */

const DOZ_PREVIEW: readonly ("X" | "O" | null)[] = [
  "X", null, "O",
  null, "X", null,
  "O", null, "X",
];

export function DozClassicVisual() {
  return (
    <div className="hp-vis hp-vis--doz" aria-hidden="true">
      <div className="hp-doz-mini">
        {DOZ_PREVIEW.map((cell, idx) => (
          <span
            key={idx}
            className={`hp-doz-mini__cell ${
              cell === "X" ? "hp-doz-mini__cell--x" : cell === "O" ? "hp-doz-mini__cell--o" : ""
            } ${idx === 0 || idx === 4 || idx === 8 ? "hp-doz-mini__cell--win" : ""}`}
          >
            {cell === "X" ? "✕" : cell === "O" ? "◯" : ""}
          </span>
        ))}
      </div>
      <div className="hp-doz-meta">
        <span className="hp-doz-pill">داوری سرور</span>
        <span className="hp-doz-pill">{toFaDigits(6)} تیر Elo</span>
      </div>
    </div>
  );
}

export function GameMicroVisual({ gameId, bannerUrl }: { gameId: string; bannerUrl?: string }) {
  switch (gameId) {
    case "last_night":
      return <LastNightVisual />;
    case "sheriff_blast":
      return <SheriffBlastVisual />;
    case "code_breaker":
      return <CodeBreakerVisual bannerUrl={bannerUrl} />;
    case "word_cipher":
      return <WordCipherVisual bannerUrl={bannerUrl} />;
    default:
      return <DozClassicVisual />;
  }
}
