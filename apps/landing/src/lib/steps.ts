import type { Lang } from "./i18n";

/**
 * How to apply, in the same four steps wherever the site shows them (UX review 2026-11-04:
 * the home page listed three and the admissions page four).
 */
const STEPS: [string, string, string, string][] = [
  [
    "تحقّق من بريدك",
    "Verify your email",
    "أدخل بريدك وأكّد الرمز المرسل إليه — يُحفظ طلبك كمسودة بعد كل خطوة.",
    "Enter your email and confirm the code we send — your application is saved as a draft after every step.",
  ],
  [
    "اختر البرنامج",
    "Choose the programme",
    "برنامج واحد لكل طلب؛ يمكنك تقديم طلب آخر لبرنامج ثانٍ بالبريد نفسه.",
    "One programme per application; you can apply to another one with the same email.",
  ],
  [
    "أكمل النموذج وارفع المستندات",
    "Fill in the form and upload documents",
    "الأسئلة حسب البرنامج، وتكفي صورة واضحة بالهاتف للمستندات.",
    "Questions depend on the programme; a clear phone photo of each document is enough.",
  ],
  [
    "راجع وأرسل",
    "Review and submit",
    "تستلم رقمًا مرجعيًا فورًا، ويصلك كل تحديث على بريدك.",
    "You get a reference number at once, and every update reaches your email.",
  ],
];

export const applySteps = (lang: Lang): [string, string][] =>
  STEPS.map(([ar, en, arBody, enBody]) => (lang === "ar" ? [ar, arBody] : [en, enBody]));
