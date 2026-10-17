import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { api } from "@/lib/api";
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

  useEffect(() => {
    const fromUrl = normalizeRoomCode(searchParams.get("code"));
    if (fromUrl) setCode(fromUrl);
  }, [searchParams]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cErr = roomCodeError(code);
    const nErr = displayNameError(name);
    setCodeError(cErr);
    setNameError(nErr);
    if (cErr || nErr) return;

    setSubmitting(true);
    try {
      const normalized = normalizeRoomCode(code)!;
      const res = await api.joinRoom(normalized, name.trim());
      playerSession.save(res.room_code, res.player_token, res.symbol);
      navigate(`/room/${res.room_code}`, { replace: true });
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
        <p className="card__sub">کد ۶ نویسه‌ای اتاق و نام نمایشی خود را وارد کنید.</p>
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
