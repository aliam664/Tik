# طرح بازتنظیم اقتصاد Sheriff Coin — نسخهٔ ۲۰۲۶-۱۰-۲۳

## وضعیت اجرا

این سند، مدل دقیق پیاده‌سازی‌شده در migration `0024_sheriff_coin_rebalance.sql` را ثبت می‌کند. migration هنوز روی Supabase تولیدی اجرا نشده است و اجرای مستقیم آن، به‌دلیل نبود staging branch، نیازمند تأیید صریح مالک پروژه است.

Sheriff Coin همچنان ارز مجازی، غیرقابل‌نقدکردن و بدون ارزش پول واقعی است. آیتم‌های فروشگاه صرفاً آرایشی‌اند.

## روش اقتصادی

مدل بر اساس «زمان بازیکن تا خرید» و «نرخ تولید خالص» تنظیم شده، نه با کپی‌کردن مبلغ خام از بازی‌های دیگر:

- هدف پایدار برای پاداش تکرارشونده: تقریباً **۳ تا ۵ SH در دقیقه** در یک نشست معمولی.
- موجودی شروع: **۱۵۰ SH**؛ برابر با قیمت اولین آیتم معنادار فروشگاه.
- سقف مشترک تمام پاداش‌های تکرارشونده: **۱۵۰ SH در روز برای هر بازیکن**.
- زمان رسیدن از صفر به گران‌ترین آیتم ۵۰۰۰ سکه‌ای، فقط با سقف روزانه: حداقل **۳۴ روز**.
- ارزش کل کاتالوگ پس از افزودن آیتم‌های prestige: **۱۴٬۳۵۰ SH**؛ معادل حداقل حدود **۹۶ روز سقف کامل**.
- اصل شرط و پرداخت شرط، Faucet محسوب نمی‌شود؛ فقط به‌عنوان `transfer` ثبت می‌شود.

این رویکرد با راهنمای Roblox دربارهٔ طراحی داده‌محور Faucet/Sink و ثبت رویدادهای اقتصادی، راهنمای Unity دربارهٔ زمان بازیکن، پیشرفت سریع اولیه و پایش inflation/velocity، و ادبیات حرفه‌ای metagame دربارهٔ لزوم حذف دائمی ارزش توسط Sink همسو است.

## پاداش دقیق هر بازی

| بازی/جریان | مقدار دقیق | فرض زمانی و منطق |
|---|---:|---|
| دوز رده‌بندی — برد | ۱۲ SH | میانگین برد/باخت برای هر بازیکن ۷٫۵ SH در مسابقهٔ ۲ دقیقه‌ای ≈ ۳٫۷۵ SH/min |
| دوز رده‌بندی — مساوی | ۶ SH | زیر برد و بالاتر از حضور؛ بدون انگیزهٔ افراطی برای تبانی |
| دوز رده‌بندی — باخت | ۳ SH | مشارکت را حفظ می‌کند، ولی farming با باخت را سودآور نمی‌کند |
| اولین برد روز | ۸ SH | boost کوچک روزانه، داخل همان سقف ۱۵۰ |
| رشته برد | ۲ SH به‌ازای هر پله، حداکثر ۶ | کوچک و سقف‌دار؛ جلوگیری از snowball |
| رازواژه — برنده | ۲۴ SH | میانگین ۱۷ SH برای نشست معمول ۵ دقیقه‌ای ≈ ۳٫۴ SH/min |
| رازواژه — مشارکت | ۱۰ SH | تقریباً ۴۲٪ جایزهٔ برنده؛ کاهش انگیزهٔ AFK |
| رمزگشا — برنده | ۱۲ SH | میانگین ۸ SH برای نشست ۲٫۵ دقیقه‌ای ≈ ۳٫۲ SH/min |
| رمزگشا — مشارکت | ۴ SH | پاداش کم اما غیرصفر برای تکمیل سالم مسابقه |
| Last Night — تکمیل ۱۰ موج | ۷۵ SH برای هر بازیکن | حداقل زمانی سرور حدود ۱۷٫۹ دقیقه؛ ≈ ۴٫۲ SH/min |
| Sheriff Dice / Blast | بدون Faucet | فقط انتقال موجودی؛ house edge بلندمدت |
| دوز شرطی | بدون Faucet | pot بازیکنان منهای rake؛ draw کاملاً refund می‌شود |

### مرز ارزی Last Night

- سکهٔ خزانهٔ داخل یک کمپین به‌صورت واضح **Run Coin** نام‌گذاری شده است.
- Run Coin در پایان اتاق از بین می‌رود و وارد کیف پول پایدار نمی‌شود.
- تنها تکمیل کامل کمپین، ۷۵ Sheriff Coin پایدار می‌دهد.
- سرور برای پذیرش `wave_cleared` هم حداقل زمان و هم تعداد roster کشتار همان موج را بررسی می‌کند؛ ادعای کلاینت به‌تنهایی کافی نیست.

## دستاوردها و فصل

### دستاوردهای یک‌باره

| دستاورد | پاداش جدید |
|---|---:|
| اولین برد | ۲۰ |
| ۱۰ برد | ۴۰ |
| ۱۰۰ برد | ۱۵۰ |
| رشتهٔ ۵ برد | ۳۰ |
| ۵۰ بازی | ۵۰ |
| اولین بازی شرطی | ۱۵ |
| رسیدن به Gold | ۱۰۰ |

`elo_start` از ۱۲۰۰ به **۱۰۰۰** تغییر کرده است؛ حساب جدید دیگر در لحظهٔ ساخت واجد Gold نیست. حساب‌های قدیمیِ بازی‌نکرده به ۱۰۰۰ منتقل می‌شوند و حساب‌های قدیمیِ بازی‌کرده که Gold بوده‌اند badge را بدون mint تصادفی آینده دریافت می‌کنند.

