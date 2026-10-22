-- DOZ ONLINE / RAZ-VAJEH (رازواژه — WORD CIPHER) — 0017: Server-Authoritative Multiplayer Word Game
-- Implements:
--   1. Configurable database-backed word bank (`wg_categories`, `wg_words`) with difficulty,
--      accepted synonyms, semantic associations, and 2 progressive auxiliary hint words per entry.
--   2. Server-authoritative rooms, seats, presence, round state machine, role rotation,
--      idempotent duplicate-submission protection (`wg_request_log`), and Sheriff Coin rewards.
--   3. Zero-leak information security: the secret `target_word` and unrevealed `board_cards`
--      NEVER appear in the guesser's RPC payload or shared Realtime broadcast until `round_result`.
--   4. Full Persian Unicode normalization (`ی/ي/ى/ئ`, `ک/ك`, `ه/ة/ۀ`, `آ/ا/أ/إ`, ZWNJ/half-space)
--      plus 3-outcome evaluation (`correct`, `related`, `incorrect`).

-- ---------------------------------------------------------------------------
-- 1. Word Bank Schema & Seed Data
-- ---------------------------------------------------------------------------
create table if not exists public.wg_categories (
  id text primary key,
  pack_id text not null check (pack_id in ('classic', 'culture', 'adventure')),
  lang text not null default 'fa' check (lang in ('fa', 'en')),
  title_fa text not null,
  title_en text not null,
  color text not null default '#e5a93c',
  icon text not null default '✨',
  active boolean not null default true
);

create table if not exists public.wg_words (
  id text primary key,
  category_id text not null references public.wg_categories (id) on delete cascade,
  lang text not null default 'fa' check (lang in ('fa', 'en')),
  word text not null,
  word_en text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  accepted_answers text[] not null default '{}',
  related_words text[] not null default '{}',
  hint_words text[] not null default '{}',
  active boolean not null default true
);

create index if not exists idx_wg_words_cat_active on public.wg_words (category_id, difficulty) where active;

insert into public.wg_categories (id, pack_id, lang, title_fa, title_en, color, icon) values
  ('nature',        'classic',   'fa', 'طبیعت و پدیده‌ها',    'Nature',           '#39c98a', '🌿'),
  ('objects',       'classic',   'fa', 'اشیا و ابزارها',      'Objects',          '#e5a93c', '🧭'),
  ('places',        'classic',   'fa', 'مکان‌ها و بناها',     'Places',           '#4dd0c4', '🏛️'),
  ('food',          'classic',   'fa', 'خوراکی و نوشیدنی',    'Food & Drink',     '#ff8c5a', '🍵'),
  ('entertainment', 'culture',   'fa', 'سرگرمی و هنر',        'Entertainment',    '#a78bfa', '🎭'),
  ('sports',        'culture',   'fa', 'ورزش و رقابت',        'Sports',           '#38bdf8', '🏆'),
  ('music',         'culture',   'fa', 'موسیقی و سازها',      'Music',            '#f472b6', '🎻'),
  ('professions',   'culture',   'fa', 'مشاغل و مهارت‌ها',    'Professions',      '#facc15', '⚒️'),
  ('cosmos',        'adventure', 'fa', 'آسمان و فضا',         'Space & Sky',      '#818cf8', '🪐'),
  ('animals',       'adventure', 'fa', 'حیات‌وحش و جانوران',  'Wildlife',         '#34d399', '🦅'),
  ('vehicles',      'adventure', 'fa', 'حمل‌ونقل و سفر',      'Travel & Vehicles','#60a5fa', '⛵'),
  ('science',       'adventure', 'fa', 'دانش و فناوری',       'Science & Tech',   '#fb923c', '🔬')
on conflict (id) do update set
  pack_id = excluded.pack_id,
  title_fa = excluded.title_fa,
  title_en = excluded.title_en,
  color = excluded.color,
  icon = excluded.icon;

