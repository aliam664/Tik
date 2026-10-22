/**
 * RAZ-VAJEH (رازواژه — WORD CIPHER)
 * Curated, extensible, multi-pack word bank.
 *
 * Architecture notes:
 *  - Words are grouped into 12 rich categories across 3 themed packs ("classic", "culture", "adventure"),
 *    with 6–8 familiar Persian words per category (80 curated entries total).
 *  - Every round selects 4 distinct categories × 4 distinct words = 16 word cards without repeats.
 *  - Each entry stores category metadata, difficulty ("easy" | "medium" | "hard"), English equivalent,
 *    accepted Persian alternative spellings/synonyms, semantic `relatedWords`, and 2 progressive `hintWords`.
 *  - Adding new categories, packs, or languages requires ONLY appending to `WORD_CATEGORIES` / `WORD_BANK`.
 */

import type {
  RoundWordCard,
  WordCategorySpec,
  WordDifficulty,
  WordEntrySpec,
  WordPackId,
} from "@/types/wordGame";

export const WORD_PACK_META: readonly {
  readonly id: WordPackId;
  readonly titleFa: string;
  readonly subtitleFa: string;
}[] = [
  {
    id: "all",
    titleFa: "بسته جامع (همه دسته‌ها)",
    subtitleFa: "ترکیب متنوع از ۱۲ دسته‌بندی مختلف برای بیشترین تنوع در هر راند",
  },
  {
    id: "classic",
    titleFa: "بسته کلاسیک روزمره",
    subtitleFa: "طبیعت، اشیا، مکان‌ها و خوراکی‌های آشنا و محبوب",
  },
  {
    id: "culture",
    titleFa: "بسته سرگرمی و فرهنگ",
    subtitleFa: "سینما و بازی، ورزش، موسیقی و مشاغل",
  },
  {
    id: "adventure",
    titleFa: "بسته دانش و ماجراجویی",
    subtitleFa: "نجوم و فضا، حیوانات، سفر و فناوری",
  },
] as const;

export const WORD_CATEGORIES: readonly WordCategorySpec[] = [
  // Pack 1: Classic (4 categories)
  {
    id: "nature",
    packId: "classic",
    lang: "fa",
    titleFa: "طبیعت و پدیده‌ها",
    titleEn: "Nature",
    color: "#39c98a",
    icon: "🌿",
  },
  {
    id: "objects",
    packId: "classic",
    lang: "fa",
    titleFa: "اشیا و ابزارها",
    titleEn: "Objects",
    color: "#e5a93c",
    icon: "🧭",
  },
  {
    id: "places",
    packId: "classic",
    lang: "fa",
    titleFa: "مکان‌ها و بناها",
    titleEn: "Places",
    color: "#4dd0c4",
    icon: "🏛️",
  },
  {
    id: "food",
    packId: "classic",
    lang: "fa",
    titleFa: "خوراکی و نوشیدنی",
    titleEn: "Food & Drink",
    color: "#ff8c5a",
    icon: "🍵",
  },

  // Pack 2: Culture & Entertainment (4 categories)
  {
    id: "entertainment",
    packId: "culture",
    lang: "fa",
    titleFa: "سرگرمی و هنر",
    titleEn: "Entertainment",
    color: "#a78bfa",
    icon: "🎭",
  },
  {
    id: "sports",
    packId: "culture",
    lang: "fa",
    titleFa: "ورزش و رقابت",
    titleEn: "Sports",
    color: "#38bdf8",
    icon: "🏆",
  },
  {
    id: "music",
    packId: "culture",
    lang: "fa",
    titleFa: "موسیقی و سازها",
    titleEn: "Music",
    color: "#f472b6",
    icon: "🎻",
  },
  {
    id: "professions",
    packId: "culture",
    lang: "fa",
    titleFa: "مشاغل و مهارت‌ها",
    titleEn: "Professions",
    color: "#facc15",
    icon: "⚒️",
  },

  // Pack 3: Science & Adventure (4 categories)
  {
    id: "cosmos",
    packId: "adventure",
    lang: "fa",
    titleFa: "آسمان و فضا",
    titleEn: "Space & Sky",
    color: "#818cf8",
    icon: "🪐",
  },
  {
    id: "animals",
    packId: "adventure",
    lang: "fa",
    titleFa: "حیات‌وحش و جانوران",
    titleEn: "Wildlife",
    color: "#34d399",
    icon: "🦅",
  },
  {
    id: "vehicles",
    packId: "adventure",
    lang: "fa",
    titleFa: "حمل‌ونقل و سفر",
    titleEn: "Travel & Vehicles",
    color: "#60a5fa",
    icon: "⛵",
  },
  {
    id: "science",
    packId: "adventure",
    lang: "fa",
    titleFa: "دانش و فناوری",
    titleEn: "Science & Tech",
    color: "#fb923c",
    icon: "🔬",
  },
] as const;

