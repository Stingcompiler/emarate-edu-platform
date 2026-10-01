export const LANGS = ["ar", "en"] as const;
export type Lang = (typeof LANGS)[number];

const T = {
  home: { ar: "الرئيسية", en: "Home" },
  about: { ar: "عن الكلية", en: "About" },
  departments: { ar: "الأقسام", en: "Departments" },
  programs: { ar: "البرامج", en: "Programmes" },
  admission: { ar: "القبول", en: "Admission" },
  news: { ar: "الأخبار والفعاليات", en: "News & events" },
  contact: { ar: "تواصل", en: "Contact" },
  portal: { ar: "دخول المنصة", en: "Sign in" },
  apply: { ar: "قدّم الآن", en: "Apply now" },
  track: { ar: "تابع طلبك", en: "Track your application" },
  explore: { ar: "استكشف البرامج", en: "Explore programmes" },
  open: { ar: "يقبل الآن", en: "Open" },
  closed: { ar: "مغلق حاليًا", en: "Closed" },
  all: { ar: "الكل", en: "All" },
  students: { ar: "الطلاب", en: "students" },
  teachers: { ar: "أعضاء هيئة التدريس", en: "faculty" },
  programsCount: { ar: "البرامج", en: "programmes" },
  departmentsCount: { ar: "الأقسام", en: "departments" },
  upcoming: { ar: "الفعالية القادمة", en: "Next event" },
  latestNews: { ar: "الأخبار", en: "News" },
  openPrograms: { ar: "البرامج المفتوحة", en: "Open programmes" },
  plan: { ar: "الخطة الدراسية", en: "Study plan" },
  level: { ar: "المستوى", en: "Level" },
  levels: { ar: "المستويات", en: "levels" },
  documents: { ar: "المستندات المطلوبة", en: "Required documents" },
  terms: { ar: "الفصول الدراسية", en: "terms" },
  hours: { ar: "الساعات المعتمدة", en: "credit hours" },
  manager: { ar: "مدير القسم", en: "Head of department" },
  privacy: { ar: "الخصوصية", en: "Privacy" },
  other: { ar: "English", en: "العربية" },
  darkMode: { ar: "الوضع الداكن", en: "Dark mode" },
  lightMode: { ar: "الوضع الفاتح", en: "Light mode" },
  poweredBy: { ar: "مدعوم من ستينج سيستم", en: "Powered by Sting System" },
  newTab: { ar: "(يفتح في تبويب جديد)", en: "(opens in a new tab)" },
  announcements: { ar: "الإعلانات", en: "Announcements" },
  register: { ar: "سجّل", en: "Register" },
  readMore: { ar: "اقرأ المزيد", en: "Read more" },
  notFound: { ar: "الصفحة غير موجودة", en: "Page not found" },
} as const;

export type Key = keyof typeof T;
export const t = (lang: Lang, key: Key) => T[key][lang];
export const dir = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");
export const href = (lang: Lang, path = "") =>
  `/${lang}/${path}`.replace(/\/+$/, "/").replace(/\/\/+/g, "/");
/** True when the text is (or starts as) Arabic — an untranslated fallback on English pages. */
export const isArabic = (text?: string | null) => !!text && /[\u0600-\u06FF]/.test(text);
/** An admission cycle's name for the page's language: the college names cycles in Arabic
 *  («قبول 2026/2027»), so English pages say «Admissions 2026/2027» (W3). */
export const cycleName = (lang: Lang, name: string) => {
  if (lang === "ar" || !isArabic(name)) return name;
  const year = name.match(/\d{4}(?:\/\d{2,4})?/)?.[0];
  return year ? `Admissions ${year}` : "Admissions";
};
/** English falls back to Arabic when a field has no translation yet. */
export const pick = (lang: Lang, ar: string, en?: string | null) => (lang === "en" && en ? en : ar);
export const langPaths = () => LANGS.map((lang) => ({ params: { lang } }));
export const fmtDate = (
  lang: Lang,
  iso: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
) => new Date(iso).toLocaleDateString(lang === "ar" ? "ar-u-nu-latn" : "en-GB", opts);
/** A time of day alone («3:00 م» · «15:00»): toLocaleDateString would add the date. */
export const fmtTime = (lang: Lang, iso: string) =>
  new Date(iso).toLocaleTimeString(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    hour: "numeric",
    minute: "2-digit",
  });
