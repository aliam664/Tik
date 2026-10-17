/**
 * Typed env access. Fails fast (with a helpful message) when env vars are
 * missing instead of producing a broken runtime far away from the cause.
 */

function readEnv(name: string): string {
  const value = import.meta.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `DOZ ONLINE: متغیر محیطی ${name} تنظیم نشده است. فایل .env را مطابق .env.example بسازید.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: readEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: readEnv("VITE_SUPABASE_ANON_KEY"),
} as const;
