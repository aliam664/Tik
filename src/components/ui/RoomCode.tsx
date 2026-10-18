import { Check, Copy, Share2 } from "lucide-react";
import { useCopy } from "@/hooks/useCopy";
import { inviteLink } from "@/lib/session";
import { IconButton } from "./Button";
import { useToast } from "./Toast";

/** Big, readable, LTR room-code chip with copy + share actions. */
export function RoomCodeDisplay({
  code,
  size = "md",
  withActions = true,
}: {
  code: string;
  size?: "sm" | "md" | "lg";
  withActions?: boolean;
}) {
  const { copied, copy } = useCopy();
  const { showToast } = useToast();

  const doShare = async () => {
    const link = inviteLink(code);
    const text = `بیا دوز بازی کنیم! کد اتاق: ${code}\n${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "DOZ ONLINE", text, url: link });
        return;
      }
    } catch {
      /* user cancelled — fall through to copy */
    }
    const ok = await copy(text);
    showToast(ok ? "کد و لینک دعوت کپی شد" : "کپی ناموفق بود — کد را دستی کپی کنید", ok ? "success" : "error");
  };

  return (
    <div className={`room-code room-code--${size}`}>
      <span className="room-code__value ltr num" dir="ltr">
        {code}
      </span>
      {withActions ? (
        <span className="room-code__actions">
          <IconButton
            label="کپی کد اتاق"
            onClick={() => void copy(code)}
            className={copied ? "icon-btn--ok" : ""}
          >
            {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          </IconButton>
          <IconButton label="اشتراک‌گذاری" onClick={() => void doShare()}>
            <Share2 size={15} aria-hidden="true" />
          </IconButton>
        </span>
      ) : null}
    </div>
  );
}

/** Small copy button with feedback, usable inline anywhere. */
export function CopyButton({
  value,
  label = "کپی",
  copiedLabel = "کپی شد",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <button type="button" className={`copy-btn ${copied ? "copy-btn--ok" : ""}`} onClick={() => void copy(value)}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