insert into public.wg_words (id, category_id, word, word_en, difficulty, accepted_answers, related_words, hint_words) values
  -- 1. Nature
  ('nat_volcano',    'nature', 'آتشفشان',    'Volcano',     'easy',   array['کوه آتشفشان','اتشفشان'], array['گدازه','ماگما','کوه','خاکستر','فوران','آتش','دهانه','دود'], array['کوه خشمگین','فوران گدازه']),
  ('nat_fog',        'nature', 'مه',          'Fog',         'medium', array['مه غلیظ','مه صبحگاهی'], array['ابر','بخار','جاده','جنگل','رطوبت','دید کم','شبنم','شمال'], array['کاهش دید در جاده','ابر نزدیک زمین']),
  ('nat_coral',      'nature', 'مرجان',       'Coral',       'hard',   array['مرجان دریایی','صخره مرجانی'], array['دریا','اقیانوس','غواصی','ماهی','صخره','خلیج فارس','زیر آب','صدف'], array['باغ رنگارنگ زیر دریا','صخره زنده اقیانوس']),
  ('nat_earthquake', 'nature', 'زلزله',       'Earthquake',  'easy',   array['زمین‌لرزه','زمین لرزه'], array['گسل','ریشتر','لرزش','زمین','آوار','پناه','پس‌لرزه'], array['حرکت گسل‌ها','مقیاس ریشتر']),
  ('nat_waterfall',  'nature', 'آبشار',       'Waterfall',   'easy',   array['ابشار'], array['رودخانه','صخره','سقوط آب','کوهستان','جنگل','دره','خروشان'], array['ریزش آب از بلندی','صخره و رود خروشان']),
  ('nat_rainbow',    'nature', 'رنگین‌کمان',  'Rainbow',     'easy',   array['رنگین کمان','قوس قزح'], array['باران','خورشید','هفت رنگ','آسمان','نور','منشور'], array['بعد از باران در آسمان','کمان هفت‌رنگ نور']),
  -- 2. Objects
  ('obj_mirror',     'objects', 'آینه',       'Mirror',      'easy',   array['آیینه','ایینه','اینه'], array['بازتاب','تصویر','شیشه','چهره','نگاه','شمعدان','نور'], array['بازتاب تصویر','شیشه نقره‌اندود']),
  ('obj_hammer',     'objects', 'چکش',        'Hammer',      'easy',   array['پتک'], array['میخ','نجاری','ابزار','ضربه','آهنگر','چوب','کارگاه'], array['یار همیشگی میخ','ابزار کوبیدن در نجاری']),
  ('obj_compass',    'objects', 'قطب‌نما',    'Compass',     'medium', array['قطب نما','قبله‌نما'], array['شمال','جهت','مغناطیس','عقربه','نقشه','کوهنوردی','کشتی'], array['عقربه مغناطیسی','نشان‌دهنده جهت شمال']),
  ('obj_umbrella',   'objects', 'چتر',        'Umbrella',    'easy',   array['چتر بارانی'], array['باران','خیس','پاییز','خیابان','ابری','سایبان'], array['همراه روزهای بارانی','سایبان دستی بالای سر']),
  ('obj_hourglass',  'objects', 'ساعت شنی',   'Hourglass',   'hard',   array['شیشه شنی'], array['زمان','شن','ماسه','شیشه','قدیمی','ثانیه','ساعت'], array['زمان‌سنج قدیمی بدون عقربه','ریزش دانه‌های شن در شیشه']),
  ('obj_lantern',    'objects', 'فانوس',      'Lantern',     'medium', array['چراغ بادی','چراغ نفتی'], array['شعله','نفت','تاریکی','شب','نور','شمع','فتیله'], array['چراغ قدیمی شب‌های تاریک','شعله پشت حباب شیشه‌ای']),
  -- 3. Places
  ('plc_airport',     'places', 'فرودگاه',     'Airport',     'easy',   array['میدان هوایی'], array['هواپیما','پرواز','چمدان','پاسپورت','باند','خلبان','ترمینال'], array['چمدان و کارت پرواز','باند برخاستن هواپیما']),
  ('plc_museum',      'places', 'موزه',        'Museum',      'easy',   array['موزه‌خانه'], array['تاریخ','عتیقه','مجسمه','آثار باستانی','گالری','تابلو','بازدید'], array['نگهداری آثار باستانی','تماشای اشیای تاریخی پشت شیشه']),
  ('plc_tunnel',      'places', 'تونل',        'Tunnel',      'medium', array['راه زیرزمینی','دالان کوه'], array['کوه','جاده','قطار','تاریک','مترو','عبور','زیرزمین'], array['مسیر تاریک در دل کوه','گذرگاه سرپوشیده جاده یا قطار']),
  ('plc_lighthouse',  'places', 'فانوس دریایی','Lighthouse',  'medium', array['چراغ دریایی','برج ساحلی'], array['ساحل','کشتی','دریا','برج','نور','صخره','طوفان','ملوان'], array['برج بلند لب ساحل','نور راهنمای کشتی‌ها در شب']),
  ('plc_library',     'places', 'کتابخانه',    'Library',     'easy',   array['کتاب‌خانه','سالن مطالعه'], array['کتاب','سکوت','مطالعه','قفسه','امانت','دانشگاه','صفحه'], array['قفسه‌های پر از جلد و کاغذ','فرمانروایی سکوت و مطالعه']),
  ('plc_observatory', 'places', 'رصدخانه',     'Observatory', 'hard',   array['رصد خانه'], array['تلسکوپ','ستاره','نجوم','گنبد','شب','سیاره','مراغه'], array['گنبدی بر فراز کوه برای تماشای شب','خانه تلسکوپ‌های بزرگ نجومی']),
  -- 4. Food
  ('fod_saffron',     'food', 'زعفران',  'Saffron',     'medium', array['طلای سرخ'], array['برنج','تهچین','عطر','قرمز','زرد','شربت','خراسان','ادویه'], array['گران‌ترین ادویه ایرانی','طلای سرخ خوش‌عطر روی برنج']),
  ('fod_pomegranate', 'food', 'انار',    'Pomegranate', 'easy',   array['میوه انار'], array['یلدا','قرمز','دانه','پاییز','رب','یاقوت','ترش'], array['ستاره شب یلدا','دانه‌های سرخ یاقوتی']),
  ('fod_honey',       'food', 'عسل',     'Honey',       'easy',   array['انگبین'], array['زنبور','کندو','شیرین','موم','صبحانه','گل','سبلان'], array['محصول طلایی کندو','دست‌رنج شیرین زنبورها']),
  ('fod_tea',         'food', 'چای',     'Tea',         'easy',   array['چایی'], array['سماور','قوری','استکان','قند','نعلبکی','دم کشیدن','لاهیجان'], array['یار قوری و استکان کمر‌باریک','نوشیدنی گرم همیشگی ایرانی‌ها']),
  ('fod_pistachio',   'food', 'پسته',    'Pistachio',   'medium', array['پسته خندان'], array['آجیل','نوروز','خندان','کرمان','رفسنجان','مغز سبز','پوست'], array['عضو خندان آجیل عید','مغز سبز با پوسته سخت']),
  ('fod_icecream',    'food', 'بستنی',   'Ice Cream',   'easy',   array['بستنی سنتی'], array['تابستان','سرد','قیفی','شیر','وانیل','شکلاتی','فالوده'], array['خوراکی شیرین و یخ‌زده تابستان','در نان قیفی آب می‌شود']),
  -- 5. Entertainment
  ('ent_chess',       'entertainment', 'شطرنج',      'Chess',    'easy',   array['بازی شطرنج'], array['کیش','مات','وزیر','شاه','سرباز','رخ','صفحه ۶۴ خانه'], array['نبرد فکری شاه و وزیر','کیش و مات روی ۶۴ خانه']),
  ('ent_cinema',      'entertainment', 'سینما',      'Cinema',   'easy',   array['سالن سینما'], array['فیلم','پرده نقره‌ای','پاپ‌کورن','کارگردان','بازیگر','بلیت','اکران'], array['پرده بزرگ در سالن تاریک','تماشای فیلم با پاپ‌کورن']),
  ('ent_magic',       'entertainment', 'شعبده‌بازی', 'Magic',    'medium', array['شعبده بازی','تردستی','شعبده'], array['کلاه','خرگوش','کارت','چوب جادو','حقه','غیب شدن','صحنه'], array['خرگوش بیرون آمده از کلاه','هنر تردستی و غیب کردن اشیا']),
  ('ent_charades',    'entertainment', 'پانتومیم',   'Charades', 'medium', array['ادا بازی','ادابازی','لال‌بازی'], array['سکوت','اشاره','حرکت دست','حدس','دورهمی','تایمر','نمایش'], array['حرف زدن در آن ممنوع است','رساندن کلمه فقط با حرکت دست و صورت']),
  ('ent_puzzle',      'entertainment', 'پازل',       'Puzzle',   'easy',   array['جورچین'], array['قطعه','تکه','تصویر','چیدن','هزار تکه','فکری'], array['جورچین صدها تکه مقوایی','کامل کردن تصویر با کنار هم گذاشتن قطعات']),
  ('ent_circus',      'entertainment', 'سیرک',       'Circus',   'medium', array['چادر سیرک'], array['دلقک','بندباز','آکروبات','چادر','شیر','نمایش'], array['چادر بزرگ بندبازها و آکروبات‌بازان','نمایش دلقک‌ها و عملیات مهیج']),
  -- 6. Sports
  ('spt_archery',        'sports', 'تیراندازی با کمان', 'Archery',        'medium', array['کمانداری','تیر و کمان'], array['سیبل','تیر','کمان','هدف','زه','مرکز خال','المپیک'], array['کشیدن زه و رها کردن تیر','نشانه رفتن به مرکز سیبل']),
  ('spt_mountaineering', 'sports', 'کوهنوردی',          'Mountaineering', 'easy',   array['کوهپیمایی','صعود'], array['قله','کوله‌پشتی','دماوند','طناب','یخ‌شکن','ارتفاع','صخره'], array['صعود با کوله‌پشتی تا قله','فتح ارتفاعات و دماوند']),
  ('spt_swimming',       'sports', 'شنا',               'Swimming',       'easy',   array['ورزش شنا'], array['استخر','آب','کرال','پروانه','عینک','شیرجه','کلر'], array['شیرجه در استخر آبی','حرکت کرال و پروانه در آب']),
  ('spt_fencing',        'sports', 'شمشیربازی',         'Fencing',        'hard',   array['شمشیر بازی'], array['ماسک توری','لباس سفید','سابر','اپه','فلوره','تیغه','المپیک'], array['دوئل ورزشی با لباس سفید و ماسک','رشته‌های سابر، اپه و فلوره']),
  ('spt_wrestling',      'sports', 'کشتی',              'Wrestling',      'easy',   array['کشتی آزاد','کشتی فرنگی'], array['تشک','دوبنده','پهلوان','تختی','فن کمر','ضربه فنی','مدال طلا'], array['ورزش اول مدال‌آور ایران روی تشک','دوبنده و ضربه فنی']),
  ('spt_skiing',         'sports', 'اسکی',              'Skiing',         'easy',   array['اسکی روی برف'], array['برف','پیست','دیزین','چوب اسکی','تله‌کابین','زمستان','کوه'], array['سر خوردن سریع روی پیست برفی','ورزش زمستانی با تله‌کابین']),
  -- 7. Music
  ('mus_piano',   'music', 'پیانو',  'Piano',  'easy',   array['ساز پیانو'], array['کلاویه','سیاه و سفید','پدال','نت','کنسرت','بتهوون','نوازنده'], array['کلاویه‌های سیاه و سفید','ساز بزرگ پدال‌دار تالار کنسرت']),
  ('mus_santur',  'music', 'سنتور',  'Santur', 'medium', array['ساز سنتور'], array['مضراب','سیم','چوب گردو','موسیقی سنتی','خرک','ذوالفنون'], array['ساز ایرانی ذوزنقه‌ای شکل','نواختن روی سیم‌ها با دو مضراب چوبی']),
  ('mus_violin',  'music', 'ویولن',  'Violin', 'easy',   array['ویلن','کمانچه فرنگی'], array['آرشه','سیم','ارکستر','شانه','چانه','نواختن'], array['روی شانه و زیر چانه قرار می‌گیرد','کشیدن آرشه روی چهار سیم']),
  ('mus_daf',     'music', 'دف',     'Daf',    'medium', array['ساز دف'], array['کوبه ای','حلقه','پوست','کردستان','ریتم','عرفانی','تنبک'], array['ساز کوبه‌ای گرد با حلقه‌های فلزی','ریتم پرشور موسیقی کردستان']),
  ('mus_guitar',  'music', 'گیتار',  'Guitar', 'easy',   array['ساز گیتار'], array['شش سیم','پیک','آکورد','فلامنکو','پاپ','الکتریک'], array['ساز شش‌سیم محبوب پاپ و فلامنکو','نواختن آکورد با انگشت یا پیک']),
  ('mus_flute',   'music', 'فلوت',   'Flute',  'medium', array['نی فرنگی','ساز فلوت'], array['بادی','نفس','دمیدن','سوراخ','ملودی','نی'], array['ساز بادی باریک و نقره‌ای','نواختن با دمیدن نفس']),
  -- 8. Professions
  ('prf_astronaut',     'professions', 'فضانورد',     'Astronaut',     'easy',   array['کیهان‌نورد','کیهان نورد'], array['موشک','بی‌وزنی','ایستگاه فضایی','کلاه کاسکت','ماه','مدار زمین','ناسا'], array['سفر در بی‌وزنی بیرون از جو زمین','مسافر موشک و ایستگاه فضایی']),
  ('prf_architect',     'professions', 'معمار',       'Architect',     'medium', array['مهندس معمار'], array['نقشه','ساختمان','طراحی','نما','پلان','برج','سازه'], array['خالق نقشه و نمای ساختمان‌ها','ترکیب هنر و مهندسی در طراحی بنا']),
  ('prf_blacksmith',    'professions', 'آهنگر',       'Blacksmith',    'medium', array['چلنگر'], array['کوره','سندان','پتک','گداخته','فلز','شمشیر','جرقه'], array['کوبیدن پتک بر فلز گداخته','کار در کنار کوره و سندان']),
  ('prf_detective',     'professions', 'کارآگاه',     'Detective',     'easy',   array['کاراگاه','بازرس جنایی'], array['ذره بین','سرنخ','معما','شرلوک هلمز','اثر انگشت','پرونده','مظنون'], array['ذره‌بین، سرنخ و کشف معما','همکار شرلوک هلمز در حل پرونده']),
  ('prf_captain',       'professions', 'ناخدا',       'Captain',       'medium', array['کاپیتان کشتی'], array['کشتی','دریا','سکان','لنگر','اقیانوس','ملوان','بندر'], array['فرمانده عرشه و سکان کشتی','هدایت ملوانان در دل دریا']),
  ('prf_archaeologist', 'professions', 'باستان‌شناس', 'Archaeologist', 'hard',   array['باستان شناس'], array['حفاری','تخت جمشید','سفال','فسیل','کتیبه','تمدن','کاوش'], array['کاوش تمدن‌های خفته زیر خاک','کشف کتیبه‌ها و سفال‌های کهن']),
  -- 9. Cosmos
  ('cos_blackhole', 'cosmos', 'سیاه‌چاله',       'Black Hole',    'medium', array['سیاه چاله','سیاهچاله'], array['گرانش','نور','کهکشان','افق رویداد','فضا','زمان','بلعیدن'], array['گرانشی که حتی نور هم از آن نمی‌گریزد','مرز مرموز افق رویداد در فضا']),
  ('cos_comet',     'cosmos', 'ستاره دنباله‌دار','Comet',         'medium', array['دنباله‌دار','دنباله دار'], array['هالی','یخ','غبار','دم نورانی','مدار','آسمان شب','شهاب'], array['جرم یخی با گیسوی نورانی در آسمان','میهمان معروفی مثل هالی']),
  ('cos_eclipse',   'cosmos', 'خورشیدگرفتگی',    'Solar Eclipse', 'medium', array['خورشید گرفتگی','کسوف'], array['ماه','خورشید','سایه','روز تاریک','تاج خورشید','عینک مخصوص'], array['تاریک شدن ناگهانی روز','قرار گرفتن ماه دقیقاً جلوی خورشید']),
  ('cos_saturn',    'cosmos', 'زحل',             'Saturn',        'easy',   array['کیوان','سیاره زحل'], array['حلقه','سیاره','منظومه شمسی','گازی','تایتان','مشتری'], array['عروس حلقه‌دار منظومه شمسی','سیاره‌ای با نام فارسی کیوان']),
  ('cos_nebula',    'cosmos', 'سحابی',           'Nebula',        'hard',   array['ابر کیهانی'], array['تولد ستاره','گاز','غبار کیهانی','تلسکوپ جیمز وب','کهکشان','رنگارنگ'], array['گهواره رنگارنگ تولد ستارگان','ابر عظیم گاز و غبار میان‌ستاره‌ای']),
  ('cos_meteor',    'cosmos', 'شهاب‌سنگ',        'Meteorite',     'easy',   array['شهاب سنگ','شهاب'], array['آسمان','جو زمین','سوختن','دهانه برخورد','آرزو','سنگ فضایی'], array['سنگ سرگردان فضایی در برخورد با جو','رد نورانی سریع در آسمان شب']),
  -- 10. Animals
  ('ani_chameleon', 'animals', 'آفتاب‌پرست', 'Chameleon', 'medium', array['افتاب پرست','آفتاب پرست'], array['تغییر رنگ','استتار','زبان دراز','خزنده','درخت','حشره'], array['استاد تغییر رنگ و استتار','خزنده‌ای که هم‌رنگ محیط می‌شود']),
  ('ani_owl',       'animals', 'جغد',        'Owl',       'easy',   array['بوف'], array['شب‌زی','پرنده','دانا','چشم درشت','چرخش گردن','جنگل','شکارچی شب'], array['پرنده بیدار شب با چشمان درشت','نماد دانایی با چرخش عجیب سر']),
  ('ani_octopus',   'animals', 'اختاپوس',    'Octopus',   'easy',   array['هشت‌پا','هشت پا'], array['هشت بازو','مرکب','اقیانوس','مکندگان','باهوش','سه قلب'], array['موجود باهوش دریایی با سه قلب','هشت بازو و پاشیدن جوهر سیاه']),
  ('ani_cheetah',   'animals', 'یوزپلنگ',    'Cheetah',   'easy',   array['یوز','یوزپلنگ ایرانی'], array['سرعت','سریع‌ترین','خال‌دار','توران','ایران','دویدن','شکار'], array['سریع‌ترین دونده روی خشکی','گربه‌سان نادر دشت توران ایران']),
  ('ani_penguin',   'animals', 'پنگوئن',     'Penguin',   'easy',   array['پنگوین'], array['قطب جنوب','یخ','پرنده بی‌پرواز','شناگر','کت و شلوار','ماهی'], array['پرنده‌ای که پرواز نمی‌کند اما شناگر قهاری است','ساکن بامزه یخ‌های قطب جنوب']),
  ('ani_firefly',   'animals', 'کرم شب‌تاب', 'Firefly',   'hard',   array['کرم شب تاب','شب‌تاب'], array['نور','حشره','شب','جنگل','درخشش','تابستان'], array['فانوس زنده و کوچک جنگل در تاریکی','حشره‌ای که در شب از خودش نور می‌دهد']),
  -- 11. Vehicles
  ('veh_submarine',     'vehicles', 'زیردریایی',   'Submarine',       'easy',   array['زیر دریایی'], array['پریسکوپ','سونار','اعماق دریا','اقیانوس','اکسیژن','کاپیتان نمو'], array['پریسکوپ و رادار سونار','سفر خاموش در اعماق اقیانوس']),
  ('veh_hotairballoon', 'vehicles', 'بالن',        'Hot Air Balloon', 'medium', array['بالن هوای گرم','بالون'], array['سبد','مشعل','آسمان','کاپادوکیه','هوای گرم','پرواز آرام'], array['سبد حصیری معلق در آسمان','پرواز آرام با شعله هوای گرم']),
  ('veh_sailboat',      'vehicles', 'کشتی بادبانی','Sailboat',        'medium', array['قایق بادبانی','لنج بادبانی'], array['باد','پارچه سفید','دکل','امواج','دریا','عرشه'], array['دکل بلند و پارچه‌های برافراشته','حرکت روی امواج با نیروی باد']),
  ('veh_cablecar',      'vehicles', 'تله‌کابین',   'Cable Car',       'easy',   array['تله کابین'], array['کابل','توچال','نمک‌آبرود','کوه','جنگل','معلق','واگن'], array['اتاقک معلق روی کابل فولادی','عبور از بالای درختان و دره‌ها تا قله']),
  ('veh_train',         'vehicles', 'قطار',        'Train',           'easy',   array['لوکوموتیو'], array['ریل','واگن','ایستگاه راه‌آهن','کوپه','سوت','مسافرت'], array['ردیف واگن‌ها روی ریل آهنی','کوپه و سوت حرکت از ایستگاه']),
  ('veh_helicopter',    'vehicles', 'هلیکوپتر',    'Helicopter',      'easy',   array['بالگرد','چرخبال'], array['ملخ','عمودپرواز','امداد','پروانه چرخان','خلبان','فرود روی بام'], array['پرواز عمودی بدون نیاز به باند','پروانه بزرگ چرخان بالای کابین']),
  -- 12. Science
  ('sci_microscope', 'science', 'میکروسکوپ', 'Microscope', 'easy',   array['ریزبین'], array['سلول','باکتری','عدسی','آزمایشگاه','بزرگ‌نمایی','لام'], array['ابزار تماشای سلول و باکتری','عدسی بزرگ‌نمایی در آزمایشگاه']),
  ('sci_magnet',     'science', 'آهنربا',    'Magnet',     'easy',   array['آهن‌ربا','اهنربا'], array['جذب','قطب شمال و جنوب','آهن','فلز','میدان مغناطیسی','دافعه'], array['قطب‌های هم‌نامش همدیگر را دفع می‌کنند','رباینده فلز و میخ آهنی']),
  ('sci_prism',      'science', 'منشور',     'Prism',      'hard',   array['منشور نوری'], array['نور سفید','تجزیه نور','طیف رنگ','شیشه مثلثی','نیوتن','شکست نور'], array['بلور شیشه‌ای آزمایش معروف نیوتن','نور سفید را به هفت رنگ می‌شکند']),
  ('sci_laser',      'science', 'لیزر',      'Laser',      'medium', array['پرتو لیزر'], array['پرتو متمرکز','نور قرمز','برش دقیق','پزشکی','فیزیک','فوتون'], array['پرتو باریک و بسیار متمرکز نور','از جراحی چشم تا برش صنعتی کاربرد دارد']),
  ('sci_battery',    'science', 'باتری',     'Battery',    'easy',   array['باطری'], array['شارژ','برق','مثبت و منفی','انرژی','کنترل','لیتیوم'], array['قطب مثبت و منفی ذخیره انرژی','منبع برق قابل حمل دستگاه‌ها']),
  ('sci_robot',      'science', 'ربات',      'Robot',      'easy',   array['روبات','آدم‌آهنی','آدم آهنی'], array['هوش مصنوعی','ماشین خودکار','سنسور','برنامه‌نویسی','مکانیکی','کارخانه'], array['ماشین هوشمند برنامه‌ریزی‌شده','آدم‌آهنی دنیای فناوری'])