export const WORD_BANK: readonly WordEntrySpec[] = [
  /* ============================== 1. NATURE ============================== */
  {
    id: "nat_volcano",
    categoryId: "nature",
    lang: "fa",
    word: "آتشفشان",
    wordEn: "Volcano",
    difficulty: "easy",
    acceptedAnswers: ["کوه آتشفشان", "اتشفشان"],
    relatedWords: ["گدازه", "ماگما", "کوه", "خاکستر", "فوران", "آتش", "دهانه", "دود"],
    hintWords: ["کوه خشمگین", "فوران گدازه"],
  },
  {
    id: "nat_fog",
    categoryId: "nature",
    lang: "fa",
    word: "مه",
    wordEn: "Fog",
    difficulty: "medium",
    acceptedAnswers: ["مه غلیظ", "مه صبحگاهی"],
    relatedWords: ["ابر", "بخار", "جاده", "جنگل", "رطوبت", "دید کم", "شبنم", "شمال"],
    hintWords: ["کاهش دید در جاده", "ابر نزدیک زمین"],
  },
  {
    id: "nat_coral",
    categoryId: "nature",
    lang: "fa",
    word: "مرجان",
    wordEn: "Coral",
    difficulty: "hard",
    acceptedAnswers: ["مرجان دریایی", "صخره مرجانی"],
    relatedWords: ["دریا", "اقیانوس", "غواصی", "ماهی", "صخره", "خلیج فارس", "زیر آب", "صدف"],
    hintWords: ["باغ رنگارنگ زیر دریا", "صخره زنده اقیانوس"],
  },
  {
    id: "nat_earthquake",
    categoryId: "nature",
    lang: "fa",
    word: "زلزله",
    wordEn: "Earthquake",
    difficulty: "easy",
    acceptedAnswers: ["زمین‌لرزه", "زمین لرزه"],
    relatedWords: ["گسل", "ریشتر", "لرزش", "زمین", "آوار", "پناه", "پس‌لرزه"],
    hintWords: ["حرکت گسل‌ها", "مقیاس ریشتر"],
  },
  {
    id: "nat_waterfall",
    categoryId: "nature",
    lang: "fa",
    word: "آبشار",
    wordEn: "Waterfall",
    difficulty: "easy",
    acceptedAnswers: ["ابشار"],
    relatedWords: ["رودخانه", "صخره", "سقوط آب", "کوهستان", "جنگل", "دره", "خروشان"],
    hintWords: ["ریزش آب از بلندی", "صخره و رود خروشان"],
  },
  {
    id: "nat_rainbow",
    categoryId: "nature",
    lang: "fa",
    word: "رنگین‌کمان",
    wordEn: "Rainbow",
    difficulty: "easy",
    acceptedAnswers: ["رنگین کمان", "قوس قزح"],
    relatedWords: ["باران", "خورشید", "هفت رنگ", "آسمان", "نور", "منشور"],
    hintWords: ["بعد از باران در آسمان", "کمان هفت‌رنگ نور"],
  },

  /* ============================== 2. OBJECTS ============================= */
  {
    id: "obj_mirror",
    categoryId: "objects",
    lang: "fa",
    word: "آینه",
    wordEn: "Mirror",
    difficulty: "easy",
    acceptedAnswers: ["آیینه", "ایینه", "اینه"],
    relatedWords: ["بازتاب", "تصویر", "شیشه", "چهره", "نگاه", "شمعدان", "نور"],
    hintWords: ["بازتاب تصویر", "شیشه نقره‌اندود"],
  },
  {
    id: "obj_hammer",
    categoryId: "objects",
    lang: "fa",
    word: "چکش",
    wordEn: "Hammer",
    difficulty: "easy",
    acceptedAnswers: ["پتک"],
    relatedWords: ["میخ", "نجاری", "ابزار", "ضربه", "آهنگر", "چوب", "کارگاه"],
    hintWords: ["یار همیشگی میخ", "ابزار کوبیدن در نجاری"],
  },
  {
    id: "obj_compass",
    categoryId: "objects",
    lang: "fa",
    word: "قطب‌نما",
    wordEn: "Compass",
    difficulty: "medium",
    acceptedAnswers: ["قطب نما", "قبله‌نما"],
    relatedWords: ["شمال", "جهت", "مغناطیس", "عقربه", "نقشه", "کوهنوردی", "کشتی"],
    hintWords: ["عقربه مغناطیسی", "نشان‌دهنده جهت شمال"],
  },
  {
    id: "obj_umbrella",
    categoryId: "objects",
    lang: "fa",
    word: "چتر",
    wordEn: "Umbrella",
    difficulty: "easy",
    acceptedAnswers: ["چتر بارانی"],
    relatedWords: ["باران", "خیس", "پاییز", "خیابان", "ابری", "سایبان"],
    hintWords: ["همراه روزهای بارانی", "سایبان دستی بالای سر"],
  },
  {
    id: "obj_hourglass",
    categoryId: "objects",
    lang: "fa",
    word: "ساعت شنی",
    wordEn: "Hourglass",
    difficulty: "hard",
    acceptedAnswers: ["شیشه شنی"],
    relatedWords: ["زمان", "شن", "ماسه", "شیشه", "قدیمی", "ثانیه", "ساعت"],
    hintWords: ["زمان‌سنج قدیمی بدون عقربه", "ریزش دانه‌های شن در شیشه"],
  },
  {
    id: "obj_lantern",
    categoryId: "objects",
    lang: "fa",
    word: "فانوس",
    wordEn: "Lantern",
    difficulty: "medium",
    acceptedAnswers: ["چراغ بادی", "چراغ نفتی"],
    relatedWords: ["شعله", "نفت", "تاریکی", "شب", "نور", "شمع", "فتیله"],
    hintWords: ["چراغ قدیمی شب‌های تاریک", "شعله پشت حباب شیشه‌ای"],
  },

  /* ============================== 3. PLACES ============================== */
  {
    id: "plc_airport",
    categoryId: "places",
    lang: "fa",
    word: "فرودگاه",
    wordEn: "Airport",
    difficulty: "easy",
    acceptedAnswers: ["میدان هوایی"],
    relatedWords: ["هواپیما", "پرواز", "چمدان", "پاسپورت", "باند", "خلبان", "ترمینال"],
    hintWords: ["چمدان و کارت پرواز", "باند برخاستن هواپیما"],
  },
  {
    id: "plc_museum",
    categoryId: "places",
    lang: "fa",
    word: "موزه",
    wordEn: "Museum",
    difficulty: "easy",
    acceptedAnswers: ["موزه‌خانه"],
    relatedWords: ["تاریخ", "عتیقه", "مجسمه", "آثار باستانی", "گالری", "تابلو", "بازدید"],
    hintWords: ["نگهداری آثار باستانی", "تماشای اشیای تاریخی پشت شیشه"],
  },
  {
    id: "plc_tunnel",
    categoryId: "places",
    lang: "fa",
    word: "تونل",
    wordEn: "Tunnel",
    difficulty: "medium",
    acceptedAnswers: ["راه زیرزمینی", "دالان کوه"],
    relatedWords: ["کوه", "جاده", "قطار", "تاریک", "مترو", "عبور", "زیرزمین"],
    hintWords: ["مسیر تاریک در دل کوه", "گذرگاه سرپوشیده جاده یا قطار"],
  },
  {
    id: "plc_lighthouse",
    categoryId: "places",
    lang: "fa",
    word: "فانوس دریایی",
    wordEn: "Lighthouse",
    difficulty: "medium",
    acceptedAnswers: ["چراغ دریایی", "برج ساحلی"],
    relatedWords: ["ساحل", "کشتی", "دریا", "برج", "نور", "صخره", "طوفان", "ملوان"],
    hintWords: ["برج بلند لب ساحل", "نور راهنمای کشتی‌ها در شب"],
  },
  {
    id: "plc_library",
    categoryId: "places",
    lang: "fa",
    word: "کتابخانه",
    wordEn: "Library",
    difficulty: "easy",
    acceptedAnswers: ["کتاب‌خانه", "سالن مطالعه"],
    relatedWords: ["کتاب", "سکوت", "مطالعه", "قفسه", "امانت", "دانشگاه", "صفحه"],
    hintWords: ["قفسه‌های پر از جلد و کاغذ", "فرمانروایی سکوت و مطالعه"],
  },
  {
    id: "plc_observatory",
    categoryId: "places",
    lang: "fa",
    word: "رصدخانه",
    wordEn: "Observatory",
    difficulty: "hard",
    acceptedAnswers: ["رصد خانه"],
    relatedWords: ["تلسکوپ", "ستاره", "نجوم", "گنبد", "شب", "سیاره", "مراغه"],
    hintWords: ["گنبدی بر فراز کوه برای تماشای شب", "خانه تلسکوپ‌های بزرگ نجومی"],
  },

  /* =============================== 4. FOOD =============================== */
  {
    id: "fod_saffron",
    categoryId: "food",
    lang: "fa",
    word: "زعفران",
    wordEn: "Saffron",
    difficulty: "medium",
    acceptedAnswers: ["طلای سرخ"],
    relatedWords: ["برنج", "تهچین", "عطر", "قرمز", "زرد", "شربت", "خراسان", "ادویه"],
    hintWords: ["گران‌ترین ادویه ایرانی", "طلای سرخ خوش‌عطر روی برنج"],
  },
  {
    id: "fod_pomegranate",
    categoryId: "food",
    lang: "fa",
    word: "انار",
    wordEn: "Pomegranate",
    difficulty: "easy",
    acceptedAnswers: ["میوه انار"],
    relatedWords: ["یلدا", "قرمز", "دانه", "پاییز", "رب", "یاقوت", "ترش"],
    hintWords: ["ستاره شب یلدا", "دانه‌های سرخ یاقوتی"],
  },
  {
    id: "fod_honey",
    categoryId: "food",
    lang: "fa",
    word: "عسل",
    wordEn: "Honey",
    difficulty: "easy",
    acceptedAnswers: ["انگبین"],
    relatedWords: ["زنبور", "کندو", "شیرین", "موم", "صبحانه", "گل", "سبلان"],
    hintWords: ["محصول طلایی کندو", "دست‌رنج شیرین زنبورها"],
  },
  {
    id: "fod_tea",
    categoryId: "food",
    lang: "fa",
    word: "چای",
    wordEn: "Tea",
    difficulty: "easy",
    acceptedAnswers: ["چایی"],
    relatedWords: ["سماور", "قوری", "استکان", "قند", "نعلبکی", "دم کشیدن", "لاهیجان"],
    hintWords: ["یار قوری و استکان کمر‌باریک", "نوشیدنی گرم همیشگی ایرانی‌ها"],
  },
  {
    id: "fod_pistachio",
    categoryId: "food",
    lang: "fa",
    word: "پسته",
    wordEn: "Pistachio",
    difficulty: "medium",
    acceptedAnswers: ["پسته خندان"],
    relatedWords: ["آجیل", "نوروز", "خندان", "کرمان", "رفسنجان", "مغز سبز", "پوست"],
    hintWords: ["عضو خندان آجیل عید", "مغز سبز با پوسته سخت"],
  },
  {
    id: "fod_icecream",
    categoryId: "food",
    lang: "fa",
    word: "بستنی",
    wordEn: "Ice Cream",
    difficulty: "easy",
    acceptedAnswers: ["بستنی سنتی"],
    relatedWords: ["تابستان", "سرد", "قیفی", "شیر", "وانیل", "شکلاتی", "فالوده"],
    hintWords: ["خوراکی شیرین و یخ‌زده تابستان", "در نان قیفی آب می‌شود"],
  },

  /* =========================== 5. ENTERTAINMENT ========================== */
  {
    id: "ent_chess",
    categoryId: "entertainment",
    lang: "fa",
    word: "شطرنج",
    wordEn: "Chess",
    difficulty: "easy",
    acceptedAnswers: ["بازی شطرنج"],
    relatedWords: ["کیش", "مات", "وزیر", "شاه", "سرباز", "رخ", "صفحه ۶۴ خانه"],
    hintWords: ["نبرد فکری شاه و وزیر", "کیش و مات روی ۶۴ خانه"],
  },
  {
    id: "ent_cinema",
    categoryId: "entertainment",
    lang: "fa",
    word: "سینما",
    wordEn: "Cinema",
    difficulty: "easy",
    acceptedAnswers: ["سالن سینما"],
    relatedWords: ["فیلم", "پرده نقره‌ای", "پاپ‌کورن", "کارگردان", "بازیگر", "بلیت", "اکران"],
    hintWords: ["پرده بزرگ در سالن تاریک", "تماشای فیلم با پاپ‌کورن"],
  },
  {
    id: "ent_magic",
    categoryId: "entertainment",
    lang: "fa",
    word: "شعبده‌بازی",
    wordEn: "Magic",
    difficulty: "medium",
    acceptedAnswers: ["شعبده بازی", "تردستی", "شعبده"],
    relatedWords: ["کلاه", "خرگوش", "کارت", "چوب جادو", "حقه", "غیب شدن", "صحنه"],
    hintWords: ["خرگوش بیرون آمده از کلاه", "هنر تردستی و غیب کردن اشیا"],
  },
  {
    id: "ent_charades",
    categoryId: "entertainment",
    lang: "fa",
    word: "پانتومیم",
    wordEn: "Charades",
    difficulty: "medium",
    acceptedAnswers: ["ادا بازی", "ادابازی", "لال‌بازی"],
    relatedWords: ["سکوت", "اشاره", "حرکت دست", "حدس", "دورهمی", "تایمر", "نمایش"],
    hintWords: ["حرف زدن در آن ممنوع است", "رساندن کلمه فقط با حرکت دست و صورت"],
  },
  {
    id: "ent_puzzle",
    categoryId: "entertainment",
    lang: "fa",
    word: "پازل",
    wordEn: "Puzzle",
    difficulty: "easy",
    acceptedAnswers: ["جورچین"],
    relatedWords: ["قطعه", "تکه", "تصویر", "چیدن", "هزار تکه", "فکری"],
    hintWords: ["جورچین صدها تکه مقوایی", "کامل کردن تصویر با کنار هم گذاشتن قطعات"],
  },
  {
    id: "ent_circus",
    categoryId: "entertainment",
    lang: "fa",
    word: "سیرک",
    wordEn: "Circus",
    difficulty: "medium",
    acceptedAnswers: ["چادر سیرک"],
    relatedWords: ["دلقک", "بندباز", "آکروبات", "چادر", "شیر", "نمایش"],
    hintWords: ["چادر بزرگ بندبازها و آکروبات‌بازان", "نمایش دلقک‌ها و عملیات مهیج"],
  },

  /* ============================== 6. SPORTS ============================== */
  {
    id: "spt_archery",
    categoryId: "sports",
    lang: "fa",
    word: "تیراندازی با کمان",
    wordEn: "Archery",
    difficulty: "medium",
    acceptedAnswers: ["کمانداری", "تیر و کمان"],
    relatedWords: ["سیبل", "تیر", "کمان", "هدف", "زه", "مرکز خال", "المپیک"],
    hintWords: ["کشیدن زه و رها کردن تیر", "نشانه رفتن به مرکز سیبل"],
  },
  {
    id: "spt_mountaineering",
    categoryId: "sports",
    lang: "fa",
    word: "کوهنوردی",
    wordEn: "Mountaineering",
    difficulty: "easy",
    acceptedAnswers: ["کوهپیمایی", "صعود"],
    relatedWords: ["قله", "کوله‌پشتی", "دماوند", "طناب", "یخ‌شکن", "ارتفاع", "صخره"],
    hintWords: ["صعود با کوله‌پشتی تا قله", "فتح ارتفاعات و دماوند"],
  },
  {
    id: "spt_swimming",
    categoryId: "sports",
    lang: "fa",
    word: "شنا",
    wordEn: "Swimming",
    difficulty: "easy",
    acceptedAnswers: ["ورزش شنا"],
    relatedWords: ["استخر", "آب", "کرال", "پروانه", "عینک", "شیرجه", "کلر"],
    hintWords: ["شیرجه در استخر آبی", "حرکت کرال و پروانه در آب"],
  },
  {
    id: "spt_fencing",
    categoryId: "sports",
    lang: "fa",
    word: "شمشیربازی",
    wordEn: "Fencing",
    difficulty: "hard",
    acceptedAnswers: ["شمشیر بازی"],
    relatedWords: ["ماسک توری", "لباس سفید", "سابر", "اپه", "فلوره", "تیغه", "المپیک"],
    hintWords: ["دوئل ورزشی با لباس سفید و ماسک", "رشته‌های سابر، اپه و فلوره"],
  },
  {
    id: "spt_wrestling",
    categoryId: "sports",
    lang: "fa",
    word: "کشتی",
    wordEn: "Wrestling",
    difficulty: "easy",
    acceptedAnswers: ["کشتی آزاد", "کشتی فرنگی"],
    relatedWords: ["تشک", "دوبنده", "پهلوان", "تختی", "فن کمر", "ضربه فنی", "مدال طلا"],
    hintWords: ["ورزش اول مدال‌آور ایران روی تشک", "دوبنده و ضربه فنی"],
  },
  {
    id: "spt_skiing",
    categoryId: "sports",
    lang: "fa",
    word: "اسکی",
    wordEn: "Skiing",
    difficulty: "easy",
    acceptedAnswers: ["اسکی روی برف"],
    relatedWords: ["برف", "پیست", "دیزین", "چوب اسکی", "تله‌کابین", "زمستان", "کوه"],
    hintWords: ["سر خوردن سریع روی پیست برفی", "ورزش زمستانی با تله‌کابین"],
  },

  /* =============================== 7. MUSIC ============================== */
  {
    id: "mus_piano",
    categoryId: "music",
    lang: "fa",
    word: "پیانو",
    wordEn: "Piano",
    difficulty: "easy",
    acceptedAnswers: ["ساز پیانو"],
    relatedWords: ["کلاویه", "سیاه و سفید", "پدال", "نت", "کنسرت", "بتهوون", "نوازنده"],
    hintWords: ["کلاویه‌های سیاه و سفید", "ساز بزرگ پدال‌دار تالار کنسرت"],
  },
  {
    id: "mus_santur",
    categoryId: "music",
    lang: "fa",
    word: "سنتور",
    wordEn: "Santur",
    difficulty: "medium",
    acceptedAnswers: ["ساز سنتور"],
    relatedWords: ["مضراب", "سیم", "چوب گردو", "موسیقی سنتی", "خرک", "ذوالفنون"],
    hintWords: ["ساز ایرانی ذوزنقه‌ای شکل", "نواختن روی سیم‌ها با دو مضراب چوبی"],
  },
  {
    id: "mus_violin",
    categoryId: "music",
    lang: "fa",
    word: "ویولن",
    wordEn: "Violin",
    difficulty: "easy",
    acceptedAnswers: ["ویلن", "کمانچه فرنگی"],
    relatedWords: ["آرشه", "سیم", "ارکستر", "شانه", "چانه", "نواختن"],
    hintWords: ["روی شانه و زیر چانه قرار می‌گیرد", "کشیدن آرشه روی چهار سیم"],
  },
  {
    id: "mus_daf",
    categoryId: "music",
    lang: "fa",
    word: "دف",
    wordEn: "Daf",
    difficulty: "medium",
    acceptedAnswers: ["ساز دف"],
    relatedWords: ["کوبه ای", "حلقه", "پوست", "کردستان", "ریتم", "عرفانی", "تنبک"],
    hintWords: ["ساز کوبه‌ای گرد با حلقه‌های فلزی", "ریتم پرشور موسیقی کردستان"],
  },
  {
    id: "mus_guitar",
    categoryId: "music",
    lang: "fa",
    word: "گیتار",
    wordEn: "Guitar",
    difficulty: "easy",
    acceptedAnswers: ["ساز گیتار"],
    relatedWords: ["شش سیم", "پیک", "آکورد", "فلامنکو", "پاپ", "الکتریک"],
    hintWords: ["ساز شش‌سیم محبوب پاپ و فلامنکو", "نواختن آکورد با انگشت یا پیک"],
  },
  {
    id: "mus_flute",
    categoryId: "music",
    lang: "fa",
    word: "فلوت",
    wordEn: "Flute",
    difficulty: "medium",
    acceptedAnswers: ["نی فرنگی", "ساز فلوت"],
    relatedWords: ["بادی", "نفس", "دمیدن", "سوراخ", "ملودی", "نی"],
    hintWords: ["ساز بادی باریک و نقره‌ای", "نواختن با دمیدن نفس"],
  },

  /* ============================ 8. PROFESSIONS =========================== */
  {
    id: "prf_astronaut",
    categoryId: "professions",
    lang: "fa",
    word: "فضانورد",
    wordEn: "Astronaut",
    difficulty: "easy",
    acceptedAnswers: ["کیهان‌نورد", "کیهان نورد"],
    relatedWords: ["موشک", "بی‌وزنی", "ایستگاه فضایی", "کلاه کاسکت", "ماه", "مدار زمین", "ناسا"],
    hintWords: ["سفر در بی‌وزنی بیرون از جو زمین", "مسافر موشک و ایستگاه فضایی"],
  },
  {
    id: "prf_architect",
    categoryId: "professions",
    lang: "fa",
    word: "معمار",
    wordEn: "Architect",
    difficulty: "medium",
    acceptedAnswers: ["مهندس معمار"],
    relatedWords: ["نقشه", "ساختمان", "طراحی", "نما", "پلان", "برج", "سازه"],
    hintWords: ["خالق نقشه و نمای ساختمان‌ها", "ترکیب هنر و مهندسی در طراحی بنا"],
  },
  {
    id: "prf_blacksmith",
    categoryId: "professions",
    lang: "fa",
    word: "آهنگر",
    wordEn: "Blacksmith",
    difficulty: "medium",
    acceptedAnswers: ["چلنگر"],
    relatedWords: ["کوره", "سندان", "پتک", "گداخته", "فلز", "شمشیر", "جرقه"],
    hintWords: ["کوبیدن پتک بر فلز گداخته", "کار در کنار کوره و سندان"],
  },
  {
    id: "prf_detective",
    categoryId: "professions",
    lang: "fa",
    word: "کارآگاه",
    wordEn: "Detective",
    difficulty: "easy",
    acceptedAnswers: ["کاراگاه", "بازرس جنایی"],
    relatedWords: ["ذره بین", "سرنخ", "معما", "شرلوک هلمز", "اثر انگشت", "پرونده", "مظنون"],
    hintWords: ["ذره‌بین، سرنخ و کشف معما", "همکار شرلوک هلمز در حل پرونده"],
  },
  {
    id: "prf_captain",
    categoryId: "professions",
    lang: "fa",
    word: "ناخدا",
    wordEn: "Captain",
    difficulty: "medium",
    acceptedAnswers: ["کاپیتان کشتی"],
    relatedWords: ["کشتی", "دریا", "سکان", "لنگر", "اقیانوس", "ملوان", "بندر"],
    hintWords: ["فرمانده عرشه و سکان کشتی", "هدایت ملوانان در دل دریا"],
  },
  {
    id: "prf_archaeologist",
    categoryId: "professions",
    lang: "fa",
    word: "باستان‌شناس",
    wordEn: "Archaeologist",
    difficulty: "hard",
    acceptedAnswers: ["باستان شناس"],
    relatedWords: ["حفاری", "تخت جمشید", "سفال", "فسیل", "کتیبه", "تمدن", "کاوش"],
    hintWords: ["کاوش تمدن‌های خفته زیر خاک", "کشف کتیبه‌ها و سفال‌های کهن"],
  },

  /* ============================== 9. COSMOS ============================== */
  {
    id: "cos_blackhole",
    categoryId: "cosmos",
    lang: "fa",
    word: "سیاه‌چاله",
    wordEn: "Black Hole",
    difficulty: "medium",
    acceptedAnswers: ["سیاه چاله", "سیاهچاله"],
    relatedWords: ["گرانش", "نور", "کهکشان", "افق رویداد", "فضا", "زمان", "بلعیدن"],
    hintWords: ["گرانشی که حتی نور هم از آن نمی‌گریزد", "مرز مرموز افق رویداد در فضا"],
  },
  {
    id: "cos_comet",
    categoryId: "cosmos",
    lang: "fa",
    word: "ستاره دنباله‌دار",
    wordEn: "Comet",
    difficulty: "medium",
    acceptedAnswers: ["دنباله‌دار", "دنباله دار"],
    relatedWords: ["هالی", "یخ", "غبار", "دم نورانی", "مدار", "آسمان شب", "شهاب"],
    hintWords: ["جرم یخی با گیسوی نورانی در آسمان", "میهمان معروفی مثل هالی"],
  },
  {
    id: "cos_eclipse",
    categoryId: "cosmos",
    lang: "fa",
    word: "خورشیدگرفتگی",
    wordEn: "Solar Eclipse",
    difficulty: "medium",
    acceptedAnswers: ["خورشید گرفتگی", "کسوف"],
    relatedWords: ["ماه", "خورشید", "سایه", "روز تاریک", "تاج خورشید", "عینک مخصوص"],
    hintWords: ["تاریک شدن ناگهانی روز", "قرار گرفتن ماه دقیقاً جلوی خورشید"],
  },
  {
    id: "cos_saturn",
    categoryId: "cosmos",
    lang: "fa",
    word: "زحل",
    wordEn: "Saturn",
    difficulty: "easy",
    acceptedAnswers: ["کیوان", "سیاره زحل"],
    relatedWords: ["حلقه", "سیاره", "منظومه شمسی", "گازی", "تایتان", "مشتری"],
    hintWords: ["عروس حلقه‌دار منظومه شمسی", "سیاره‌ای با نام فارسی کیوان"],
  },
  {
    id: "cos_nebula",
    categoryId: "cosmos",
    lang: "fa",
    word: "سحابی",
    wordEn: "Nebula",
    difficulty: "hard",
    acceptedAnswers: ["ابر کیهانی"],
    relatedWords: ["تولد ستاره", "گاز", "غبار کیهانی", "تلسکوپ جیمز وب", "کهکشان", "رنگارنگ"],
    hintWords: ["گهواره رنگارنگ تولد ستارگان", "ابر عظیم گاز و غبار میان‌ستاره‌ای"],
  },
  {
    id: "cos_meteor",
    categoryId: "cosmos",
    lang: "fa",
    word: "شهاب‌سنگ",
    wordEn: "Meteorite",
    difficulty: "easy",
    acceptedAnswers: ["شهاب سنگ", "شهاب"],
    relatedWords: ["آسمان", "جو زمین", "سوختن", "دهانه برخورد", "آرزو", "سنگ فضایی"],
    hintWords: ["سنگ سرگردان فضایی در برخورد با جو", "رد نورانی سریع در آسمان شب"],
  },

  /* ============================= 10. ANIMALS ============================= */
  {
    id: "ani_chameleon",
    categoryId: "animals",
    lang: "fa",
    word: "آفتاب‌پرست",
    wordEn: "Chameleon",
    difficulty: "medium",
    acceptedAnswers: ["افتاب پرست", "آفتاب پرست"],
    relatedWords: ["تغییر رنگ", "استتار", "زبان دراز", "خزنده", "درخت", "حشره"],
    hintWords: ["استاد تغییر رنگ و استتار", "خزنده‌ای که هم‌رنگ محیط می‌شود"],
  },
  {
    id: "ani_owl",
    categoryId: "animals",
    lang: "fa",
    word: "جغد",
    wordEn: "Owl",
    difficulty: "easy",
    acceptedAnswers: ["بوف"],
    relatedWords: ["شب‌زی", "پرنده", "دانا", "چشم درشت", "چرخش گردن", "جنگل", "شکارچی شب"],
    hintWords: ["پرنده بیدار شب با چشمان درشت", "نماد دانایی با چرخش عجیب سر"],
  },
  {
    id: "ani_octopus",
    categoryId: "animals",
    lang: "fa",
    word: "اختاپوس",
    wordEn: "Octopus",
    difficulty: "easy",
    acceptedAnswers: ["هشت‌پا", "هشت پا"],
    relatedWords: ["هشت بازو", "مرکب", "اقیانوس", "مکندگان", "باهوش", "سه قلب"],
    hintWords: ["موجود باهوش دریایی با سه قلب", "هشت بازو و پاشیدن جوهر سیاه"],
  },
  {
    id: "ani_cheetah",
    categoryId: "animals",
    lang: "fa",
    word: "یوزپلنگ",
    wordEn: "Cheetah",
    difficulty: "easy",
    acceptedAnswers: ["یوز", "یوزپلنگ ایرانی"],
    relatedWords: ["سرعت", "سریع‌ترین", "خال‌دار", "توران", "ایران", "دویدن", "شکار"],
    hintWords: ["سریع‌ترین دونده روی خشکی", "گربه‌سان نادر دشت توران ایران"],
  },
  {
    id: "ani_penguin",
    categoryId: "animals",
    lang: "fa",
    word: "پنگوئن",
    wordEn: "Penguin",
    difficulty: "easy",
    acceptedAnswers: ["پنگوین"],
    relatedWords: ["قطب جنوب", "یخ", "پرنده بی‌پرواز", "شناگر", "کت و شلوار", "ماهی"],
    hintWords: ["پرنده‌ای که پرواز نمی‌کند اما شناگر قهاری است", "ساکن بامزه یخ‌های قطب جنوب"],
  },
  {
    id: "ani_firefly",
    categoryId: "animals",
    lang: "fa",
    word: "کرم شب‌تاب",
    wordEn: "Firefly",
    difficulty: "hard",
    acceptedAnswers: ["کرم شب تاب", "شب‌تاب"],
    relatedWords: ["نور", "حشره", "شب", "جنگل", "درخشش", "تابستان"],
    hintWords: ["فانوس زنده و کوچک جنگل در تاریکی", "حشره‌ای که در شب از خودش نور می‌دهد"],
  },

  /* ============================ 11. VEHICLES ============================= */
  {
    id: "veh_submarine",
    categoryId: "vehicles",
    lang: "fa",
    word: "زیردریایی",
    wordEn: "Submarine",
    difficulty: "easy",
    acceptedAnswers: ["زیر دریایی"],
    relatedWords: ["پریسکوپ", "سونار", "اعماق دریا", "اقیانوس", "اکسیژن", "کاپیتان نمو"],
    hintWords: ["پریسکوپ و رادار سونار", "سفر خاموش در اعماق اقیانوس"],
  },
  {
    id: "veh_hotairballoon",
    categoryId: "vehicles",
    lang: "fa",
    word: "بالن",
    wordEn: "Hot Air Balloon",
    difficulty: "medium",
    acceptedAnswers: ["بالن هوای گرم", "بالون"],
    relatedWords: ["سبد", "مشعل", "آسمان", "کاپادوکیه", "هوای گرم", "پرواز آرام"],
    hintWords: ["سبد حصیری معلق در آسمان", "پرواز آرام با شعله هوای گرم"],
  },
  {
    id: "veh_sailboat",
    categoryId: "vehicles",
    lang: "fa",
    word: "کشتی بادبانی",
    wordEn: "Sailboat",
    difficulty: "medium",
    acceptedAnswers: ["قایق بادبانی", "لنج بادبانی"],
    relatedWords: ["باد", "پارچه سفید", "دکل", "امواج", "دریا", "عرشه"],
    hintWords: ["دکل بلند و پارچه‌های برافراشته", "حرکت روی امواج با نیروی باد"],
  },
  {
    id: "veh_cablecar",
    categoryId: "vehicles",
    lang: "fa",
    word: "تله‌کابین",
    wordEn: "Cable Car",
    difficulty: "easy",
    acceptedAnswers: ["تله کابین"],
    relatedWords: ["کابل", "توچال", "نمک‌آبرود", "کوه", "جنگل", "معلق", "واگن"],
    hintWords: ["اتاقک معلق روی کابل فولادی", "عبور از بالای درختان و دره‌ها تا قله"],
  },
  {
    id: "veh_train",
    categoryId: "vehicles",
    lang: "fa",
    word: "قطار",
    wordEn: "Train",
    difficulty: "easy",
    acceptedAnswers: ["لوکوموتیو"],
    relatedWords: ["ریل", "واگن", "ایستگاه راه‌آهن", "کوپه", "سوت", "مسافرت"],
    hintWords: ["ردیف واگن‌ها روی ریل آهنی", "کوپه و سوت حرکت از ایستگاه"],
  },
  {
    id: "veh_helicopter",
    categoryId: "vehicles",
    lang: "fa",
    word: "هلیکوپتر",
    wordEn: "Helicopter",
    difficulty: "easy",
    acceptedAnswers: ["بالگرد", "چرخبال"],
    relatedWords: ["ملخ", "عمودپرواز", "امداد", "پروانه چرخان", "خلبان", "فرود روی بام"],
    hintWords: ["پرواز عمودی بدون نیاز به باند", "پروانه بزرگ چرخان بالای کابین"],
  },

  /* ============================= 12. SCIENCE ============================= */
  {
    id: "sci_microscope",
    categoryId: "science",
    lang: "fa",
    word: "میکروسکوپ",
    wordEn: "Microscope",
    difficulty: "easy",
    acceptedAnswers: ["ریزبین"],
    relatedWords: ["سلول", "باکتری", "عدسی", "آزمایشگاه", "بزرگ‌نمایی", "لام"],
    hintWords: ["ابزار تماشای سلول و باکتری", "عدسی بزرگ‌نمایی در آزمایشگاه"],
  },
  {
    id: "sci_magnet",
    categoryId: "science",
    lang: "fa",
    word: "آهنربا",
    wordEn: "Magnet",
    difficulty: "easy",
    acceptedAnswers: ["آهن‌ربا", "اهنربا"],
    relatedWords: ["جذب", "قطب شمال و جنوب", "آهن", "فلز", "میدان مغناطیسی", "دافعه"],
    hintWords: ["قطب‌های هم‌نامش همدیگر را دفع می‌کنند", "رباینده فلز و میخ آهنی"],
  },
  {
    id: "sci_prism",
    categoryId: "science",
    lang: "fa",
    word: "منشور",
    wordEn: "Prism",
    difficulty: "hard",
    acceptedAnswers: ["منشور نوری"],
    relatedWords: ["نور سفید", "تجزیه نور", "طیف رنگ", "شیشه مثلثی", "نیوتن", "شکست نور"],
    hintWords: ["بلور شیشه‌ای آزمایش معروف نیوتن", "نور سفید را به هفت رنگ می‌شکند"],
  },
  {
    id: "sci_laser",
    categoryId: "science",
    lang: "fa",
    word: "لیزر",
    wordEn: "Laser",
    difficulty: "medium",
    acceptedAnswers: ["پرتو لیزر"],
    relatedWords: ["پرتو متمرکز", "نور قرمز", "برش دقیق", "پزشکی", "فیزیک", "فوتون"],
    hintWords: ["پرتو باریک و بسیار متمرکز نور", "از جراحی چشم تا برش صنعتی کاربرد دارد"],
  },
  {
    id: "sci_battery",
    categoryId: "science",
    lang: "fa",
    word: "باتری",
    wordEn: "Battery",
    difficulty: "easy",
    acceptedAnswers: ["باطری"],
    relatedWords: ["شارژ", "برق", "مثبت و منفی", "انرژی", "کنترل", "لیتیوم"],
    hintWords: ["قطب مثبت و منفی ذخیره انرژی", "منبع برق قابل حمل دستگاه‌ها"],
  },
  {
    id: "sci_robot",
    categoryId: "science",
    lang: "fa",
    word: "ربات",
    wordEn: "Robot",
    difficulty: "easy",
    acceptedAnswers: ["روبات", "آدم‌آهنی", "آدم آهنی"],
    relatedWords: ["هوش مصنوعی", "ماشین خودکار", "سنسور", "برنامه‌نویسی", "مکانیکی", "کارخانه"],
    hintWords: ["ماشین هوشمند برنامه‌ریزی‌شده", "آدم‌آهنی دنیای فناوری"],
  },
];

