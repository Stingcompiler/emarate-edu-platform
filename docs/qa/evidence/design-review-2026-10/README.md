# أدلة مراجعة التصميم وتجربة المستخدم — 4 أكتوبر 2026

التقرير النهائي مدمج في [وثيقة مراجعة المشروع، القسم ي](../../project-review-2026-10.md). بدأ الفرع من `255ca23`؛ كود التطبيق هو الكود المراجع وظيفيًا عند `811f1a1`. كل الصور والبيانات محلية واصطناعية، ولا تحفظ الأدلة cookies أو رموز جلسات أو OTP. لم تُعدّل واجهات التطبيق.

## الفحوص والحدود

| الفحص                        | النتيجة                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| مسح الصفحات الأساسي          | 450 معاينة، خمسة مقاسات أساسية وعينات إضافية؛14 دورًا، والصفحات المشتركة تُفحص مرة بدور ممثل                         |
| محررات وتفاصيل ممثلة         | 70 معاينة؛إنشاء اختبار/محاضرة/واجب، تصحيح، طلب وسجل طالب، حالات، وسائط، تحويلات، مستخدم ومحرر صفحة                   |
| محاضرة فعلية من بيانات العرض | 5 معاينات؛المحتوى مرجع خارجي وليس فيديو في هذه العينة                                                                |
| التقديم                      | 30 معاينة لست حالات؛اختيار البرنامج، البيانات، المستندات، المراجعة، النجاح، المتابعة. بداية التحقق ضمن المسح الأساسي |
| التجاوز الأفقي العادي        | صفر في الفحوص الـ555 أعلاه؛لا يعني ذلك خلوها من تداخل داخل العناصر                                                   |
| axe بعد استقرار الثيم        | 16 حالة عامة +24 حالة بوابة، دون مخالفات في العينة؛ليست شهادة WCAG                                                   |
| التركيز في الدخول            | الحقلان `focus-visible=true` لكن `outline-style:none` و`box-shadow:none`، دون بديل على label                         |
| تحميل النتائج                | تأخير5 ثوانٍ: جسم خالٍ دون `aria-busy`؛503: «لا نتائج منشورة» مع تنبيه خطأ عام                                       |
| تكبير النص                   | 12 معاينة إضافية عند320 و375 وأفقي844؛تداخل ملخص النتائج بصريًا، وتجاوز4px في الرئيسية العامة320 بعد تكبير الجذر200٪ |
| مسودة التقديم                | قيمة المدرسة الجديدة أصبحت فارغة بعد تحديث الصفحة دون «التالي»، رغم وعد الحفظ التلقائي                               |

أحجام المسح:390×844،768×1024،1280×800،1440×900،1920×1080؛أضيف320 و375 و1024 في صفحات محددة. المحاكاة Chrome، وليست Safari أو جهازًا حقيقيًا. لا اختبار لوحة مفاتيح iOS الناعمة أو قارئ شاشة فعلي، ولا زوم متصفح حقيقي200٪. تكبير خط الجذر مصرح به كاختبار مختلف.

الملفات الأولية:

- [measurements.json](measurements.json): جرد التنقل، عنوان/اتجاه/خطوط ومقاسات، نصوص صغيرة، تجاوزات وعينة axe. قوائم الأهداف الأصغر من44px مجرد مرشحين: لا تفحص pseudo-element أو استثناءات الروابط المضمنة؛لا تحولها إلى عدد مخالفات.
- [details.json](details.json)،[lecture.json](lecture.json)،[journeys.json](journeys.json): المقاسات والنتائج الإضافية. في تشغيل details الأول اختير رابط `lectures/new?offering=3`، فحُفظت المحاضرة الفعلية في lecture منفصل؛صُحح اكتشاف الرابط في السكربت.
- [states.json](states.json): التركيز، حالات النتائج، تكبير الخط، عينة الخطوط والتباين العامة.
- [theme-confirmation.json](theme-confirmation.json):24 فحصًا للبوابة بعد انتظار400ms لاستقرار الألوان. في المسح الأول ظهرت مخالفة تباين واحدة أثناء الانتقال إلى الداكن؛اختفت في الإعادة المستقرة. لا يُسجّل ذلك عيب تباين مستمر.
- [draft-probe.json](draft-probe.json): الحقل قبل/بعد التحديث؛لا يزعم فقد الطلب كله أو فشل الحفظ عند الضغط على التالي.
- [contrast.json](contrast.json): حساب luminance لأزواج tokens معتمة؛ليس حسابًا للخلفيات الشفافة أو التدرجات.
- [touch.json](touch.json): تحقق تكميلي من ست صفحات عند390 مع `isMobile/hasTouch` و`pointer:coarse`؛لا يثبت Safari أو أجهزة لمس حقيقية. المسح الأساسي يغيّر viewport، وهذا الفحص يفعل قواعد CSS الخاصة بالمؤشر الخشن أيضًا.

## صور يمكن الرجوع إليها

### المشكلات المثبتة

| الحالة                | الصور                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| حفظ المسودة UX1       | [قبل تحديث الصفحة](screenshots/apply-draft-before-390.png)،[بعده](screenshots/apply-draft-after-390.png)           |
| التركيز UX2           | [كلمة المرور نشطة بلوحة المفاتيح دون حلقة تركيز](screenshots/login-keyboard-focus-390.png)                         |
| تحميل/خطأ النتائج UX3 | [أثناء التحميل](screenshots/results-loading-390.png)،[خطأ503 وحالة فارغة مضللة](screenshots/results-error-390.png) |
| تكبير النص UX4        | [نتائج375 مع تكبير200٪](screenshots/student--results-text200-375.png)                                              |
| ازدحام اليوم UX5      | [الطالب390](screenshots/student-home-390.png)،[1440](screenshots/student-home-1440.png)                            |

