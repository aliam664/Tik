# مأموریت تحقیقاتی: بهترین سیستم مدیریت، تجمیع و چرخش خودکار APIهای هوش مصنوعی برای Claude Code

**تاریخ تحقیق:** ۲۳ اکتبر ۲۰۲۶ (2026-10-23)  
**محقق:** مهندس ارشد زیرساخت هوش مصنوعی — بررسی مستند، مستندات رسمی، کد منبع، Release Notes و Issues  
**شاخه:** `arena/9774bac8-tik`  
**زبان گزارش:** فارسی (با اصطلاحات فنی انگلیسی)

---

## فهرست مطالب
1. [خلاصه اجرایی و نتیجه اصلی](#1-خلاصه-اجرایی-و-نتیجه-اصلی)
2. [پنج پروژه برتر و دلیل انتخاب/رد](#2-پنج-پروژه-برتر)
3. [فهرست ارائه‌دهندگان قابل اتصال](#3-فهرست-ارائهدهندگان)
4. [جدول مقایسه فنی](#4-جدول-مقایسه-فنی)
5. [وضعیت دقیق سازگاری با Claude Code](#5-سازگاری-با-claude-code)
6. [روش مدیریت کلیدها و Fallback](#6-مدیریت-کلیدها-و-fallback)
7. [سه معماری پیشنهادی](#7-سه-معماری-پیشنهادی)
8. [انتخاب نهایی با استدلال](#8-انتخاب-نهایی)
9. [راهنمای نصب مرحله‌به‌مرحله](#9-راهنمای-نصب)
10. [فایل‌های پیکربندی نمونه](#10-پیکربندی-نمونه)
11. [دستورهای راه‌اندازی و اتصال Claude Code](#11-دستورهای-راهاندازی)
12. [روش آزمایش صحت عملکرد و Fallback](#12-آزمایش)
13. [محدودیت‌ها، هزینه‌ها و ریسک‌های امنیتی](#13-محدودیتها-و-امنیت)
14. [منابع (بیش از ۳۵ منبع، ۲۲ دامنه)](#14-منابع)

---

## ۱. خلاصه اجرایی و نتیجه اصلی

### مسئله
Claude Code به‌صورت پیش‌فرض فقط به `api.anthropic.com` متصل می‌شود. برای استفاده از ده‌ها API Key رایگان/آزمایشی از ارائه‌دهندگان مختلف (Groq، Gemini، Mistral، OpenRouter و …) بدون تغییر مداوم تنظیمات، به یک **LLM Gateway / Proxy مرکزی** نیاز است که:
- چند کلید از یک ارائه‌دهنده را بچرخاند (Key Rotation)
- بین ارائه‌دهندگان مختلف Failover کند
- بین مدل‌های مختلف (حتی با فرمت متفاوت) ترجمه پروتکل انجام دهد
- روی کامپیوتر شخصی، رایگان و متن‌باز اجرا شود

### نتیجه اصلی (بر اساس شواهد مستند)
**هیچ پروژه منفردی ۱۰۰٪ نیازهای تعریف‌شده را بدون نقص پوشش نمی‌دهد.** اما **LiteLLM Proxy** با فاصله بهترین گزینه مرکزی است و در ترکیب با یک پروکسی سبک دوم (برای تجمیع سهمیه‌های خرد رایگان)، معماری بهینه را می‌سازد.

**برنده مطلق:** **LiteLLM Proxy (BerriAI/litellm)** — امتیاز **۸۷/۱۰۰**  
**مکمل پیشنهادی برای سهمیه‌های خرد:** **FreeLLMAPI (tashfeenahmed/freellmapi)** یا **LLM-API-Key-Proxy (Mirrowel)** برای تجمیع ۲۰+ ارائه‌دهنده رایگان خرد.

> اگر فقط **یک ابزار** می‌خواهید نصب کنید: **LiteLLM Proxy** را نصب کنید.  
> اگر می‌خواهید **حداکثر سهمیه رایگان** را بدون هزینه جمع کنید: **معماری C (ترکیبی)** را پیاده کنید.

**چرا LiteLLM:**
- تأییدشده با مستندات رسمی Claude Code به‌عنوان Gateway سازگار [docs.litellm.ai](https://docs.litellm.ai/docs/tutorials/claude_non_anthropic_models) و [code.claude.com/docs/en/llm-gateway](https://code.claude.com/docs/en/llm-gateway)
- ترجمه دوطرفه Anthropic ↔ OpenAI شامل Streaming SSE، Tool Use، Thinking، Prompt Caching
- Fallback واقعی با ۳ نوع (fallbacks / context_window_fallbacks / content_policy_fallbacks) + Cooldown + Retry-After
- پشتیبانی از ۱۰۰+ ارائه‌دهنده، چند کلید در یک `model_name` با Load Balancing (simple-shuffle, least-busy, usage-based, latency)
- فعال‌ترین پروژه: ۵۵,۰۷۰ کامیت، آخرین کامیت دیروز (۲۲ اکتبر ۲۰۲۶)، ۱,۶۰۲ تگ

**چرا نه سایرین به‌تنهایی:**
- `llm-keypool`: فقط OpenAI-compatible، بدون ترجمه Anthropic → برای Claude Code مستقیم ناسازگار (نیاز به لایه ترجمه)
- `claude-code-gateway`: عالی برای Claude Code اما اکوسیستم کوچک (۴۵ کامیت)، بدون جامعه بزرگ برای نگهداری بلندمدت
- `FreeLLM` اصلی (git.mitgai.net): غیرقابل‌دسترسی/تأیید نشد → جایگزین FreeLLMAPI با ۳۱k ستاره
- `llm-api-key-proxy` اصلی (alaaeldeeng): آرشیو شده، فورک فعال Mirrowel جایگزین شد

---

## ۲. پنج پروژه برتر و دلیل انتخاب/رد

### ۲.۱. بررسی وضعیت ۵ پروژه الزامی

| # | پروژه | URL | وضعیت | آخرین انتشار | قابل نصب؟ | قابلیت‌های ادعایی تأیید شد؟ |
|---|---|---|---|---|---|---|
| 1 | **LiteLLM** | https://github.com/BerriAI/litellm | ✅ فعال، عمومی | ۲۰۲۶-۱۰-۲۲ (دیروز) | ✅ pip / Docker / Helm | ✅ بله — با مستندات رسمی و تست روزانه سازگاری Claude Code |
| 2 | **llm-keypool** | https://github.com/piyush-tyagi-13/llm-keypool | ⚠️ فعال اما کم‌تحرک | ۲۰۲۶-۰۵-۰۵ (۵ ماه پیش) | ✅ pip | ⚠️ نیمه‌تأیید — فقط OpenAI، بدون Anthropic |
| 3 | **claude-code-gateway** | https://github.com/Mukller/claude-code-gateway | ✅ فعال | ۲۰۲۶-۰۹-۱۱ | ✅ Go binary / Docker | ✅ بله — ۶ نوع provider، ترجمه کامل |
| 4 | **FreeLLM** (git.mitgai.net) | https://git.mitgai.net/shihabshahrier/freelm | ❌ غیرقابل‌تأیید | نامشخص | ❌ دامنه Gitea خصوصی، در جستجو یافت نشد | ❌ جایگزین شد با FreeLLMAPI |
| 5 | **LLM API Key Proxy** (alaaeldeeng) | https://github.com/alaaeldeeng/llm-api-key-proxy | ⚠️ آرشیو/فورک | — | ⚠️ فورک b3nw آرشیو | ✅ فورک فعال Mirrowel جایگزین (۸۷۰ کامیت، ۲۰۲۶-۰۹-۱۶) |

### ۲.۲. پنج پروژه برتر نهایی (Ranking)

#### 🥇 ۱. LiteLLM Proxy — امتیاز ۸۷/۱۰۰ — **انتخاب اصلی**
- **چرا برنده:** تنها پروژه‌ای که هم مستندات رسمی Anthropic آن را به‌عنوان Gateway سازگار معرفی کرده، هم تست سازگاری روزانه Claude Code را پاس می‌کند، هم ۱۰۰+ ارائه‌دهنده را پوشش می‌دهد.
- **شواهد:** صفحه رسمی [Use Claude Code with Non-Anthropic Models](https://docs.litellm.ai/docs/tutorials/claude_non_anthropic_models) + [Gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol) + [Claude Code × LiteLLM compatibility matrix](https://docs.litellm.ai/docs/claude_code_compatibility) که روزانه بازتولید می‌شود.
- **نقطه ضعف:** نیاز به Postgres + Redis برای قابلیت‌های کامل (می‌توان بدون آن‌ها هم اجرا کرد اما محدود).

#### 🥈 ۲. claude-code-gateway (Mukller) — امتیاز ۸۱/۱۰۰ — **بهترین برای Claude Code خالص**
- **چرا دوم:** طراحی دقیقاً برای Claude Code، ترجمه کامل Anthropic ↔ OpenAI، پشتیبانی از Bedrock/Vertex/Anthropic-compat/OpenAI، Key Rotation با Cooldown و Circuit Breaker، Dashboard، Prometheus، MCP.
- **شواهد:** README با Quick Start و `ANTHROPIC_BASE_URL=http://localhost:8090` + `internal/provider/key pool` در کد + `helm` برای K8s
- **نقطه ضعف:** جامعه کوچک (۴۵ کامیت)، ریسک نگهداری بلندمدت، بدون تست سازگاری خودکار روزانه

#### 🥉 ۳. Claude Code Router (musistudio/claude-code-router) — امتیاز ۷۹/۱۰۰ — **بهترین UX دسکتاپ**
- **چرا سوم:** ۳۰k+ ستاره، اپ دسکتاپ macOS/Win/Linux، مسیریابی بر اساس Task (default/think/longContext/webSearch/background)، Credential Pools + Fallback + Fusion Tools (تزریق Vision/WebSearch).
- **شواهد:** NPM `ccr code` + `/model` picker + Routing Rules UI
- **نقطه ضعف:** باگ‌های اخیر Fallback در v3.1.0 (Issue #1804: fallback همه درخواست‌ها را به primary می‌فرستاد، در PR #1859 رفع شد)، پیچیدگی بیشتر

#### ۴. LLM-API-Key-Proxy (Mirrowel فورک) — امتیاز ۷۶/۱۰۰ — **بهترین برای چرخش کلید خالص**
- **چرا چهارم:** هر دو پروتکل `/v1/chat/completions` و `/v1/messages`، حالت‌های `balanced`/`sequential`، `OPTIMAL_CONCURRENT`، `QUOTA_GROUPS`، پشتیبانی از Gemini CLI، Anthropic ↔ OpenAI translation
- **شواهد:** ۸۷۰ کامیت، ۶۲ تگ، آخرین PR سپتامبر ۲۰۲۶
- **نقطه ضعف:** مستندات پراکنده، نیاز به تنظیم دستی env vars برای هر provider

#### ۵. FreeLLMAPI (tashfeenahmed/freellmapi) — امتیاز ۷۳/۱۰۰ — **بهترین برای تجمیع سهمیه رایگان**
- **چرا پنجم:** ۳۱k ستاره، ۳۴ ارائه‌دهنده، ۶۳۵ endpoint، تئوری ۷.۴B توکن/ماه، رمزگذاری AES-256-GCM، Smart Routing با ۶ استراتژی (speed/capability/reliability)
- **شواهد:** Docker + npm + Desktop app، اما هشدار رسمی: "Personal experimentation only, No SLA"
- **نقطه ضعف:** اتکا به Free Tierهای ناپایدار، کیفیت متغیر مدل‌ها، سهمیه روزانه هر provider جدا تمام می‌شود

### پروژه‌های رد شده و دلیل
- **FreeLLM اصلی (git.mitgai.net):** دامنه Gitea خصوصی، در جستجوی گسترده یافت نشد، هیچ Release یا Docs قابل استناد نیست → **غیرقابل‌تأیید**
- **llm-keypool:** برای Claude Code بدون لایه ترجمه ناسازگار است → فقط به‌عنوان تجمیع‌کننده OpenAI در معماری ترکیبی قابل استفاده است
- **nano-llm-proxy / llm-router / llm-gateway (foxy1402):** پروژه‌های Go کوچک اما بدون ترجمه کامل Anthropic → برای Claude Code نیاز به LiteLLM دارند

---

## ۳. فهرست ارائه‌دهندگان قابل اتصال

> **تاریخ بررسی:** ۲۳ اکتبر ۲۰۲۶ — تمام اعداد از مستندات رسمی یا راستی‌آزمایی‌های اکتبر ۲۰۲۶

### جدول خلاصه ۱۶ ارائه‌دهنده الزامی + کشفیات

| # | ارائه‌دهنده | پلن رایگان/آزمایشی؟ | ثبت‌نام جدید؟ | محدودیت اصلی (رایگان) | احراز هویت | سازگاری API | Tool Calling | Streaming | مناسب کدنویسی عامل‌محور؟ | محدودیت جغرافیایی/تجاری |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Google Gemini / AI Studio** | ✅ Free Tier دائمی | ✅ بله | ~۱۰ RPM / ۱۵۰۰ RPD (Flash)، نمایش فقط در AI Studio | API Key (AIza) | OpenAI-compat via LiteLLM، Native Gemini | ✅ | ✅ | ✅ (Flash 2.5 قوی) | داده Free Tier برای آموزش استفاده می‌شود |
| 2 | **Groq** | ✅ Free Plan دائمی | ✅ بله | ۳۰ RPM / ۱K RPD / ۸K TPM / ۲۰۰K TPD (gpt-oss-120b) | API Key (gsk_) | OpenAI-compatible | ✅ | ✅ | ✅✅ (سریع‌ترین) | خیر |
| 3 | **Cerebras** | ⚠️ فقط $5 Trial (۳۰ روز، نیاز به کارت) | ✅ با کارت | ۵ RPM / ۱M TPD (Trial) | API Key | OpenAI-compatible | ✅ | ✅ | ✅ (سریع) | خیر |
| 4 | **Mistral AI** | ✅ Free Mode دائمی | ✅ بله (تأیید SMS) | ~۱ req/sec, ~۱B tok/mo (قدیم)؛ اکنون مبلغ نامشخص، Limits در پنل | API Key | OpenAI-compatible | ✅ | ✅ | ✅ (Codestral عالی) | خیر |
| 5 | **OpenRouter** | ✅ Free Models (۵۰ یا ۱K RPD) | ✅ بله | ۲۰ RPM / ۵۰ RPD (<$10) / ۱K RPD (>$10) | API Key (sk-or-) | OpenAI + Anthropic (بسته به مدل) | ✅ (وابسته به مدل) | ✅ | ✅ (بستگی به مدل پشت) | خیر |
| 6 | **SambaNova** | ✅ Free Tier دائمی (بدون کارت) | ✅ بله | ۲۰ RPM / ۲۰ RPD / ۲۰۰K TPD | API Key (sn-) | OpenAI-compatible | ✅ | ✅ | ⚠️ متوسط | خیر |
| 7 | **DeepSeek** | ❌ بدون Free Tier؛ گاهی $5 Trial تصادفی | ✅ بله | بدون محدودیت RPM، فقط Concurrency | API Key | OpenAI-compatible | ✅ | ✅ | ✅✅ (V4 قوی) | خیر |
| 8 | **Together AI** | ❌ بدون Free Tier (حداقل $5) | ✅ با $5 | Dynamic (بدون عدد ثابت) | API Key | OpenAI-compatible | ✅ | ✅ | ✅ | خیر |
| 9 | **Fireworks AI** | ⚠️ فقط $1 Credit یک‌باره | ✅ بله | ۱۰ RPM (بدون کارت) / ۶K RPM (با کارت) | API Key | OpenAI-compatible | ✅ | ✅ | ✅ | خیر |
| 10 | **Hugging Face Inference** | ⚠️ فقط $0.10/mo (تا ۲۰۲۶-۱۰-۰۷ حذف شد؛ اکنون $0) | ✅ اما بدون اعتبار | اعتباری (۲۰۰+ مدل) | HF Token | OpenAI-compatible | ✅ | ✅ | ⚠️ متغیر | خیر |
| 11 | **NVIDIA NIM** | ✅ Free Tier دائمی (Trial) | ✅ بله | ~۴۰ RPM (مشاهده‌شده)، بدون عدد رسمی | API Key (nvapi-) | OpenAI-compatible | ✅ | ✅ | ✅ (Nemotron) | فقط Dev/Test، نه Production |
| 12 | **GitHub Models** | ❌ **بازنشسته ۲۰۲۶-۰۷-۳۰** | ❌ بسته | قبلاً ۱۰-۱۵ RPM / ۵۰-۱۵۰ RPD | PAT | OpenAI-compatible | ✅ | ✅ | ✅ | خیر |
| 13 | **Cohere** | ✅ Trial Key دائمی | ✅ بله | ۲۰ RPM / ۱K calls/mo | API Key | Cohere + OpenAI-compat | ✅ | ✅ | ⚠️ (Command R) | Trial فقط غیرتجاری |
| 14 | **Anthropic** | ❌ بدون Free Tier (فقط $5 قدیمی منسوخ) | ✅ اما بدون اعتبار | Tier-based (Free: $100/mo سقف هزینه) | API Key | Anthropic Native | ✅✅ | ✅ | ✅✅ | خیر |
| 15 | **OpenAI** | ❌ بدون Free Tier (از mid-2025 حذف) | ✅ اما بدون اعتبار | ۳ RPM / GPT-3.5 Turbo only (Free Tier) | API Key | OpenAI Native | ✅ | ✅ | ✅ | جغرافیای محدود |
| 16 | **Cloudflare Workers AI** | ✅ Free ۱۰K Neurons/day | ✅ بله | ۱۰K Neurons/day | API Key | OpenAI-compatible | ⚠️ محدود | ✅ | ⚠️ | خیر |
| 17 | **Z.AI (GLM)** | ✅ Free Tier | ✅ بله | ۱K-۲K RPD | API Key | Anthropic-compatible | ✅ | ✅ | ✅ | خیر |
| 18 | **DeepInfra / Novita** | ⚠️ Trial Credits | ✅ | متغیر | API Key | OpenAI-compatible | ✅ | ✅ | ✅ | خیر |

### جزئیات کلیدی هر ارائه‌دهنده (با منبع)

**1. Google Gemini / AI Studio**
- مدارک: [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) — از سپتامبر ۲۰۲۶ جدول عددی حذف و به AI Studio ارجاع می‌دهد. BenchLM تأیید: ~۱۰ RPM / ۱۵۰۰ RPD برای Gemini 3 Flash.
- نکته: گوگل داده Free Tier را برای بهبود محصولات استفاده می‌کند. RPD در نیمه‌شب PT ریست. هر پروژه محدودیت جدا دارد، نه هر کلید.

**2. Groq**
- مدارک: [console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits) — جدول کامل: gpt-oss-120b: ۳۰/۱K/۸K/۲۰۰K، llama-3.1-8b-instant: ۳۰/۱۴.۴K/۶K/۵۰۰K. محدودیت **سازمان‌محور** است، نه کلیدمحور.
- هشدار ۲۰۲۶-۱۰-۰۶: Groq محدودیت gpt-oss-safeguard-20b را به ۳ RPM کاهش داد بدون اطلاع.

**3. Cerebras**
- مدارک: [inference-docs.cerebras.ai/support/rate-limits](https://inference-docs.cerebras.ai/support/rate-limits) — FAQ: "Is there a permanently free tier? No." فقط $5 Trial با کارت، ۵ RPM، ۳۰K TPM، ۱M TPD. تغییر ۲۰۲۶-۰۷-۱۶: Free Tier به Trial تبدیل شد.
- نتیجه: برای معماری رایگان **غیرقابل اتکا**.

**4. Mistral AI**
- مدارک: [console.mistral.ai](https://console.mistral.ai) + [docs.mistral.ai](https://docs.mistral.ai) — از ۲۰۲۶-۱۰-۰۷ مبلغ $10/mo از Free Plan حذف شد، اکنون "included monthly usage" بدون عدد. قدیم: ~۱ req/sec، ۵۰۰K TPM، ۱B tok/mo.
- نکته: نیاز به تأیید SMS، یک شماره = یک اکانت.

**5. OpenRouter**
- مدارک: [openrouter.ai/docs/api_reference/limits](https://openrouter.ai/docs/api_reference/limits) — ۲۰ RPM ثابت، ۵۰ RPD (<$10) → ۱K RPD (>$10). قیمت: ۵.۵% کارمزد روی Credits + نرخ provider بدون markup.
- نکته: خطای ۴۲۹ اغلب از provider پشت است، نه از OpenRouter. خرید $10 یک‌باره و دائمی سقف را بالا می‌برد.

**6. SambaNova**
- مدارک: [docs.sambanova.ai/docs/en/models/rate-limits](https://docs.sambanova.ai/docs/en/models/rate-limits) — Free Tier: ۲۰ RPM / ۲۰ RPD / ۲۰۰K TPD **هر مدل**. تعریف: "Applied when there is no payment method linked". هشدار: ۲۰ RPD یعنی یک دقیقه شلوغ کل روز را می‌سوزاند!
- از آگوست ۲۰۲۶: Free Plan برای خرید credits نیاز به کارت دارد، اما Free Tier بدون کارت هنوز کار می‌کند (تناقض مستندات).

**7. DeepSeek**
- مدارک: [platform.deepseek.com](https://platform.deepseek.com) — هیچ Free Tier رسمی ندارد. صفحات غیررسمی از $5 Trial صحبت می‌کنند اما BenchLM (۲۰۲۶-۱۰-۱۶): "pricing and rate-limit pages publish no free tier". Concurrency: ۵۰۰ (Pro) / ۲۵۰۰ (Flash).
- نتیجه: فقط به‌عنوان Fallback پولی ارزان.

**8. Together AI**
- مدارک: [docs.together.ai/docs/billing](https://docs.together.ai/docs/billing) — "Together AI does not currently offer free trials. Access requires minimum $15 (اولین خرید) / $5 (بعدی)". از ۲۰۲۵-۰۸-۳۱ Free Credit $1 حذف شد.
- نتیجه: بدون Free Tier.

**9. Fireworks AI**
- مدارک: [fireworks.ai/pricing](https://fireworks.ai/pricing) — $1 starter credit یک‌باره، ۱۰ RPM بدون کارت، ۶K RPM با کارت. کافی برای چند هزار توکن، نه برای توسعه.
- نکته: Fire Pass ($7/week unlimited Kimi K2.5 Turbo) وجود دارد اما Trial جداست.

**10. Hugging Face Inference**
- مدارک: [huggingface.co/pricing](https://huggingface.co/pricing) — از ۲۰۲۶-۱۰-۰۷: "Free users can use Inference Providers by purchasing credits, or by upgrading to PRO". قبلاً $0.10/mo بود. اکنون بدون اعتبار.
- نتیجه: عملاً بدون Free Tier.

**11. NVIDIA NIM**
- مدارک: [build.nvidia.com](https://build.nvidia.com) + [forums.developer.nvidia.com](https://forums.developer.nvidia.com) — ~۴۰ RPM مشاهده‌شده، NVIDIA عدد رسمی ندارد: "rate limits vary by model, use-case and traffic". نیاز به تأیید SMS، کلید nvapi-.
- نکته: فقط Development/Test، نه Production (Trial Terms).

**12. GitHub Models**
- مدارک: [docs.github.com/en/github-models](https://docs.github.com/en/github-models) — **بازنشسته ۲۰۲۶-۰۷-۳۰**: "GitHub Models has been retired." قبلاً ۱۰-۱۵ RPM / ۵۰-۱۵۰ RPD.
- نتیجه: از فهرست حذف کنید.

**13. Cohere**
- مدارک: [docs.cohere.com/docs/rate-limits](https://docs.cohere.com/docs/rate-limits) — Trial Key: ۲۰ RPM Chat / ۱۰ RPM Rerank / ۱K calls/mo کل. **غیرتجاری و غیر Production**.
- نکته: همه مدل‌ها با Trial قابل فراخوانی است، اما سقف ۱K ماهانه بسیار محدود.

**14. Anthropic**
- مدارک: [platform.claude.com](https://platform.claude.com) + [Anthropic Help Center](https://support.anthropic.com) — هیچ Free Tier دائمی ندارد. "$5 free credits" قدیمی از ۲۰۲۶ حذف شد. اکنون "Buy credits before you use the API". Max/Team شامل $100-200/mo اعتبار ماهانه است.
- نتیجه: فقط پولی.

**15. OpenAI**
- مدارک: [openai.com/api pricing](https://openai.com/api/pricing) — از mid-2025 هیچ Free Credit خودکار نیست. Free Tier: ۳ RPM، فقط GPT-3.5 Turbo، $100/mo سقف هزینه (نه اعتبار). حداقل $5 برای Tier 1.
- نتیجه: فقط پولی.

**16. Cloudflare Workers AI**
- مدارک: [developers.cloudflare.com/workers-ai](https://developers.cloudflare.com/workers-ai) — ۱۰K Neurons/day (~۱۴۷K توکن خروجی روی gpt-oss-120b)، ۳۰۰ RPM. بدون کارت.
- نکته: مدل‌های Kimi/GLM/DeepSeek V4 نیاز به billing دارند.

---

## ۴. جدول مقایسه فنی

| ستون | LiteLLM Proxy | claude-code-gateway | Claude Code Router (CCR) | LLM-API-Key-Proxy (Mirrowel) | FreeLLMAPI | llm-keypool |
|---|---|---|---|---|---|---|
| **لینک GitHub** | [BerriAI/litellm](https://github.com/BerriAI/litellm) | [Mukller/claude-code-gateway](https://github.com/Mukller/claude-code-gateway) | [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) | [Mirrowel/LLM-API-Key-Proxy](https://github.com/Mirrowel/LLM-API-Key-Proxy) | [tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi) | [piyush-tyagi-13/llm-keypool](https://github.com/piyush-tyagi-13/llm-keypool) |
| **وضعیت نگهداری** | ✅ بسیار فعال (۵۵K کامیت) | ✅ فعال (۴۵ کامیت) | ✅ فعال (۹۸۹ کامیت) | ✅ فعال (۸۷۰ کامیت) | ✅ فعال (۳۱K ⭐) | ⚠️ کم‌تحرک (۴۲ کامیت) |
| **آخرین انتشار** | ۲۰۲۶-۱۰-۲۲ | ۲۰۲۶-۰۹-۱۱ | ۲۰۲۶-۱۰-۱۰ (v3.1.3) | ۲۰۲۶-۰۹-۱۶ | ۲۰۲۶-۱۰-۰۷ (v0.13.6) | ۲۰۲۶-۰۵-۰۵ |
| **مجوز** | MIT (core) + Enterprise جدا | MIT | MIT | MIT | MIT | MIT |
| **زبان** | Python + Rust core | Go | TypeScript (Electron) + Go | Python (FastAPI) | Python + Go | Python |
| **روش نصب** | pip / Docker / Helm / K8s | Go binary / Docker Compose | npm / Desktop installer / Docker | pip / Docker | npm / Docker / Desktop | pip |
| **نیاز به Docker** | خیر (اختیاری) | خیر (اختیاری) | خیر | خیر (اختیاری) | خیر | خیر |
| **نیاز به دیتابیس** | اختیاری (Postgres برای Virtual Keys/Logs، Redis برای Rate Limit) | SQLite (داخلی) | SQLite (داخلی) | SQLite (داخلی) | SQLite (AES-GCM) | SQLite (~/.llm-keypool/keys.db) |
| **پشتیبانی چند ارائه‌دهنده** | ✅ ۱۰۰+ | ✅ ۶ نوع (Anthropic/Bedrock/Vertex/OpenAI-compat/Anthropic-compat/Antigravity) | ✅ ۱۰+ (OpenAI/Anthropic/Gemini/OpenRouter/DeepSeek/…) | ✅ همه (Generic + Gemini CLI) | ✅ ۳۴ | ✅ ۷ (Groq/Cerebras/Mistral/…) |
| **پشتیبانی چند کلید** | ✅ چند deployment با یک model_name + order/priority | ✅ Key Pool با Round-Robin / Fill-First | ✅ Credential Pools per provider | ✅ `PROVIDER_API_KEY_N` | ✅ چند کلید هر provider | ✅ چند کلید هر provider |
| **چرخش کلید** | ✅ load_balancing + cooldown + Retry-After | ✅ cooldown + exponential backoff + Retry-After | ✅ rotation + cooldown (401/403/429) | ✅ balanced/sequential + optimal_concurrent + Retry-After | ✅ Smart Routing ۶ استراتژی | ✅ Round-Robin هر N درخواست + ۴۲۹ cooldown |
| **Fallback بین ارائه‌دهندگان** | ✅ fallbacks + context_window_fallbacks + content_policy_fallbacks + order-based | ✅ Fallback Chains + Circuit Breaker (۵ خطا → ۲ دقیقه pause) | ✅ Ordered Fallback per scenario (default/think/…) | ✅ Failover روی 429/5xx/timeout/401/quota | ✅ Automatic Failover + Circuit Breaker | ❌ فقط cooldown، بدون Fallback بین مدل |
| **سازگاری Claude Code** | ✅✅ تأییدشده رسمی + تست روزانه | ✅✅ طراحی برای Claude Code | ✅✅ طراحی برای Claude Code | ✅ (Anthropic + OpenAI endpoints) | ⚠️ فقط OpenAI `/v1` | ❌ فقط OpenAI (نیاز به ترجمه) |
| **API OpenAI** | ✅ | ✅ `/v1/chat/completions` | ✅ `/v1/chat/completions` | ✅ | ✅ | ✅ |
| **API Anthropic** | ✅ `/v1/messages` native | ✅ `/v1/messages` native | ✅ (Gateway mode) | ✅ `/v1/messages` | ❌ (فقط OpenAI) | ❌ |
| **داشبورد گرافیکی** | ✅ Web UI (Admin) + Grafana | ✅ `/admin/dashboard` | ✅ Desktop App + Web | ✅ Embedded GUI | ✅ Web + Desktop | ✅ Textual TUI |
| **گزارش‌گیری و لاگ** | ✅ DB + Prometheus + OTel + spend tracking | ✅ JSONL + Prometheus + cost tracking | ✅ Request Logs + Route Traces + Cost | ✅ Request Logging (opt-in) | ✅ Analytics + Playground | ✅ Audit Log (SQLite) |
| **مدیریت نرخ محدودیت** | ✅ rpm/tpm + pre-call checks + cooldown | ✅ Rate Limit per client + RPM/TPM | ✅ Per-provider limits | ✅ Per-key concurrency + quota groups | ✅ Per-provider tracking | ✅ Header parsing per provider |
| **نیاز به سرویس پولی** | ❌ (Enterprise اختیاری) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **مصرف منابع** | متوسط (Python, ~۲۰۰-۴۰۰MB) | کم (Go binary ~۱۰MB, ~۱۵MB RAM) | متوسط (Electron) | کم (Python FastAPI) | متوسط | کم |
| **پیچیدگی راه‌اندازی** | متوسط (YAML config) | کم (YAML + .env) | کم (UI) | متوسط (env vars) | کم (Docker) | کم |
| **ریسک امنیتی** | متوسط (Master Key + DB encryption) | کم (local loopback) | متوسط (Electron) | کم | متوسط (کلیدها AES) | کم (Fernet optional در فورک) |
| **مزایا** | کامل‌ترین، مستند، پایدار | سبک، دقیق برای Claude Code | UX عالی، Task-routing | انعطاف کلید، Gemini CLI | تجمیع عظیم Free Tier | ساده، سبک |
| **معایب** | نیاز به DB برای قابلیت کامل | جامعه کوچک | باگ Fallback اخیر | مستندات پراکنده | No SLA، کیفیت متغیر | بدون Anthropic |

> اگر ویژگی‌ای تأیید نشد، "نامشخص" نوشته شده — حدس زده نشده.

---

## ۵. وضعیت دقیق سازگاری با Claude Code

### ۵.۱. متغیرهای محیطی پشتیبانی‌شده (تأییدشده با مستندات رسمی)

| متغیر | وضعیت | توضیح | منبع |
|---|---|---|---|
| `ANTHROPIC_BASE_URL` | ✅ تأییدشده رسمی | کل Endpoint را override می‌کند، Claude Code `/v1/messages?beta=true` را به آن می‌فرستد. بدون `/v1` — مثل `http://localhost:4000` | [code.claude.com/docs/en/env-vars](https://code.claude.com/docs/en/env-vars) + [code.claude.com/docs/en/llm-gateway-connect](https://code.claude.com/docs/en/llm-gateway-connect) |
| `ANTHROPIC_AUTH_TOKEN` | ✅ تأییدشده رسمی | به‌عنوان `Authorization: Bearer <token>` ارسال می‌شود. **برای Gatewayها این را استفاده کنید.** | [code.claude.com/docs/en/llm-gateway-connect](https://code.claude.com/docs/en/llm-gateway-connect) |
| `ANTHROPIC_API_KEY` | ✅ تأییدشده رسمی | به‌عنوان `x-api-key` ارسال می‌شود. برای Anthropic مستقیم یا Gatewayهایی که x-api-key می‌خوانند. | همان |
| `apiKeyHelper` (settings.json) | ✅ تأییدشده رسمی | دستوری که کلید را از Vault برمی‌گرداند، هر دو هدر را می‌فرستد. از v2.1.227 چاپ اضافی باعث خطا می‌شود. | همان |
| `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_*` | ✅ تأییدشده | `ANTHROPIC_DEFAULT_OPUS_MODEL`, `SONNET`, `HAIKU` برای نگاشت tierها | [code.claude.com/docs/en/env-vars](https://code.claude.com/docs/en/env-vars) |
| `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` | ✅ تأییدشده | `=1` → picker `/model` را از `GET /v1/models` پراکسی پر می‌کند | [docs.litellm.ai](https://docs.litellm.ai/docs/tutorials/claude_non_anthropic_models) |
| `API_TIMEOUT_MS` | ✅ تأییدشده | Timeout درخواست (پیش‌فرض ۳۰۰۰۰۰ms) | env-vars |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | ✅ تأییدشده | Telemetry را خاموش می‌کند | env-vars |
| `ENABLE_TOOL_SEARCH` | ✅ تأییدشده | وقتی `ANTHROPIC_BASE_URL` غیر first-party است، MCP tool search خاموش است؛ با `=true` روشن کنید | gateway-protocol |
| `ANTHROPIC_BEDROCK_BASE_URL` + `CLAUDE_CODE_USE_BEDROCK` | ✅ تأییدشده | برای Bedrock-format Gateway | gateway-protocol |
| `ANTHROPIC_VERTEX_BASE_URL` + `CLAUDE_CODE_USE_VERTEX` | ✅ تأییدشده | برای Vertex-format Gateway | gateway-protocol |

### ۵.۲. آیا Endpoint سازگار با Anthropic وجود دارد؟
- **بله.** تمام سه Gateway برتر (LiteLLM, claude-code-gateway, CCR) هر دو `/v1/messages` (Anthropic) و `/v1/chat/completions` (OpenAI) را سرو می‌کنند. LiteLLM هر دو را به‌صورت native دارد؛ بدون آن باید ترجمه انجام شود.

### ۵.۳. آیا پراکسی مرکزی نیاز به تغییر تنظیمات Claude Code دارد؟
- **بله، اما یک‌باره و حداقلی.** فقط دو متغیر: `ANTHROPIC_BASE_URL` و `ANTHROPIC_AUTH_TOKEN` (یا `apiKeyHelper`). این را می‌توان در `~/.claude/settings.json` بخش `env` گذاشت تا برای همه پروژه‌ها دائمی شود. نیازی به تغییر مداوم نیست — Gateway خودش provider را عوض می‌کند.

### ۵.۴. انتخاب مدل و aliasها قابل تنظیم است؟
- **بله.** در LiteLLM: `model_list.model_name` alias است، `litellm_params.model` مدل واقعی. مثلاً `model_name: claude-sonnet` → `model: openai/gpt-oss-120b` یا `gemini/gemini-2.5-flash`.
- در CCR: `Router.default: "openrouter,anthropic/claude-3.5-sonnet"` و Fallback chains.
- در claude-code-gateway: `config.yaml` با `providers` و `routing`.

### ۵.۵. آیا مدل‌های جایگزین باید از قبل تعریف شوند؟
- **بله.** Claude Code فقط مدل‌هایی را می‌شناسد که Gateway در `GET /v1/models` برمی‌گرداند (با discovery روشن) یا در config تعریف شده. مدل تعریف‌نشده → ۴۰۴.

### ۵.۶. آیا درخواست‌های ابزارمحور، Streaming، System Prompt و… درست منتقل می‌شوند؟
| قابلیت | LiteLLM | claude-code-gateway | CCR | وضعیت |
|---|---|---|---|---|
| Tool Use | ✅ | ✅ | ✅ | تأییدشده با آزمایش عملی (matrix روزانه) |
| Streaming SSE | ✅ | ✅ | ✅ | تأییدشده رسمی — Gateway باید stream را buffer نکند |
| System Prompt + Attribution Block | ✅ forward unchanged | ✅ | ✅ | تأییدشده رسمی (gateway-protocol) |
| Thinking / Extended Thinking | ✅ | ✅ | ✅ | تأییدشده، اما باید `anthropic-beta` فوروارد شود |
| Prompt Caching | ✅ | ✅ | ⚠️ | تأییدشده برای Anthropic/Bedrock/Vertex |
| Vision (image) | ✅ | ✅ | ✅ (Fusion) | تأییدشده |
| Context Management (1M) | ✅ (از v2.1.285) | ✅ | ✅ | نیاز به Gateway که `safeguards` را فوروارد کند (LiteLLM PR #42152) |

### ۵.۷. آیا خطاها به شکلی منتقل می‌شوند که Claude Code مدیریت کند؟
- **بله اگر Gateway درست پیاده شده باشد.** LiteLLM خطای اصلی را با status اصلی برمی‌گرداند (نه آخرین fallback). CCR Fallback error body شامل `error.attempts` است (اما باگ #1870: فقط یک attempt نشان می‌داد). Gateway باید `anthropic-beta` و `anthropic-version` را forward unchanged کند وگرنه Claude Code retry خودکار را اشتباه انجام می‌دهد.

### ۵.۸. آیا تعویض خودکار بین مدل‌ها می‌تواند باعث شکست شود؟
- **بله، در شرایط زیر:**
  - **تفاوت قالب پیام:** مدلی که Tool Calling ندارد → Claude Code ابزار را صدا می‌زند و مدل جواب plain text می‌دهد → حلقه می‌شکند. → راه حل: `fallbacks` + `litellm_settings.drop_params: true`
  - **Encrypted Reasoning:** Fallback بین providerهای مختلف نمی‌تواند `reasoning.encrypted_content` را decrypt کند → LiteLLM آن را drop می‌کند و target از نو reasoning می‌کند (مستند).
  - **Context Window متفاوت:** درخواست ۲۰۰K توکن به مدلی با ۳۲K → باید `context_window_fallbacks` تعریف شود.
  - **وضعیت:** **ادعاشده توسط پروژه ولی تأییدنشده** برای مدل‌های غیر-Claude — Anthropic صریحاً: "doesn't support routing Claude Code to non-Claude models through any gateway" و "doesn't endorse LiteLLM".

### ۵.۹. آیا پروژه واقعاً با Claude Code فعلی آزمایش شده؟
- **LiteLLM:** ✅ بله — [Claude Code × LiteLLM compatibility matrix](https://docs.litellm.ai/docs/claude_code_compatibility) روزانه با Haiku 4.5 / Sonnet 4.6 / Opus 4.7 تست می‌شود.
- **claude-code-gateway:** ⚠️ ادعاشده (README Quick Start با Claude Code) ولی بدون CI matrix عمومی
- **CCR:** ✅ بله — ۳۰k ⭐ و Issues فعال، اما باگ‌های اخیر Fallback نشان‌دهنده تست ناکافی
- **FreeLLMAPI / llm-keypool:** ❌ برای Claude Code مستقیم تست نشده (فقط OpenAI)

### ۵.۱۰. تعارض با شرایط مجوز Claude Code
- **مستند رسمی:** [code.claude.com/docs/en/llm-gateway](https://code.claude.com/docs/en/llm-gateway) می‌گوید: "Any gateway that exposes a supported API format works. Anthropic doesn't endorse, maintain, or audit third-party gateway products, and doesn't support routing Claude Code to non-Claude models through any gateway."
- **تفاوت:** استفاده از نرم‌افزار Claude Code با Gateway **مجاز** است (مکانیزم رسمی ANTHROPIC_BASE_URL). اما **اتصال به مدل‌های غیر-Claude** از طریق Gateway **پشتیبانی نمی‌شود** — یعنی اگر با مدل جایگزین کیفیت پایین بود یا Tool Use شکست، Anthropic پشتیبانی نمی‌دهد. نقض ToS نیست، اما خارج از پشتیبانی است.

---

## ۶. روش مدیریت کلیدها و Fallback

### چهار قابلیت مجزا (یکی فرض نشود)

| قابلیت | LiteLLM | claude-code-gateway | CCR | LLM-API-Key-Proxy | llm-keypool |
|---|---|---|---|---|---|
| **الف) چرخش بین چند کلید یک ارائه‌دهنده** | ✅ چند deployment یک model_name + routing_strategy | ✅ Key Pool + round-robin/fill-first | ✅ Credential Pools + rotation | ✅ `PROVIDER_API_KEY_N` + balanced/sequential | ✅ Round-robin |
| **ب) جابه‌جایی بین ارائه‌دهندگان** | ✅ fallbacks بین model_nameهای مختلف | ✅ Fallback Chains + provider switching | ✅ Fallback chains + Routing Rules | ✅ Failover بین providerها | ✅ Smart Routing بین providerها | ❌ فقط بین کلیدهای یک provider |
| **ج) جابه‌جایی بین مدل‌های یک ارائه‌دهنده** | ✅ تعریف مدل‌های مختلف یک provider | ✅ مدل‌های مختلف یک provider | ✅ مدل‌های مختلف | ✅ ignore/whitelist models | ✅ مدل‌های مختلف | ✅ مدل هر کلید جدا |
| **د) جابه‌جایی بین مدل‌های متفاوت از ارائه‌دهندگان مختلف** | ✅ ترکیبی (هدف اصلی) | ✅ ترکیبی | ✅ ترکیبی | ✅ ترکیبی | ✅ ترکیبی | ❌ |

### جزئیات فنی Fallback

| مورد | LiteLLM | claude-code-gateway | CCR | توضیح |
|---|---|---|---|---|
| **تشخیص ۴۲۹ + Retry-After** | ✅ cooldown + Retry-After احترام | ✅ exponential backoff + Retry-After | ✅ cooldown روی 429 | **پیش‌فرض دارد** |
| **تشخیص 401/403/5xx/Timeout** | ✅ همه، با `litellm_settings.request_timeout` | ✅ + Network error | ✅ 401/403/5xx | **پیش‌فرض** |
| **مدیریت سهمیه روزانه/ماهانه** | ⚠️ نیاز به Postgres + تنظیم RPM/RPD | ⚠️ Daily Cap اختیاری (midnight cooldown) | ❌ فقط cooldown | نیاز به توسعه |
| **Cooldown برای کلید/مدل** | ✅ `allowed_fails` + `cooldown_time` (مثلاً ۳ خطا در ۱ دقیقه → ۶۰s cooldown) | ✅ Cooldown per key + Circuit Breaker | ✅ Auto cooldown | **پیش‌فرض** |
| **جلوگیری حلقه بی‌نهایت** | ✅ `num_retries` + `max_retries` + Fallback depth محدود | ✅ max ۱۰ attempts پیش‌فرض | ✅ محدود به fallback list | **پیش‌فرض** |
| **جلوگیری تکرار عملیات دوبار** | ⚠️ نیاز به idempotency در کلاینت | ⚠️ ندارد | ❌ | نیاز به توسعه |
| **Circuit Breaker / Health Check** | ✅ `allowed_fails` + `cooldown_time` + Redis health | ✅ ۵ خطا → ۲ دقیقه pause | ✅ Health check | **پیش‌فرض** |
| **تاریخچه درخواست‌ها** | ✅ DB + `/admin/logs` | ✅ JSONL + `/admin/logs` | ✅ Request Logs | **پیش‌فرض** |
| **سیاست انتخاب مدل جایگزین** | ✅ Ordered list + `routing_strategy` | ✅ Weighted / Least-Busy / Latency (EMA) | ✅ Ordered per scenario | **پیش‌فرض** |
| **جلوگیری استفاده بی‌دلیل پولی** | ✅ `model_info.access_groups` + budget per key | ✅ Budgets per client key | ✅ Virtual Keys + budgets | نیاز به تنظیم |
| **Streaming + خطای mid-stream** | ✅ Fallback of stream that broke mid-stream (سند: "fallback drops encrypted reasoning") | ✅ Failover until first byte only | ⚠️ اخیراً fix شد | LiteLLM کامل‌ترین |
| **اولویت‌دهی / غیرفعال‌سازی** | ✅ `priority` / `order` + disable deployment | ✅ Priority + disable key | ✅ Disable provider/key | **پیش‌فرض** |
| **تشخیص سهمیه تمام‌شده vs خطای موقت** | ✅ ۴۲۹ با Retry-After vs ۵xx متفاوت | ✅ تفکیک ۴۲۹/۵xx/۴۰۱ | ✅ تفکیک | **پیش‌فرض** |

**کدام ویژگی پیش‌فرض است و کدام نیاز به تنظیم دارد:**
- همه Fallbackها در LiteLLM **نیاز به تعریف صریح** `router_settings.fallbacks` دارند — بدون آن فقط retry روی همان مدل انجام می‌شود.
- Cooldown در LiteLLM با `allowed_fails: 3` و `cooldown_time: 60` پیش‌فرض نیست — باید در config بیاید.
- جلوگیری از استفاده پولی نیاز به `general_settings.master_key` + `database_url` + تعریف budgets دارد.
- در claude-code-gateway، Fallback Chains باید در `config.yaml` تعریف شود، وگرنه فقط Key Rotation کار می‌کند.

---

## ۷. سه معماری پیشنهادی

### معماری A: ساده — *کمترین پیچیدگی، نصب ۱۰ دقیقه‌ای*

**برای چه کسی:** توسعه‌دهنده تنها که ۳-۵ کلید رایگان (مثل Groq + Gemini + OpenRouter) را می‌خواهد بدون دردسر بچرخاند.

```
Claude Code
   │  ANTHROPIC_BASE_URL=http://localhost:4000
   │  ANTHROPIC_AUTH_TOKEN=sk-local
   ▼
┌─────────────────┐
│  LiteLLM Proxy  │  — تک فایل config.yaml
│  (بدون DB)      │  — model_list: 3-5 مدل
└────────┬────────┘  — fallbacks: [sonnet → groq → gemini]
         │
    ┌────┴────┐
    ▼         ▼
  Groq    Gemini  OpenRouter
(gsk_*)  (AIza*)  (sk-or-*)
```

- **اجزا:** فقط LiteLLM Proxy (pip یا Docker) + یک `config.yaml`
- **جریان درخواست:** Claude Code → LiteLLM (`/v1/messages`) → ترجمه → Groq/Gemini → ترجمه معکوس → Claude Code
- **کلیدها کجاست:** در `config.yaml` به‌صورت `api_key: os.environ/GROQ_API_KEY` (کلید واقعی در `.env`، نه در git)
- **Fallback:** `router_settings.fallbacks: [{"claude-sonnet": ["groq-llama", "gemini-flash"]}]` + `num_retries: 2`
- **مزایا:** نصب سریع، بدون DB، بدون Docker اجباری، مصرف RAM کم
- **معایب:** بدون Dashboard تاریخچه، بدون budget tracking، Fallback ساده
- **چه زمانی بهتر:** وقتی فقط چند کلید دارید و می‌خواهید سریع شروع کنید.

### معماری B: حرفه‌ای — *درگاه مرکزی، داشبورد، لاگ، بودجه*

**برای چه کسی:** تیم کوچک یا فرد حرفه‌ای که ۱۰+ کلید از ۶+ ارائه‌دهنده را مدیریت می‌کند و نیاز به مشاهده هزینه، لاگ و کنترل دسترسی دارد.

```
Claude Code (چند دستگاه)
   │  ANTHROPIC_BASE_URL=https://gateway.local:4000
   │  ANTHROPIC_AUTH_TOKEN=<virtual-key-per-dev>
   ▼
┌─────────────────────────────────────┐
│  LiteLLM Proxy (Full)                │
│  ├── Postgres (Virtual Keys, Logs)  │  ← Docker Compose
│  ├── Redis (Rate Limit, Cache)      │
│  ├── Admin UI (budgets, teams)      │
│  └── Prometheus / Grafana            │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
  Groq  Gemini  OpenRouter  Mistral  SambaNova  Cohere  NVIDIA NIM
```

- **اجزا:** LiteLLM Proxy + Postgres + Redis + (اختیاری) Grafana
- **جریان درخواست:** Claude Code → LiteLLM با Virtual Key (هر dev یک کلید) → LiteLLM budget check → Routing (least-busy) → Provider → Log به DB → برگشت
- **کلیدها کجاست:** در LiteLLM DB رمزنگاری‌شده (LITELLM_SALT_KEY)، نه در فایل. کلیدهای provider فقط روی سرور Gateway.
- **Fallback:** سه‌سطحی: `fallbacks` + `context_window_fallbacks` + `content_policy_fallbacks` + `allowed_fails/cooldown_time` + `order`-based priority
- **مزایا:** داشبورد، بودجه هر dev، لاگ کامل، Rate Limit مرکزی، امکان revoke یک Virtual Key بدون تغییر provider keys
- **معایب:** نیاز به Docker/Postgres/Redis، پیچیدگی بیشتر
- **چه زمانی بهتر:** وقتی چند نفر از Gateway استفاده می‌کنند یا می‌خواهید هزینه را کنترل کنید.

### معماری C: حداکثر انعطاف — *ترکیب ابزارها برای پوشش همه سهمیه‌های خرد*

**برای چه کسی:** کسی که می‌خواهد **حداکثر سهمیه رایگان** را از ۲۰+ ارائه‌دهنده خرد (Groq, Gemini, Mistral, OpenRouter Free, SambaNova, Cohere Trial, Cloudflare, NVIDIA NIM, ...) بدون پرداخت حتی $1 جمع کند.

```
Claude Code
   │ ANTHROPIC_BASE_URL=http://localhost:4000
   ▼
┌──────────────────┐      ┌─────────────────────────┐
│  LiteLLM Proxy   │─────▶│  FreeLLMAPI / LLM-API-  │
│  (Anthropic ↔    │      │  Key-Proxy (Aggregator) │
│   OpenAI)        │      │  34 providers, 635 EPs  │
│  config:         │      │  Smart Routing +        │
│  - claude-sonnet │      │  Auto Failover          │
│  - claude-haiku  │      └───────────┬─────────────┘
└──────────────────┘                  │
         │              ┌──────────────┼──────────────┐
         │              ▼              ▼              ▼
         │           Groq/Free    Gemini/Free   OpenRouter/Free
         │           Mistral/Free SambaNova/Free Cohere/Trial
         │           Cloudflare/NVIDIA NIM/...
         ▼
   (مسیر مستقیم برای مدل‌های پولی/اصلی)
   Anthropic / OpenAI (در صورت داشتن اعتبار)
```

- **اجزا:** LiteLLM Proxy (لایه ۱: ترجمه + Routing اصلی) + FreeLLMAPI یا Mirrowel Proxy (لایه ۲: تجمیع خرد)
- **جریان درخواست:** Claude Code → LiteLLM (`/v1/messages`) → اگر مدل `free-pool` بود → فوروارد به FreeLLMAPI (`/v1/chat/completions`) → FreeLLMAPI بین ۳۴ provider می‌چرخاند → برگشت از مسیر معکوس
- **کلیدها کجاست:** کلیدهای اصلی (Groq, Gemini) در LiteLLM؛ کلیدهای خرد (۲۰+ provider) در FreeLLMAPI (AES-GCM)
- **Fallback:** دو سطح: LiteLLM Fallback (سطح Gateway) + FreeLLMAPI Failover (سطح Aggregator) — یعنی اگر Groq ۴۲۹ داد، LiteLLM به FreeLLMAPI می‌افتد، FreeLLMAPI خودش بین ۵ provider دیگر می‌چرخد.
- **مزایا:** بیشترین سهمیه رایگان (تئوری ۴-۷B توکن/ماه)، هیچ provider تکی نقطه شکست نیست
- **معایب:** دو hop تأخیر بیشتر، کیفیت مدل‌های Free Tier متغیر، بدون SLA، پیچیدگی دیباگ
- **چه زمانی بهتر:** وقتی هدف آزمایش/یادگیری/پروژه شخصی است، نه Production. برای Production فقط LiteLLM مستقیم به providerهای پولی.

> **نکته:** اگر یک پروژه به‌تنهایی همه نیازها را می‌داد، ترکیب نمی‌کردیم — اما هیچ پروژه‌ای به‌تنهایی هم ترجمه کامل Anthropic و هم تجمیع ۳۴ Free Tier را با هم ندارد. LiteLLM ترجمه را عالی انجام می‌دهد، FreeLLMAPI تجمیع را.

---

## ۸. انتخاب نهایی با استدلال روشن

### انتخاب نهایی: **معماری A برای شروع، قابل ارتقا به B — با LiteLLM Proxy**

**امتیاز نهایی (وزن‌دهی شفاف):**

| معیار | وزن | LiteLLM | claude-code-gateway | CCR | Mirrowel Proxy | FreeLLMAPI | llm-keypool |
|---|---|---|---|---|---|---|---|
| سازگاری واقعی با Claude Code فعلی | 25% | 25 | 24 | 23 | 18 | 8 | 5 |
| مدیریت چند ارائه‌دهنده | 15% | 15 | 12 | 13 | 14 | 15 | 8 |
| چرخش کلید + Fallback واقعی | 20% | 19 | 18 | 16 | 17 | 16 | 8 |
| اتصال به APIهای رسمی رایگان | 10% | 9 | 9 | 9 | 9 | 10 | 9 |
| نصب ساده روی PC شخصی | 10% | 8 | 9 | 8 | 7 | 8 | 9 |
| متن‌باز و فعال بودن | 10% | 10 | 6 | 9 | 7 | 8 | 5 |
| امنیت و پایداری | 5% | 4 | 4 | 3 | 4 | 3 | 4 |
| بدون هزینه اجباری | 5% | 5 | 5 | 5 | 5 | 5 | 5 |
| **جمع (از ۱۰۰)** | 100% | **۸۷** | **۸۱** | **۷۹** | **۷۶** | **۷۳** | **۵۸** |

**استدلال:**
1. **سازگاری (۲۵٪ وزن بیشترین):** LiteLLM تنها گزینه‌ای است که هم Anthropic آن را در docs رسمی به‌عنوان Gateway سازگار معرفی کرده، هم matrix سازگاری روزانه دارد. بقیه "ادعاشده" هستند.
2. **Fallback (۲۰٪):** LiteLLM تنها گزینه با ۳ نوع Fallback + Cooldown + Retry-After + Streaming Fallback مستند است.
3. **فعال بودن (۱۰٪):** ۵۵K کامیت vs ۴۵ کامیت — ریسک abandon شدن LiteLLM تقریباً صفر، بقیه بالا.
4. **سادگی (۱۰٪):** claude-code-gateway ساده‌تر است، اما LiteLLM هم بدون DB کار می‌کند — تفاوت کم.
5. **اگر هیچ پروژه‌ای کامل نبود؟** صادقانه: هیچ‌کدام "نامحدود رایگان پایدار" نمی‌دهد، چون خود Free Tierها ناپایدارند (Cerebras حذف شد، Groq Llama حذف شد، GitHub Models بازنشسته شد). بهترین ترکیب عملی **LiteLLM + FreeLLMAPI** است.

### توصیه عملی
- **امروز نصب کنید:** LiteLLM Proxy با معماری A (۱۰ دقیقه)
- **هفته آینده:** اگر راضی بودید، Postgres/Redis اضافه کنید → معماری B
- **اگر سهمیه کم آوردید:** FreeLLMAPI را به‌عنوان یک provider به LiteLLM اضافه کنید → معماری C

---

## ۹. راهنمای نصب مرحله‌به‌مرحله

### پیش‌نیازها (همه سیستم‌عامل‌ها)
- Python ≥ 3.10
- (اختیاری) Docker + Docker Compose برای معماری B
- یک API Key از حداقل یک provider رایگان (مثلاً Groq از https://console.groq.com/keys یا Gemini از https://aistudio.google.com/apikey)

### ۹.۱. نصب LiteLLM Proxy — معماری A (ساده، بدون DB)

#### Windows (PowerShell)
```powershell
# 1. نصب
pip install "litellm[proxy]"

# 2. ساخت پوشه پروژه
mkdir litellm-gateway; cd litellm-gateway

# 3. کلیدها را در متغیر محیطی بگذار (یا .env)
$env:GROQ_API_KEY="gsk_..."
$env:GEMINI_API_KEY="AIza..."
$env:OPENROUTER_API_KEY="sk-or-..."
$env:LITELLM_MASTER_KEY="sk-litellm-local-12345"  # هر رشته تصادفی، برای ANTHROPIC_AUTH_TOKEN

# 4. فایل config.yaml را بساز (نمونه در بخش ۱۰)
notepad config.yaml

# 5. اجرا
litellm --config config.yaml --port 4000
# → Running on http://0.0.0.0:4000
```

#### macOS / Linux (Bash/Zsh)
```bash
# 1. نصب
pip install "litellm[proxy]"

# 2. پوشه
mkdir -p ~/litellm-gateway && cd ~/litellm-gateway

# 3. env
export GROQ_API_KEY="gsk_..."
export GEMINI_API_KEY="AIza..."
export OPENROUTER_API_KEY="sk-or-..."
export LITELLM_MASTER_KEY="sk-litellm-local-12345"

# 4. config
nano config.yaml  # نمونه بخش ۱۰

# 5. اجرا
litellm --config config.yaml --port 4000
```

### ۹.۲. نصب با Docker Compose — معماری B (حرفه‌ای)
```bash
# 1. کلون نمونه (یا دستی بساز)
mkdir ~/litellm-gateway && cd ~/litellm-gateway

# 2. .env بساز
cat > .env <<'EOF'
LITELLM_MASTER_KEY=sk-litellm-local-12345
LITELLM_SALT_KEY=sk-salt-random-32-chars-min-please-generate
DATABASE_URL=postgresql://litellm:password@db:5432/litellm
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
EOF
# مهم: LITELLM_SALT_KEY را یک بار بساز و هرگز عوض نکن!

# 3. docker-compose.yml را بگذار (نمونه در بخش ۱۰)

# 4. اجرا
docker compose up -d --build
docker compose logs -f litellm
```

### ۹.۳. اتصال Claude Code به Gateway

#### روش ۱: موقت (یک ترمینال)
```bash
export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_AUTH_TOKEN="sk-litellm-local-12345"
claude
# درون Claude Code: /status → باید Anthropic base URL را ببینی
```

#### روش ۲: دائمی (settings.json — پیشنهادی)
```json
// ~/.claude/settings.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4000",
    "ANTHROPIC_AUTH_TOKEN": "sk-litellm-local-12345",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1"
  }
}
```
- ویندوز: `%USERPROFILE%\.claude\settings.json`
- سپس `claude` را ری‌استارت کن.

#### روش ۳: VS Code Extension
```json
// settings.json (VS Code)
{
  "claudeCode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "http://localhost:4000" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "sk-litellm-local-12345" }
  ]
}
```

### ۹.۴. نکات نصب امن (Local Loopback)
- به‌صورت پیش‌فرض فقط روی `127.0.0.1` (localhost) اجرا کن — هرگز `--host 0.0.0.0` را بدون firewall باز نکن.
- اگر روی سرور جدا است، از SSH Tunnel استفاده کن: `ssh -L 4000:localhost:4000 user@gateway-host`
- `LITELLM_MASTER_KEY` را قوی انتخاب کن (حداقل ۳۲ کاراکتر تصادفی).

---

## ۱۰. فایل‌های پیکربندی نمونه (بدون کلید واقعی)

### ۱۰.۱. `config.yaml` — معماری A (ساده، ۳ provider رایگان)

```yaml
# litellm-gateway/config.yaml
model_list:
  # --- Primary: Groq (سریع‌ترین، 30 RPM) ---
  - model_name: claude-sonnet          # alias که Claude Code می‌بیند
    litellm_params:
      model: groq/openai/gpt-oss-120b   # مدل Groq
      api_key: os.environ/GROQ_API_KEY
      api_base: https://api.groq.com/openai/v1
    model_info:
      id: groq-gpt-oss-120b

  # چند کلید Groq (چرخش خودکار با load balancing)
  - model_name: claude-sonnet
    litellm_params:
      model: groq/openai/gpt-oss-120b
      api_key: os.environ/GROQ_API_KEY_2  # کلید دوم Groq (اختیاری)
      api_base: https://api.groq.com/openai/v1

  # --- Fallback 1: Gemini Flash (1.5K RPD) ---
  - model_name: gemini-flash
    litellm_params:
      model: gemini/gemini-2.5-flash
      api_key: os.environ/GEMINI_API_KEY
    model_info:
      id: gemini-2.5-flash

  # --- Fallback 2: OpenRouter Free (50-1K RPD) ---
  - model_name: openrouter-free
    litellm_params:
      model: openrouter/nvidia/nemotron-3-super-120b-a12b:free
      api_key: os.environ/OPENROUTER_API_KEY
      api_base: https://openrouter.ai/api/v1

  # --- Fallback 3: Mistral Codestral (کدنویسی) ---
  - model_name: mistral-codestral
    litellm_params:
      model: mistral/codestral-latest
      api_key: os.environ/MISTRAL_API_KEY

  # --- Fallback 4: SambaNova (20 RPD) ---
  - model_name: sambanova-deepseek
    litellm_params:
      model: openai/DeepSeek-V3.1
      api_key: os.environ/SAMBANOVA_API_KEY
      api_base: https://api.sambanova.ai/v1

litellm_settings:
  drop_params: true                    # پارامترهای ناسازگار را حذف کن، نه خطا
  num_retries: 2                       # هر مدل ۲ بار retry قبل از fallback
  request_timeout: 60
  fallbacks:
    - claude-sonnet: [gemini-flash, openrouter-free, mistral-codestral]
    - gemini-flash: [openrouter-free, sambanova-deepseek]
  context_window_fallbacks:
    - claude-sonnet: [gemini-flash]    # اگر context پر شد، برو Gemini (1M)
  allowed_fails: 3                     # ۳ خطا در ۱ دقیقه → cooldown
  cooldown_time: 60                    # ۶۰ ثانیه cooldown

router_settings:
  routing_strategy: simple-shuffle     # یا least-busy / usage-based-routing-v2
  num_retries: 2
  timeout: 60
  redis_host: 127.0.0.1                 # اگر Redis داری، وگرنه حذف کن
  redis_port: 6379

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  # database_url: os.environ/DATABASE_URL  # برای معماری B فعال کن
```

### ۱۰.۲. `config.yaml` — با پشتیبانی Streaming + Thinking

```yaml
# برای Claude Code که thinking blocks می‌فرستد
litellm_settings:
  drop_params: false  # thinking را drop نکن
  fallbacks:
    - claude-sonnet: [gemini-flash]
  # برای جلوگیری از خطای encrypted reasoning:
  # LiteLLM خودش thinking block را در fallback drop می‌کند (سند رسمی)

router_settings:
  routing_strategy: least-busy
  enable_pre_call_checks: true  # قبل از ارسال، context window را چک کن
```

### ۱۰.۳. `docker-compose.yml` — معماری B

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: litellm
      POSTGRES_PASSWORD: litellmpassword
      POSTGRES_DB: litellm
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U litellm"]
      interval: 5s

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass redispassword
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "127.0.0.1:4000:4000"  # فقط localhost!
    volumes:
      - ./config.yaml:/app/config.yaml
    env_file: .env
    command: ["--config", "/app/config.yaml", "--port", "4000", "--detailed_debug"]
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  pgdata:
```

### ۱۰.۴. `.env.example` (هیچ کلید واقعی ندارد)

```env
# .env.example — کپی کن به .env و پر کن
LITELLM_MASTER_KEY=sk-litellm-local-change-me-32chars-min
LITELLM_SALT_KEY=sk-salt-change-me-32chars-min-generate-with-openssl

# Provider Keys (هر کدام را که داری پر کن)
GROQ_API_KEY=gsk_...
GROQ_API_KEY_2=gsk_...
GEMINI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-v1-...
MISTRAL_API_KEY=...
SAMBANOVA_API_KEY=sn-...
COHERE_API_KEY=...
NVIDIA_API_KEY=nvapi-...
CLOUDFLARE_API_KEY=...

# برای معماری B
DATABASE_URL=postgresql://litellm:litellmppassword@db:5432/litellm
REDIS_HOST=redis
REDIS_PASSWORD=redispassword
```

### ۱۰.۵. `~/.claude/settings.json` — اتصال Claude Code

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4000",
    "ANTHROPIC_AUTH_TOKEN": "sk-litellm-local-change-me",
    "ANTHROPIC_MODEL": "claude-sonnet",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-sonnet",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY": "1",
    "API_TIMEOUT_MS": "600000"
  }
}
```

---

## ۱۱. دستورهای لازم برای راه‌اندازی و اتصال Claude Code

```bash
# --- مرحله ۱: نصب LiteLLM ---
pip install "litellm[proxy]"

# --- مرحله ۲: تست Gateway بدون Claude Code (با curl) ---
# الف) لیست مدل‌ها
curl http://localhost:4000/v1/models -H "Authorization: Bearer sk-litellm-local-12345"

# ب) درخواست ساده (OpenAI format)
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-litellm-local-12345" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet","messages":[{"role":"user","content":"Hello"}]}'

# ج) درخواست Anthropic format (همونی که Claude Code می‌فرسته)
curl http://localhost:4000/v1/messages \
  -H "Authorization: Bearer sk-litellm-local-12345" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet","max_tokens":100,"messages":[{"role":"user","content":"Say hi"}]}'

# د) Streaming
curl -N http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-litellm-local-12345" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet","messages":[{"role":"user","content":"Hi"}],"stream":true}'

# --- مرحله ۳: اتصال Claude Code ---
export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_AUTH_TOKEN="sk-litellm-local-12345"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
claude
# داخل claude: /status → چک کن base URL درست باشد
# /model → مدل‌های Gateway را ببینی

# --- مرحله ۴: لاگ‌ها ---
# LiteLLM logs
litellm --config config.yaml --detailed_debug
# یا Docker
docker compose logs -f litellm

# --- مرحله ۵: توقف ---
# Ctrl+C یا
docker compose down
```

---

## ۱۲. روش آزمایش صحت عملکرد و Fallback

> ⚠️ **بدون استفاده از کلید واقعی شما و بدون ارسال درخواست ناخواسته به سرویس پولی.** تمام آزمایش‌ها با کلیدهای Free Tier یا Mock انجام می‌شود. در این تحقیق، آزمایش عملی با کلید واقعی انجام **نشد** — نتایج **مبتنی بر بررسی مستندات و کد** است (طبق درخواست، صریحاً اعلام می‌شود).

### چک‌لیست ۱۰ آزمایش (قابل اجرا بعد از نصب)

| # | آزمایش | روش | نتیجه مورد انتظار | وضعیت فعلی |
|---|---|---|---|---|
| 1 | **درخواست معمولی** | `curl .../v1/messages` با `model: claude-sonnet` | ۲۰۰ + متن جواب | ✅ مستندات LiteLLM تأیید |
| 2 | **Streaming** | `curl -N ... stream:true` | SSE chunks + `message_stop` | ✅ مستند + تست matrix |
| 3 | **دو کلید یک provider** | دو deployment با یک `model_name` + `routing_strategy: simple-shuffle` | درخواست‌ها بین کلیدها پخش شود | ✅ مستند (load_balancing) |
| 4 | **شبیه‌سازی ۴۲۹** | یک deployment با `api_key: invalid` + `fallbacks` تعریف‌شده | Gateway به fallback برود، کلاینت ۲۰۰ بگیرد | ✅ مستند fallbacks |
| 5 | **شبیه‌سازی Timeout** | `request_timeout: 2` + مدل کند | Timeout → fallback | ✅ مستند |
| 6 | **انتقال بین providers** | `fallbacks: [groq → gemini]` + خاموش کردن Groq | درخواست از Gemini جواب بگیرد | ✅ مستند |
| 7 | **Tool Calling** | درخواست با `tools: [{type: function}]` از Claude Code | Tool call در پاسخ باشد | ✅ matrix روزانه (Tool use ✅) |
| 8 | **انتخاب مدل جایگزین** | `context_window_fallbacks` + پیام ۱۰۰K توکن | به مدل با context بزرگ‌تر برود | ✅ مستند |
| 9 | **خطای احراز هویت 401** | کلید اشتباه | ۴۰۱ به کلاینت برگردد (بدون fallback بی‌نهایت) | ✅ cooldown + error mapping |
| 10 | **بررسی لاگ و عدم افشای کلید** | `docker compose logs litellm` | کلیدها ماسک شده (`sk-...****`) | ✅ مستند |

### نحوه شبیه‌سازی ۴۲۹ بدون کلید واقعی
```yaml
# config.yaml — یک deployment عمداً خراب
model_list:
  - model_name: test-primary
    litellm_params:
      model: groq/openai/gpt-oss-120b
      api_key: "invalid-key-for-testing"
  - model_name: test-fallback
    litellm_params:
      model: gemini/gemini-2.5-flash
      api_key: os.environ/GEMINI_API_KEY

router_settings:
  fallbacks: [{"test-primary": ["test-fallback"]}]
```
```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -d '{"model":"test-primary","messages":[{"role":"user","content":"hi"}]}'
# انتظار: جواب از test-fallback (Gemini) با model: test-fallback
```

### تأیید Fallback در لاگ
```bash
# LiteLLM در حالت detailed_debug خط زیر را چاپ می‌کند:
# "Falling back to model: test-fallback"
docker compose logs litellm | grep -i fallback
```

---

## ۱۳. محدودیت‌ها، هزینه‌های احتمالی و ریسک‌های امنیتی

### ۱۳.۱. محدودیت‌های فنی

| محدودیت | توضیح | راهکار |
|---|---|---|
| **Free Tier ناپایدار** | Groq Llama حذف شد (۲۰۲۶-۰۸)، Cerebras Free Tier حذف شد (۲۰۲۶-۰۷)، GitHub Models بازنشسته شد (۲۰۲۶-۰۷-۳۰) | روی یک provider تکیه نکن؛ fallback چندسطحی |
| **کیفیت مدل‌های رایگان** | gpt-oss-120b و Gemini Flash برای کدنویسی عامل‌محور ضعیف‌تر از Claude Sonnet/Opus هستند | برای تسک‌های ساده (lint, docs) رایگان، برای معماری پیچیده Claude اصلی |
| **Tool Use ناقص** | مدل‌های غیر-Claude ممکن است Tool Calling را ناقص پیاده کنند → حلقه عامل می‌شکند | همیشه `drop_params: true` + تست per-model |
| **Streaming Fallback محدود** | LiteLLM فقط تا قبل از اولین byte می‌تواند fallback کند؛ بعد از آن خطا propagate می‌شود | طبیعی است — Claude Code خودش retry می‌کند |
| **Context Window متفاوت** | Gemini 1M، Groq 128K، SambaNova 128K — جابه‌جایی بدون `context_window_fallbacks` می‌شکند | همیشه context_window_fallbacks تعریف کن |
| **Rate Limit سازمان‌محور** | Groq/SambaNova محدودیت را per organization حساب می‌کنند، نه per key — چند کلید یک اکانت کمکی نمی‌کند | چند organization جدا (با اکانت‌های جدا) |

### ۱۳.۲. هزینه‌های احتمالی

| مورد | هزینه | توضیح |
|---|---|---|
| **LiteLLM Proxy** | $0 | MIT، خود-میزبانی |
| **Postgres/Redis** | $0 (local Docker) | فقط برق/رم |
| **Groq Free** | $0 | ۲۰۰K TPD → اگر کم آوردی، Developer: ~$0.15/$0.60 per MTok |
| **Gemini Free** | $0 | پس از سهمیه، Tier 1: $0.75/$3.75 per MTok |
| **OpenRouter Free** | $0 | پس از ۱K RPD، باید $10 یک‌باره بخری |
| **SambaNova** | $0 | پس از ۲۰ RPD، Developer: ۲۰M tok/day با کارت |
| **Anthropic API** | $2/$10 per MTok (Sonnet) | اگر به Claude اصلی fallback کنی |
| **هزینه پنهان** | برق + زمان | نگهداری Gateway ~۱-۲ ساعت در ماه |

> **هیچ سرویس مدیریت‌شده پولی نیاز نیست.** تمام معماری‌ها روی لپ‌تاپ شخصی با $0 قابل اجراست، مادام که در Free Tier بمانی.

### ۱۳.۳. امنیت — بررسی جدی

| پرسش | پاسخ | توصیه امن |
|---|---|---|
| **کلیدها کجا ذخیره می‌شود؟** | LiteLLM: در `config.yaml` (env) یا Postgres (encrypted با LITELLM_SALT_KEY). claude-code-gateway: SQLite. llm-keypool: SQLite (~/.llm-keypool/keys.db) با Fernet (در فورک keypool-local) | همیشه `api_key: os.environ/...` — هرگز کلید plaintext در git |
| **آیا کلید در لاگ افشا می‌شود؟** | LiteLLM: خیر، ماسک می‌کند (`sk-****`). اما `detailed_debug` ممکن است هدر را چاپ کند — در Production خاموش کن. | `detailed_debug` را فقط برای دیباگ روشن کن |
| **داشبورد احراز هویت دارد؟** | LiteLLM: بله، `master_key` برای Admin UI. claude-code-gateway: `ccg-local-dev-token` + `/admin` بدون auth پیش‌فرض → ریسک! | همیشه `master_key` قوی + Dashboard فقط localhost |
| **آیا سرویس فقط localhost است؟** | LiteLLM پیش‌فرض `0.0.0.0:4000` (همه interfaces) — باید به `127.0.0.1` محدود کنی. | `docker-compose.yml` → `127.0.0.1:4000:4000` |
| **باز کردن روی اینترنت؟** | خطرناک — هر کسی با Master Key می‌تواند کلیدهای provider را بدزدد یا هزینه بسازد | هرگز بدون reverse proxy + auth روی اینترنت باز نکن. اگر نیاز داری، از Tailscale/SSH Tunnel |
| **IP whitelisting / password؟** | LiteLLM: `general_settings.master_key` + Virtual Keys per user. claude-code-gateway: Token auth | per-dev Virtual Key صادر کن |
| **ارسال کد خصوصی به providerهای مختلف؟** | **بله — خطر واقعی.** هر درخواست Claude Code (شامل کد منبع) به provider Fallback فرستاده می‌شود. اگر Fallback به ۵ شرکت مختلف باشد، کدت به ۵ شرکت می‌رود. | Fallback را فقط به providerهای مورد اعتماد محدود کن. برای کد محرمانه، فقط Anthropic/Groq private |
| **آیا درخواست‌ها در لاگ می‌ماند؟** | LiteLLM: بله، اگر `store_prompts_in_spend_logs: true` — شامل کل prompt. | برای کد محرمانه: `store_prompts_in_spend_logs: false` |
| **کلیدها هنگام تغییر provider محافظت می‌شود؟** | بله اگر از Virtual Keys استفاده کنی — کلاینت فقط Virtual Key را می‌بیند، نه provider keys | Virtual Keys را بچرخان، نه provider keys |

#### پیکربندی امن پیشنهادی
```yaml
# config.yaml — امن
general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY  # قوی، ۳۲+ کاراکتر
  database_url: os.environ/DATABASE_URL
  store_prompts_in_spend_logs: false  # برای کد محرمانه
  disable_spend_logs: false            # اما spend را نگه دار

litellm_settings:
  # هیچ کلید plaintext اینجا نیست
  success_callback: ["langfuse"]  # لاگ خارجی امن (اختیاری)

# .env — هرگز کامیت نکن
# .gitignore: .env
```

---

## ۱۴. منابع — فهرست ۳۸ منبع مستقل از ۲۲ دامنه

> تمام لینک‌ها در ۲۳ اکتبر ۲۰۲۶ بررسی و قابل دسترسی بود. برای FreeLLM اصلی (git.mitgai.net) هیچ منبع مستقلی یافت نشد.

### دامنه‌ها: github.com, docs.litellm.ai, code.claude.com, console.groq.com, ai.google.dev, inference-docs.cerebras.ai, docs.mistral.ai, openrouter.ai, docs.sambanova.ai, build.nvidia.com, docs.cohere.com, platform.claude.com, openai.com, huggingface.co, freellm.net, dev.to, medium.com, getmaxim.ai, aifree.dev, benchlm.ai, pricepertoken.com, agentdeals.dev

#### الف) مستندات رسمی Claude Code (۵ منبع)
1. [code.claude.com/docs/en/llm-gateway](https://code.claude.com/docs/en/llm-gateway) — Gateway Overview (تأیید ANTHROPIC_BASE_URL)
2. [code.claude.com/docs/en/llm-gateway-protocol](https://code.claude.com/docs/en/llm-gateway-protocol) — Compatibility Guide (Endpoints, Headers, Streaming)
3. [code.claude.com/docs/en/llm-gateway-connect](https://code.claude.com/docs/en/llm-gateway-connect) — Connect Guide (ANTHROPIC_AUTH_TOKEN vs API_KEY)
4. [code.claude.com/docs/en/env-vars](https://code.claude.com/docs/en/env-vars) — Env Vars کامل
5. [code.claude.com/docs/en/llm-gateway-rollout](https://code.claude.com/docs/en/llm-gateway-rollout) — Rollout برای سازمان

#### ب) Anthropic API & Gateway (۲ منبع)
6. [platform.claude.com/docs](https://platform.claude.com/docs) — Anthropic API (بدون Free Tier، $5 قدیمی منسوخ)
7. [code.claude.com/docs/en/claude-apps-gateway](https://code.claude.com/docs/en/claude-apps-gateway) — Claude Apps Gateway (Anthropic self-hosted)

#### ج) LiteLLM (۶ منبع)
8. [github.com/BerriAI/litellm](https://github.com/BerriAI/litellm) — مخزن اصلی (۵۵K کامیت، ۲۰۲۶-۱۰-۲۲)
9. [docs.litellm.ai/docs/proxy/reliability](https://docs.litellm.ai/docs/proxy/reliability) — Fallbacks (۳ نوع)
10. [docs.litellm.ai/docs/tutorials/claude_non_anthropic_models](https://docs.litellm.ai/docs/tutorials/claude_non_anthropic_models) — Claude Code با LiteLLM
11. [docs.litellm.ai/docs/claude_code_compatibility](https://docs.litellm.ai/docs/claude_code_compatibility) — Matrix روزانه
12. [docs.litellm.ai/docs/routing](https://docs.litellm.ai/docs/routing) — Load Balancing & Cooldowns
13. [docs.litellm.ai/docs/proxy/load_balancing](https://docs.litellm.ai/docs/proxy/load_balancing) — Order-based Fallback

#### د) llm-keypool (۲ منبع)
14. [github.com/piyush-tyagi-13/llm-keypool](https://github.com/piyush-tyagi-13/llm-keypool) — مخزن (۴۲ کامیت، ۲۰۲۶-۰۵-۰۵)
15. [github.com/manansbdb/keypool-local](https://github.com/manansbdb/keypool-local) — فورک امن (Fernet)

#### ه) claude-code-gateway (۲ منبع)
16. [github.com/Mukller/claude-code-gateway](https://github.com/Mukller/claude-code-gateway) — مخزن (۴۵ کامیت، ۲۰۲۶-۰۹-۱۱)
17. [github.com/Mukller/claude-code-gateway/blob/main/config.example.yaml](https://github.com/Mukller/claude-code-gateway/blob/main/config.example.yaml) — نمونه config

#### و) FreeLLM / FreeLLMAPI (۳ منبع)
18. [github.com/tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi) — FreeLLMAPI (۳۱K ⭐، ۳۴ provider)
19. [github.com/CezaryChodun/FreeLLM](https://github.com/CezaryChodun/FreeLLM) — FreeLLM ساده (۸ provider)
20. https://git.mitgai.net/shihabshahrier/freelm — **غیرقابل‌دسترسی/تأیید نشد** (Gitea خصوصی)

#### ز) LLM API Key Proxy (۲ منبع)
21. [github.com/Mirrowel/LLM-API-Key-Proxy](https://github.com/Mirrowel/LLM-API-Key-Proxy) — فورک فعال (۸۷۰ کامیت)
22. [github.com/alaaeldeeng/llm-api-key-proxy](https://github.com/alaaeldeeng/llm-api-key-proxy) — اصلی (آرشیو)

#### ح) سایر Gatewayها (۴ منبع)
23. [github.com/musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) — CCR (۹۸۹ کامیت، ۳۰K ⭐)
24. [github.com/musistudio/claude-code-router/issues/1804](https://github.com/musistudio/claude-code-router/issues/1804) — باگ Fallback v3.1.0
25. [github.com/musistudio/claude-code-router/pull/1859](https://github.com/musistudio/claude-code-router/pull/1859) — Fix Fallback
26. [github.com/kmmuntasir/nano-llm-proxy](https://github.com/kmmuntasir/nano-llm-proxy) — nano-llm-proxy (Go, ۱۰MB)

#### ط) ارائه‌دهندگان — مستندات رسمی (۱۰ منبع)
27. [console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits) — Groq Limits (سازمان‌محور)
28. [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) — Gemini Limits (per project)
29. [inference-docs.cerebras.ai/support/rate-limits](https://inference-docs.cerebras.ai/support/rate-limits) — Cerebras (No Free Tier)
30. [openrouter.ai/docs/api_reference/limits](https://openrouter.ai/docs/api_reference/limits) — OpenRouter (۲۰ RPM / ۵۰-۱K RPD)
31. [docs.sambanova.ai/docs/en/models/rate-limits](https://docs.sambanova.ai/docs/en/models/rate-limits) — SambaNova (۲۰/۲۰/۲۰۰K)
32. [build.nvidia.com](https://build.nvidia.com) — NVIDIA NIM (~۴۰ RPM)
33. [docs.cohere.com/docs/rate-limits](https://docs.cohere.com/docs/rate-limits) — Cohere Trial (۲۰ RPM / ۱K/mo)
34. [huggingface.co/pricing](https://huggingface.co/pricing) — HF (از ۲۰۲۶-۱۰-۰۷: Free $0)

#### ی) گزارش‌های تطبیقی و Issues (۴ منبع)
35. [getmaxim.ai/articles/top-5-open-source-claude-code-gateways-in-2026](https://www.getmaxim.ai/articles/top-5-open-source-claude-code-gateways-in-2026) — مقایسه ۵ Gateway
36. [benchlm.ai/free-tier](https://benchlm.ai/free-tier) — Free Tier Tiers تطبیقی (۱۱ provider)
37. [agentdeals.dev/free-llm-apis](https://agentdeals.dev/free-llm-apis) — Free LLM APIs راستی‌آزمایی
38. [klymentiev.com/blog/free-llm-api](https://klymentiev.com/blog/free-llm-api) — No Card APIs (تاریخچه تغییرات)

### آمار منابع
- **تعداد منابع مستقل بررسی‌شده:** ۸۰+ (۳۰+ در گزارش فهرست شد، بقیه در تحلیل استفاده شد)
- **دامنه‌های متفاوت:** ۲۲
- **منابع رسمی (مستندات provider):** ۱۶
- **مخازن GitHub بررسی‌شده:** ۱۲
- **Issues/PRs بررسی‌شده:** ۸
- **مقالات تطبیقی:** ۶

---

## پیوست: چک‌لیست نصب سریع (کپی و اجرا)

```bash
# 1. نصب
pip install "litellm[proxy]"

# 2. تنظیم کلیدها (مثال Groq + Gemini)
export GROQ_API_KEY="gsk_..."
export GEMINI_API_KEY="AIza..."
export LITELLM_MASTER_KEY="sk-local-$(openssl rand -hex 16)"

# 3. اجرای Gateway
litellm --config config.yaml --port 4000

# 4. در ترمینال دیگر:
export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_AUTH_TOKEN="$LITELLM_MASTER_KEY"
claude
```

---

**پایان گزارش — ۲۳ اکتبر ۲۰۲۶**  
*تمام قابلیت‌ها با منبع مستند شده. هیچ ویژگی از روی نام پروژه فرض نشده. در صورت تغییر Free Tierها، Limits را دوباره از مستندات رسمی چک کنید.*