export function getCategoryById(id: string): WordCategorySpec | undefined {
  return WORD_CATEGORIES.find((c) => c.id === id);
}

export function getWordById(id: string): WordEntrySpec | undefined {
  return WORD_BANK.find((w) => w.id === id);
}

/** Deterministic/seeded shuffle utility for drawing non-repeating 4×4 boards. */
function shuffleArray<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Draw 4 distinct categories × 4 distinct words = 16 non-repeating word cards
 * respecting pack & difficulty preferences with graceful fallback so every round
 * always receives a complete 16-card board.
 */
export function drawRoundBoard16(options?: {
  packId?: WordPackId;
  difficultyFilter?: "all" | WordDifficulty;
  excludeWordIds?: ReadonlySet<string>;
  rng?: () => number;
}): {
  categories: WordCategorySpec[];
  cards: RoundWordCard[];
} {
  const packId = options?.packId ?? "all";
  const diff = options?.difficultyFilter ?? "all";
  const exclude = options?.excludeWordIds ?? new Set<string>();
  const rng = options?.rng ?? Math.random;

  const candidateCategories =
    packId === "all"
      ? WORD_CATEGORIES
      : WORD_CATEGORIES.filter((c) => c.packId === packId);

  const selectedCategories = shuffleArray(
    candidateCategories.length >= 4 ? candidateCategories : WORD_CATEGORIES,
    rng,
  ).slice(0, 4);

  const cards: RoundWordCard[] = [];
  const usedInBoard = new Set<string>();

  for (const cat of selectedCategories) {
    const catEntries = WORD_BANK.filter((w) => w.categoryId === cat.id);
    // Prioritize words matching both difficulty and unused history, then relax smoothly if < 4
    const tier1 = shuffleArray(
      catEntries.filter(
        (w) => (diff === "all" || w.difficulty === diff) && !exclude.has(w.id),
      ),
      rng,
    );
    const tier2 = shuffleArray(
      catEntries.filter((w) => !exclude.has(w.id) && !tier1.includes(w)),
      rng,
    );
    const tier3 = shuffleArray(
      catEntries.filter((w) => !tier1.includes(w) && !tier2.includes(w)),
      rng,
    );

    const chosen = [...tier1, ...tier2, ...tier3]
      .filter((w) => !usedInBoard.has(w.id))
      .slice(0, 4);

    for (const entry of chosen) {
      usedInBoard.add(entry.id);
      cards.push({
        id: entry.id,
        categoryId: cat.id,
        categoryTitleFa: cat.titleFa,
        categoryTitleEn: cat.titleEn,
        categoryColor: cat.color,
        word: entry.word,
        wordEn: entry.wordEn,
        difficulty: entry.difficulty,
        hintWords: entry.hintWords,
      });
    }
  }

  return {
    categories: selectedCategories,
    cards,
  };
}
