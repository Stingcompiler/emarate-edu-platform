const relative = new Intl.RelativeTimeFormat("ar-u-nu-latn", { numeric: "auto" });
const clock = new Intl.DateTimeFormat("ar-u-nu-latn", { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("ar-u-nu-latn", { weekday: "long" });
const date = new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric", month: "long" });
const fullDate = new Intl.DateTimeFormat("ar-u-nu-latn", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * One date format for the portal (docs/06: «29 سبتمبر 2026», Western digits). A date-only
 * value ("2026-09-01") is that calendar day here, not midnight UTC shifted a day.
 */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = plain ? new Date(+plain[1]!, +plain[2]! - 1, +plain[3]!) : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : fullDate.format(d);
}

/**
 * Past: "قبل 12 دقيقة", "قبل 3 ساعات" today, "أمس 3:05 م", the weekday this week, else the
 * date. Future (a due or opening time): "بعد 20 دقيقة", "بعد 3 ساعات" today, "غدًا 10:00 ص",
 * the weekday within a week, else the date — never "بعد 120 ساعة" (review 2026-09-29, P12).
 */
export function when(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.round((then.getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  if (minutes > 0) {
    const days = Math.floor((then.getTime() - today.getTime()) / day);
    if (days === 0) return relative.format(Math.round(minutes / 60), "hour");
    if (days === 1) return `غدًا ${clock.format(then)}`;
    if (days < 7) return `${weekday.format(then)} ${clock.format(then)}`;
    return date.format(then);
  }
  const group = dayGroup(iso, now);
  if (group === "today") return relative.format(Math.round(minutes / 60), "hour");
  if (group === "yesterday") return `أمس ${clock.format(then)}`;
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

const pluralRule = new Intl.PluralRules("ar-u-nu-latn");

/** "٥ أسئلة", "سؤالان", "١٥ سؤالًا", "١٠٠ سؤال" — "—" when the number is unknown. */
export function count(n: number | null | undefined, noun: Noun): string {
  if (n == null) return "—";
  const form = pluralRule.select(n);
  if (form === "two") return noun.two;
  const word = form === "few" ? noun.few : form === "many" ? noun.many : noun.one;
  return `${n.toLocaleString("ar-u-nu-latn", { maximumFractionDigits: 1 })} ${word}`;
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
  change: noun("تغيير", "تغييران", "تغييرات", "تغييرًا"),
  course: noun("مادة", "مادتان", "مواد", "مادة"),
  day: noun("يوم", "يومان", "أيام", "يومًا"),
  decision: noun("قرار", "قراران", "قرارات", "قرارًا"),
  department: noun("قسم", "قسمان", "أقسام", "قسمًا"),
  exam: noun("اختبار", "اختباران", "اختبارات", "اختبارًا"),
  file: noun("ملف", "ملفان", "ملفات", "ملفًا"),
  hour: noun("ساعة", "ساعتان", "ساعات", "ساعة"),
  lecture: noun("محاضرة", "محاضرتان", "محاضرات", "محاضرة"),
  mark: noun("درجة", "درجتان", "درجات", "درجة"),
  member: noun("عضو", "عضوان", "أعضاء", "عضوًا"),
  minute: noun("دقيقة", "دقيقتان", "دقائق", "دقيقة"),
  operation: noun("عملية", "عمليتان", "عمليات", "عملية"),
  program: noun("برنامج", "برنامجان", "برامج", "برنامجًا"),
  question: noun("سؤال", "سؤالان", "أسئلة", "سؤالًا"),
  regulation: noun("لائحة", "لائحتان", "لوائح", "لائحة"),
  report: noun("بلاغ", "بلاغان", "بلاغات", "بلاغًا"),
  resource: noun("مورد", "موردان", "موارد", "موردًا"),
  row: noun("صف", "صفان", "صفوف", "صفًا"),
  student: noun("طالب", "طالبان", "طلاب", "طالبًا"),
  submission: noun("تسليم", "تسليمان", "تسليمات", "تسليمًا"),
  task: noun("مهمة", "مهمتان", "مهام", "مهمة"),
  term: noun("فصل", "فصلان", "فصول", "فصلًا"),
  time: noun("مرة", "مرتان", "مرات", "مرة"),
} satisfies Record<string, Noun>;

/** A mark out of a maximum: "6 من 10", "8.5 من 10" — never "6/10", which RTL shows as "10/6". */
export function score(got: number | string | null | undefined, of: number | string): string {
  const n = (v: number | string) =>
    Number(v).toLocaleString("ar-u-nu-latn", { maximumFractionDigits: 2 });
  return got == null || got === "" ? "—" : `${n(got)} من ${n(of)}`;
}

/**
 * A left-to-right token (university number, course code, email) inside an Arabic string:
 * isolated so it isn't reordered — "26-IT-0001", never "IT-0001-26". For JSX use
 * `<bdi dir="ltr">`; this is for plain-text props such as a page subtitle.
 */
export function ltr(text: string | null | undefined): string {
  return text ? `\u2066${text}\u2069` : "";
}

/**
 * A file name inside Arabic text (owner review 2026-10-02: «csv.المستوى الأول»). An Arabic
 * name keeps its own direction and only the extension is isolated left-to-right, so it reads
 * «…المستوى الأول.csv»; isolating the whole name LTR would reorder words around a dash. A
 * Latin name is isolated whole.
 */
export function fileName(name: string | null | undefined): string {
  if (!name) return "";
  const dot = name.lastIndexOf(".");
  if (!/[\u0600-\u06FF]/.test(name) || dot <= 0) return `\u2066${name}\u2069`;
  return `\u2068${name.slice(0, dot)}\u2069\u2066${name.slice(dot)}\u2069`;
}

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
