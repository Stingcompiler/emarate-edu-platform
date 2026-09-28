import { pages } from "./api";
import { type Lang, href } from "./i18n";

/** Site sections a side column can point to; official pages only once published. */
const LINKS = {
  news: ["الأخبار", "News", "news/"],
  events: ["الفعاليات", "Events", "events/"],
  announcements: ["الإعلانات", "Announcements", "announcements/"],
  calendar: ["التقويم الأكاديمي", "Academic calendar", "calendar/"],
  regulations: ["اللوائح والأنظمة", "Regulations", "regulations/"],
  admissions: ["القبول والتسجيل", "How to apply", "admissions/"],
  programs: ["البرامج", "Programmes", "programs/"],
  contact: ["تواصل معنا", "Contact us", "contact/"],
  fees: ["الرسوم والمنح", "Fees and scholarships", "admissions/fees/", "admissions/fees"],
  guide: ["دليل الطالب", "Student guide", "academics/student-guide/", "academics/student-guide"],
  affairs: ["شؤون الطلاب", "Student affairs", "student-life/affairs/", "student-life/affairs"],
} as const satisfies Record<string, readonly [string, string, string, string?]>;

export async function related(lang: Lang, keys: (keyof typeof LINKS)[]) {
  const published = new Set((await pages()).map((p) => p.path));
  return keys
    .map((k) => LINKS[k] as readonly [string, string, string, string?])
    .filter(([, , , official]) => !official || published.has(official))
    .map(([ar, en, path]) => ({ label: lang === "ar" ? ar : en, href: href(lang, path) }));
}
