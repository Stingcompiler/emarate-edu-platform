const relative = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
const clock = new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("ar", { weekday: "long" });
const date = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long" });

/** "قبل 12 دقيقة" today, the time yesterday, the weekday this week, else the date. */
export function when(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.round((then.getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const group = dayGroup(iso, now);
  if (group === "today") return relative.format(Math.round(minutes / 60), "hour");
  if (group === "yesterday") return clock.format(then);
  if (group === "week") return weekday.format(then);
  return date.format(then);
}

export type DayGroup = "today" | "yesterday" | "week" | "older";

export const DAY_LABELS: Record<DayGroup, string> = {
  today: "اليوم",
  yesterday: "أمس",
  week: "هذا الأسبوع",
  older: "أقدم",
};

export function dayGroup(iso: string, now = new Date()): DayGroup {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  const day = 86_400_000;
  if (t >= start.getTime()) return "today";
  if (t >= start.getTime() - day) return "yesterday";
  if (t >= start.getTime() - 6 * day) return "week";
  return "older";
}

/** A counted Arabic noun: 1 and 100+ take the singular, 2 the dual (said without the number),
 *  3–10 the plural, 11–99 the accusative singular (e.g. سؤال، سؤالان، أسئلة، سؤالًا). */
export type Noun = { one: string; two: string; few: string; many: string };

const pluralRule = new Intl.PluralRules("ar");

/** "٥ أسئلة", "سؤالان", "١٥ سؤالًا", "١٠٠ سؤال" — "—" when the number is unknown. */
export function count(n: number | null | undefined, noun: Noun): string {
  if (n == null) return "—";
  const form = pluralRule.select(n);
  if (form === "two") return noun.two;
  const word = form === "few" ? noun.few : form === "many" ? noun.many : noun.one;
  return `${n.toLocaleString("ar", { maximumFractionDigits: 1 })} ${word}`;
}

const noun = (one: string, two: string, few: string, many: string): Noun => ({
  one,
  two,
  few,
  many,
});

/** Nouns the portal counts. Add here rather than writing number + noun by hand. */
export const N = {
  application: noun("طلب", "طلبان", "طلبات", "طلبًا"),
  acknowledgement: noun("إقرار", "إقراران", "إقرارات", "إقرارًا"),
  case: noun("حالة", "حالتان", "حالات", "حالة"),
  course: noun("مادة", "مادتان", "مواد", "مادة"),
  day: noun("يوم", "يومان", "أيام", "يومًا"),
  decision: noun("قرار", "قراران", "قرارات", "قرارًا"),
  department: noun("قسم", "قسمان", "أقسام", "قسمًا"),
  exam: noun("اختبار", "اختباران", "اختبارات", "اختبارًا"),
  file: noun("ملف", "ملفان", "ملفات", "ملفًا"),
  hour: noun("ساعة", "ساعتان", "ساعات", "ساعة"),
  lecture: noun("محاضرة", "محاضرتان", "محاضرات", "محاضرة"),
  mark: noun("درجة", "درجتان", "درجات", "درجة"),
  minute: noun("دقيقة", "دقيقتان", "دقائق", "دقيقة"),
  operation: noun("عملية", "عمليتان", "عمليات", "عملية"),
  program: noun("برنامج", "برنامجان", "برامج", "برنامجًا"),
  question: noun("سؤال", "سؤالان", "أسئلة", "سؤالًا"),
  report: noun("بلاغ", "بلاغان", "بلاغات", "بلاغًا"),
  resource: noun("مورد", "موردان", "موارد", "موردًا"),
  row: noun("صف", "صفان", "صفوف", "صفًا"),
  student: noun("طالب", "طالبان", "طلاب", "طالبًا"),
  submission: noun("تسليم", "تسليمان", "تسليمات", "تسليمًا"),
  task: noun("مهمة", "مهمتان", "مهام", "مهمة"),
  term: noun("فصل", "فصلان", "فصول", "فصلًا"),
  time: noun("مرة", "مرتان", "مرات", "مرة"),
} satisfies Record<string, Noun>;

/** URL slug from a title — Arabic letters are kept (the server's SlugField allows Unicode). */
export function slugify(title: string, max = 100): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);
}