on conflict (id) do update set
  category_id = excluded.category_id,
  word = excluded.word,
  word_en = excluded.word_en,
  difficulty = excluded.difficulty,
  accepted_answers = excluded.accepted_answers,
  related_words = excluded.related_words,
  hint_words = excluded.hint_words;

-- ---------------------------------------------------------------------------
-- 2. Room, Players, Rounds & Idempotency Tables
-- ---------------------------------------------------------------------------
create table if not exists public.wg_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z2-9]{6}$'),
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished', 'closed')),
  max_players integer not null default 2 check (max_players between 2 and 6),
  game_number integer not null default 1 check (game_number >= 1),
  current_round integer not null default 0 check (current_round >= 0),
  total_rounds integer not null default 4 check (total_rounds between 2 and 8),
  rules jsonb not null default '{}'::jsonb,
  used_word_ids text[] not null default '{}',
  history jsonb not null default '[]'::jsonb,
  winner_seat integer,
  is_draw boolean not null default false,
  settlement jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_wg_rooms_status_expires on public.wg_rooms (status, expires_at);

create table if not exists public.wg_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.wg_rooms (id) on delete cascade,
  seat integer not null check (seat between 1 and 6),
  is_host boolean not null default false,
  display_name text not null check (char_length(display_name) between 2 and 24),
  token_hash text not null unique,
  profile_id uuid references public.player_profiles (id) on delete set null,
  ready boolean not null default true,
  score integer not null default 0,
  correct_guesses integer not null default 0,
  related_guesses integer not null default 0,
  successful_clues integer not null default 0,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, seat)
);

create index if not exists idx_wg_players_room on public.wg_room_players (room_id);

create table if not exists public.wg_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.wg_rooms (id) on delete cascade,
  game_number integer not null,
  round_number integer not null,
  phase text not null check (phase in ('selecting_word', 'giving_clue', 'guessing', 'round_result')),
  clue_giver_seat integer not null,
  guesser_seat integer not null,
  categories jsonb not null default '[]'::jsonb,
  board_cards jsonb not null default '[]'::jsonb,
  target_word_id text references public.wg_words (id),
  clues jsonb not null default '[]'::jsonb,
  guesses jsonb not null default '[]'::jsonb,
  system_hints_used integer not null default 0,
  related_bonus_claimed boolean not null default false,
  round_summary jsonb,
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  unique (room_id, game_number, round_number)
);