### الصفحات والمقاسات

| العائلة                    | صور مختارة                                                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| الرئيسية العامة            | [390](screenshots/public-ar-390.png)،[1440](screenshots/public-ar-1440.png)،[1920](screenshots/public-ar-1920.png)،[داكن390](screenshots/public-home-390-dark.png)                                                                                                     |
| عن الكلية والبرامج والقبول | [عن الكلية1440](screenshots/public-ar-about-1440.png)،[البرامج1920](screenshots/public-ar-programs-1920.png)،[القبول390](screenshots/public-ar-admissions-390.png)                                                                                                     |
| التواصل والدخول            | [التواصل1440](screenshots/public-ar-contact-1440.png)،[الدخول1440](screenshots/guest-login-1440.png)                                                                                                                                                                   |
| التقديم                    | [بداية390](screenshots/guest-apply-390.png)،[بداية1440](screenshots/guest-apply-1440.png)،[البيانات390](screenshots/apply-step-3-390.png)،[المراجعة1440](screenshots/apply-step-5-1440.png)،[النجاح390](screenshots/apply-step-success-390.png)                        |
| الطالب                     | [اليوم1920](screenshots/student-home-1920.png)،[المواد1440](screenshots/student-courses-1440.png)،[النتائج768](screenshots/student-results-768.png)،[النتائج1440](screenshots/student-results-1440.png)،[محاضرة1440](screenshots/lecture-1440.png)                     |
| الأستاذ                    | [اليوم1440](screenshots/teacher-home-1440.png)،[التصحيح1440](screenshots/teacher-grading-1440.png)،[إنشاء اختبار390](screenshots/detail-teacher--exams-new-390.png)                                                                                                    |
| القسم والقبول              | [القسم390](screenshots/department-department-390.png)،[1440](screenshots/department-department-1440.png)،[الطلبات1440](screenshots/head-registrar-applications-1440.png)                                                                                               |
| النظام                     | [المستخدمون390](screenshots/admin-system-users-390.png)،[1440](screenshots/admin-system-users-1440.png)،[الهيكل1440](screenshots/admin-system-structure-1440.png)،[الأدوار390](screenshots/admin-system-roles-390.png)،[1440](screenshots/admin-system-roles-1440.png) |
| إدارة الوسائط              | [1920](screenshots/detail-admin--site-media-1920.png)                                                                                                                                                                                                                  |
| نظرة بصرية عامة            | [العام والطالب والأستاذ](screenshots/overview-1.jpg)،[الإدارة والمحررات](screenshots/overview-2.jpg)                                                                                                                                                                   |

الصور المختارة فقط حُفظت في المستودع؛بقية لقطات الجلسة في `/tmp/ecst-design-review/` وقد تُحذف من النظام. أسماء الطلاب/الموظفين في الصور من seed_demo، وليست بيانات أشخاص من الإنتاج. عناوين البريد في رحلة التقديم `example.test` اصطناعية.

## إعادة الفحص محليًا

من جذر المشروع، بخوادم اختبار على منافذ غير مستخدمة. **serve-api يعيد إنشاء قاعدة E2E وملفات بريد العرض**؛لا تشغله على قاعدة إنتاج أو عند وجود E2E آخر قائم.

```bash
UV_CACHE_DIR=/tmp/ecst-review-uv-cache E2E_API_PORT=8011 bash e2e/serve-api.sh
ECST_API_ORIGIN=http://127.0.0.1:8011 pnpm --filter @ecst/portal exec vite --port 5184 --strictPort
PUBLIC_API_URL=http://127.0.0.1:8011 PUBLIC_PORTAL_URL=http://localhost:5184 ECST_E2E=1 pnpm --filter @ecst/landing exec astro dev --port 4332 --ignore-lock
```

تُشغّل أوامر الخوادم في جلسات منفصلة. ثم، من الجذر:

```bash
node docs/qa/evidence/design-review-2026-10/capture.cjs
node docs/qa/evidence/design-review-2026-10/states.cjs
node docs/qa/evidence/design-review-2026-10/details.cjs
node docs/qa/evidence/design-review-2026-10/theme-confirmation.cjs
node docs/qa/evidence/design-review-2026-10/journeys.cjs
```

تعتمد الأدوات على Chrome المثبت وPlaywright/axe في الحزم الحالية. السكربتات الأولى تقرأ الصفحات وتسجل الدخول؛journeys يكتب طلبات وملفات **اختبار اصطناعية** محليًا، وينفذ مجس المسودة. تُقرأ OTP من بريد التطوير دون طباعتها. لا تُنقل الجلسات أو cookies إلى الأدلة. لا تُشغّل السكربتات على الإنتاج.

لوحات المقارنة موجودة في `docs/prototype/screens/` ويمكن عرضها بـ`python3 scripts/boards.py serve --port 8799`. بعض اللوحات تعتمد support.js غير موجود في الشجرة؛قُرئت البنية/styles والمحتوى الثابت، ولم تُعتبر تفاعلات اللوحة مرجعًا قابلًا للتنفيذ. قواعد docs/06 الحالية تفصل في اختلاف الهيكل عن اللوحات الأقدم.
