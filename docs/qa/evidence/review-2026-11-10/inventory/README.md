# جرد النسخة قيد المراجعة

النسخة `496fdeb`. يُعاد توليده بـ `bash scripts/qa/inventory.sh <مجلد>`؛ لا يُحرَّر باليد.
المصدر: قوالب `apps/landing/src/pages`، مسارات `apps/portal/src/main.tsx` وقواعد
`ROUTE_ACCESS` مقيَّمة على رد `/api/v1/me` لمستخدم من كل دور، ومخطط OpenAPI مع صفوف
`core/tests/test_permission_matrix.py`.

| السجل | الملف | وحدة العد | العدد |
|---|---|---|---|
| الموقع العام | `site.csv` | قالب × لغة | 53 (44 صفحة، 9 ملفًا مولَّدًا) |
| البوابة | `portal.csv` | مسار × دور ينطبق عليه | 568 (109 مسارًا، منها 10 بلا دخول) |
| الخادم | `backend.csv` | عملية (طريقة + مسار) | 396 في 40 وحدة |
| فحص العرض | `fit.csv` | صفحة × حجم (390 و1280) | 306 — عمود النتيجة فارغ حتى يُنفَّذ |

## ما يحتاج نظرًا

- **مسارات محمية لا يفتحها أي دور (0):** لا شيء.
- **مسارات بلا رابط في تنقّل أي دور (13)** — تُفتح من صفحة أخرى، فلا يمر بها `sweep.spec.ts`: `/lectures/new`، `/assignments/new`، `/me/status`، `/regulations/new`، `/exams/new`، `/live/new`، `/announcements/new`، `/site/media`، `/site/redirects`، `/students/new`، `/hr/notices/new`، `/print/my-results`، `/cases/new`.
- **مسارات تحتاج سجلًا (`:id`): 30** — تُفحص ببيانات العرض من الصفحة التي تفتحها.
- **عمليات `/api/v1` بلا صف في اختبار المصفوفة (0):** لا شيء.

## المواصفة (docs/07 §2) مقابل الكود

docs/07 §2.17 ينبّه أن مسارات البوابة الفعلية تبدأ بـ `/system/…` و`/admissions/…`؛ القائمتان أدناه مطابقة نصية بعد توحيد المعرّفات، وليست حكمًا: يُراجَع كل سطر.

**في الكود وليست في المواصفة (71):** `*`، `/`، `/academic`، `/admissions/cycles`، `/affairs`، `/announcements/new`، `/apply`، `/assignments/:x`، `/assignments/:x/edit`، `/assignments/new`، `/change-password`، `/courses/:x/students`، `/department`، `/department/approvals`، `/department/audit`، `/department/courses`، `/department/lectures`، `/department/students`، `/department/teachers`، `/exam-attempts/:x`، `/exam-attempts/:x/result`، `/exams/:x`، `/exams/:x/edit`، `/exams/:x/monitor`، `/exams/:x/stats`، `/exams/new`، `/forgot-password`، `/hr`، `/hr-notices/:x`، `/hr/notices/new`، `/hr/report`، `/hr/teachers`، `/hr/teachers/:x`، `/install`، `/lectures/:x`، `/lectures/:x/edit`، `/lectures/new`، `/live/new`، `/me/status`، `/me/teaching`، `/print/my-results`، `/print/report/:x`، `/print/transcript/:x`، `/registrar`، `/regulations/:x`، `/regulations/new`، `/reports/admissions`، `/reports/affairs`، `/result-corrections`، `/result-imports`، `/result-imports/:x`، `/results-office`، `/results/search`، `/results/settings`، `/site`، `/site/media`، `/site/news/:x`، `/site/pages/:x`، `/site/redirects`، `/site/staff`، `/student-imports`، `/student-imports/:x`، `/submissions/:x`، `/system`، `/system/deletions`، `/system/roles`، `/system/settings`، `/system/users`، `/system/users/:x`، `/track`، `/transcripts`