create index if not exists idx_wg_rounds_room_lookup on public.wg_rounds (room_id, game_number, round_number);

create table if not exists public.wg_request_log (
  room_id uuid not null references public.wg_rooms (id) on delete cascade,
  player_id uuid not null references public.wg_room_players (id) on delete cascade,
  request_id text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, player_id, request_id)
);

-- Enable deny-all RLS on every new table (only SECURITY DEFINER RPCs may access)
alter table public.wg_categories enable row level security;
alter table public.wg_words enable row level security;
alter table public.wg_rooms enable row level security;
alter table public.wg_room_players enable row level security;
alter table public.wg_rounds enable row level security;
alter table public.wg_request_log enable row level security;

revoke all on public.wg_categories from public, anon, authenticated;
revoke all on public.wg_words from public, anon, authenticated;
revoke all on public.wg_rooms from public, anon, authenticated;
revoke all on public.wg_room_players from public, anon, authenticated;
revoke all on public.wg_rounds from public, anon, authenticated;
revoke all on public.wg_request_log from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Persian Normalization, Edit Distance & 3-Outcome Evaluation Helpers
-- ---------------------------------------------------------------------------
create or replace function public.wg_normalize_text(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(coalesce(p_raw, ''));
begin
  -- Remove harakat / diacritics & tatweel
  v := regexp_replace(v, '[\u064B-\u065F\u0670\u0640]', '', 'g');
  -- Fold Yeh variants (ي ى ئ -> ی) and Kaf (ك -> ک)
  v := regexp_replace(v, '[\u064A\u0649\u0626]', 'ی', 'g');
  v := replace(v, E'\u0643', 'ک');
  -- Fold Teh Marbuta / Heh variants and Alef variants
  v := regexp_replace(v, '[\u0629\u06C0]', 'ه', 'g');
  v := replace(v, 'هٔ', 'ه');
  v := regexp_replace(v, '[\u0622\u0623\u0625\u0671]', 'ا', 'g');
  v := replace(v, 'ؤ', 'و');
  -- Fold Persian & Arabic-Indic digits
  v := translate(v, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
  -- Replace ZWNJ / invisible marks & punctuation with single space
  v := regexp_replace(v, '[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]', ' ', 'g');
  v := regexp_replace(v, '[.,/#!$%^&*;:{}=\-_`~()«»؟،؛"''\[\]\\|<>+]', ' ', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  return v;
end;
$$;

create or replace function public.wg_compact_key(p_raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(replace(public.wg_normalize_text(p_raw), ' ', ''), 'یی+', 'ی', 'g');
$$;

create or replace function public.wg_edit_distance(a text, b text)
returns integer
language plpgsql
immutable
as $$
declare
  la integer := char_length(coalesce(a, ''));
  lb integer := char_length(coalesce(b, ''));
  prev integer[];
  curr integer[];
  i integer;
  j integer;
  cost integer;
begin
  if a = b then return 0; end if;
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  if abs(la - lb) > 2 then return abs(la - lb); end if;

  prev := array_fill(0, array[lb + 1]);
  curr := array_fill(0, array[lb + 1]);
  for j in 0..lb loop
    prev[j + 1] := j;
  end loop;

  for i in 1..la loop
    curr[1] := i;
    for j in 1..lb loop
      cost := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      curr[j + 1] := least(
        prev[j + 1] + 1,
        curr[j] + 1,
        prev[j] + cost
      );
    end loop;
    prev := curr;
  end loop;
  return prev[lb + 1];
end;
$$;

create or replace function public.wg_evaluate_answer(
  p_guess text,
  p_word_row public.wg_words,
  p_cat_row public.wg_categories,
  p_board_cards jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  v_norm text := public.wg_normalize_text(p_guess);
  v_key text := public.wg_compact_key(p_guess);
  v_stripped text;
  v_cand text;
  v_cand_key text;
  v_tok text;
begin
  if v_key = '' then
    return 'incorrect';
  end if;
  v_stripped := regexp_replace(v_key, 'ها$', '');

  -- 1. Check exact / accepted synonyms / minor 1-char typo on >=5-letter words
  foreach v_cand in array array_prepend(p_word_row.word, array_prepend(p_word_row.word_en, p_word_row.accepted_answers)) loop
    v_cand_key := public.wg_compact_key(v_cand);
    if v_cand_key <> '' then
      if v_key = v_cand_key then
        return 'correct';
      end if;
      if least(char_length(v_key), char_length(v_cand_key)) >= 5
         and public.wg_edit_distance(v_key, v_cand_key) <= 1 then
        return 'correct';
      end if;
      if char_length(v_stripped) >= 3 and v_stripped = v_cand_key then
        return 'correct';
      end if;
    end if;
  end loop;

  -- 2. Check curated semantic associations + hint words + category + sibling cards
  for v_cand in
    select unnest(p_word_row.related_words)
    union all
    select unnest(p_word_row.hint_words)
    union all
    select p_cat_row.title_fa
    union all
    select p_cat_row.title_en
    union all
    select (elem ->> 'word')
    from jsonb_array_elements(coalesce(p_board_cards, '[]'::jsonb)) elem
    where (elem ->> 'categoryId') = p_word_row.category_id
      and (elem ->> 'id') <> p_word_row.id
  loop
    v_cand_key := public.wg_compact_key(v_cand);
    if v_cand_key <> '' then
      if v_key = v_cand_key then
        return 'related';
      end if;
      if least(char_length(v_key), char_length(v_cand_key)) >= 5
         and public.wg_edit_distance(v_key, v_cand_key) <= 1 then
        return 'related';
      end if;
      if char_length(v_stripped) >= 3 and v_stripped = v_cand_key then
        return 'related';
      end if;
      if position(' ' in v_norm) > 0 and char_length(v_cand_key) >= 3 then
        foreach v_tok in array string_to_array(v_norm, ' ') loop
          if char_length(public.wg_compact_key(v_tok)) >= 3
             and public.wg_compact_key(v_tok) = v_cand_key then
            return 'related';
          end if;
        end loop;
      end if;
    end if;
  end loop;

  return 'incorrect';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Rules Builder, 16-Card Round Drawer & Role-Scrubbed State Projector
-- ---------------------------------------------------------------------------
create or replace function public.wg_resolve_rules(p_input jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v jsonb := case when jsonb_typeof(p_input) = 'object' then p_input else '{}'::jsonb end;
  v_rounds integer := least(8, greatest(2, coalesce((v ->> 'totalRounds')::integer, 4)));
  v_pack text := case when coalesce(v ->> 'packId', 'all') in ('all', 'classic', 'culture', 'adventure')
                 then coalesce(v ->> 'packId', 'all') else 'all' end;
  v_diff text := case when coalesce(v ->> 'difficultyFilter', 'all') in ('all', 'easy', 'medium', 'hard')
                 then coalesce(v ->> 'difficultyFilter', 'all') else 'all' end;
  v_extra text := case when coalesce(v ->> 'extraClueMode', 'hybrid') in ('hybrid', 'clue_giver_only', 'system_hints')
                  then coalesce(v ->> 'extraClueMode', 'hybrid') else 'hybrid' end;
  v_view text := case when coalesce(v ->> 'guesserViewMode', 'blind_typed') in ('blind_typed', 'categories_visible', 'board_16')
                 then coalesce(v ->> 'guesserViewMode', 'blind_typed') else 'blind_typed' end;
  v_timer integer := least(300, greatest(0, coalesce((v ->> 'roundTimerSeconds')::integer, 120)));
begin
  return jsonb_build_object(
    'totalRounds', v_rounds,
    'packId', v_pack,
    'difficultyFilter', v_diff,
    'maxCluesPerRound', 3,
    'maxGuessesPerRound', 3,
    'extraClueMode', v_extra,
    'guesserViewMode', v_view,
    'roundTimerSeconds', v_timer,
    'pointsCorrectByClue', jsonb_build_array(12, 9, 6),
    'pointsClueGiverBonus', jsonb_build_array(8, 6, 4),
    'pointsRelatedBonus', 2,
    'difficultyBonus', jsonb_build_object('easy', 0, 'medium', 2, 'hard', 4),
    'speedBonusMax', 3,
    'sheriffCoinWinReward', 35,
    'sheriffCoinPlayReward', 15
  );
end;
$$;

create or replace function public.wg_create_round_row(
  p_room public.wg_rooms,
  p_round_number integer
)
returns public.wg_rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pack text := coalesce(p_room.rules ->> 'packId', 'all');
  v_diff text := coalesce(p_room.rules ->> 'difficultyFilter', 'all');
  v_timer integer := coalesce((p_room.rules ->> 'roundTimerSeconds')::integer, 120);
  v_player_count integer;
  v_clue_seat integer;
  v_guess_seat integer;
  v_cat record;
  v_cats_json jsonb := '[]'::jsonb;
  v_cards_json jsonb := '[]'::jsonb;
  v_cat_cards jsonb;
  v_round public.wg_rounds;
begin
  select greatest(2, count(*)) into v_player_count
  from public.wg_room_players where room_id = p_room.id;

  -- Rotate roles cleanly on every round & alternate starting seat across rematches
  v_clue_seat := (((p_round_number - 1 + (p_room.game_number - 1)) % v_player_count) + 1);
  v_guess_seat := ((v_clue_seat % v_player_count) + 1);

  for v_cat in
    select *
    from public.wg_categories c
    where c.active and (v_pack = 'all' or c.pack_id = v_pack)
    order by random()
    limit 4
  loop
    v_cats_json := v_cats_json || jsonb_build_array(jsonb_build_object(
      'id', v_cat.id,
      'titleFa', v_cat.title_fa,
      'titleEn', v_cat.title_en,
      'color', v_cat.color
    ));

    select coalesce(jsonb_agg(card_obj), '[]'::jsonb)
    into v_cat_cards
    from (
      select jsonb_build_object(
        'id', w.id,
        'categoryId', v_cat.id,
        'categoryTitleFa', v_cat.title_fa,
        'categoryTitleEn', v_cat.title_en,
        'categoryColor', v_cat.color,
        'word', w.word,
        'wordEn', w.word_en,
        'difficulty', w.difficulty,
        'hintWords', to_jsonb(w.hint_words)
      ) as card_obj
      from public.wg_words w
      where w.active and w.category_id = v_cat.id
      order by
        (case when not (w.id = any(p_room.used_word_ids)) then 0 else 1 end),
        (case when v_diff = 'all' or w.difficulty = v_diff then 0 else 1 end),
        random()
      limit 4
    ) picked;

    v_cards_json := v_cards_json || v_cat_cards;
  end loop;

  insert into public.wg_rounds (
    room_id, game_number, round_number, phase,
    clue_giver_seat, guesser_seat, categories, board_cards,
    started_at, deadline_at
  )
  values (
    p_room.id, p_room.game_number, p_round_number, 'selecting_word',
    v_clue_seat, v_guess_seat, v_cats_json, v_cards_json,
    now(),
    case when v_timer > 0 then now() + make_interval(secs => v_timer) else null end
  )
  returning * into v_round;

  return v_round;
end;
$$;

-- Role-aware projector: strictly scrubs secret target word & cards when
-- `p_viewer_seat` is NOT the `clue_giver_seat` and `phase <> 'round_result'`.
create or replace function public.wg_project_state(
  p_room public.wg_rooms,
  p_viewer_seat integer default null
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_round public.wg_rounds;
  v_target public.wg_words;
  v_cat public.wg_categories;
  v_can_see_secret boolean := false;
  v_view_mode text := coalesce(p_room.rules ->> 'guesserViewMode', 'blind_typed');
  v_round_json jsonb := null;
  v_scrubbed_cards jsonb := null;
begin
  if p_room.current_round > 0 then
    select * into v_round
    from public.wg_rounds
    where room_id = p_room.id
      and game_number = p_room.game_number
      and round_number = p_room.current_round;

    if found then
      v_can_see_secret := (
        v_round.phase = 'round_result'
        or p_room.status = 'finished'
        or (p_viewer_seat is not null and p_viewer_seat = v_round.clue_giver_seat)
      );

      if v_round.target_word_id is not null then
        select * into v_target from public.wg_words where id = v_round.target_word_id;
        if found then
          select * into v_cat from public.wg_categories where id = v_target.category_id;
        end if;
      end if;

      if v_can_see_secret then
        v_scrubbed_cards := v_round.board_cards;
      elsif v_view_mode = 'board_16' then
        -- Strip hintWords even in optional board_16 mode, and never expose which card is target
        select coalesce(jsonb_agg(c - 'hintWords'), '[]'::jsonb)
        into v_scrubbed_cards
        from jsonb_array_elements(v_round.board_cards) c;
      else
        v_scrubbed_cards := null;
      end if;

      v_round_json := jsonb_build_object(
        'round_number', v_round.round_number,
        'phase', v_round.phase,
        'clue_giver_seat', v_round.clue_giver_seat,
        'guesser_seat', v_round.guesser_seat,
        'visible_categories', case
          when v_can_see_secret or v_view_mode in ('categories_visible', 'board_16')
            then v_round.categories
          else '[]'::jsonb
        end,
        'board_cards', v_scrubbed_cards,
        'target_word_id', case when v_can_see_secret then v_round.target_word_id else null end,
        'target_word', case when v_can_see_secret and v_target.id is not null then v_target.word else null end,
        'target_word_en', case when v_can_see_secret and v_target.id is not null then v_target.word_en else null end,
        'target_category_fa', case when v_can_see_secret and v_cat.id is not null then v_cat.title_fa else null end,
        'target_difficulty', case when v_can_see_secret and v_target.id is not null then v_target.difficulty else null end,
        'suggested_hints', case when v_can_see_secret and v_target.id is not null then to_jsonb(v_target.hint_words) else null end,
        'system_hints_used', v_round.system_hints_used,
        'clues', v_round.clues,
        'guesses', v_round.guesses,
        'related_bonus_claimed', v_round.related_bonus_claimed,
        'round_result_summary', v_round.round_summary,
        'started_at', to_jsonb(v_round.started_at),
        'deadline_at', to_jsonb(v_round.deadline_at),
        'remaining_seconds', case
          when v_round.deadline_at is not null
            then greatest(0, extract(epoch from (v_round.deadline_at - now())))::integer
          else null
        end
      );
    end if;
  end if;

  return jsonb_build_object(
    'room_code', p_room.room_code,
    'status', case
      when p_room.status not in ('closed', 'finished') and p_room.expires_at <= now() then 'expired'
      else p_room.status
    end,
    'max_players', p_room.max_players,
    'game_number', p_room.game_number,
    'current_round', p_room.current_round,
    'total_rounds', p_room.total_rounds,
    'rules', p_room.rules,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'seat', rp.seat,
        'name', rp.display_name,
        'score', rp.score,
        'ready', rp.ready,
        'connected', (rp.last_seen_at > now() - interval '45 seconds'),
        'is_host', rp.is_host,
        'correct_guesses', rp.correct_guesses,
        'related_guesses', rp.related_guesses,
        'successful_clues', rp.successful_clues,
        'profile_id', rp.profile_id
      ) order by rp.seat), '[]'::jsonb)
      from public.wg_room_players rp
      where rp.room_id = p_room.id
    ),
    'round', v_round_json,
    'history', p_room.history,
    'winner_seat', p_room.winner_seat,
    'is_draw', p_room.is_draw,
    'settlement', p_room.settlement,
    'version', p_room.version,
    'created_at', to_jsonb(p_room.created_at),
    'started_at', to_jsonb(p_room.started_at),
    'finished_at', to_jsonb(p_room.finished_at),
    'expires_in_seconds', greatest(0, extract(epoch from (p_room.expires_at - now())))::integer,
    'server_now', to_jsonb(now())
  );
end;
$$;

-- Shared channel broadcast ONLY ever sends `wg_project_state(v_room, null)`
-- so the hidden target word never crosses the Realtime WebSocket channel early!
create or replace function public.wg_broadcast_state(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
begin
  select * into v_room from public.wg_rooms where id = p_room_id;
  if not found then return; end if;
  begin
    perform realtime.send(
      public.wg_project_state(v_room, null),
      'state',
      'wg_room:' || v_room.room_code,
      false
    );
  exception
    when others then
      null;
  end;
end;
$$;

create or replace function public.wg_role_for_seat(p_room public.wg_rooms, p_seat integer)
returns text
language plpgsql
volatile
as $$
declare
  v_clue_seat integer;
begin
  if p_seat is null or p_room.current_round <= 0 then
    return null;
  end if;
  select clue_giver_seat into v_clue_seat
  from public.wg_rounds
  where room_id = p_room.id
    and game_number = p_room.game_number
    and round_number = p_room.current_round;
  if not found then
    return null;
  end if;
  return case when p_seat = v_clue_seat then 'clue_giver' else 'guesser' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Public Player RPC Endpoints (`SECURITY DEFINER`)
-- ---------------------------------------------------------------------------
create or replace function public.wg_create_room(
  p_display_name text,
  p_rules jsonb default '{}'::jsonb,
  p_profile_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip inet := public.get_client_ip();
  v_settings public.platform_settings;
  v_name text;
  v_rules jsonb;
  v_code text;
  v_token text;
  v_profile_id uuid := null;
  v_room public.wg_rooms;
  v_tries integer := 0;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if v_settings.maintenance_mode then
    raise exception 'MAINTENANCE';
  end if;
  if not public.rate_limit_check('wg_create', v_ip, v_settings.max_rooms_per_ip_per_hour, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  v_name := public.validate_display_name(p_display_name);
  v_rules := public.wg_resolve_rules(p_rules);

  if p_profile_token is not null and btrim(p_profile_token) <> '' then
    select id into v_profile_id
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_profile_token)) and status = 'active';
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := public.generate_room_code();
    exit when not exists (select 1 from public.wg_rooms where room_code = v_code);
    if v_tries >= 12 then raise exception 'CODE_GENERATION_FAILED'; end if;
  end loop;

  insert into public.wg_rooms (
    room_code, status, max_players, total_rounds, rules,
    expires_at
  )
  values (
    v_code, 'waiting', 2, (v_rules ->> 'totalRounds')::integer, v_rules,
    now() + make_interval(hours => coalesce(v_settings.room_ttl_hours, 3))
  )
  returning * into v_room;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.wg_room_players (
    room_id, seat, is_host, display_name, token_hash, profile_id, ready
  )
  values (
    v_room.id, 1, true, v_name, public.hash_token(v_token), v_profile_id, true
  );

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', 1,
    'my_role', null,
    'state', public.wg_project_state(v_room, 1)
  );
end;
$$;

create or replace function public.wg_join_room(
  p_room_code text,
  p_display_name text,
  p_profile_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip inet := public.get_client_ip();
  v_settings public.platform_settings;
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_name text;
  v_room public.wg_rooms;
  v_count integer;
  v_next_seat integer;
  v_token text;
  v_profile_id uuid := null;
begin
  select * into v_settings from public.platform_settings where id = 1;
  if v_settings.maintenance_mode then raise exception 'MAINTENANCE'; end if;
  if not public.rate_limit_check('wg_join', v_ip, v_settings.max_joins_per_ip_per_hour, interval '1 hour') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_code !~ '^[A-Z2-9]{6}$' then raise exception 'ROOM_NOT_FOUND'; end if;
  v_name := public.validate_display_name(p_display_name);

  select * into v_room from public.wg_rooms where room_code = v_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status = 'closed' then raise exception 'ROOM_CLOSED'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;

  select count(*) into v_count from public.wg_room_players where room_id = v_room.id;
  if v_count >= v_room.max_players then raise exception 'ROOM_FULL'; end if;
  if v_room.status <> 'waiting' then raise exception 'ROOM_IN_GAME'; end if;

  if p_profile_token is not null and btrim(p_profile_token) <> '' then
    select id into v_profile_id
    from public.player_profiles
    where token_hash = public.hash_token(btrim(p_profile_token)) and status = 'active';
  end if;

  v_next_seat := v_count + 1;
  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  insert into public.wg_room_players (
    room_id, seat, is_host, display_name, token_hash, profile_id, ready
  )
  values (
    v_room.id, v_next_seat, false, v_name, public.hash_token(v_token), v_profile_id, true
  );

  -- As soon as 2 players have joined, start Round 1 automatically!
  if v_next_seat >= 2 then
    update public.wg_rooms
    set status = 'active',
        current_round = 1,
        started_at = coalesce(started_at, now()),
        version = version + 1,
        last_activity_at = now(),
        expires_at = now() + make_interval(hours => coalesce(v_settings.room_ttl_hours, 3))
    where id = v_room.id
    returning * into v_room;

    perform public.wg_create_round_row(v_room, 1);
  else
    update public.wg_rooms
    set version = version + 1, last_activity_at = now()
    where id = v_room.id
    returning * into v_room;
  end if;

  perform public.wg_broadcast_state(v_room.id);

  return jsonb_build_object(
    'room_code', v_room.room_code,
    'room_id', v_room.id,
    'player_token', v_token,
    'seat', v_next_seat,
    'my_role', public.wg_role_for_seat(v_room, v_next_seat),
    'state', public.wg_project_state(v_room, v_next_seat)
  );
end;
$$;

create or replace function public.wg_get_room_state(
  p_room_code text,
  p_token text default null,
  p_notify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_seat integer := null;
  v_was_offline boolean := false;
begin
  if v_code !~ '^[A-Z2-9]{6}$' then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_room from public.wg_rooms where room_code = v_code;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  if p_token is not null and btrim(p_token) <> '' then
    select * into v_player
    from public.wg_room_players
    where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token));
    if found then
      v_seat := v_player.seat;
      v_was_offline := (v_player.last_seen_at <= now() - interval '45 seconds');
      update public.wg_room_players set last_seen_at = now() where id = v_player.id;
      if p_notify or v_was_offline then
        update public.wg_rooms set version = version + 1 where id = v_room.id returning * into v_room;
        perform public.wg_broadcast_state(v_room.id);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'seat', v_seat,
    'my_role', public.wg_role_for_seat(v_room, v_seat),
    'state', public.wg_project_state(v_room, v_seat)
  );
end;
$$;

create or replace function public.wg_set_ready(
  p_room_code text,
  p_token text,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  update public.wg_room_players
  set ready = coalesce(p_ready, true), last_seen_at = now()
  where id = v_player.id;

  update public.wg_rooms
  set version = version + 1, last_activity_at = now()
  where id = v_room.id returning * into v_room;

  perform public.wg_broadcast_state(v_room.id);
  return jsonb_build_object(
    'seat', v_player.seat,
    'my_role', public.wg_role_for_seat(v_room, v_player.seat),
    'state', public.wg_project_state(v_room, v_player.seat)
  );
end;
$$;

create or replace function public.wg_select_target(
  p_room_code text,
  p_token text,
  p_word_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_round public.wg_rounds;
  v_timer integer;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;
  if v_room.status <> 'active' then raise exception 'GAME_NOT_ACTIVE'; end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  select * into v_round from public.wg_rounds
  where room_id = v_room.id and game_number = v_room.game_number and round_number = v_room.current_round
  for update;
  if not found then raise exception 'GAME_NOT_ACTIVE'; end if;
  if v_player.seat <> v_round.clue_giver_seat then raise exception 'NOT_YOUR_TURN'; end if;

  -- Idempotent if same target already selected
  if v_round.phase <> 'selecting_word' then
    if v_round.target_word_id = p_word_id then
      return jsonb_build_object(
        'seat', v_player.seat,
        'my_role', 'clue_giver',
        'state', public.wg_project_state(v_room, v_player.seat)
      );
    end if;
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  -- Must belong to the 16 available cards in this round!
  if not exists (
    select 1 from jsonb_array_elements(v_round.board_cards) elem
    where (elem ->> 'id') = p_word_id
  ) then
    raise exception 'INVALID_TARGET';
  end if;

  v_timer := coalesce((v_room.rules ->> 'roundTimerSeconds')::integer, 120);
  update public.wg_rounds
  set target_word_id = p_word_id,
      phase = 'giving_clue',
      started_at = now(),
      deadline_at = case when v_timer > 0 then now() + make_interval(secs => v_timer) else null end
  where id = v_round.id;

  update public.wg_room_players set last_seen_at = now() where id = v_player.id;
  update public.wg_rooms
  set used_word_ids = case
        when p_word_id = any(used_word_ids) then used_word_ids
        else array_append(used_word_ids, p_word_id)
      end,
      version = version + 1,
      last_activity_at = now()
  where id = v_room.id returning * into v_room;

  perform public.wg_broadcast_state(v_room.id);
  return jsonb_build_object(
    'seat', v_player.seat,
    'my_role', 'clue_giver',
    'state', public.wg_project_state(v_room, v_player.seat)
  );
end;
$$;

create or replace function public.wg_submit_clue(
  p_room_code text,
  p_token text,
  p_clue_text text,
  p_kind text default 'association',
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_round public.wg_rounds;
  v_word public.wg_words;
  v_cached jsonb;
  v_cleaned text := btrim(regexp_replace(coalesce(p_clue_text, ''), '\s+', ' ', 'g'));
  v_kind text := case when p_kind in ('association', 'category', 'narrowing') then p_kind else 'association' end;
  v_clue_key text;
  v_forbid text;
  v_max_clues integer;
  v_resp jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;
  if v_room.status <> 'active' then raise exception 'GAME_NOT_ACTIVE'; end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  if p_request_id is not null and btrim(p_request_id) <> '' then
    select response into v_cached from public.wg_request_log
    where room_id = v_room.id and player_id = v_player.id and request_id = left(btrim(p_request_id), 64);
    if found then return v_cached; end if;
  end if;

  select * into v_round from public.wg_rounds
  where room_id = v_room.id and game_number = v_room.game_number and round_number = v_room.current_round
  for update;
  if not found then raise exception 'GAME_NOT_ACTIVE'; end if;
  if v_player.seat <> v_round.clue_giver_seat then raise exception 'NOT_YOUR_TURN'; end if;
  if v_round.phase <> 'giving_clue' then raise exception 'NOT_YOUR_TURN'; end if;
  if v_round.target_word_id is null then raise exception 'GAME_NOT_ACTIVE'; end if;

  v_max_clues := coalesce((v_room.rules ->> 'maxCluesPerRound')::integer, 3);
  if jsonb_array_length(v_round.clues) >= v_max_clues then
    raise exception 'MAX_CLUES_REACHED';
  end if;

  if char_length(v_cleaned) < 2 then raise exception 'CLUE_EMPTY'; end if;
  if char_length(v_cleaned) > 60 then raise exception 'CLUE_TOO_LONG'; end if;

  select * into v_word from public.wg_words where id = v_round.target_word_id;
  v_clue_key := public.wg_compact_key(v_cleaned);
  foreach v_forbid in array array_prepend(v_word.word, array_prepend(v_word.word_en, v_word.accepted_answers)) loop
    if char_length(public.wg_compact_key(v_forbid)) >= 2
       and position(public.wg_compact_key(v_forbid) in v_clue_key) > 0 then
      raise exception 'CLUE_CONTAINS_TARGET';
    end if;
  end loop;

  update public.wg_rounds
  set clues = v_round.clues || jsonb_build_array(jsonb_build_object(
        'index', jsonb_array_length(v_round.clues) + 1,
        'text', v_cleaned,
        'source', 'clue_giver',
        'kind', v_kind,
        'created_at', to_jsonb(now())
      )),
      phase = 'guessing'
  where id = v_round.id;

  update public.wg_room_players set last_seen_at = now() where id = v_player.id;
  update public.wg_rooms
  set version = version + 1, last_activity_at = now()
  where id = v_room.id returning * into v_room;

  perform public.wg_broadcast_state(v_room.id);
  v_resp := jsonb_build_object(
    'seat', v_player.seat,
    'my_role', 'clue_giver',
    'state', public.wg_project_state(v_room, v_player.seat)
  );

  if p_request_id is not null and btrim(p_request_id) <> '' then
    insert into public.wg_request_log (room_id, player_id, request_id, response)
    values (v_room.id, v_player.id, left(btrim(p_request_id), 64), v_resp)
    on conflict do nothing;
  end if;
  return v_resp;
end;
$$;

-- Introduce up to 2 progressive auxiliary hint words from the curated word bank
create or replace function public.wg_request_hint(
  p_room_code text,
  p_token text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_round public.wg_rounds;
  v_word public.wg_words;
  v_cached jsonb;
  v_mode text;
  v_max_clues integer;
  v_hint_text text;
  v_resp jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;
  if v_room.status <> 'active' then raise exception 'GAME_NOT_ACTIVE'; end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  if p_request_id is not null and btrim(p_request_id) <> '' then
    select response into v_cached from public.wg_request_log
    where room_id = v_room.id and player_id = v_player.id and request_id = left(btrim(p_request_id), 64);
    if found then return v_cached; end if;
  end if;

  v_mode := coalesce(v_room.rules ->> 'extraClueMode', 'hybrid');
  if v_mode = 'clue_giver_only' and v_player.seat <> (
    select clue_giver_seat from public.wg_rounds
    where room_id = v_room.id and game_number = v_room.game_number and round_number = v_room.current_round
  ) then
    raise exception 'MODE_DISABLED';
  end if;

  select * into v_round from public.wg_rounds
  where room_id = v_room.id and game_number = v_room.game_number and round_number = v_room.current_round
  for update;
  if not found or v_round.phase in ('selecting_word', 'round_result') or v_round.target_word_id is null then
    raise exception 'GAME_NOT_ACTIVE';
  end if;

  v_max_clues := coalesce((v_room.rules ->> 'maxCluesPerRound')::integer, 3);
  if jsonb_array_length(v_round.clues) >= v_max_clues or v_round.system_hints_used >= 2 then
    raise exception 'MAX_CLUES_REACHED';
  end if;

  select * into v_word from public.wg_words where id = v_round.target_word_id;
  v_hint_text := coalesce(v_word.hint_words[v_round.system_hints_used + 1], v_word.related_words[1], 'راهنمای کمکی');

  update public.wg_rounds
  set system_hints_used = v_round.system_hints_used + 1,
      clues = v_round.clues || jsonb_build_array(jsonb_build_object(
        'index', jsonb_array_length(v_round.clues) + 1,
        'text', v_hint_text,
        'source', 'system_hint',
        'kind', 'narrowing',
        'created_at', to_jsonb(now())
      )),
      phase = 'guessing'
  where id = v_round.id;

  update public.wg_room_players set last_seen_at = now() where id = v_player.id;
  update public.wg_rooms
  set version = version + 1, last_activity_at = now()
  where id = v_room.id returning * into v_room;

  perform public.wg_broadcast_state(v_room.id);
  v_resp := jsonb_build_object(
    'seat', v_player.seat,
    'my_role', public.wg_role_for_seat(v_room, v_player.seat),
    'state', public.wg_project_state(v_room, v_player.seat)
  );

  if p_request_id is not null and btrim(p_request_id) <> '' then
    insert into public.wg_request_log (room_id, player_id, request_id, response)
    values (v_room.id, v_player.id, left(btrim(p_request_id), 64), v_resp)
    on conflict do nothing;
  end if;
  return v_resp;
end;
$$;

create or replace function public.wg_submit_guess(
  p_room_code text,
  p_token text,
  p_guess_text text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_round public.wg_rounds;
  v_word public.wg_words;
  v_cat public.wg_categories;
  v_cached jsonb;
  v_cleaned text := btrim(regexp_replace(coalesce(p_guess_text, ''), '\s+', ' ', 'g'));
  v_outcome text;
  v_clue_count integer;
  v_clue_idx integer;
  v_elapsed numeric;
  v_guesser_pts integer := 0;
  v_clue_pts integer := 0;
  v_diff_bonus integer := 0;
  v_speed_bonus integer := 0;
  v_related_claimed boolean;
  v_new_guesses jsonb;
  v_max_guesses integer;
  v_max_clues integer;
  v_extra_mode text;
  v_next_phase text;
  v_round_ended boolean := false;
  v_total_guesser_round integer := 0;
  v_total_clue_round integer := 0;
  v_summary jsonb := null;
  v_auto_hint text;
  v_new_clues jsonb;
  v_new_sys_hints integer;
  v_resp jsonb;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;
  if v_room.status <> 'active' then raise exception 'GAME_NOT_ACTIVE'; end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  if p_request_id is not null and btrim(p_request_id) <> '' then
    select response into v_cached from public.wg_request_log
    where room_id = v_room.id and player_id = v_player.id and request_id = left(btrim(p_request_id), 64);
    if found then return v_cached; end if;
  end if;

  select * into v_round from public.wg_rounds
  where room_id = v_room.id and game_number = v_room.game_number and round_number = v_room.current_round
  for update;
  if not found then raise exception 'GAME_NOT_ACTIVE'; end if;
  if v_player.seat <> v_round.guesser_seat or v_round.phase <> 'guessing' then
    raise exception 'NOT_YOUR_TURN';
  end if;
  if char_length(v_cleaned) < 1 or char_length(v_cleaned) > 60 then
    raise exception 'INVALID_GUESS';
  end if;

  select * into v_word from public.wg_words where id = v_round.target_word_id;
  select * into v_cat from public.wg_categories where id = v_word.category_id;

  v_outcome := public.wg_evaluate_answer(v_cleaned, v_word, v_cat, v_round.board_cards);
  v_clue_count := greatest(1, jsonb_array_length(v_round.clues));
  v_clue_idx := least(2, greatest(0, v_clue_count - 1));
  v_elapsed := greatest(1::numeric, extract(epoch from (now() - v_round.started_at))::numeric);
  v_related_claimed := v_round.related_bonus_claimed;

  if v_outcome = 'correct' then
    v_diff_bonus := coalesce((v_room.rules -> 'difficultyBonus' ->> v_word.difficulty)::integer, 0);
    if v_elapsed <= 20 then
      v_speed_bonus := coalesce((v_room.rules ->> 'speedBonusMax')::integer, 3);
    elsif v_elapsed <= 45 then
      v_speed_bonus := greatest(1, coalesce((v_room.rules ->> 'speedBonusMax')::integer, 3) / 2);
    end if;
    v_guesser_pts := coalesce((v_room.rules -> 'pointsCorrectByClue' ->> v_clue_idx)::integer, 8) + v_diff_bonus + v_speed_bonus;
    v_clue_pts := coalesce((v_room.rules -> 'pointsClueGiverBonus' ->> v_clue_idx)::integer, 5) + (v_diff_bonus / 2);
  elsif v_outcome = 'related' and not v_related_claimed then
    v_guesser_pts := coalesce((v_room.rules ->> 'pointsRelatedBonus')::integer, 2);
    v_clue_pts := 1;
    v_related_claimed := true;
  end if;

  update public.wg_room_players
  set score = score + v_guesser_pts,
      correct_guesses = correct_guesses + (case when v_outcome = 'correct' then 1 else 0 end),
      related_guesses = related_guesses + (case when v_outcome = 'related' then 1 else 0 end),
      last_seen_at = now()
  where id = v_player.id;

  if v_clue_pts > 0 or v_outcome = 'correct' then
    update public.wg_room_players
    set score = score + v_clue_pts,
        successful_clues = successful_clues + (case when v_outcome = 'correct' then 1 else 0 end)
    where room_id = v_room.id and seat = v_round.clue_giver_seat;
  end if;

  v_new_guesses := v_round.guesses || jsonb_build_array(jsonb_build_object(
    'index', jsonb_array_length(v_round.guesses) + 1,
    'seat', v_player.seat,
    'player_name', v_player.display_name,
    'guess_text', v_cleaned,
    'normalized_guess', public.wg_normalize_text(v_cleaned),
    'outcome', v_outcome,
    'points_awarded', v_guesser_pts,
    'clue_count_when_guessed', v_clue_count,
    'created_at', to_jsonb(now())
  ));

  v_max_guesses := coalesce((v_room.rules ->> 'maxGuessesPerRound')::integer, 3);
  v_max_clues := coalesce((v_room.rules ->> 'maxCluesPerRound')::integer, 3);
  v_extra_mode := coalesce(v_room.rules ->> 'extraClueMode', 'hybrid');
  v_new_clues := v_round.clues;
  v_new_sys_hints := v_round.system_hints_used;

  if v_outcome = 'correct'
     or jsonb_array_length(v_new_guesses) >= v_max_guesses
     or jsonb_array_length(v_round.clues) >= v_max_clues then
    v_round_ended := true;
    v_next_phase := 'round_result';

    select coalesce(sum((g ->> 'points_awarded')::integer), 0)
    into v_total_guesser_round
    from jsonb_array_elements(v_new_guesses) g;

    v_total_clue_round := v_clue_pts + (case when v_round.related_bonus_claimed and v_outcome = 'correct' then 1 else 0 end)
      + (case when v_outcome <> 'correct' and v_related_claimed then 1 else 0 end);

    v_summary := jsonb_build_object(
      'outcome', v_outcome,
      'guesser_points', v_total_guesser_round,
      'clue_giver_points', v_total_clue_round,
      'speed_bonus', v_speed_bonus,
      'difficulty_bonus', v_diff_bonus
    );

    update public.wg_rooms
    set history = v_room.history || jsonb_build_array(jsonb_build_object(
          'round_number', v_round.round_number,
          'clue_giver_seat', v_round.clue_giver_seat,
          'guesser_seat', v_round.guesser_seat,
          'target_word', v_word.word,
          'target_word_en', v_word.word_en,
          'category_title_fa', v_cat.title_fa,
          'difficulty', v_word.difficulty,
          'outcome', v_outcome,
          'clues_used', jsonb_array_length(v_round.clues),
          'guesses_count', jsonb_array_length(v_new_guesses),
          'guesser_points', v_total_guesser_round,
          'clue_giver_points', v_total_clue_round
        )),
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id returning * into v_room;
  else
    -- Round continues! Introduce next narrowing clue via `system_hints` auto-mode or return turn to `clue_giver`
    if v_extra_mode = 'system_hints' and v_round.system_hints_used < 2 then
      v_auto_hint := coalesce(v_word.hint_words[v_round.system_hints_used + 1], v_word.related_words[1], 'راهنمای کمکی');
      v_new_sys_hints := v_round.system_hints_used + 1;
      v_new_clues := v_round.clues || jsonb_build_array(jsonb_build_object(
        'index', jsonb_array_length(v_round.clues) + 1,
        'text', v_auto_hint,
        'source', 'system_hint',
        'kind', 'narrowing',
        'created_at', to_jsonb(now())
      ));
      v_next_phase := 'guessing';
    else
      v_next_phase := 'giving_clue';
    end if;

    update public.wg_rooms
    set version = version + 1, last_activity_at = now()
    where id = v_room.id returning * into v_room;
  end if;

  update public.wg_rounds
  set guesses = v_new_guesses,
      clues = v_new_clues,
      system_hints_used = v_new_sys_hints,
      related_bonus_claimed = v_related_claimed,
      phase = v_next_phase,
      round_summary = coalesce(v_summary, round_summary)
  where id = v_round.id;

  perform public.wg_broadcast_state(v_room.id);
  v_resp := jsonb_build_object(
    'seat', v_player.seat,
    'my_role', public.wg_role_for_seat(v_room, v_player.seat),
    'evaluation', jsonb_build_object(
      'outcome', v_outcome,
      'points_awarded', v_guesser_pts,
      'round_ended', v_round_ended
    ),
    'state', public.wg_project_state(v_room, v_player.seat)
  );

  if p_request_id is not null and btrim(p_request_id) <> '' then
    insert into public.wg_request_log (room_id, player_id, request_id, response)
    values (v_room.id, v_player.id, left(btrim(p_request_id), 64), v_resp)
    on conflict do nothing;
  end if;
  return v_resp;
end;
$$;

create or replace function public.wg_next_round(
  p_room_code text,
  p_token text,
  p_expected_round integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_round public.wg_rounds;
  v_top_score integer;
  v_top_count integer;
  v_winner_seat integer := null;
  v_p record;
  v_win_sh integer;
  v_play_sh integer;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  -- Idempotency guard if the other player ALREADY clicked "Next Round" a moment ago!
  if v_room.status = 'finished' or v_room.current_round <> coalesce(p_expected_round, v_room.current_round) then
    return jsonb_build_object(
      'seat', v_player.seat,
      'my_role', public.wg_role_for_seat(v_room, v_player.seat),
      'state', public.wg_project_state(v_room, v_player.seat)
    );
  end if;

  select * into v_round from public.wg_rounds
  where room_id = v_room.id and game_number = v_room.game_number and round_number = v_room.current_round
  for update;
  if not found then raise exception 'GAME_NOT_ACTIVE'; end if;

  -- Allow advancing when round_result OR if round timer genuinely expired
  if v_round.phase <> 'round_result' then
    if v_round.deadline_at is not null and v_round.deadline_at <= now() then
      update public.wg_rounds
      set phase = 'round_result',
          round_summary = jsonb_build_object(
            'outcome', 'timeout',
            'guesser_points', 0,
            'clue_giver_points', 0,
            'speed_bonus', 0,
            'difficulty_bonus', 0
          )
      where id = v_round.id;
    else
      raise exception 'GAME_NOT_ACTIVE';
    end if;
  end if;

  if v_room.current_round >= v_room.total_rounds then
    select max(score) into v_top_score from public.wg_room_players where room_id = v_room.id;
    select count(*) into v_top_count from public.wg_room_players where room_id = v_room.id and score = v_top_score;
    if v_top_count = 1 then
      select seat into v_winner_seat from public.wg_room_players where room_id = v_room.id and score = v_top_score;
    end if;

    v_win_sh := coalesce((v_room.rules ->> 'sheriffCoinWinReward')::integer, 35);
    v_play_sh := coalesce((v_room.rules ->> 'sheriffCoinPlayReward')::integer, 15);

    for v_p in
      select * from public.wg_room_players where room_id = v_room.id and profile_id is not null
    loop
      perform public.coins_grant(
        v_p.profile_id,
        case when v_winner_seat is not null and v_p.seat = v_winner_seat then v_win_sh else v_play_sh end,
        'win_reward',
        v_room.id,
        'پاداش مسابقه رازواژه (تداعی و حدس کلمات)'
      );
    end loop;

    update public.wg_rooms
    set status = 'finished',
        winner_seat = v_winner_seat,
        is_draw = (v_winner_seat is null),
        settlement = jsonb_build_object(
          'settled', true,
          'win_reward_sh', v_win_sh,
          'play_reward_sh', v_play_sh
        ),
        finished_at = now(),
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id returning * into v_room;
  else
    update public.wg_rooms
    set current_round = current_round + 1,
        version = version + 1,
        last_activity_at = now()
    where id = v_room.id returning * into v_room;

    perform public.wg_create_round_row(v_room, v_room.current_round);
  end if;

  perform public.wg_broadcast_state(v_room.id);
  return jsonb_build_object(
    'seat', v_player.seat,
    'my_role', public.wg_role_for_seat(v_room, v_player.seat),
    'state', public.wg_project_state(v_room, v_player.seat)
  );
end;
$$;

create or replace function public.wg_rematch(
  p_room_code text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
  v_count integer;
begin
  if coalesce(btrim(p_token), '') = '' then raise exception 'PLAYER_UNAUTHORIZED'; end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.expires_at <= now() then raise exception 'ROOM_EXPIRED'; end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then raise exception 'PLAYER_UNAUTHORIZED'; end if;

  if v_room.status <> 'finished' then
    return jsonb_build_object(
      'seat', v_player.seat,
      'my_role', public.wg_role_for_seat(v_room, v_player.seat),
      'state', public.wg_project_state(v_room, v_player.seat)
    );
  end if;

  select count(*) into v_count from public.wg_room_players where room_id = v_room.id;
  if v_count < 2 then raise exception 'REMATCH_NOT_ALLOWED'; end if;

  update public.wg_room_players
  set score = 0,
      correct_guesses = 0,
      related_guesses = 0,
      successful_clues = 0,
      last_seen_at = now()
  where room_id = v_room.id;

  update public.wg_rooms
  set status = 'active',
      game_number = game_number + 1,
      current_round = 1,
      history = '[]'::jsonb,
      winner_seat = null,
      is_draw = false,
      settlement = '{}'::jsonb,
      finished_at = null,
      version = version + 1,
      last_activity_at = now()
  where id = v_room.id returning * into v_room;

  perform public.wg_create_round_row(v_room, 1);
  perform public.wg_broadcast_state(v_room.id);

  return jsonb_build_object(
    'seat', v_player.seat,
    'my_role', public.wg_role_for_seat(v_room, v_player.seat),
    'state', public.wg_project_state(v_room, v_player.seat)
  );
end;
$$;

create or replace function public.wg_leave_room(
  p_room_code text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.wg_rooms;
  v_player public.wg_room_players;
begin
  if coalesce(btrim(p_token), '') = '' then
    return jsonb_build_object('action', 'left');
  end if;
  select * into v_room from public.wg_rooms
  where room_code = upper(btrim(coalesce(p_room_code, '')))
  for update;
  if not found then
    return jsonb_build_object('action', 'left');
  end if;

  select * into v_player from public.wg_room_players
  where room_id = v_room.id and token_hash = public.hash_token(btrim(p_token))
  for update;
  if not found then
    return jsonb_build_object('action', 'left');
  end if;

  delete from public.wg_room_players where id = v_player.id;

  update public.wg_rooms
  set status = 'closed',
      version = version + 1,
      last_activity_at = now()
  where id = v_room.id;

  perform public.wg_broadcast_state(v_room.id);
  return jsonb_build_object('action', 'closed');
end;
$$;

-- Include `wg_rooms` in automated cleanup
create or replace function public.cleanup_expired_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_escrow record;
begin
  for v_escrow in
    select e.* from public.stake_escrows e
    left join public.rooms r on r.id = e.room_id
    where e.status = 'locked'
      and (r.id is null or r.expires_at < now() or r.status in ('closed', 'finished'))
      and e.created_at < now() - interval '10 minutes'
    for update of e
  loop
    update public.stake_escrows set status = 'refunded', settled_at = now() where id = v_escrow.id;
    perform public.coins_grant(v_escrow.player_id, v_escrow.amount, 'stake_refund',
      v_escrow.room_id, 'بازگشت ورودی (اتاق بسته شد)');
  end loop;

  delete from public.rooms where expires_at < now() - interval '1 hour';
  delete from public.ln_rooms where expires_at < now() - interval '1 hour';
  delete from public.wg_rooms where expires_at < now() - interval '1 hour';
  delete from public.rate_limit_hits where created_at < now() - interval '2 days';
  delete from public.admin_sessions where expires_at < now();
  delete from public.matchmaking_tickets
  where (status = 'searching' and enqueued_at < now() - interval '30 minutes')
     or (closed_at is not null and closed_at < now() - interval '2 days');
end;
$$;

-- Lock down internal helper functions & grant execute ONLY on public RPC entry points
revoke all on function public.wg_normalize_text(text) from public, anon, authenticated;
revoke all on function public.wg_compact_key(text) from public, anon, authenticated;
revoke all on function public.wg_edit_distance(text, text) from public, anon, authenticated;
revoke all on function public.wg_evaluate_answer(text, public.wg_words, public.wg_categories, jsonb) from public, anon, authenticated;
revoke all on function public.wg_resolve_rules(jsonb) from public, anon, authenticated;
revoke all on function public.wg_create_round_row(public.wg_rooms, integer) from public, anon, authenticated;
revoke all on function public.wg_project_state(public.wg_rooms, integer) from public, anon, authenticated;
revoke all on function public.wg_broadcast_state(uuid) from public, anon, authenticated;
revoke all on function public.wg_role_for_seat(public.wg_rooms, integer) from public, anon, authenticated;
revoke execute on function public.cleanup_expired_data() from public, anon, authenticated;

grant execute on function public.wg_create_room(text, jsonb, text) to anon, authenticated;
grant execute on function public.wg_join_room(text, text, text) to anon, authenticated;
grant execute on function public.wg_get_room_state(text, text, boolean) to anon, authenticated;
grant execute on function public.wg_set_ready(text, text, boolean) to anon, authenticated;
grant execute on function public.wg_select_target(text, text, text) to anon, authenticated;
grant execute on function public.wg_submit_clue(text, text, text, text, text) to anon, authenticated;
grant execute on function public.wg_request_hint(text, text, text) to anon, authenticated;
grant execute on function public.wg_submit_guess(text, text, text, text) to anon, authenticated;
grant execute on function public.wg_next_round(text, text, integer) to anon, authenticated;
grant execute on function public.wg_rematch(text, text) to anon, authenticated;
grant execute on function public.wg_leave_room(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
