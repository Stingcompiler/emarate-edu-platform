export const LANGS = ["ar", "en"] as const;
export type Lang = (typeof LANGS)[number];

const T = {
  home: { ar: "الرئيسية", en: "Home" },
  about: { ar: "عن الكلية", en: "About" },
  departments: { ar: "الأقسام", en: "Departments" },
  programs: { ar: "البرامج", en: "Programs" },
  admission: { ar: "القبول", en: "Admission" },
  news: { ar: "الأخبار والفعاليات", en: "News & events" },
  contact: { ar: "تواصل", en: "Contact" },
  portal: { ar: "دخول المنصة", en: "Sign in" },
  apply: { ar: "قدّم الآن", en: "Apply now" },
  track: { ar: "تابع طلبك", en: "Track your application" },
  explore: { ar: "استكشف البرامج", en: "Explore programs" },
  open: { ar: "يقبل الآن", en: "Open" },
  closed: { ar: "مغلق حاليًا", en: "Closed" },
  all: { ar: "الكل", en: "All" },
  students: { ar: "الطلاب", en: "students" },
  teachers: { ar: "أعضاء هيئة التدريس", en: "faculty" },
  programsCount: { ar: "البرامج", en: "programs" },
  departmentsCount: { ar: "الأقسام", en: "departments" },
  upcoming: { ar: "الفعالية القادمة", en: "Next event" },
  latestNews: { ar: "الأخبار", en: "News" },
  openPrograms: { ar: "البرامج المفتوحة", en: "Open programs" },
  plan: { ar: "الخطة الدراسية", en: "Study plan" },
  level: { ar: "المستوى", en: "Level" },
  levels: { ar: "المستويات", en: "levels" },
  documents: { ar: "المستندات المطلوبة", en: "Required documents" },
  terms: { ar: "الفصول الدراسية", en: "terms" },
  hours: { ar: "الساعات المعتمدة", en: "credit hours" },
  manager: { ar: "مدير القسم", en: "Head of department" },
  privacy: { ar: "الخصوصية", en: "Privacy" },
  other: { ar: "English", en: "العربية" },
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
/** English falls back to Arabic when a field has no translation yet. */
export const pick = (lang: Lang, ar: string, en?: string | null) => (lang === "en" && en ? en : ar);
export const langPaths = () => LANGS.map((lang) => ({ params: { lang } }));
export const fmtDate = (
  lang: Lang,
  iso: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
) => new Date(iso).toLocaleDateString(lang === "ar" ? "ar-u-nu-latn" : "en-GB", opts);
export const num = (lang: Lang, n: number) =>
  n.toLocaleString(lang === "ar" ? "ar-u-nu-latn" : "en");
/** A counted noun in either language. Arabic: 1 and 100+ singular, 2 dual (without the
 *  number), 3–10 plural, 11–99 accusative singular — «٥ أقسام», «قسمان», «١١ برنامجًا». */
type Noun = { one: string; two: string; few: string; many: string; en: [string, string] };
const arRule = new Intl.PluralRules("ar");
export function count(lang: Lang, n: number, noun: Noun): string {
  if (lang === "en") return `${num(lang, n)} ${n === 1 ? noun.en[0] : noun.en[1]}`;
  const form = arRule.select(n);
  if (form === "two") return noun.two;
  const word = form === "few" ? noun.few : form === "many" ? noun.many : noun.one;
  return `${num(lang, n)} ${word}`;
}
export const N = {
  program: {
    one: "برنامج",
    two: "برنامجان",
    few: "برامج",
    many: "برنامجًا",
    en: ["program", "programs"],
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
