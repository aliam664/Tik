import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Badge, Card } from "@/features/wordGame/WordUiPrimitives";
import {
  codeBreakerAudio,
  saveCodeBreakerSession,
  SoloCodeBreakerController,
} from "@/games/codeBreaker/engine";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { codeBreakerApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import type { CodeBreakerStateResponse } from "@/types/codeBreaker";
import { CodeBreakerArenaView } from "./CodeBreakerArenaView";

export function CodeBreakerLobbyPage() {
  useDocumentTitle("رمزگشا — رقابت زنده کشف کد ۴ رقمی");
  const navigate = useNavigate();
  const { showToast: show } = useToast();
  const { profile, token: profileToken } = useEconomyProfile();

  const [displayName, setDisplayName] = useState(() => profile?.display_name ?? "");
  const [joinCode, setJoinCode] = useState("");
  const [attemptLimitOption, setAttemptLimitOption] = useState<number>(0); // 0 = unlimited default
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  // Embedded Solo Competitive Duel vs Tactical AI Opponent
  const [soloCtrl, setSoloCtrl] = useState<SoloCodeBreakerController | null>(null);
  const [soloSnapshot, setSoloSnapshot] = useState<CodeBreakerStateResponse | null>(null);
  const aiIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (profile?.display_name && !displayName) {
      setDisplayName(profile.display_name);
    }
  }, [profile?.display_name, displayName]);

  const effectiveName = useMemo(
    () => (displayName.trim() || profile?.display_name || "رمزگشا").slice(0, 24),
    [displayName, profile?.display_name],
  );

  // Real-time independent AI opponent guesses every ~5.5s during active solo duel!
  useEffect(() => {
    if (!soloCtrl || soloSnapshot?.state.status !== "active") {
      if (aiIntervalRef.current) {
        window.clearInterval(aiIntervalRef.current);
        aiIntervalRef.current = null;
      }
      return;
    }

    aiIntervalRef.current = window.setInterval(() => {
      const updated = soloCtrl.triggerAiStep();
      if (updated) {
        setSoloSnapshot(updated);
      }
    }, 5500);

    return () => {
      if (aiIntervalRef.current) {
        window.clearInterval(aiIntervalRef.current);
        aiIntervalRef.current = null;
      }
    };
  }, [soloCtrl, soloSnapshot?.state.status, soloSnapshot?.state.current_round]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    if (effectiveName.trim().length < 2) {
      show("لطفاً یک نام نمایشی حداقل ۲ حرفی وارد کنید.", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await codeBreakerApi.createRoom(effectiveName, {
        maxAttemptsPerPlayer: attemptLimitOption > 0 ? attemptLimitOption : null,
        profileToken,
      });
      saveCodeBreakerSession({
        roomCode: res.room_code,
        playerToken: res.player_token,
        seat: res.seat,
        displayName: effectiveName,
        savedAt: new Date().toISOString(),
      });
      codeBreakerAudio.play("ready_chime");
      navigate(`/games/code-breaker/room/${res.room_code}`);
    } catch (err) {
      show(getErrorMessage(err), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joining) return;
    const cleanCode = joinCode.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      show("کد اتاق باید دقیقاً ۶ کاراکتر باشد.", "error");
      return;
    }
    setJoining(true);
    try {
      const res = await codeBreakerApi.joinRoom(cleanCode, effectiveName, profileToken);
      saveCodeBreakerSession({
        roomCode: res.room_code,
        playerToken: res.player_token,
        seat: res.seat,
        displayName: effectiveName,
        savedAt: new Date().toISOString(),
      });
      codeBreakerAudio.play("ready_chime");
      navigate(`/games/code-breaker/room/${res.room_code}`);
    } catch (err) {
      show(getErrorMessage(err), "error");
    } finally {
      setJoining(false);
    }
  };

  const startSoloDuel = () => {
    const ctrl = new SoloCodeBreakerController(
      effectiveName,
      attemptLimitOption > 0 ? attemptLimitOption : null,
    );
    codeBreakerAudio.play("ready_chime");
    setSoloCtrl(ctrl);
    setSoloSnapshot(ctrl.getSnapshot());
  };

  if (soloCtrl && soloSnapshot) {
    return (
      <div className="container stack stack--lg" style={{ paddingBlock: "1.5rem" }}>
        <div className="row row--between row--wrap">
          <div className="row row--xs">
            <Badge tone="gold">مسابقه تمرینی زنده با رقیب هوشمند منطقی</Badge>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              رقیب AI به‌صورت مستقل و هم‌زمان با شما برای کشف کد مخفی ۴ رقمی تلاش می‌کند!
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSoloCtrl(null);
              setSoloSnapshot(null);
            }}
          >
            ← بازگشت به لابی آنلاین ۲ نفره
          </Button>
        </div>

        <CodeBreakerArenaView
          snapshot={soloSnapshot}
          isSolo={true}
          actions={{
            onSetReady: (r) => setSoloSnapshot(soloCtrl.setReady(r)),
            onSubmitGuess: (code) => {
              try {
                setSoloSnapshot(soloCtrl.submitGuess(code));
                return true;
              } catch (err) {
                show(getErrorMessage(err), "error");
                return false;
              }
            },
            onRematch: () => setSoloSnapshot(soloCtrl.rematch()),
            onLeave: () => {
              setSoloCtrl(null);
              setSoloSnapshot(null);
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className="container stack stack--lg" style={{ paddingBlock: "1.75rem" }}>
      {/* Hero Banner */}
      <section className="cb-hero">
        <div className="stack stack--md">
          <div className="row row--xs row--wrap">
            <Badge tone="gold">بازی رقابتی جدید · هم‌زمان</Badge>
            <Badge tone="success">Server-Authoritative · Zero-Leak</Badge>
            <Badge tone="info">پاداش Sheriff Coin</Badge>
          </div>
          <h1 style={{ fontSize: "clamp(1.7rem, 3.3vw, 2.45rem)", margin: 0 }}>
            رمزگشا — نبرد زنده کشف کد مخفی ۴ رقمی
          </h1>
          <p className="muted" style={{ margin: 0, lineHeight: 1.75 }}>
            سرور یک <strong>کد مخفی ۴ رقمی واحد</strong> (شامل صفرهای ابتدایی مثل{" "}
            <code style={{ color: "#f3be58" }}>0072</code> و ارقام تکراری مثل{" "}
            <code style={{ color: "#f3be58" }}>9090</code>) تولید می‌کند. هر دو بازیکن به‌طور{" "}
            <strong>مستقل و هم‌زمان</strong> حدس می‌زنند، تاریخچه کامل و دقیق هر دو نفر را زنده می‌بینند و اولین نفری که هر ۴ جایگاه را سبز کند <strong>برنده فوری راند</strong> است!
          </p>
          <div className="row row--sm row--wrap">
            <Button onClick={startSoloDuel} variant="secondary">
              ⚡ شروع فوری رقابت تک‌نفره با AI
            </Button>
          </div>
        </div>

        <div className="cb-hero__media">
          <img
            src="/assets/code-breaker/hero-banner.png"
            alt="رمزگشا — نبرد کشف کد ۴ رقمی"
          />
        </div>
      </section>

      {/* Three Action Cards: Create Room | Join Room | Rules & Feedback Guide */}
      <div className="cb-lobby-grid">
        {/* Card 1: Create Multiplayer Room */}
        <Card className="stack stack--md">
          <div className="row row--between">
            <h2 style={{ margin: 0, fontSize: "1.2rem" }}>۱. ساخت اتاق ۲ نفره آنلاین</h2>
            <Badge tone="gold">میزبان</Badge>
          </div>

          <form onSubmit={handleCreateRoom} className="stack stack--sm">
            <label className="stack stack--xs">
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>نام نمایشی شما</span>
              <input
                className="input"
                type="text"
                maxLength={24}
                placeholder="مثلاً علی..."
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>

            <label className="stack stack--xs">
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                محدودیت تعداد تلاش (اختیاری)
              </span>
              <select
                className="input"
                value={attemptLimitOption}
                onChange={(e) => setAttemptLimitOption(Number(e.target.value))}
              >
                <option value={0}>بدون محدودیت تلاش (استاندارد رقابتی)</option>
                <option value={10}>حداکثر ۱۰ تلاش برای هر بازیکن</option>
                <option value={15}>حداکثر ۱۵ تلاش برای هر بازیکن</option>
                <option value={20}>حداکثر ۲۰ تلاش برای هر بازیکن</option>
              </select>
            </label>

            <Button type="submit" loading={creating}>
              ساخت اتاق و دریافت کد دعوت ←
            </Button>
          </form>
        </Card>

        {/* Card 2: Join Existing Room */}
        <Card className="stack stack--md">
          <div className="row row--between">
            <h2 style={{ margin: 0, fontSize: "1.2rem" }}>۲. ورود به اتاق با کد دعوت</h2>
            <Badge tone="info">مهمان</Badge>
          </div>

          <form onSubmit={handleJoinRoom} className="stack stack--sm">
            <label className="stack stack--xs">
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>نام نمایشی شما</span>
              <input
                className="input"
                type="text"
                maxLength={24}
                placeholder="نام شما..."
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>

            <label className="stack stack--xs">
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>کد ۶ کاراکتری اتاق</span>
              <input
                className="input"
                type="text"
                maxLength={6}
                dir="ltr"
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.22em",
                  fontFamily: "monospace",
                  fontWeight: 800,
                }}
                placeholder="AB39XZ"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
            </label>

            <Button type="submit" variant="secondary" loading={joining}>
              ورود به لابی اتاق ←
            </Button>
          </form>
        </Card>

        {/* Card 3: Deterministic Feedback Spec */}
        <Card className="stack stack--sm">
          <div className="row row--between">
            <h2 style={{ margin: 0, fontSize: "1.2rem" }}>۳. قوانین دقیق رنگ‌ها</h2>
            <Badge tone="success">قطعی و شفاف</Badge>
          </div>

          <p className="muted" style={{ margin: 0, fontSize: "0.84rem", lineHeight: 1.7 }}>
            کد مخفی دقیقاً یک رشته ۴ رقمی از <code>0000</code> تا <code>9999</code> است. پس از تایید آمادگی هر دو بازیکن، تایمر سرور آغاز می‌شود:
          </p>

          <div className="stack stack--xs" style={{ fontSize: "0.83rem" }}>
            <div>
              <strong style={{ color: "#6ee7b7" }}>🟢 سبز (GREEN):</strong> هم رقم درست است و هم جایگاه آن (P1 تا P4) کاملاً درست است.
            </div>
            <div>
              <strong style={{ color: "#fcd34d" }}>🟡 زرد (YELLOW):</strong> رقم در باقی‌مانده ارقام تطبیق‌نیافته کد مخفی وجود دارد ولی جایگاهش متفاوت است (بدون شمارش مضاعف ارقام تکراری!).
            </div>
            <div>
              <strong style={{ color: "#fca5a5" }}>🔴 قرمز (RED):</strong> این رقم اصلاً در کد مخفی نیست یا ظرفیت تکرار آن قبلاً پر شده است.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