### جایزهٔ پایان فصل (حداقل ۱۰ بازی)

| Tier | پاداش |
|---|---:|
| Master | ۶۰۰ |
| Diamond | ۴۰۰ |
| Platinum | ۲۷۵ |
| Gold | ۱۸۰ |
| Silver | ۱۰۰ |
| Bronze | ۵۰ |

## شرط‌بندی، RTP و rounding

- حداقل شرط Dice و Blast: **۱۰۰ SH**.
- حداکثر شرط: **۳۰۰ SH**؛ برابر سقف باخت مشترک روزانه در بدترین حالت یک شرط.
- house edge پایه: **۱٪**.
- در ۱۰۰ SH، هر multiplier صدمی به پرداخت صحیح تبدیل می‌شود و flooring دوم پرداخت حذف می‌شود.
- Dice علاوه بر RTP پایه، **RTP واقعی همان stake/target/side** را در UI نشان می‌دهد.
- کمینهٔ RTP واقعی Dice در محدودهٔ هدف مجاز و stake=100 حدود **98.175%** است؛ UI آن را پنهان نمی‌کند.
- rake بازی Stakes از ۱۰٪ به **۷٪** کاهش یافت (cap=20).
- rake مساوی از ۵٪ به **صفر** رسید تا refund دقیق باشد و خطای rounding/ثبت rake حذف شود.

RTP یک ویژگی بلندمدت است، نه وعدهٔ هر نشست. UI شانس، house edge/RTP، سقف باخت و استقلال راندها را نمایش می‌دهد. این کار با استانداردهای اطلاع‌رسانی مسئولانهٔ NCPG و توضیح حرفه‌ای RTP/house edge توسط eCOGRA همسو است.

## کنترل تورم و هم‌زمانی

`coins_grant` اکنون تنها مرجع پاداش‌های تکرارشونده است:

1. ردیف کیف پول قفل می‌شود.
2. ردیف `(player_id, current_date)` در `daily_gameplay_rewards` ایجاد و `FOR UPDATE` قفل می‌شود.
3. مبلغ در باقی‌ماندهٔ سقف ۱۵۰ clamp می‌شود.
4. claim در `gameplay_reward_claims` با requested/granted/source ثبت می‌شود.
5. کیف پول و ledger در همان transaction تغییر می‌کنند.

بنابراین دو بازی هم‌زمان نمی‌توانند با race condition سقف را رد کنند. `stake_payout`، `crash_payout` و `dice_payout` از سقف درآمد gameplay و محاسبهٔ Faucet حذف شده‌اند.

## تله‌متری

هر ردیف ledger اکنون دارای دو فیلد اجباری است:

- `source`: بازی/منبع، مانند `classic_ranked`, `word_cipher`, `last_night`, `sheriff_dice`, `shop`.
- `flow_kind`: یکی از `faucet`, `sink`, `transfer`, `neutral`.

پنل ادمین اکنون نمایش می‌دهد:

- Faucet و Sink واقعی ۲۴ ساعته (بدون شمردن payout شرط به‌عنوان mint)،
- تمرکز جریان بر اساس بازی در ۷ روز،
- Sink coverage،
- transfer net جداگانه،
- مقدار درخواست‌شده، پرداخت‌شده و مسدودشده توسط daily cap.

## Sink و مالکیت آرایشی

- موجودی آرایشی در profile API برگردانده می‌شود.
- بازیکن می‌تواند آیتم خریداری‌شده را تجهیز کند.
- در هر `kind` فقط یک آیتم فعال است.
- عنوان و قاب فعال در پروفایل نمایش داده می‌شود و وضعیت همهٔ تجهیزات در فروشگاه قابل مشاهده است.
- سه sink بلندمدت اضافه شد: عنوان ۱۸۰۰، قاب ۳۰۰۰ و تم ۵۰۰۰ SH.

## آزمون‌ها

- شبیه‌سازی تمام ترتیب‌های interleaving چند claim بین بازی‌ها و اثبات سقف ۱۵۰.
- taper دقیق ۱۴۷→۱۵۰ و grant صفر پس از سقف.
- نرخ درآمد چهار بازی تحت فرض‌های زمانی مستند.
- conservation دقیق pot = payout + rake.
- پیمایش تمام targetهای Dice و تأیید RTP واقعی 98.17%..99% در minimum stake.
- تست مرز Sheriff Coin پایدار در برابر Run Coin موقت.

## منابع پژوهش

- Roblox — Balance virtual economies: https://github.com/Roblox/creator-docs/blob/main/content/en-us/production/game-design/balance-virtual-economies.md
- Roblox — Economy events: https://github.com/Roblox/creator-docs/blob/main/content/en-us/production/analytics/economy-events.md
- Unity — Game economy design guide: https://unity.com/resources/game-economy-design-guide
- Game Developer — Game Economy Design / metagame: https://www.gamedeveloper.com/design/book-excerpt-game-economy-design-metagame-monetization-and-live-operations
- OSRS transaction tax/item sink study: https://arxiv.org/html/2210.07970
- Virtual-currency endowment and inflation experiment: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0186407
- eCOGRA — RTP and house edge: https://ecogra.org/igaming/what-is-return-to-player/
- NCPG Internet Responsible Gambling Standards: https://www.ncpgambling.org/wp-content/uploads/2024/01/Internet-Responsible-Gambling-Standards-Rev.-12-2023-FINAL.pdf
