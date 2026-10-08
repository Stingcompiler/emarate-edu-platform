# أدلة المراجعة — 8 أكتوبر 2026

النسخة الأصلية المراجعة: `d2f0368`. [التقرير](../../comprehensive-review-2026-10-08.md).

## دلالة النتائج

**ملفات المجسّات تتوقع السلوك الخاطئ. نجاحها يثبت وجود المشكلة عند النسخة المراجعة، ولا يعني أن التطبيق أصلحها.** تحفظ خارج اختبارات CI، وتتحول إلى اختبارات انحدار ذات توقعات صحيحة عند تنفيذ الإصلاح.

- `backend_probes.py`: تسع حالات تثبت R01–R08، ثم الجزء الخادمي من R11.
- `frontend_probes.test.tsx`: ثلاث حالات لمكوّن `TakeExam` الفعلي تثبت R09 وR10 وR11. تستخدم API محاكى؛ اختبار R11 يحاكي قاعدة منع الرجوع ويقابله مجس للخدمة الفعلية.
- `backend-sqlite.txt`: نتيجة الحزمة الأصلية؛ 752 ناجحة.
- `backend-postgres.txt`: نتيجة الحزمة الأصلية؛ 751 ناجحة وتخطّي ضمان خاص بـSQLite.
- `probes-sqlite.txt` و`probes-postgres.txt`: تسعة مجسّات مثبتة على كل محرك.
- `frontend-probes.txt`: المجسّات الثلاثة ناجحة.
- `e2e-critical.txt`: 11 رحلة ناجحة وتخطّي مقصود واحد؛ مجموعة فرعية محددة، وليست كل اختبارات المتصفح.
- `build.txt`: البناء العادي، ويتضمن رسائل غياب API والبناء الجزئي للموقع.
- `build-strict.txt`: البناء مع API الاختبار و`LANDING_STRICT=1`؛ 104 صفحات.
- `pnpm-audit.json`: تنبيهان High لحزمتين من سلسلة Astro.
- `pip-audit.json`: فحص حزم Python المحلية؛ لا ثغرات معروفة.
- `verification.txt`: ملخص الفحوص الإضافية وحدودها.

أُزيلت مسافات نهايات الأسطر الزائدة من سجلات الأوامر فقط، دون تغيير نتائجها. لا تحتوي البيانات على سجلات طلاب حقيقيين. PostgreSQL كان مثيلًا مؤقتًا محليًا على `127.0.0.1:55438`، بقاعدة `ecst_review` وقاعدة اختبار ينشئها pytest. أُوقف بعد الانتهاء. لا حاجة لهذا المنفذ بالذات عند إعادة الفحص.

## إعادة تشغيل مجسّات الخادم

من جذر نسخة نظيفة للمستودع، تحقق أولًا من عدم وجود الملف المؤقت بالاسم التالي، ولا تستبدل ملفًا موجودًا:

```bash
cp docs/qa/evidence/review-2026-10-08/backend_probes.py backend/core/tests/test_review_20261008_probes.py
cd backend
.venv/bin/python -m pytest core/tests/test_review_20261008_probes.py -q -s
DATABASE_URL=postgresql://127.0.0.1:55438/ecst_review .venv/bin/python -m pytest core/tests/test_review_20261008_probes.py -q -s
rm core/tests/test_review_20261008_probes.py
```

أمر PostgreSQL يفترض مثيل اختبار جاهزًا وحسابًا يمكنه إنشاء قاعدة اختبار. لا تستخدم عنوان الإنتاج. المجسّات تنشئ بيانات اصطناعية؛ التخزين في إعدادات الاختبار في الذاكرة.

R01 وR02 يقرآن كائنين قبل القرار ثم يرتبان الكتابات. R03 يحقن كتابة إبطال بين قراءة الإغلاق وتسويته. هذه مجسّات حتمية لحالة قديمة، وليست قياسًا لحمل متزامن أو لتكرار السباق. R08 يحقن فشلًا أثناء استبدال الملف للتحقق من الفرق بين rollback قاعدة البيانات والتخزين.

## إعادة تشغيل مجسّات الواجهة

الاستيرادات نسبية لموضع النسخة المؤقتة بجانب `TakeExam.tsx`. تحقق من عدم وجود الملف المؤقت قبل نسخه:

```bash
cp docs/qa/evidence/review-2026-10-08/frontend_probes.test.tsx apps/portal/src/routes/exams/review20261008.test.tsx
pnpm --filter @ecst/portal exec vitest run src/routes/exams/review20261008.test.tsx
rm apps/portal/src/routes/exams/review20261008.test.tsx
```

لا تنسخ المجسّات إلى مصدر البوابة أثناء تشغيل E2E. R10 يستخدم ساعة افتراضية وذاكرة استعلام تمثل البيانات التي جُلبت قبل التمديد. R09 يتحقق من أن قيمة `unsent` المرسلة مع التنقل تساوي صفرًا رغم رفض الإجابة.

## الفحوص العامة التي نُفذت

```bash
cd backend
.venv/bin/python -m pytest -q -W error::DeprecationWarning
DATABASE_URL=postgresql://127.0.0.1:55438/ecst_review .venv/bin/python -m pytest -q -W error::DeprecationWarning
.venv/bin/ruff check . ../scripts
.venv/bin/ruff format --check . ../scripts
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py spectacular --fail-on-warn --validate --file /tmp/ecst-review-openapi.yaml
cd ..
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
E2E_API_PORT=8011 E2E_PORTAL_PORT=5184 E2E_SITE_PORT=4332 pnpm e2e e2e/tests/sign-in.spec.ts e2e/tests/exam.spec.ts e2e/tests/apply.spec.ts e2e/tests/access.spec.ts
PUBLIC_API_URL=http://127.0.0.1:8011 PUBLIC_PORTAL_URL=http://localhost:5184 LANDING_STRICT=1 pnpm --filter @ecst/landing build
pnpm audit --prod --json
```

البناء الصارم يفترض API محليًا قائمًا. في الجولة الأصلية شُغّل أثناء عمل خادم E2E. سكربت E2E يستخدم قاعدة اختبار قابلة للمسح، فلا تشغله فوق جلسة اختبار أخرى تريد الاحتفاظ ببياناتها.

فحص Python شُغّل بأداة `pip-audit` مؤقتة خارج المشروع، مع `--path backend/.venv/lib/python3.13/site-packages --format json`. لم تتغير ملفات قفل الاعتماديات.

## حدود هذه الأدلة

لم يُفحص الإنتاج، ولا استُعيد dump إنتاجي، ولا اختُبر حمل 500 طالب أو جهاز هاتف حقيقي. لم تُجرَ مراجعة بصرية لكل صفحات الموقع والبوابة في هذه الجولة. تنبيهات الحزم تثبت تطابق إصدارات متأثرة، ولا تثبت مسار استغلال في المنصة.