export const num = (lang: Lang, n: number) =>
  n.toLocaleString(lang === "ar" ? "ar-u-nu-latn" : "en");
/** A counted noun in either language. Arabic: 1 and 100+ singular, 2 dual (without the
 *  number), 3–10 plural, 11–99 accusative singular — «٥ أقسام», «قسمان», «١١ برنامجًا». */
type Noun = { one: string; two: string; few: string; many: string; en: [string, string] };
const arRule = new Intl.PluralRules("ar");
/** The noun that goes with n, without the number (for a big figure over its label). */
export function word(lang: Lang, n: number, noun: Noun): string {
  if (lang === "en") return n === 1 ? noun.en[0] : noun.en[1];
  const form = arRule.select(n);
  if (form === "two") return noun.two;
  return form === "few" ? noun.few : form === "many" ? noun.many : noun.one;
}
export function count(lang: Lang, n: number, noun: Noun): string {
  if (lang === "ar" && arRule.select(n) === "two") return noun.two;
  return `${num(lang, n)} ${word(lang, n, noun)}`;
}
export const N = {
  program: {
    one: "برنامج",
    two: "برنامجان",
    few: "برامج",
    many: "برنامجًا",
    en: ["programme", "programmes"],
  },
  department: {
    one: "قسم",
    two: "قسمان",
    few: "أقسام",
    many: "قسمًا",
    en: ["department", "departments"],
  },
  faculty: {
    one: "عضو هيئة تدريس",
    two: "عضوا هيئة تدريس",
    few: "أعضاء هيئة تدريس",
    many: "عضو هيئة تدريس",
    en: ["faculty member", "faculty"],
  },
  upcomingEvent: {
    one: "فعالية قادمة",
    two: "فعاليتان قادمتان",
    few: "فعاليات قادمة",
    many: "فعالية قادمة",
    en: ["upcoming event", "upcoming events"],
  },
  day: { one: "يوم", two: "يومين", few: "أيام", many: "يومًا", en: ["day", "days"] },
  hour: {
    one: "ساعة",
    two: "ساعتان",
    few: "ساعات",
    many: "ساعة",
    en: ["credit hour", "credit hours"],
  },
} satisfies Record<string, Noun>;

export const years = (lang: Lang, terms: number) => {
  const y = terms / 2;
  if (lang === "en") return `${y} years`;
  return y === 2 ? "سنتان" : y === 1 ? "سنة" : `${num(lang, y)} سنوات`;
};

const DEGREE_EN: Record<string, string> = {
  diploma: "Diploma",
  bachelor: "Bachelor",
  honours: "Honours",
  master: "Master",
};
export const degree = (lang: Lang, key: string, label: string) =>
  lang === "en" ? (DEGREE_EN[key] ?? label) : label;
/** "Forward" arrow for the reading direction. */
/** Keeps number ranges such as «8:00–15:00» in reading order inside Arabic text (LTR isolate);
 *  without it the bidi algorithm shows «15:00–8:00». */
export const isolateNumbers = (text: string) =>
  text.replace(/\d[\d:.,]*(?:\s*[–-]\s*\d[\d:.,]*)+/g, (run) => `\u2066${run}\u2069`);
/** A yearly fee as the college states it: «1,600,000 جنيه» · «SDG 1,600,000». */
export const money = (lang: Lang, n: number, currency: "SDG" | "USD") =>
  lang === "ar"
    ? `${num(lang, n)} ${currency === "SDG" ? "جنيه" : "دولار"}`
    : `${currency === "SDG" ? "SDG" : "US$"} ${num(lang, n)}`;
export const arrow = (lang: Lang) => (lang === "ar" ? "←" : "→");
/** schema.org FAQPage for the same questions a page shows (rich results). */
export const faqLd = (items: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
});
