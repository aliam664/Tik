/**
 * Server and transport errors → safe, actionable Persian messages.
 * Technical details stay in the developer console; never render raw SQL or
 * PostgREST response bodies in the UI.
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
  | "PLAYER_BANNED"
  | "INVALID_NAME"
  | "INVALID_PASSWORD"
  | "INVALID_CREDENTIALS"
  | "INVALID_BOARD"
  | "INVALID_FILTER"
  | "RATE_LIMITED"
  | "MAINTENANCE"
  | "CODE_GENERATION_FAILED"
  | "ADMIN_UNAUTHORIZED"
  | "ADMIN_FORBIDDEN"
  | "REMATCH_NOT_ALLOWED"
  | "INSUFFICIENT_FUNDS"
  | "ITEM_OWNED"
  | "ITEM_NOT_FOUND"
  | "STAKES_REQUIRE_GAMES"
  | "STAKES_REQUIRE_TIER"
  | "INVALID_STAKE"
  | "STAKE_TOO_HIGH"
  | "DAILY_LOSS_CAP"
  | "QUEUE_BANNED"
  | "STAKES_BANNED"
  | "MODE_DISABLED"
  | "NO_ACTIVE_MATCH"
  | "WALLET_FROZEN";

export interface UserError {
  message: string;
  known: boolean;
  code: string;
  solution: string;
}

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
  PLAYER_BANNED: "حساب شما مسدود شده است.",
  INVALID_NAME: "نام نمایشی باید ۲ تا ۲۴ کاراکتر و بدون نویسه‌های غیرمجاز باشد.",
  INVALID_PASSWORD: "رمز عبور جدید باید حداقل ۱۰ کاراکتر باشد.",
  INVALID_CREDENTIALS: "نام کاربری یا رمز عبور اشتباه است.",
  INVALID_BOARD: "وضعیت صفحه بازی معتبر نیست.",
  INVALID_FILTER: "فیلتر درخواستی معتبر نیست.",
  RATE_LIMITED: "تعداد درخواست‌ها زیاد است. کمی صبر کنید و دوباره تلاش کنید.",
  MAINTENANCE: "سرویس موقتاً در حال نگهداری است. بعداً برگردید.",
  ADMIN_UNAUTHORIZED: "دسترسی مدیر مجاز نیست یا نشست منقضی شده است.",
  ADMIN_FORBIDDEN: "نقش مدیر اجازه انجام این عملیات را ندارد.",
  REMATCH_NOT_ALLOWED: "بازی مجدد فقط پس از پایان بازی ممکن است.",
  CODE_GENERATION_FAILED: "خطا در ساخت اتاق. دوباره تلاش کنید.",
  INSUFFICIENT_FUNDS: "موجودی شریف‌کوین کافی نیست.",
  ITEM_OWNED: "این آیتم را قبلاً خریده‌اید.",
  ITEM_NOT_FOUND: "آیتم در دسترس نیست.",
  STAKES_REQUIRE_GAMES: "برای بازی شرطی باید ابتدا حداقل ۲۰ بازی رنکد انجام دهید.",
  STAKES_REQUIRE_TIER: "برای بازی شرطی باید به تیر نقره یا بالاتر برسید.",
  INVALID_STAKE: "مبلغ ورودی شرط معتبر نیست.",
  STAKE_TOO_HIGH: "سقف ورودی شرط برای تیر فعلی شما کمتر است.",
  DAILY_LOSS_CAP: "به سقف باخت روزانه شرط رسیده‌اید؛ فردا دوباره تلاش کنید.",
  QUEUE_BANNED: "دسترسی شما به صف مسابقه موقتاً مسدود است.",
  STAKES_BANNED: "دسترسی شما به بازی شرطی موقتاً مسدود است.",
  MODE_DISABLED: "این حالت بازی فعلاً غیرفعال است.",
  NO_ACTIVE_MATCH: "مسابقه فعالی برای این حساب پیدا نشد.",
  WALLET_FROZEN: "کیف پول شما موقتاً قفل شده است.",
};

export const GENERIC_ERROR = "خطایی رخ داد. لطفاً دوباره تلاش کنید.";
export const NETWORK_ERROR = "ارتباط با سرور برقرار نشد. اینترنت خود را بررسی کنید.";
const GENERIC_SOLUTION = "لطفاً دوباره تلاش کنید؛ اگر مشکل ادامه داشت، کد خطا را برای پشتیبانی ارسال کنید.";

const DIAGNOSTIC_ERRORS: Record<string, { message: string; solution: string }> = {
  PGRST202: {
    message: "تابع موردنیاز در API پایگاه داده پیدا نشد.",
    solution:
      "مایگریشن‌های Supabase را به‌ترتیب اعمال کنید و پس از آن schema cache را تازه‌سازی کنید. نام و امضای RPC باید با فرانت‌اند یکی باشد.",
  },
  PGRST203: {
    message: "برای این درخواست چند تابع هم‌نام وجود دارد و انتخاب تابع مبهم است.",
    solution:
      "امضاهای RPC را در Supabase بررسی کنید؛ برای پارامترهای تابع نام‌ها و نوع‌های یکتا تعریف کنید.",
  },
  PGRST301: {
    message: "مجوز دسترسی به سرویس معتبر نیست.",
    solution:
      "کلید عمومی و تنظیمات احراز هویت را در محیط انتشار بررسی کنید؛ کلید service-role را هرگز در فرانت‌اند قرار ندهید.",
  },
  "42501": {
    message: "پایگاه داده اجازه اجرای این عملیات را نمی‌دهد.",
    solution:
      "GRANTهای RPC و نقش anon را بررسی کنید. فقط توابع عمومیِ فهرست مجاز باید به anon دسترسی داشته باشند.",
  },
  PERMISSION_DENIED: {
    message: "پایگاه داده اجازه اجرای این عملیات را نمی‌دهد.",
    solution:
      "GRANTهای RPC و نقش anon را بررسی کنید؛ دسترسی مستقیم جدول‌ها را باز نکنید.",
  },
  NETWORK: {
    message: NETWORK_ERROR,
    solution:
      "اتصال اینترنت را بررسی کنید، سپس وضعیت Supabase و نشانی VITE_SUPABASE_URL را کنترل کنید.",
  },
  TIMEOUT: {
    message: "پاسخ سرور بیش از حد طول کشید.",
    solution: "چند لحظه صبر کنید و دوباره تلاش کنید؛ اگر ادامه داشت، سلامت دیتابیس و شبکه را بررسی کنید.",
  },
  ENV_PLACEHOLDER: {
    message: "تنظیمات اتصال هنوز مقدار نمونه دارند و به پروژه واقعی اشاره نمی‌کنند.",
    solution:
      "VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY را در تنظیمات build/Cloudflare با مقادیر واقعی پروژه تنظیم و دوباره منتشر کنید.",
  },
  ENV_MISSING: {
    message: "تنظیمات اتصال پایگاه داده در محیط انتشار تعریف نشده‌اند.",
    solution:
      "VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY را در تنظیمات build/Cloudflare اضافه کنید و انتشار را دوباره اجرا کنید.",
  },
  ENV_INVALID: {
    message: "نشانی یا کلید اتصال Supabase معتبر نیست.",
    solution:
      "نشانی پروژه باید URL معتبر HTTPS و کلید باید کلید عمومی anon/publishable همان پروژه باشد.",
  },
  RUNTIME_ERROR: {
    message: "بخشی از برنامه با خطای پیش‌بینی‌نشده روبه‌رو شد.",
    solution: "صفحه را دوباره بارگذاری کنید. اگر خطا تکرار شد، کد خطا را برای پشتیبانی ارسال کنید.",
  },
};

function resultForCode(code: string, known = false): UserError {
  const diagnostic = DIAGNOSTIC_ERRORS[code];
  if (diagnostic) return { ...diagnostic, known: true, code };
  const message = ERROR_MESSAGES[code];
  if (message) {
    return {
      message,
      known: true,
      code,
      solution: "درخواست را بررسی کنید و در صورت تداوم مشکل با پشتیبانی تماس بگیرید.",
    };
  }
  return { message: GENERIC_ERROR, known, code, solution: GENERIC_SOLUTION };
}

function isStructuredCode(value: string): boolean {
  return /^(?:PGRST\d{3}|[0-9A-Z]{5}|[A-Z][A-Z0-9_]{1,63})$/.test(value);
}

function getStringProperty(value: object, key: string): string | null {
  if (!(key in value)) return null;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" && property.length > 0 ? property : null;
}

/** Map any thrown value to a user-facing Persian message, code, and remedy. */
export function toUserError(err: unknown): UserError {
  if (err instanceof ApiError) {
    if (err.cause) console.error("[doz-api]", { code: err.code, technical: err.cause });
    return resultForCode(err.code, err.known);
  }

  if (typeof err === "string") {
    const code = err.trim();
    if (ERROR_MESSAGES[code] || DIAGNOSTIC_ERRORS[code]) return resultForCode(code, true);
  }

  if (typeof err === "object" && err !== null) {
    const message = getStringProperty(err, "message") ?? "";
    const suppliedCode = getStringProperty(err, "code")?.trim() ?? "";
    const normalizedMessage = message.trim();

    // PostgreSQL business errors are sent in message; PostgREST's transport
    // code (for example PGRST202) is kept separately in `code`.
    if (ERROR_MESSAGES[normalizedMessage]) return resultForCode(normalizedMessage, true);
    if (DIAGNOSTIC_ERRORS[suppliedCode]) return resultForCode(suppliedCode, true);
    if (DIAGNOSTIC_ERRORS[normalizedMessage]) return resultForCode(normalizedMessage, true);

    if (/failed to fetch|fetch failed|networkerror|network request failed|err_network|offline/i.test(message)) {
      return resultForCode("NETWORK", true);
    }
    if (/timeout|timed out|aborted/i.test(message)) return resultForCode("TIMEOUT", true);
    if (/(?:could not find|does not exist|not found).{0,100}function|function.{0,100}(?:does not exist|not found)/i.test(message)) {
      return resultForCode("PGRST202", true);
    }
    if (/permission denied|not authorized|insufficient privilege/i.test(message)) {
      return resultForCode(suppliedCode === "42501" ? "42501" : "PERMISSION_DENIED", true);
    }

    const detectedCode = isStructuredCode(suppliedCode)
      ? suppliedCode
      : normalizedMessage.match(/\bPGRST\d{3}\b/)?.[0];
    if (detectedCode) {
      const knownCode = Boolean(DIAGNOSTIC_ERRORS[detectedCode] || ERROR_MESSAGES[detectedCode]);
      console.error("[doz-api]", { code: detectedCode, message });
      return resultForCode(detectedCode, knownCode);
    }

    if (message) console.error("[doz-api]", message);
    else console.error("[doz-api]", err);
  } else {
    console.error("[doz-api]", err);
  }

  return resultForCode("UNKNOWN", false);
}
