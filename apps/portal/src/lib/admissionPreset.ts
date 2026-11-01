import type { Field, FormSchema } from "./visitor";

/**
 * «قالب طلب الالتحاق بالكلية» (owner, 2026-11-01), from the college's paper form. The registrar
 * loads it into a draft and edits labels, options, help and requirement before publishing; the
 * options and help below are starting values, not admission rules.
 *
 * Who sees what (owner): every field down to the closest contact's phone is the applicant's
 * and required; university number, admitted level and admission type are filled by the
 * college and shown to the applicant only when released; from the bridging/transfer cohort
 * down, staff only. The year, the programme and the date of submission come from the system.
 */
const half = { width: "half" } as const;
const release = { audience: "release" } as const;
const staff = { audience: "staff" } as const;

const f = (field: Field): Field => field;

export const ADMISSION_PRESET: FormSchema = {
  title: "استمارة طلب الالتحاق بالكلية",
  intro:
    "املأ الاستمارة بدقة كما في مستنداتك الرسمية. الحقول المعلَّمة بـ * مطلوبة، و«تعليمات» بجانب كل حقل تشرح المطلوب. إرسال الطلب لا يعني القبول؛ تتابع حالته من «متابعة طلبي».",
  steps: [
    {
      title: "الاستمارة",
      sections: [
        {
          title: "بيانات طلب الالتحاق",
          description: "العام الدراسي والبرنامج من اختيارك في الخطوة السابقة.",
          fields: [
            f({
              key: "application_path",
              type: "select",
              label: "مسار التقديم",
              required: true,
              options: ["قبول جديد", "تجسير", "تحويل"],
              help: "اختر «تجسير» إن كنت تحمل دبلومًا وتريد إكمال البكالوريوس، و«تحويل» إن كنت تدرس في جامعة أخرى.",
              ...half,
            }),
          ],
        },
        {
          title: "البيانات الشخصية",
          fields: [
            f({
              key: "personal_photo",
              type: "file",
              label: "الصورة الشخصية",
              required: true,
              accept: ["jpg", "jpeg", "png"],
              max_mb: 3,
              help: "ارفع صورة شخصية واضحة بخلفية فاتحة، JPG أو PNG حتى 3 ميغابايت.",
            }),
            f({
              key: "full_name_ar",
              type: "text",
              label: "الاسم الكامل باللغة العربية",
              required: true,
              help: "اكتب اسمك كاملًا كما ورد في مستنداتك الرسمية، دون اختصارات.",
              example: "محمد أحمد علي عثمان",
            }),
            f({
              key: "full_name_en",
              ltr: true,
              type: "text",
              label: "الاسم الكامل باللغة الإنجليزية",
              required: true,
              help: "اكتب اسمك بالإنجليزية كما في جواز السفر أو الشهادة؛ يُطبع في الشهادات.",
              example: "Mohamed Ahmed Ali Osman",
            }),
            f({
              key: "gender",
              type: "select",
              label: "النوع",
              required: true,
              options: ["ذكر", "أنثى"],
              help: "اختر النوع وفق بياناتك الرسمية.",
              ...half,
            }),
            f({
              key: "nationality",
              type: "select",
              label: "الجنسية",
              required: true,
              options: [
                "سوداني",
                "جنوب سوداني",
                "مصري",
                "تشادي",
                "إريتري",
                "إثيوبي",
                "يمني",
                "سوري",
                "سعودي",
                "أخرى",
              ],
              help: "اختر جنسيتك حسب المستند الرسمي.",
              ...half,
            }),
            f({
              key: "religion",
              type: "select",
              label: "الديانة",
              required: true,
              options: ["الإسلام", "المسيحية", "أخرى"],
              help: "اختر الديانة من الخيارات المتاحة.",
              ...half,
            }),
            f({
              key: "national_id",
              type: "text",
              label: "الرقم الوطني",
              required: true,
              pattern: "[0-9]{5,20}",
              help: "أدخل الرقم الوطني كما ورد في مستندك الرسمي، أرقامًا فقط، مع الأصفار في بدايته.",
              example: "01234567890",
              ...half,
            }),
          ],
        },
        {
          title: "بيانات الشهادة والدراسة السابقة",
          fields: [
            f({
              key: "certificate_type",
              type: "select",
              label: "نوع الشهادة",
              required: true,
              options: [
                "الشهادة الثانوية السودانية",
                "شهادة عربية",
                "شهادة أجنبية",
                "دبلوم",
                "بكالوريوس",
                "أخرى",
              ],
              help: "اختر نوع الشهادة التي تتقدم بموجبها.",
              ...half,
            }),
            f({
              key: "certificate_year",
              type: "year",
              label: "سنة الحصول على الشهادة",
              required: true,
              help: "اختر السنة الموضحة في الشهادة.",
              ...half,
            }),
            f({
              key: "academic_track",
              type: "select",
              label: "المساق الأكاديمي",
              required: true,
              options: ["علمي", "أدبي", "فني", "أخرى"],
              help: "اختر مساق الشهادة حسب التصنيف المعتمد لدى الكلية.",
              ...half,
            }),
            f({
              key: "previous_university",
              type: "text",
              label: "اسم الجامعة السابقة",
              required: true,
              show_if: { key: "application_path", in: ["تجسير", "تحويل"] },
              help: "أدخل اسم الجامعة أو الكلية التي درست بها.",
              ...half,
            }),
          ],
        },
        {
          title: "بيانات التواصل",
          fields: [
            f({
              key: "residential_address",
              type: "textarea",
              label: "عنوان السكن",
              required: true,
              help: "اكتب عنوان سكنك الحالي: الولاية، المدينة، الحي.",
              example: "ولاية الخرطوم، أم درمان، حي الثورة",
            }),
            f({
              key: "student_phone",
              type: "phone",
              label: "رقم هاتف الطالب",
              required: true,
              help: "أدخل رقمًا فعّالًا للتواصل معك، مع مفتاح الدولة.",
              example: "+249912345678",
              ...half,
            }),
            f({
              key: "guardian_name",
              type: "text",
              label: "اسم ولي الأمر",
              required: true,
              help: "اكتب الاسم الكامل لولي الأمر.",
              ...half,
            }),
            f({
              key: "guardian_phone",
              type: "phone",
              label: "رقم هاتف ولي الأمر",
              required: true,
              help: "أدخل رقم هاتف ولي الأمر مع مفتاح الدولة.",
              example: "+249912345678",
              ...half,
            }),
            f({
              key: "emergency_contact_name",
              type: "text",
              label: "اسم أقرب شخص للتواصل",
              required: true,
              help: "اسم شخص نرجع إليه عند تعذر التواصل معك أو مع ولي أمرك.",
              ...half,
            }),
            f({
              key: "emergency_contact_phone",
              type: "phone",
              label: "رقم هاتف أقرب شخص",
              required: true,
              help: "أدخل رقم هاتف الشخص المذكور مع مفتاح الدولة.",
              example: "+249912345678",
              ...half,
            }),
          ],
        },
        {
          title: "الإقرار",
          fields: [
            f({
              key: "declaration",
              type: "consent",
              label:
                "أقر بأن البيانات والمستندات المقدمة صحيحة، وأعلم أن إرسال الطلب لا يعني القبول.",
              required: true,
            }),
          ],
        },
        {
          title: "بيانات القبول",
          description: "يعبئها مسجل الكلية، وتظهر للمتقدم حين يتيحها.",
          fields: [
            f({
              key: "university_number",
              ltr: true,
              type: "text",
              label: "الرقم الجامعي",
              help: "يدخله موظف التسجيل بعد إتمام إجراءات القبول.",
              ...release,
              ...half,
            }),
            f({
              key: "admitted_level",
              type: "select",
              label: "المستوى المقبول به الطالب",
              options: [
                "المستوى الأول",
                "المستوى الثاني",
                "المستوى الثالث",
                "المستوى الرابع",
                "المستوى الخامس",
              ],
              help: "المستوى الأكاديمي المعتمد لقبول الطالب.",
              ...release,
              ...half,
            }),
            f({
              key: "admission_type",
              type: "select",
              label: "نوع القبول",
              options: ["قبول عام", "قبول خاص", "تجسير", "تحويل", "منحة"],
              help: "تصنيف القبول حسب خيارات الكلية.",
              ...release,
              ...half,
            }),
          ],
        },
        {
          title: "بيانات التسجيل",
          description: "للموظفين فقط؛ لا تظهر للمتقدم ولا في الدليل العام.",
          fields: [
            f({
              key: "target_cohort",
              type: "text",
              label: "الدفعة المستهدفة للتجسير أو التحويل",
              help: "الدفعة التي يلتحق بها الطالب في حالات التجسير أو التحويل.",
              ...staff,
              ...half,
            }),
            f({
              key: "tuition_fees",
              type: "money",
              label: "رسوم الدراسة",
              help: "قيمة رسوم الدراسة المعتمدة للطالب؛ تسجيلها لا يعني دفعها.",
              ...staff,
              ...half,
            }),
            f({
              key: "currency",
              type: "select",
              label: "العملة",
              options: ["جنيه سوداني", "دولار أمريكي"],
              ...staff,
              ...half,
            }),
            f({
              key: "department_student_number",
              ltr: true,
              type: "text",
              label: "رقم الطالب بالقسم",
              help: "الرقم الداخلي للطالب لدى القسم، إن كان مستخدمًا.",
              ...staff,
              ...half,
            }),
            f({
              key: "registration_level",
              type: "select",
              label: "المستوى الدراسي عند التسجيل",
              options: [
                "المستوى الأول",
                "المستوى الثاني",
                "المستوى الثالث",
                "المستوى الرابع",
                "المستوى الخامس",
              ],
              ...staff,
              ...half,
            }),
            f({
              key: "registration_type",
              type: "select",
              label: "نوع التسجيل",
              options: ["تسجيل جديد", "إعادة تسجيل", "تجسير", "تحويل"],
              ...staff,
              ...half,
            }),
            f({
              key: "registration_fees",
              type: "money",
              label: "رسوم التسجيل",
              help: "قيمة رسوم التسجيل المعتمدة؛ تسجيلها لا يعني دفعها.",
              ...staff,
              ...half,
            }),
            f({
              key: "registration_date",
              type: "date",
              label: "تاريخ التسجيل",
              help: "تاريخ إتمام التسجيل الرسمي لدى الكلية.",
              ...staff,
              ...half,
            }),
          ],
        },
      ],
    },
  ],
};
