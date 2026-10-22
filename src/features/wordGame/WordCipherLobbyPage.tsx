import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { saveWordSession } from "@/games/wordGame/session";
import { SoloWordGameController } from "@/games/wordGame/soloEngine";
import { wordCipherAudio } from "@/games/wordGame/sound";
import { WORD_BANK, WORD_CATEGORIES, WORD_PACK_META } from "@/games/wordGame/wordBank";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEconomyProfile } from "@/hooks/useEconomyProfile";
import { wordGameApi } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import type {
  ExtraClueMode,
  GuesserViewMode,
  WordDifficulty,
  WordPackId,
  WordRoomStateResponse,
} from "@/types/wordGame";
import { WordCipherArenaView } from "./WordCipherArenaView";
import { Badge, Card } from "./WordUiPrimitives";
import "@/styles/word-game.css";

export function WordCipherLobbyPage() {
  useDocumentTitle("رازواژه — بازی آنلاین تداعی و حدس کلمات");
  const navigate = useNavigate();
  const { showToast: show } = useToast();
  const { profile, token: profileToken } = useEconomyProfile();

  const [displayName, setDisplayName] = useState(
    () => profile?.display_name ?? "",
  );
  useEffect(() => {
    if (profile?.display_name && !displayName) {
      setDisplayName(profile.display_name);
    }
  }, [profile?.display_name, displayName]);
  const [joinCode, setJoinCode] = useState("");
  const [totalRounds, setTotalRounds] = useState(4);
  const [packId, setPackId] = useState<WordPackId>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | WordDifficulty>("all");
  const [extraClueMode, setExtraClueMode] = useState<ExtraClueMode>("hybrid");
  const [guesserViewMode, setGuesserViewMode] = useState<GuesserViewMode>("blind_typed");
  const [roundTimerSeconds, setRoundTimerSeconds] = useState(120);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  // Embedded Solo Semantic AI Match Controller
  const [soloCtrl, setSoloCtrl] = useState<SoloWordGameController | null>(null);
  const [soloSnapshot, setSoloSnapshot] = useState<WordRoomStateResponse | null>(
    null,
  );

  const effectiveName = useMemo(
    () => (displayName.trim() || profile?.display_name || "بازیکن").slice(0, 24),
    [displayName, profile?.display_name],
  );

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    const cleanName = effectiveName.trim();
    if (cleanName.length < 2) {
      show("لطفاً نام نمایشی حداقل ۲ حرفی وارد کنید.", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await wordGameApi.createRoom(cleanName, {
        totalRounds,
        packId,
        difficultyFilter,
        extraClueMode,
        guesserViewMode,
        roundTimerSeconds,
        profileToken,
      });
      saveWordSession({
        roomCode: res.room_code,
        playerToken: res.player_token,
        seat: res.seat,
        displayName: cleanName,
        savedAt: new Date().toISOString(),
      });
      wordCipherAudio.play("card_select");
      navigate(`/games/word-cipher/room/${res.room_code}`);
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
    const cleanName = effectiveName.trim();
    if (cleanCode.length !== 6) {
      show("کد اتاق باید ۶ کاراکتر باشد.", "error");
      return;
    }
    if (cleanName.length < 2) {
      show("لطفاً نام نمایشی حداقل ۲ حرفی وارد کنید.", "error");
      return;
    }
    setJoining(true);
    try {
      const res = await wordGameApi.joinRoom(cleanCode, cleanName, profileToken);
      saveWordSession({
        roomCode: res.room_code,
        playerToken: res.player_token,
        seat: res.seat,
        displayName: cleanName,
        savedAt: new Date().toISOString(),
      });
      wordCipherAudio.play("clue_sent");
      navigate(`/games/word-cipher/room/${res.room_code}`);
    } catch (err) {
      show(getErrorMessage(err), "error");
    } finally {
      setJoining(false);
    }
  };

  const handleStartSolo = () => {
    const ctrl = new SoloWordGameController(effectiveName, {
      totalRounds,
      packId,
      difficultyFilter,
      extraClueMode,
      guesserViewMode,
      roundTimerSeconds: 0,
    });
    wordCipherAudio.play("card_select");
    setSoloCtrl(ctrl);
    setSoloSnapshot(ctrl.getPublicSnapshot());
  };

  // =========================================================================
  // Active Solo Practice Arena Mode
  // =========================================================================
  if (soloCtrl && soloSnapshot) {
    return (
              <div className="container stack stack--lg" style={{ paddingBlock: "1.5rem" }}>
          <div className="row row--between row--wrap">
            <div className="row row--sm row--wrap">
              <Badge tone="gold">حالت تک‌نفره با هوش مصنوعی رازواژه</Badge>
              <span className="muted" style={{ fontSize: "0.88rem" }}>
                چرخش کامل نقش‌ها: یک راند شما حدس می‌زنید، راند بعد شما از ۱۶ کارت انتخاب می‌کنید و AI حدس می‌زند!
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
              بازگشت به لابی آنلاین رازواژه
            </Button>
          </div>

          <WordCipherArenaView
            snapshot={soloSnapshot}
            isSolo
            actions={{
              onSelectTarget: (wordId) => {
                try {
                  setSoloSnapshot(soloCtrl.selectTargetCard(wordId));
                } catch (err) {
                  show(getErrorMessage(err), "error");
                }
              },
              onSubmitClue: (clueText, kind) => {
                try {
                  const res = soloCtrl.submitHumanClue(clueText, kind);
                  if (res.evaluation?.outcome === "correct") {
                    wordCipherAudio.play("guess_correct");
                  } else if (res.evaluation?.outcome === "related") {
                    wordCipherAudio.play("guess_related");
                  } else {
                    wordCipherAudio.play("guess_wrong");
                  }
                  setSoloSnapshot(res);
                } catch (err) {
                  show(getErrorMessage(err), "error");
                }
              },
              onRequestHint: () => {
                try {
                  setSoloSnapshot(soloCtrl.requestExtraHint());
                } catch (err) {
                  show(getErrorMessage(err), "error");
                }
              },
              onSubmitGuess: (guessText) => {
                try {
                  const res = soloCtrl.submitHumanGuess(guessText);
                  if (res.evaluation?.outcome === "correct") {
                    wordCipherAudio.play("guess_correct");
                  } else if (res.evaluation?.outcome === "related") {
                    wordCipherAudio.play("guess_related");
                  } else {
                    wordCipherAudio.play("guess_wrong");
                  }
                  setSoloSnapshot(res);
                  return true;
                } catch (err) {
                  show(getErrorMessage(err), "error");
                  return false;
                }
              },
              onNextRound: () => {
                const res = soloCtrl.nextRound();
                if (res.state.status === "finished") {
                  wordCipherAudio.play("match_victory");
                }
                setSoloSnapshot(res);
              },
              onRematch: () => {
                wordCipherAudio.play("card_select");
                setSoloSnapshot(soloCtrl.rematch());
              },
              onLeave: () => {
                setSoloCtrl(null);
                setSoloSnapshot(null);
              },
            }}
          />
        </div>
          );
  }

  // =========================================================================
  // Main Multiplayer + Solo Lobby View
  // =========================================================================
  return (
          <div className="container stack stack--lg" style={{ paddingBlock: "1.75rem" }}>
        {/* Hero Banner */}
        <section className="wg-hero">
          <div className="stack stack--md">
            <div className="wg-hero__badges">
              <Badge tone="gold">RAZ-VAJEH · WORD CIPHER</Badge>
              <Badge tone="success">۲ نفره آنلاین + تمرین با AI</Badge>
              <Badge tone="info">{WORD_CATEGORIES.length} دسته‌بندی · {WORD_BANK.length} واژه</Badge>
            </div>
            <h1 style={{ margin: 0 }}>رازواژه — نبرد تداعی و کشف واژه مخفی</h1>
            <p className="muted" style={{ lineHeight: 1.75 }}>
              در هر راند <strong>۴ دسته‌بندی و ۱۶ کارت واژه</strong> آماده می‌شود. بازیکن{" "}
              <strong>راهنما</strong> یک واژه مخفی انتخاب کرده و سرنخ هوشمند می‌دهد؛ بازیکن{" "}
              <strong>حدس‌زننده</strong> بدون دیدن واژه هدف، با کمک حداکثر{" "}
              <strong>۲ سرنخ محدودکننده کمکی</strong> و تشخیص پاسخ‌های{" "}
              <strong>درست / مرتبط / نادرست</strong> واژه را کشف می‌کند و در راند بعد نقش‌ها جابه‌جا می‌شوند!
            </p>
            <div className="row row--sm row--wrap">
              <Button onClick={handleStartSolo} variant="secondary">
                ⚡ شروع فوری تمرین تک‌نفره با AI
              </Button>
              {profile && (
                <Badge tone="gold">
                  پروفایل متصل: {profile.display_name} (دریافت خودکار Sheriff Coin)
                </Badge>
              )}
            </div>
          </div>

          <div className="wg-hero__media">
            <img
              src="/assets/word-cipher/hero-banner.png"
              alt="رازواژه — بازی ۱۶ کارتی تداعی و حدس کلمات"
            />
          </div>
        </section>

        {/* Shared Display Name Bar */}
        <Card className="row row--between row--wrap" style={{ gap: "1rem" }}>
          <div className="stack stack--xs" style={{ flex: "1 1 260px" }}>
            <label htmlFor="wg-player-name" style={{ fontWeight: 700 }}>
              نام نمایشی شما در بازی رازواژه
            </label>
            <input
              id="wg-player-name"
              className="input"
              type="text"
              maxLength={24}
              placeholder="مثلاً: آرش، سارا، کارآگاه..."
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <p className="muted" style={{ maxWidth: 460, fontSize: "0.86rem", margin: 0 }}>
            اتاق‌های آنلاین روی دو دستگاه جداگانه (موبایل و دسکتاپ) همگام‌سازی زنده دارند و واژه مخفی تا پایان راند هرگز به مرورگر حدس‌زننده ارسال نمی‌شود.
          </p>
        </Card>

        {/* 3 Main Action Cards */}
        <div className="wg-lobby-grid">
          {/* 1. Create Online Room */}
          <Card className="stack stack--md">
            <div className="stack stack--xs">
              <Badge tone="gold">ساخت اتاق خصوصی آنلاین</Badge>
              <h2>میزبانی اتاق ۲ نفره</h2>
              <p className="muted" style={{ fontSize: "0.88rem" }}>
                قوانین راند را تنظیم کنید و کد ۶ رقمی یا لینک مستقیم دعوت را برای دوست خود بفرستید.
              </p>
            </div>

            <form onSubmit={handleCreateRoom} className="stack stack--sm">
              <div className="wg-config-grid">
                <label className="stack stack--xs">
                  <span style={{ fontSize: "0.82rem" }}>تعداد راند</span>
                  <select
                    className="input"
                    value={totalRounds}
                    onChange={(e) => setTotalRounds(Number(e.target.value))}
                  >
                    <option value={2}>۲ راند (سریع)</option>
                    <option value={4}>۴ راند (استاندارد)</option>
                    <option value={6}>۶ راند (رقابتی)</option>
                  </select>
                </label>

                <label className="stack stack--xs">
                  <span style={{ fontSize: "0.82rem" }}>زمان هر راند</span>
                  <select
                    className="input"
                    value={roundTimerSeconds}
                    onChange={(e) => setRoundTimerSeconds(Number(e.target.value))}
                  >
                    <option value={90}>۹۰ ثانیه</option>
                    <option value={120}>۱۲۰ ثانیه</option>
                    <option value={180}>۱۸۰ ثانیه</option>
                    <option value={0}>بدون زمان‌سنج</option>
                  </select>
                </label>

                <label className="stack stack--xs">
                  <span style={{ fontSize: "0.82rem" }}>بسته موضوعی</span>
                  <select
                    className="input"
                    value={packId}
                    onChange={(e) => setPackId(e.target.value as WordPackId)}
                  >
                    {WORD_PACK_META.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.titleFa}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="stack stack--xs">
                  <span style={{ fontSize: "0.82rem" }}>سطح دشواری</span>
                  <select
                    className="input"
                    value={difficultyFilter}
                    onChange={(e) =>
                      setDifficultyFilter(e.target.value as "all" | WordDifficulty)
                    }
                  >
                    <option value="all">ترکیبی متعادل</option>
                    <option value="easy">آسان</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">دشوار (+امتیاز ویژه)</option>
                  </select>
                </label>
              </div>

              <label className="stack stack--xs">
                <span style={{ fontSize: "0.82rem" }}>قانون ۲ سرنخ/واژه کمکی محدودکننده</span>
                <select
                  className="input"
                  value={extraClueMode}
                  onChange={(e) => setExtraClueMode(e.target.value as ExtraClueMode)}
                >
                  <option value="hybrid">
                    ترکیبی: سرنخ بازیکن راهنما + قابلیت ۲ راهنمای کمکی (پیشنهادی)
                  </option>
                  <option value="system_hints">
                    خودکار: افزودن خودکار واژه کمکی پس از حدس نادرست
                  </option>
                  <option value="clue_giver_only">
                    کلاسیک: فقط سرنخ‌های نوشته‌شده توسط بازیکن راهنما
                  </option>
                </select>
              </label>

              <label className="stack stack--xs">
                <span style={{ fontSize: "0.82rem" }}>دید حدس‌زننده حین راند</span>
                <select
                  className="input"
                  value={guesserViewMode}
                  onChange={(e) =>
                    setGuesserViewMode(e.target.value as GuesserViewMode)
                  }
                >
                  <option value="blind_typed">
                    کاملاً مخفی + تایپ آزاد پاسخ (پیش‌فرض استاندارد)
                  </option>
                  <option value="categories_visible">
                    نمایش نام ۴ دسته‌بندی راند (بدون نمایش واژه‌ها)
                  </option>
                  <option value="board_16">
                    نمایش ۱۶ کارت روی میز (واژه هدف کاملاً مخفی)
                  </option>
                </select>
              </label>

              <Button type="submit" loading={creating}>
                ساخت اتاق و دریافت کد دعوت ←
              </Button>
            </form>
          </Card>

          {/* 2. Join Online Room */}
          <Card className="stack stack--md">
            <div className="stack stack--xs">
              <Badge tone="info">اتصال از دستگاه دوم</Badge>
              <h2>ورود با کد ۶ رقمی اتاق</h2>
              <p className="muted" style={{ fontSize: "0.88rem" }}>
                کد ۶ کاراکتری میزبان را وارد کنید تا بلافاصله راند اول با تخصیص نقش‌ها آغاز شود.
              </p>
            </div>

            <form onSubmit={handleJoinRoom} className="stack stack--sm">
              <label className="stack stack--xs">
                <span>کد اتاق</span>
                <input
                  className="input"
                  dir="ltr"
                  style={{
                    textAlign: "center",
                    letterSpacing: "0.25em",
                    fontWeight: 800,
                    fontSize: "1.2rem",
                  }}
                  maxLength={6}
                  placeholder="K7M4P9"
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                />
              </label>

              <Button
                type="submit"
                variant="secondary"
                loading={joining}
                disabled={joinCode.length < 6}
              >
                پیوستن به اتاق و شروع بازی
              </Button>
            </form>

            <div className="stack stack--xs" style={{ marginTop: "auto" }}>
              <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                جدول امتیازدهی هر راند:
              </span>
              <p className="muted" style={{ fontSize: "0.82rem", margin: 0, lineHeight: 1.7 }}>
                • کشف با سرنخ اول: <strong>+۱۲ امتیاز</strong> حدس‌زننده و <strong>+۸</strong> راهنما
                <br />• کشف با سرنخ دوم: <strong>+۹ امتیاز</strong> حدس‌زننده و <strong>+۶</strong> راهنما
                <br />• کشف با سرنخ سوم: <strong>+۶ امتیاز</strong> حدس‌زننده و <strong>+۴</strong> راهنما
                <br />• پاسخ معنایی مرتبط: <strong>+۲ امتیاز</strong> راهنمای مسیر
              </p>
            </div>
          </Card>

          {/* 3. Solo AI & Word Bank Showcase */}
          <Card className="stack stack--md">
            <div className="stack stack--xs">
              <Badge tone="success">تمرین فوری بدون انتظار</Badge>
              <h2>بازی تک‌نفره با هوش مصنوعی</h2>
              <p className="muted" style={{ fontSize: "0.88rem" }}>
                قوانین انتخابی همین صفحه (بسته موضوعی، دشواری و تعداد راند) مستقیماً در مسابقه با هوش مصنوعی رازواژه اعمال می‌شود.
              </p>
            </div>

            <Button onClick={handleStartSolo}>شروع بازی تک‌نفره با AI ⚡</Button>

            <div className="stack stack--xs">
              <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                ۱۲ دسته‌بندی فعال بانک واژگان:
              </span>
              <div className="row row--xs row--wrap">
                {WORD_CATEGORIES.map((cat) => (
                  <Badge key={cat.id} tone="neutral">
                    {cat.icon} {cat.titleFa}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
      );
}
