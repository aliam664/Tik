import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, DoorOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { RoomCodeDisplay } from "@/components/ui/RoomCode";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { api } from "@/lib/api";
import { toUserError } from "@/lib/errors";
import { displayNameError } from "@/lib/format";
import { playerSession } from "@/lib/session";
import type { JoinCreateResponse } from "@/types/api";

export function CreateRoomPage() {
  useDocumentTitle("ساخت اتاق | دوز آنلاین");
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<JoinCreateResponse | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameErr = displayNameError(name);
    if (nameErr) {
      setError(nameErr);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.createRoom(name.trim());
      playerSession.save(res.room_code, res.player_token, res.symbol);
      setCreated(res);
    } catch (err) {
      const user = toUserError(err);
      showToast(user.message, "error");
      if (!user.known) setError(user.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="page page--narrow">
        <section className="card created-card" aria-live="polite">
          <h1 className="card__title">اتاق شما آماده است ✨</h1>
          <p className="created-card__text">
            این کد ۶ نویسه‌ای را برای دوستتان بفرستید تا وارد اتاق شود. با ورود او، بازی
            به‌صورت خودکار شروع می‌شود.
          </p>
          <div className="created-card__code">
            <RoomCodeDisplay code={created.room_code} size="lg" />
          </div>
          <p className="created-card__hint">
            نگه‌دارنده اتاق شما هستید (علامت X). اگر از این صفحه خارج شوید، اتاق بسته می‌شود.
          </p>
          <Button
            size="lg"
            fullWidth
            icon={<DoorOpen size={18} aria-hidden="true" />}
            onClick={() => navigate(`/room/${created.room_code}`)}
          >
            ورود به اتاق
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <button type="button" className="back-link" onClick={() => navigate("/")}>
        <ArrowLeft size={16} aria-hidden="true" />
        بازگشت
      </button>
      <section className="card">
        <h1 className="card__title">ساخت اتاق جدید</h1>
        <p className="card__sub">
          یک نام نمایشی انتخاب کنید؛ به‌عنوان میزبان با علامت X وارد اتاق می‌شوید.
        </p>
        <form onSubmit={submit} noValidate>
          <FormField label="نام نمایشی" htmlFor="display-name" error={error} hint="بین ۲ تا ۲۴ کاراکتر">
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: آرش"
              maxLength={24}
              autoComplete="off"
              autoFocus
              invalid={!!error}
            />
          </FormField>
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={submitting}
            icon={<Plus size={18} aria-hidden="true" />}
          >
            ساخت اتاق
          </Button>
        </form>
      </section>
    </div>
  );
}
