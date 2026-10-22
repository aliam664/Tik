import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ROOM_JOIN_ADAPTERS } from "@/games/joinAdapters";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { toUserError } from "@/lib/errors";
import { displayNameError, roomCodeError } from "@/lib/format";
import { normalizeRoomCode } from "@/lib/session";

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
      for (const adapter of ROOM_JOIN_ADAPTERS) {
        const result = await adapter.tryJoin(normalized, cleanName);
        if (result === "not_found") continue;
        navigate(result.roomPath, { replace: true });
        return;
      }
      setCodeError("اتاقی با این کد پیدا نشد.");
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
          کد ۶ نویسه‌ای هر یک از بازی‌های پلتفرم را وارد کنید تا مستقیماً وارد همان اتاق شوید.
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
