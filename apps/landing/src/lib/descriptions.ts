import type { Lang } from "./i18n";

/**
 * What search results show for the listing pages (review 2026-11 R44): without one they fell
 * back to «title — college name», 41–64 characters, too short to say what the page holds.
 * Each stays within 70–170 characters (scripts/seo-check.mjs).
 */
const DESCRIPTIONS = {
  about: [
    "عن كلية الإمارات للعلوم والتكنولوجيا: رسالتها ورؤيتها وأقسامها الأكاديمية وقيادتها.",
    "About the Emirates College of Science and Technology: its mission, vision, academic departments and leadership.",
  ],
  contact: [
    "تواصل مع كلية الإمارات للعلوم والتكنولوجيا: العنوان والهاتف والبريد، ونموذج استفسار يصل إلى الجهة المختصة.",
    "Contact the Emirates College of Science and Technology: address, phone, email and an enquiry form that reaches the right office.",
  ],
  programs: [
    "برامج كلية الإمارات للعلوم والتكنولوجيا: الدرجة والمدة والساعات والرسوم وحالة التقديم لكل برنامج، مع البحث والتصفية.",
    "Programmes at the Emirates College of Science and Technology: degree, duration, credit hours, fees and admission status for each.",
  ],
  departments: [
    "الأقسام الأكاديمية في كلية الإمارات للعلوم والتكنولوجيا: نبذة كل قسم وبرامجه وأعضاء هيئة التدريس فيه.",
    "Academic departments of the Emirates College of Science and Technology: each department's overview, programmes and teaching staff.",
  ],
  announcements: [
    "إعلانات كلية الإمارات للعلوم والتكنولوجيا الرسمية للطلاب والمتقدمين والزوار، مرتبة من الأحدث إلى الأقدم.",
    "Official announcements from the Emirates College of Science and Technology for students, applicants and visitors, newest first.",
  ],
  calendar: [
    "التقويم الأكاديمي لكلية الإمارات للعلوم والتكنولوجيا: مواعيد الفصول الدراسية والتسجيل والامتحانات والإجازات.",
    "The academic calendar of the Emirates College of Science and Technology: term dates, registration, examinations and holidays.",
  ],
  news: [
    "أخبار كلية الإمارات للعلوم والتكنولوجيا: ما يجري في الأقسام من أنشطة وإنجازات، مرتبة من الأحدث إلى الأقدم.",
    "News from the Emirates College of Science and Technology: what happens in its departments, activities and achievements, newest first.",
  ],
  regulations: [
    "اللوائح والأنظمة المنشورة في كلية الإمارات للعلوم والتكنولوجيا: الدراسة والامتحانات والسلوك الطلابي.",
    "Published regulations of the Emirates College of Science and Technology: study, examinations and student conduct.",
  ],
  events: [
    "فعاليات كلية الإمارات للعلوم والتكنولوجيا القادمة والسابقة، مع مواعيدها وأماكنها وتفاصيل كل فعالية.",
    "Upcoming and past events at the Emirates College of Science and Technology, with the date, venue and details of each.",
  ],
} as const;

export function pageDescription(lang: Lang, page: keyof typeof DESCRIPTIONS): string {
  return DESCRIPTIONS[page][lang === "ar" ? 0 : 1];
}
