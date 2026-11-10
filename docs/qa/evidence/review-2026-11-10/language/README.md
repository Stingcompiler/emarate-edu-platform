# أدلة المحور 8 — الوصولية والعربية

## رسائل الخادم بالعربية

المجسات في `backend_probes.py`. كل مجس **يتوقع الخلل**: نجاحه يعني أن جملة إنجليزية تصل الصفحة.

```bash
bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11-10/language sqlite
```

قبل الإصلاح نجحت المجسات الأربعة (`probes-sqlite.txt`)، وبعده فشلت كلها (`verify-after-fix-sqlite.txt`).

**الطريقة:**
1. مسح شجرة الكود (AST) بحثًا عن كل جملة إنجليزية لا يلفّها `gettext`، خارج التوثيق والسجلات وأدوات المشغّل.
   وجد المسح **39 جملة** قبل الإصلاح، وبقيت **5** بعده، كلها لأدوات المشغّل (النسخ الاحتياطية، فحوص الإعداد).
2. `makemessages` ثم `msgattrib --untranslated --only-fuzzy` لمعرفة ما بلا ترجمة.

| المعرّف | الخطورة | الخلل المثبت | الإصلاح | اختبار الانحدار (`core/tests/test_messages_in_arabic.py`) |
|---|---|---|---|---|
| R85 | 🟠 | محرر الامتحان ينبّه الأستاذ بالإنجليزية فوق «نشر»: كل امتحان جديد يبدأ بـ«Add at least one question.»، ثم «Question 1: Set the correct answer.» و«The pass mark is above the total marks.». وترد إجابة الطالب ذات الشكل الخاطئ بـ«Answer true or false.» | `gettext` وترجمات عربية | `test_the_exam_builder_warns_in_arabic`، `test_a_bad_answer_is_refused_in_arabic` |
| R86 | 🟠 | المتقدم على `/apply` يقرأ بجانب الحقول «Upload this document.» و«Required.» و«Out of range.» و«Invalid phone number.» (17 رسالة) | كذلك؛ وكان بعضها مترجمًا ترجمة «تقريبية» (fuzzy) خاطئة لا تُستعمل، مثل «يجب أن يكون بعد البداية» لـ«Must be text.»، فصُحّحت | `test_the_applicant_reads_arabic_beside_the_fields` |
| R87 | 🟢 | الضغطة الثانية على «اعتماد» أو «رفض» لدفعة استيراد ترد بـ«This batch was already committed or rejected.»، و«نشر» دفعة نتائج غير معتمدة ترد بـ«Commit the batch first.» | كذلك | `test_a_second_press_on_a_closed_import_answers_in_arabic` |

**حارسان دائمان:**
- `test_no_english_sentence_reaches_a_page`: المسح نفسه، يفشل عند أي جملة إنجليزية جديدة بلا `gettext`.
- `test_every_message_has_its_arabic`: لا رسالة بلا ترجمة ولا ترجمة تقريبية في `django.po`.

## البحث داخل الصفحات

| المعرّف | الخطورة | الخلل | الإصلاح | اختبار |
|---|---|---|---|---|
| R88 | 🟢 | مربعات البحث داخل أربع صفحات (الترفيع، طلاب المادة، اختيار الموظفين في التعميم، اختيار البرنامج في التقديم) تطابق الحروف حرفيًا: «احمد» لا تجد «أحمد»، و«26-it-0001» لا تجد «26-IT-0001». بحث الصفحات و`Select` كانا يطبّعان (`fold`) | `matches()` في `lib/search.ts` تستعملها الصفحات الأربع، ومعها `fold` | `apps/portal/src/lib/search.test.ts` |

## الصفحات الجديدة بـ axe ولوحة المفاتيح والنص المكبّر

- `e2e/tests/a11y.spec.ts` أضاف إلى التدقيق (WCAG 2.1 AA، الخطير والحرج يُفشل البناء) هذه الصفحات:
  `/site-staff`، `/student-promotion`، `/staff-profiles`، `/department/approvals`، `/system/deletions`،
  `/system/roles`، `/admissions/cycles`.
- وأضاف **نموذج البلاغ في `/register`**: يصل إليه الاختبار بردّ الخادم `already_registered`، فلا يتغير حساب.
  تنتقل لوحة المفاتيح من البريد إلى الملاحظة ثم إلى زر البلاغ، ويخلو النموذج من مخالفات axe الخطيرة.
- `fit-signed-in.spec.ts`: صار النص المكبّر (20px) يُفحص لكل الأدوار السبعة على الهاتف، لا لثلاثة فقط،
  وأُضيف مدير الموقع.
- لوحة المفاتيح في `Select` (الأسهم، Enter، Escape، إعادة التركيز) يغطيها `Select.test.tsx`.
  وكل خانة في مصفوفة الكوادر لها اسم «فلان في «التصنيف»» يستعمله `site-staff.spec.ts`.
  وفي الترفيع: كل علامة داخل `label` باسم الطالب ورقمه، وتبقى ظاهرة أثناء البحث فلا يضيع التركيز عند إزالتها.

**النتيجة محليًا** بـ Chromium الذي يأتي مع Playwright (`CI=1`):
- `a11y.spec.ts` على سطح المكتب: 11 من 11.
- `a11y.spec.ts` و`fit-signed-in.spec.ts` على الهاتف: 25 من 25، منها النص المكبّر لكل الأدوار السبعة.

أما Google Chrome المثبت فكان يُغلق في منتصف الاختبارات، وهذا سبب عدم موثوقية E2E المحلي من قبل.

## حجم الحزمة (المحور 5)

بُنيت البوابة على هذا الفرع، والأرقام مضغوطة بـ gzip -9:

| | الآن | قبل (`review-2026-11/perf`) |
|---|---|---|
| الحزمة الأولى `index` | 91.3 kB | 93.5 kB |
| مع `ui` المشتركة (JS) | 148.5 kB | 146 kB |
| مع CSS | 174.9 kB | — |
| أكبر صفحة | `Apply` 9.8 kB، `Structure` 9.0 kB، `Settings` 7.0 kB | كلها دون 10 kB |

الحد في docs/09 هو 200 kB للحزمة الأولى. زادت `Select` نحو 2.5 kB ولم تتجاوز أي صفحة الحد.

**لم يُقَس:** Lighthouse، لأن الأداة غير مثبتة هنا ولم أُنزّلها. وقارئ الشاشة على الهاتف يحتاج هاتف المالك.
