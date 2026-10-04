# أدلة مراجعة 4 أكتوبر 2026

الإصدار المراجع: `811f1a1`، مطابق لـ`origin/main` عند بدء الجولة. لا توجد تغييرات تطبيق في فرع التقرير. كل بيانات المجسّات اصطناعية وعلى قواعد الاختبار فقط.

## النتائج المؤكدة

| الفحص                             | النتيجة                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| pytest، SQLite                    | 735 ناجحة؛100.60 ثانية                                             |
| pytest، Postgres16 المحلي         | 734 ناجحة، تخطّي 1 خاص بـ SQLite؛129.48 ثانية                      |
| مجسّات الخادم الإضافية            | 6 ناجحة في إثبات السلوك الحالي على كل محرك؛6.20 ثانية و 8.57 ثانية |
| مجسّات الواجهة الإضافية           | 2 ناجحتان في إثبات فقد الطابور/الإجابة؛2.05 ثانية                  |
| Vitest الحالي                     | 71 ناجحة،10 ملفات؛4.65 ثانية                                       |
| TypeScript + ruff + ruff format   | ناجحة                                                              |
| makemigrations --check --dry-run  | No changes detected                                                |
| OpenAPI --fail-on-warn --validate | نجح                                                                |
| بناء portal                       | نجح؛JS1,030.53kB،gzip267.92kB                                      |
| بناء landing صارم مع API اختبار   | 104 صفحات،2.35 ثانية                                               |
| تغطية أسطر الخادم                 | 94٪؛735 اختبارًا نجحت تحت coverage في 191.54 ثانية                 |
| تركيز حوار الاختبار               | خارج الحوار عند الفتح وبعد Shift+Tab على 390×900 و 1440×900        |
| Lighthouse                        | علقت المحاولة وأُوقفت؛لا قياسات معتمدة                             |

نتائج Playwright الكاملة تُضاف بعد انتهاء التشغيل وإعادة الإخفاقات.

## إعادة إنتاج الحالات المؤكدة

**هذه مجسّات مراجعة تتوقع السلوك المعيب عند الإصدار المذكور، وليست اختبارات قبول للسلوك الصحيح.** ستتغير نتائجها بعد الإصلاح. تُحفظ خارج شجرة اختبارات CI، ثم تُحوّل عند الإصلاح إلى اختبارات انحدار بتوقعات صحيحة. لا تُشغّل على الإنتاج، ولا تنسخ فوق ملف موجود بالاسم نفسه.

من جذر المستودع، على نسخة نظيفة:

```bash
cp docs/qa/evidence/project-review-2026-10/backend-probes.py backend/core/tests/test_review_probes.py
cd backend
.venv/bin/python -m pytest core/tests/test_review_probes.py -q -s
DATABASE_URL=postgres:///ecst .venv/bin/python -m pytest core/tests/test_review_probes.py -q -s
rm core/tests/test_review_probes.py
cd ..
```

إعداد pytest ينشئ `test_ecst` للاختبار ولا يكتب في قاعدة `ecst`. يلزم PostgreSQL محلي وحساب قادر على إنشاء قاعدة اختبار. لا تُضبط DATABASE_URL على الإنتاج.

```bash
cp docs/qa/evidence/project-review-2026-10/frontend-probes.test.tsx apps/portal/src/routes/exams/reviewProbes.test.tsx
pnpm --filter @ecst/portal exec vitest run src/routes/exams/reviewProbes.test.tsx
rm apps/portal/src/routes/exams/reviewProbes.test.tsx
```

- `sqlite-results.txt` و`postgres-results.txt`: المخرجات المختصرة، بلا بيانات شخصية أو أسرار.
- `frontend-probes.test.tsx`: المكوّن `TakeExam` الفعلي مع PUT503 و POST200، والتخزين المحلي المحجوب.
- `backend-probes.py`: نسختان مقروءتان قبل القرار، ثم ترتيب محدد للكتابات؛ يثبت تداخلًا ممكنًا، لا معدل حدوثه. يحتوي كذلك فحص HTTP للطالب الموقوف ومحاكاة فشل التدقيق وعدّ الاستعلامات.
- `coverage-summary.json`: coverage7.16.2، تغطية أسطر فقط، باستبعاد `.venv/tests/migrations/config/conftest/management`. ليست هذه نسبة تغطية جميع مخاطر الأعمال.
- `keyboard-results.json`, `exam-390.png`, `exam-1440.png`: حوار تسليم بمحاولة محاكاة على البوابة المحلية. قياس `contains(document.activeElement)` قبل وبعد Shift+Tab؛Overflow=0 على العرضين. لم يجرِ تسليم تلك المحاولة.

## أوامر التحقق العام

```bash
cd backend
.venv/bin/python -m pytest
DATABASE_URL=postgres:///ecst .venv/bin/python -m pytest
.venv/bin/ruff check . ../scripts
.venv/bin/ruff format --check . ../scripts
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py spectacular --fail-on-warn --validate --file /tmp/ecst-review-schema.yaml
cd ..
pnpm typecheck
pnpm test
pnpm build
PUBLIC_API_URL=http://127.0.0.1:8011 PUBLIC_PORTAL_URL=http://localhost:5184 LANDING_STRICT=1 pnpm --filter @ecst/landing build
E2E_API_PORT=8011 E2E_PORTAL_PORT=5184 E2E_SITE_PORT=4332 pnpm e2e
pnpm audit --prod --json
```

البناء الصارم يفترض API الاختبار قائمًا. البناء غير الصارم دون API أكمل 26 صفحة فقط؛ لذلك لا يُستعمل لإثبات اكتمال المحتوى. لا تغيّر منافذ المشاريع الأخرى؛8001 مشغول بمشروع آخر.

## حدود الأدلة

لم يُتاح SSH لهذه الجولة (`ssh-add -l`:لا هويات)، ولم يُفحص dump من الإنتاج أو يُجرَ تدريب استعادة جديد. نتائج النسخ والمؤقتات في التقرير الرئيسي من 3 أكتوبر. لا اختبار حمل على الإنتاج، ولا جهاز iPhone/Android فعلي، ولا VoiceOver/TalkBack. فحص أسرار التاريخ الكامل يظل من الجولة السابقة ولم يُعد هنا. الفحوص الحالية ليست شهادة ASVS2؛ حالة الطالب والتزامن واكتمال نسخ الاستعادة تظل بوابات عملية قبل الإطلاق.
