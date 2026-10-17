/**
 * Server error codes → Persian, user-friendly messages.
 * Technical details are logged to console only, never shown to users.
 */

export type ServerErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_EXPIRED"
  | "ROOM_CLOSED"
  | "ROOM_IN_GAME"
  | "GAME_NOT_ACTIVE"
  | "INVALID_CELL"
  | "CELL_TAKEN"
  | "NOT_YOUR_TURN"
  | "PLAYER_UNAUTHORIZED"
  | "INVALID_NAME"
  | "INVALID_PASSWORD"
  | "INVALID_CREDENTIALS"
  | "INVALID_BOARD"
  | "INVALID_FILTER"
  | "RATE_LIMITED"
  | "MAINTENANCE"
  | "CODE_GENERATION_FAILED"
  | "ADMIN_UNAUTHORIZED"
  | "REMATCH_NOT_ALLOWED";

export class ApiError extends Error {
  readonly code: string;
  /** true when the error is an expected, mapped business error */
  readonly known: boolean;

  constructor(code: string, known: boolean, technical?: string) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.known = known;
    if (technical) this.cause = technical;
  }
}

export const ERROR_MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: "اتاقی با این کد پیدا نشد. کد را دوباره بررسی کنید.",
  ROOM_FULL: "ظرفیت این اتاق تکمیل شده است (۲ بازیکن).",
  ROOM_EXPIRED: "این اتاق منقضی شده است. اتاق جدید بسازید.",
  ROOM_CLOSED: "این اتاق بسته شده است.",
  ROOM_IN_GAME: "این اتاق در حال حاضر درگیر بازی است.",
  GAME_NOT_ACTIVE: "بازی فعال نیست یا به پایان رسیده است.",
  INVALID_CELL: "شماره خانه نامعتبر است.",
  CELL_TAKEN: "این خانه قبلاً پر شده است.",
  NOT_YOUR_TURN: "در حال حاضر نوبت شما نیست.",
  PLAYER_UNAUTHORIZED: "مجوز شما برای این اتاق معتبر نیست.",
  INVALID_NAME: "نام نمایشی باید ۲ تا ۲۴ کاراکتر و بدون نویسه‌های غیرمجاز باشد.",
  INVALID_PASSWORD: "رمز عبور جدید باید حداقل ۱۰ کاراکتر باشد.",
  INVALID_CREDENTIALS: "نام کاربری یا رمز عبور اشتباه است.",
  RATE_LIMITED: "تعداد درخواست‌ها زیاد است. کمی صبر کنید و دوباره تلاش کنید.",
  MAINTENANCE: "سرویس موقتاً در حال نگهداری است. بعداً برگردید.",
  ADMIN_UNAUTHORIZED: "دسترسی مدیر مجاز نیست یا نشست منقضی شده است.",
  REMATCH_NOT_ALLOWED: "بازی مجدد فقط پس از پایان بازی ممکن است.",
  CODE_GENERATION_FAILED: "خطا در ساخت اتاق. دوباره تلاش کنید.",
};

export const GENERIC_ERROR = "خطایی رخ داد. لطفاً دوباره تلاش کنید.";
export const NETWORK_ERROR =
  "ارتباط با سرور برقرار نشد. اینترنت خود را بررسی کنید.";

/** Map any thrown value to a user-facing Persian message + known flag. */
export function toUserError(err: unknown): { message: string; known: boolean; code: string } {
  if (err instanceof ApiError) {
    return {
      message: ERROR_MESSAGES[err.code] ?? GENERIC_ERROR,
      known: err.known,
      code: err.code,
    };
  }
  // supabase-js PostgREST error surface
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = String((err as { message: unknown }).message);
    console.error("[doz-api]", msg);
    if (ERROR_MESSAGES[msg]) {
      return { message: ERROR_MESSAGES[msg], known: true, code: msg };
    }
    if (/fetch failed|network|Failed to fetch/i.test(msg)) {
      return { message: NETWORK_ERROR, known: true, code: "NETWORK" };
    }
  }
  console.error("[doz-api]", err);
  return { message: GENERIC_ERROR, known: false, code: "UNKNOWN" };
}
