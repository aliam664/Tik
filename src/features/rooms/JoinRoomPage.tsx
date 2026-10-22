import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { saveCodeBreakerSession } from "@/games/codeBreaker/engine";
import { saveLnSession } from "@/games/lastNight/session";
import { saveWordSession } from "@/games/wordGame/session";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { api, codeBreakerApi, lastNightApi, wordGameApi } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { displayNameError, roomCodeError } from "@/lib/format";
import { normalizeRoomCode, playerSession } from "@/lib/session";

export function JoinRoomPage() {
  useDocumentTitle("ورود به اتاق | دوز آنلاین");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [code, setCode] = useState(() => normalizeRoomCode(searchParams.get("code")) ?? "");
  const [name, setName] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cErr = roomCodeError(code);
    const nErr = displayNameError(name);
    setCodeError(cErr);
    setNameError(nErr);
    if (cErr || nErr) return;

    const normalized = normalizeRoomCode(code)!;
    const cleanName = name.trim();
    setSubmitting(true);
    try {
      // 1. Primary path: DOZ Classic room
      try {
        const res = await api.joinRoom(normalized, cleanName);
        playerSession.save(res.room_code, res.player_token, res.symbol);
        navigate(`/room/${res.room_code}`, { replace: true });
        return;
      } catch (dozErr) {
        if (toUserError(dozErr).code !== "ROOM_NOT_FOUND") throw dozErr;
      }

      // 2. Fallback path: Code Breaker (رمزگشا — کد ۴ رقمی)
      try {
        const cbRes = await codeBreakerApi.joinRoom(normalized, cleanName);
        saveCodeBreakerSession({
          roomCode: cbRes.room_code,
          playerToken: cbRes.player_token,
          seat: cbRes.seat,
          displayName: cleanName,
          savedAt: new Date().toISOString(),
        });
        navigate(`/games/code-breaker/room/${cbRes.room_code}`, { replace: true });
        return;
      } catch (cbErr) {
        if (toUserError(cbErr).code !== "ROOM_NOT_FOUND") throw cbErr;
      }

      // 3. Fallback path: Word Cipher (رازواژه — تداعی کلمات)
      try {
        const wgRes = await wordGameApi.joinRoom(normalized, cleanName);
        saveWordSession({
          roomCode: wgRes.room_code,
          playerToken: wgRes.player_token,
          seat: wgRes.seat,
          displayName: cleanName,
          savedAt: new Date().toISOString(),
        });
        navigate(`/games/word-cipher/room/${wgRes.room_code}`, { replace: true });
        return;
      } catch (wgErr) {
        if (toUserError(wgErr).code !== "ROOM_NOT_FOUND") throw wgErr;
      }

      // 4. Fallback path: Last Night (بقای قرون‌وسطایی)
      const lnRes = await lastNightApi.joinRoom(normalized, cleanName);
      saveLnSession({
        roomCode: lnRes.room_code,
        playerId: `${lnRes.room_id}_s${lnRes.seat}`,
        playerToken: lnRes.player_token,
        seat: lnRes.seat,
        displayName: cleanName,
        savedAt: new Date().toISOString(),
      });
      navigate(`/games/last-night/room/${lnRes.room_code}`, { replace: true });
    } catch (err) {
      const user = toUserError(err);
      showToast(user.message, "error");
      if (user.code === "ROOM_NOT_FOUND") setCodeError("اتاقی با این کد پیدا نشد.");
      if (user.code === "INVALID_NAME") setNameError(user.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page--narrow">
      <button type="button" className="back-link" onClick={() => navigate("/")}>
        <ArrowLeft size={16} aria-hidden="true" />
        بازگشت
      </button>
      <section className="card">
        <h1 className="card__title">ورود به اتاق</h1>
        <p className="card__sub">
          کد ۶ نویسه‌ای هر یک از بازی‌های پلتفرم (دوز کلاسیک، رمزگشا، رازواژه یا Last Night) را وارد کنید تا مستقیماً وارد همان اتاق شوید.
        </p>
        <form onSubmit={submit} noValidate>
          <FormField label="کد اتاق" htmlFor="room-code" error={codeError} hint="مثلاً: K7QM2P">
            <Input
              id="room-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/gi, "").slice(0, 6))}
              placeholder="ABC123"
              className="ltr num"
              dir="ltr"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              invalid={!!codeError}
            />
          </FormField>
          <FormField label="نام نمایشی" htmlFor="join-name" error={nameError} hint="بین ۲ تا ۲۴ کاراکتر">
            <Input
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: سارا"
              maxLength={24}
              autoComplete="off"
              invalid={!!nameError}
            />
          </FormField>
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={submitting}
            icon={<LogIn size={18} aria-hidden="true" />}
          >
            ورود و شروع بازی
          </Button>
        </form>
      </section>
    </div>
  );
}
