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

export function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString("ar")} ${n === 1 ? one : many}`;
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
