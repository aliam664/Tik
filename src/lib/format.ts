/** Persian date/time + misc formatting helpers. */

const dateFormatter = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
}

export function formatRelativeSeconds(seconds: number): string {
  if (seconds <= 0) return "منقضی";
  if (seconds < 60) return `${seconds} ثانیه`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} دقیقه`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ساعت`;
  return `${Math.floor(hours / 24)} روز`;
}

/** Persian digits for display of small numbers. */
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
export function toFaDigits(input: number | string): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

const FORBIDDEN_NAME_CHARS = new Set(['<', '>', '"', "/", "\\", "`", "{", "}", "|", "%", "$"]);

export function displayNameError(name: string): string | null {
  const v = name.trim();
  if (v.length < 2) return "نام باید حداقل ۲ کاراکتر باشد.";
  if (v.length > 24) return "نام حداکثر ۲۴ کاراکتر است.";
  for (const ch of v) {
    if (FORBIDDEN_NAME_CHARS.has(ch)) return "نام شامل نویسه‌های غیرمجاز است.";
  }
  return null;
}

export function roomCodeError(code: string): string | null {
  const v = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(v)) return "کد اتاق ۶ نویسه لاتین/عدد است.";
  return null;
}