**في المواصفة وليست في الكود (57):** `/admissions/…`، `/applications/:x/register`، `/assignments`، `/attempts/:x`، `/attempts/:x/result`، `/batches`، `/batches/new`، `/calendar`، `/corrections`، `/courses/:x/assignments/:x`، `/courses/:x/exams/:x`، `/courses/:x/lectures/:x`، `/cycles`، `/departments`، `/departments/:x`، `/dev/styleguide`، `/enrollment`، `/forgot`، `/form-templates`، `/help`، `/integrations`، `/lectures`، `/log`، `/me/downloads`، `/media`، `/menus`، `/misconduct-reports`، `/my-courses`، `/my-status`، `/news`، `/notices`، `/notices/new`، `/offline`، `/operations`، `/pages`، `/pages/:x`، `/parents`، `/pending`، `/professors`، `/professors/:x`، `/profile`، `/programs`، `/redirects`، `/registration-requests`، `/reset/:x`، `/roles`، `/search`، `/staff`، `/staff/:x`، `/structure`، `/students/import`، `/system/…`، `/teachers`، `/teachers/:x`، `/today`، `/users`، `/users/:x`

## أدوار كل مسار (عدد الأدوار التي تفتحه)

| المسار | الأدوار |
|---|---|
| `/` | 15 |
| `/academic` | 3 |
| `/admissions/cycles` | 3 |
| `/admissions/forms` | 4 |
| `/affairs` | 3 |
| `/announcements` | 15 |
| `/announcements/new` | 11 |
| `/applications` | 6 |
| `/applications/:id` | 6 |
| `/applications/:id/print` | 6 |
| `/assignments/:id` | 8 |
| `/assignments/:id/edit` | 6 |
| `/assignments/new` | 6 |
| `/audit` | 9 |
| `/cases` | 7 |
| `/cases/:id` | 7 |
| `/cases/new` | 3 |
| `/courses` | 8 |
| `/courses/:id` | 8 |
| `/courses/:id/students` | 7 |
| `/department` | 5 |
| `/department/approvals` | 5 |
| `/department/audit` | 4 |
| `/department/courses` | 5 |
| `/department/lectures` | 5 |
| `/department/students` | 5 |
| `/department/teachers` | 5 |
| `/events` | 4 |
| `/events/:id` | 4 |
| `/exam-attempts/:id` | 8 |
| `/exam-attempts/:id/result` | 8 |
| `/exams` | 8 |
| `/exams/:id` | 8 |
| `/exams/:id/edit` | 6 |
| `/exams/:id/monitor` | 7 |
| `/exams/:id/stats` | 7 |
| `/exams/new` | 6 |
| `/grading` | 6 |
| `/hr` | 4 |
| `/hr-notices/:id` | 6 |
| `/hr/notices/new` | 4 |
| `/hr/report` | 6 |
| `/hr/teachers` | 6 |
| `/hr/teachers/:id` | 6 |
| `/inquiries` | 5 |
| `/inquiries/:id` | 5 |
| `/install` | 15 |
| `/lectures/:id` | 8 |
| `/lectures/:id/edit` | 6 |
| `/lectures/new` | 6 |
| `/live` | 8 |
| `/live/new` | 6 |
| `/me` | 1 |
| `/me/status` | 1 |
| `/me/teaching` | 2 |
| `/notifications` | 15 |
| `/notifications/new` | 11 |
| `/print/my-results` | 1 |
| `/print/report/:id` | 9 |
| `/print/transcript/:number` | 7 |
| `/registrar` | 4 |
| `/registrars` | 3 |
| `/regulations` | 15 |
| `/regulations/:id` | 15 |
| `/regulations/new` | 3 |
| `/reports` | 5 |
| `/reports/admissions` | 6 |
| `/reports/affairs` | 3 |
| `/result-corrections` | 4 |
| `/result-imports` | 5 |
| `/result-imports/:id` | 5 |
| `/results` | 1 |
| `/results-office` | 3 |
| `/results/search` | 3 |
| `/results/settings` | 3 |
| `/settings` | 15 |
| `/site` | 3 |
| `/site-staff` | 3 |
| `/site/media` | 3 |
| `/site/news/:id` | 4 |
| `/site/pages/:id` | 3 |
| `/site/redirects` | 3 |
| `/staff-profiles` | 3 |
| `/student-imports` | 3 |
| `/student-imports/:id` | 3 |
| `/student-promotion` | 3 |
| `/students` | 6 |
| `/students/:id` | 6 |
| `/students/new` | 3 |
| `/submissions/:id` | 7 |
| `/system` | 2 |
| `/system/deletions` | 2 |
| `/system/roles` | 4 |
| `/system/settings` | 2 |
| `/system/structure` | 2 |
| `/system/users` | 4 |
| `/system/users/:id` | 4 |
| `/tasks` | 1 |
| `/transcripts` | 6 |
