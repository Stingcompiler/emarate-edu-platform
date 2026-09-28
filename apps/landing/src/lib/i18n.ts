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
  students: { ar: "طالب", en: "students" },
  teachers: { ar: "عضو هيئة تدريس", en: "faculty" },
  programsCount: { ar: "برنامجًا", en: "programs" },
  departmentsCount: { ar: "أقسام", en: "departments" },
  upcoming: { ar: "الفعالية القادمة", en: "Next event" },
  latestNews: { ar: "الأخبار", en: "News" },
  openPrograms: { ar: "البرامج المفتوحة", en: "Open programs" },
  plan: { ar: "الخطة الدراسية", en: "Study plan" },
  level: { ar: "المستوى", en: "Level" },
  levels: { ar: "مستويات", en: "levels" },
  documents: { ar: "المستندات المطلوبة", en: "Required documents" },
  terms: { ar: "فصول", en: "terms" },
  hours: { ar: "ساعة", en: "credit hours" },
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
) => new Date(iso).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", opts);
export const num = (lang: Lang, n: number) => n.toLocaleString(lang === "ar" ? "ar" : "en");
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
export const arrow = (lang: Lang) => (lang === "ar" ? "←" : "→");
