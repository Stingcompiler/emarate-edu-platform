import type { Field } from "./visitor";

/**
 * Every item of the form explained with an example (owner, 2026-11-01: «اشرح كل بند مع ذكر
 * مثال حتى لا يضطر المتقدم للتواصل»). The registrar's own text comes first; where there is
 * none, a plain explanation for the field and its type; then how to fill it (the options,
 * the range, the format) and an example. One source for «تعليمات», the in-form guide and the
 * printable guide.
 */

/** Explanations and examples for the fields colleges commonly ask, when the registrar left none. */
const KNOWN: Record<string, { help: string; example?: string }> = {
  birth_date: {
    help: "تاريخ ميلادك كما في شهادة الميلاد أو جواز السفر أو البطاقة القومية.",
    example: "2008-05-01",
  },
  certificate_type: { help: "نوع الشهادة الثانوية أو المؤهل الذي تتقدم به للقبول." },
  percentage: {
    help: "النسبة المئوية النهائية المكتوبة في شهادتك، كما هي دون تقريب.",
    example: "82.5",
  },
  school: {
    help: "اسم المدرسة التي حصلت منها على الشهادة، كما هو مكتوب في الشهادة.",
    example: "مدرسة الخرطوم الثانوية بنات",
  },
  full_name_ar: {
    help: "اسمك الرباعي بالعربية كما في مستنداتك الرسمية، دون اختصار.",
    example: "محمد أحمد علي عثمان",
  },
  full_name_en: {
    help: "اسمك بالأحرف الإنجليزية كما في جواز السفر أو الشهادة.",
    example: "Mohamed Ahmed Ali Osman",
  },
  national_id: {
    help: "الرقم الوطني كما في البطاقة القومية أو جواز السفر، أرقامًا فقط.",
    example: "01234567890",
  },
  nationality: { help: "جنسيتك كما في جواز السفر أو البطاقة القومية." },
  gender: { help: "النوع كما في مستنداتك الرسمية." },
  religion: { help: "الديانة كما في مستنداتك الرسمية." },
  residential_address: {
    help: "عنوان سكنك الحالي: الولاية ثم المدينة ثم الحي، وأقرب معلم إن أمكن.",
    example: "ولاية الخرطوم، أم درمان، حي الثورة الحارة 12",
  },
  guardian_name: { help: "الاسم الكامل لولي أمرك.", example: "أحمد علي عثمان" },
  emergency_contact_name: {
    help: "اسم شخص نتصل به إن تعذّر الوصول إليك وإلى ولي أمرك.",
    example: "فاطمة أحمد علي",
  },
  previous_university: {
    help: "اسم الجامعة أو الكلية التي درست بها قبل التقديم.",
    example: "جامعة الخرطوم",
  },

  // The documents programmes ask for.
  certificate: {
    help: "صورة الشهادة الثانوية (أو المؤهل الذي تتقدم به) كاملة: الاسم والدرجات والختم والتوقيع.",
  },
  id: { help: "البطاقة القومية من الوجهين، أو صفحة البيانات في جواز السفر." },
  photo: { help: "صورة شخصية حديثة بخلفية فاتحة، يظهر فيها الوجه كاملًا." },
  personal_photo: { help: "صورة شخصية حديثة بخلفية فاتحة، يظهر فيها الوجه كاملًا." },
};

const PHONE_EXAMPLE = "+249912345678";

/** Which file types a document accepts, in words. */
export function fileTypes(accept?: string[]): string {
  const list = (accept?.length ? accept : ["pdf", "jpg", "png"]).map((a) =>
    a.toLowerCase() === "jpeg" ? "JPG" : a.toUpperCase(),
  );
  return [...new Set(list)].join(" أو ");
}

export type Explained = { help: string; how: string[]; example?: string; required: string };

export function explain(field: Field): Explained {
  const known = KNOWN[field.key];
  const help =
    field.help?.trim() ||
    known?.help ||
    (field.type === "consent"
      ? "إقرار تؤكد به صحة ما أدخلته."
      : field.type === "file"
        ? `صورة أو نسخة من «${field.label}».`
        : `اكتب «${field.label}» كما في مستنداتك الرسمية.`);
  const how: string[] = [];
  let example = field.example?.trim() || known?.example;
  const options = field.options ?? [];
  switch (field.type) {
    case "select":
      how.push(`اختر واحدًا من القائمة: ${options.join("، ")}.`);
      example ||= options[0];
      break;
    case "multiselect":
      how.push(`اختر واحدًا أو أكثر بالضغط عليه: ${options.join("، ")}.`);
      example ||= options.slice(0, 2).join("، ");
      break;
    case "number": {
      const range =
        field.min != null && field.max != null
          ? ` بين ${field.min} و${field.max}`
          : field.min != null
            ? ` لا يقل عن ${field.min}`
            : field.max != null
              ? ` لا يزيد على ${field.max}`
              : "";
      how.push(`أدخل رقمًا${range}، واستخدم النقطة للكسر العشري.`);
      example ||= field.max === 100 ? "82.5" : String(field.min ?? 1);
      break;
    }
    case "money":
      how.push("مبلغ بالأرقام، وللقروش نقطة ورقمان.");
      example ||= "1500.50";
      break;
    case "date":
      how.push("اختر اليوم والشهر والسنة من التقويم الذي يظهر عند الضغط على الحقل.");
      example ||= "2008-05-01";
      break;
    case "year":
      how.push("اختر السنة من القائمة.");
      example ||= String(new Date().getFullYear() - 1);
      break;
    case "phone":
      how.push("اكتب الرقم كاملًا مع مفتاح الدولة يبدأ بـ +، بلا مسافات.");
      example ||= PHONE_EXAMPLE;
      break;
    case "email":
      how.push("بريد تستخدمه وتصلك عليه الرسائل.");
      example ||= "name@example.com";
      break;
    case "textarea":
      how.push("اكتب بجمل واضحة؛ يمكنك كتابة أكثر من سطر.");
      break;
    case "boolean":
      how.push("ضع علامة ✓ إن كانت الإجابة «نعم»، واتركها فارغة إن كانت «لا».");
      break;
    case "consent":
      how.push("ضع علامة ✓ بعد قراءة النص؛ لا يُرسل الطلب بدونها.");
      break;
    case "file":
      how.push(
        `ارفع ملفًا ${fileTypes(field.accept)} حتى ${field.max_mb ?? 10} ميغابايت؛ صورة واضحة بكاميرا الهاتف تكفي، ويظهر النص كاملًا مقروءًا.`,
      );
      break;
    default:
      if (field.pattern === "[0-9]{5,20}") how.push("أرقام فقط، دون مسافات أو رموز.");
  }
  const required = field.show_if
    ? field.required
      ? "مطلوب حين يظهر"
      : "اختياري"
    : field.required
      ? "مطلوب"
      : "اختياري — اتركه فارغًا إن لم ينطبق عليك";
  return { help, how, example, required };
}

/** How a date or value reads in an example (dates as day/month/year, as the picker shows). */
export function exampleText(field: Field, example: string): string {
  if (field.type === "date") {
    const [y, m, d] = example.split("-");
    if (y && m && d) return `${d}/${m}/${y}`;
  }
  return example;
}
