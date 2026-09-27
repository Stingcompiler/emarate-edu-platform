# خطة بناء المنصة الجامعية المتكاملة — كلية الإمارات للعلوم والتكنولوجيا

> تاريخ الخطة: 2026-09-27 — تبني على تقرير المراجعة (`university-platform-review-report.md`) وعلى قرارات المالك.

---

## 1. القرارات المُثبَّتة (من إجاباتك)

| # | القرار | الأثر على التصميم |
|---|---|---|
| D1 | البيانات الحالية غير مطلوبة | قاعدة بيانات جديدة؛ لا Data migrations؛ حرية كاملة في الـ Schema |
| D2 | لا أهمية للإنتاج الآن؛ **لا Docker إطلاقًا** | تطوير محلي بخدمات Homebrew (postgresql@16 + redis + mailpit)؛ النشر مرحلة أخيرة |
| D3 | الرقم الجامعي تملكه الكلية ويُرفع من ملف | `StudentRecord` يُنشأ من الاستيراد فقط (Validate → Preview → Commit) |
| D4 | التحقق: رقم جامعي + بريد الطالب الخاص + OTP | البريد يثبت ملكية البريد لا الهوية → أضفت طبقة اعتماد قابلة للتفعيل (انظر 4.3) |
| D5 | البث روابط خارجية فقط (Teams/Meet/Zoom) | `LiveSession` = رابط مقيّد بالصلاحية + إشعار؛ لا Webhooks ولا حضور تلقائي ولا تسجيل |
| D6 | مرسلو الإشعارات: الأستاذ، مدير القسم، مسجل الكلية، مدير الفعاليات، أمين الشؤون العلمية (للأساتذة) | نظام إشعارات بجمهور محدد لكل دور (انظر 5) |
| D7 | الموارد البشرية: تقارير أداء الأساتذة + تنبيه موجّه بشأن موضوع محدد | دور `hr` للقراءة + إرسال تنبيه لأستاذ محدد بموضوع مسجَّل |
| D8 | الهوية: أبيض أساسي، أحمر غامق، أزرق غامق؛ شعار لاحقًا | نظام تصميم فاتح (Light) أولد Tokens منه؛ الشعار يُستبدل لاحقًا بلا تغيير كود |
| D9 | صفحة هبوط منفصلة لتحسين محركات البحث، بياناتها من قاعدة البيانات، يديرها فريق الموقع (مدير الموقع + مدير الفعاليات) | موقع عام مستقل (SSG) يُعاد بناؤه تلقائيًا عند النشر من لوحة التحكم |
| D10 | PWA للإشعارات | Service Worker + Web Push (VAPID) + شاشة تثبيت |
| D11 | اختيار التقنيات متروك لي | القسم 2 |
| D12 | اعتماد تسجيل الطلاب إعداد نظام يبدّله مدير النظام | مفعّل → موافقة مدير/مشرف القسم؛ معطّل → تسجيل مباشر بعد OTP |
| D13 | أمين الشؤون العلمية يعيّن مديري ومشرفي الأقسام؛ مدير القسم يضيف/يزيل أساتذة القسم؛ مشرف القسم = مدير بلا حذف | `DepartmentMembership` + دور `department_supervisor` |
| D14 | المسجل = قبول فقط مرتبط بالأقسام؛ الكلية لديها عدة مسجلين | `registrar` (نطاق قسم) + `head_registrar` (كل الطلبات، التوزيع، قوالب النماذج، سجل الطلاب، Enrollment) |
| D15 | مسؤول النتائج دور مستقل يرفع وينشر مباشرة ويضبط عرض النتائج | `results_officer` |
| D16 | الزائر يتابع طلباته واستفساراته عبر OTP على البريد/الهاتف (لا بالاسم) | `Contact` + `VisitorSession`؛ الرقم المرجعي يعرض الحالة فقط |
| D17 | قوالب نماذج التقديم قابلة للتخصيص | `ApplicationFormTemplate` (JSON schema مُصدَّر) + منشئ مرئي؛ قالب افتراضي للكلية + تجاوز لكل برنامج |
| D18 | النتائج تُرفع كملف جاهز فقط (مسؤول النتائج لأي قسم، مدير/مشرف القسم لقسمه)؛ التعديل بطلب من مسؤول النتائج وموافقة أمين الشؤون العلمية | `ResultImportBatch` بنطاق، `ResultCorrection` بسير موافقة |
| D19 | دور **أمين شؤون الطلاب**: اللوائح، إشعارات تنظيمية، حالات الطلاب (أكاديمية/غش/سلوك) ونشرها | `student_affairs` app: Regulation, StudentCase, ExamMisconductReport |
| D20 | **لوحة رئيس القسم لا تتغير طريقة عملها** | نفس الأقسام والتدفقات الحالية بالهوية الجديدة + إضافات فقط (انظر 4.15) |

> تفاصيل الأدوار الكاملة (14 دورًا) في `roles-and-permissions-report.md` v2.1 — هو المرجع عند أي تعارض.

**تفسيري لنقطتين غامضتين (صحّحني إن أخطأت):**
- «أمين الشؤون العلمية إلى الأساتذة» = دور يدير شؤون الأساتذة (تعيين على المواد، متابعة الأداء) ويرسل إشعارات للأساتذة فقط.
- «تنبيه فقط بشأن موضوع معين» للموارد البشرية = HR لا يرسل إعلانات عامة، بل تنبيهًا موجّهًا لأستاذ بعينه (مثلًا: نقص في رفع المحاضرات) ويُحفظ في ملف الأستاذ.

---

## 2. التقنيات المختارة ولماذا

### Backend
| التقنية | الدور | السبب |
|---|---|---|
| Django 6 + DRF | API | الأساس الحالي؛ Admin مجاني للفريق؛ Permissions/Groups جاهزة |
| PostgreSQL 16 | قاعدة البيانات | JSONB للحقول المرنة (نماذج القبول، إجابات الاختبارات)، قيود قوية |
| Redis 7 | Cache + Throttle + Broker | – |
| Celery + Celery Beat | مهام الخلفية | الاستيراد، الإشعارات/Push، إغلاق الاختبارات، إعادة بناء الموقع، الفحص والتقارير |
| SimpleJWT (كوكيز HttpOnly) + token_blacklist | المصادقة | الإبقاء على النمط الحالي مع إصلاحه؛ مناسب لـ PWA على نطاق البوابة |
| django-anymail + Brevo/Resend (أو SMTP) | البريد | OTP، الإشعارات، رسائل القبول؛ قابل للتبديل |
| pywebpush (VAPID) | Web Push | مجاني، بلا FCM |
| drf-spectacular | OpenAPI | توليد Client للواجهتين |
| phonenumbers | تطبيع الهواتف | WhatsApp آمن |
| python-magic | فحص نوع الملفات | رفع آمن |
| openpyxl | Excel | استيراد الطلاب والنتائج |
| WeasyPrint | PDF على الخادم | كشوف النتائج وتقارير HR بالعربية |
| django-filter | فلاتر/بحث موحدة | – |
| pytest-django + factory-boy | اختبارات | مصفوفة صلاحيات آلية لكل Endpoint × دور |
| Bunny Storage (منطقتان: public/private بـ Token Auth) + Bunny Stream (TUS) | الملفات والفيديو | الحالي مع تأمينه |

### Frontend (Monorepo بـ pnpm workspaces)
| الحزمة | التقنية | السبب |
|---|---|---|
| `apps/portal` (البوابة) | React 19 + Vite + **TypeScript** + Tailwind 4 + react-router + TanStack Query (كل بيانات الخادم بما فيها `/me` والإشعارات) + Context صغير (ثيم/لغة) + react-hook-form + zod + vite-plugin-pwa (Workbox) | التطبيق الحالي مع TS وطبقة بيانات موحدة وPWA؛ بلا مكتبة حالة عامة |
| `apps/landing` (الموقع العام) | **Astro** (SSG) + React islands + Tailwind | أفضل SEO وأداء على إنترنت ضعيف؛ صفحات ثابتة تُبنى من `/api/public/*` عند كل نشر (Webhook)؛ الأجزاء التفاعلية (التقديم، التواصل، البحث) جزر React تستدعي الـ API مباشرة |
| `packages/ui` | مكوّنات React + Tokens (CSS variables) | هوية واحدة للبوابة والموقع |
| `packages/api` | Client مولَّد من OpenAPI (`openapi-typescript` + fetch wrapper) | أنواع مشتركة، لا تكرار |
| `packages/config` | tsconfig/eslint/tailwind preset | – |

### أدوات
خدمات Homebrew محلية بلا Docker (postgresql@16، redis، mailpit لمعاينة البريد) تُدار بـ `brew services` وسكربت `scripts/dev.sh` يشغّل الخادم وCelery والواجهات معًا، GitHub Actions (lint + tests + build بخدمات Postgres/Redis المدمجة في الـ Runner)، pre-commit (ruff, black, eslint, prettier).

---

## 3. الهيكل الأكاديمي والأدوار

### 3.1 الكيانات (تعريف واحد لكل مصطلح)
```
College (سجل واحد الآن، قابل للتعدد)
 └─ Department
     └─ Program (بكالوريوس تقنية معلومات…) — levels_count, degree
AcademicYear (2026/2027) ─< Term (خريف/ربيع/صيف; is_current)
Course (كتالوج: code unique per department, name, credit_hours, program, default_level)
CourseOffering (course + term + section; instructors: teacher/ta)
StudentRecord (university_number unique, full_name, program, level, status active|suspended|graduated|withdrawn, user 1─1 nullable, application nullable)
Enrollment (student_record + offering; status; source manual|bulk|auto-by-level)
Cohort = (program, level, term) — مشتق، لا جدول (يُستخدم لاستهداف الإشعارات وغرف الروابط)
```

### 3.2 الأدوار (Groups) والنطاق (`RoleAssignment(user, role, college|department|null)`)
| الدور | النطاق | القدرات الأساسية | يرسل إشعارات إلى |
|---|---|---|---|
| `system_admin` | الكل | كل شيء + المستخدمون والأدوار | الكل |
| `head_registrar` (مسؤول المسجلين) | كلية | كل طلبات القبول وتوزيعها، دورات القبول والبرامج المفتوحة، قوالب نماذج التقديم، تعيين المسجلين، استيراد الطلاب، اعتماد التسجيلات، الرقم الجامعي، Enrollment، الحالة الأكاديمية | الطلاب، المتقدمون، المسجلون |
| `registrar` (مسجل قسم) | قسم/أقسام | طلبات برامج أقسامه: مراجعة، تغيير حالة، طلب مستندات، التواصل مع المتقدمين والزوار المستفسرين عن أقسامه فقط | متقدمو أقسامه |
| `results_officer` (مسؤول النتائج) | كلية | رفع ملف نتائج جاهز لأي قسم ونشره، طلب تعديل فردي (يوافق عليه أمين الشؤون العلمية)، إعدادات عرض النتائج | (تلقائي) الطلاب المعنيون |
| `student_affairs` (أمين شؤون الطلاب) | كلية | اللوائح والضوابط وإقراراتها، حالات الطلاب (أكاديمية/غش/سلوك) ونشرها، بلاغات الغش، إيقاف/رفع إيقاف | الطلاب (أي نطاق أو فرد) |
| `academic_affairs` (أمين الشؤون العلمية) | كلية | حسابات الأساتذة، تعيين/إزالة مديري ومشرفي الأقسام، تعيين على المواد، متابعة الرفع والتصحيح، تقارير الأداء | الأساتذة والمعيدون |
| `department_manager` | قسم | المواد والتقديمات، إضافة/إزالة أساتذة القسم، تعيينهم على المواد، تقارير قسمه، اعتماد تسجيلات طلاب قسمه، الحذف داخل قسمه | طلاب وأساتذة قسمه |
| `department_supervisor` (مشرف القسم) | قسم | كل صلاحيات مدير القسم عدا أي حذف/إزالة | طلاب وأساتذة قسمه |
| `teacher` | مواده | محاضرات، واجبات، اختبارات، تصحيح، جلسات بث، إعلانات مادة | طلاب مواده |
| `ta` | مواده | مثل الأستاذ بلا حذف ولا نشر نتائج؛ التصحيح حسب إعداد المادة | طلاب مواده |
| `student` | ذاته | التعلّم | – |
| `hr` (الموارد البشرية) | كلية | تقارير أداء الأساتذة (قراءة) + تنبيه موجّه لأستاذ محدد | أستاذ محدد (تنبيه مسجَّل) |
| `site_manager` (مدير الموقع) | – | صفحات الموقع، الإعدادات، الإعلانات العامة، الاستفسارات | الجميع (إعلان عام) |
| `events_manager` (مدير الفعاليات) | – | الفعاليات، الأخبار | الجميع (إعلان فعالية) |

`inquiries_officer` من المواصفة الأصلية: أُدمج في `site_manager` (الاستفسارات العامة) و`registrar`/`head_registrar` (استفسارات القبول والبرامج) لتجنّب دور زائد؛ يمكن فصله لاحقًا بمجرد إنشاء Group.

**العدد النهائي: 14 دورًا** + الزائر (بلا حساب، هوية `Contact` بـ OTP).

---

## 4. تصميم الوحدات

### 4.1 `organization` — College, Department, Program, SiteSettings
### 4.2 `academic` — AcademicYear, Term, Course, CourseOffering, OfferingInstructor, Enrollment
### 4.3 `students` + `accounts` — الهوية والتسجيل
- `StudentRecord` من الاستيراد فقط. عمود البريد في الملف اختياري.
- **التسجيل:** الطالب يدخل الرقم الجامعي + الاسم + بريده → يُرسل OTP (6 أرقام، 10 دقائق، 5 محاولات، Throttle) → يضع كلمة المرور → الحساب بحالة:
  - `active` فورًا إذا كان البريد في الملف الرسمي مطابقًا، **أو**
  - `pending_approval` ويظهر لمدير/مشرف القسم (ومسؤول المسجلين كبديل) في قائمة اعتماد بزر واحد — وذلك عندما يكون إعداد النظام `student_registration_requires_approval` **مفعّلًا** (يبدّله مدير النظام؛ معطّل → الحساب فعّال فور OTP).
- حساب واحد لكل سجل؛ رسائل خطأ موحّدة لا تكشف السبب؛ إشعار للمسجل عند أي تسجيل.
- المستوى/البرنامج/الاسم لا يعدّلها الطالب.
### 4.4 `rbac` — RoleAssignment + `ScopedPermission` + Managers `for_user()` + مصفوفة اختبار آلية.
### 4.5 `audit` — AuditLog(actor, action, target, old JSON, new JSON, ip, at)؛ يُكتب من طبقة Services.
### 4.6 `learning` — Lecture, LectureResource(file|video|link, private), Assignment (أنواع/حجم/روابط مسماة/Late policy/إعادة تسليم/إصدارات), Submission, SubmissionVersion, SubmissionGrade (manual|rule|ai_suggested→approved).
### 4.7 `exams` — Exam, Question(type registry), Choice, ExamAttempt (زمن الخادم، Autosave، Auto-submit), StudentAnswer، إحصاءات.
### 4.8 `results` — ResultImportBatch(scope: college|department, uploaded_by)/Row, AcademicResult(student_record, offering, term, version), **ResultCorrection**(result, requested_by=results_officer, old, new, reason, status pending|approved|rejected, decided_by=academic_affairs), GradingScale(program), ResultDisplaySettings, TermResultRelease.
- **الرفع:** ملف جاهز فقط (لا إدخال يدوي): `results_officer` لأي قسم؛ `department_manager/supervisor` لمواد قسمه. تحقق → معاينة → اعتماد ونشر في النطاق.
- **التعديل:** طلب من مسؤول النتائج → موافقة أمين الشؤون العلمية → تطبيق بنسخة + AuditLog + إشعار الطالب.
### 4.8b `student_affairs` — Regulation(title, body/file, category, version, effective_from, requires_acknowledgement, status) + RegulationAcknowledgement(student, regulation, at); StudentCase(student, kind academic|exam_misconduct|conduct|welfare, description, attachments private, decision, sanction, effective_from/to, status open|decided|closed, published_to_student) + StudentCaseEvent; ExamMisconductReport(attempt/exam, reported_by teacher, evidence, status) → يتحول إلى StudentCase. القرار قد يغيّر `StudentRecord.status` (suspended) أو يمنع مقررًا.
### 4.9 `live` — LiveSession(scope: offering|cohort, provider teams|meet|zoom|other, join_url, starts_at, ends_at, host, recording_url nullable). الرابط لا يُعاد إلا لمن له صلاحية؛ إشعار قبل 30 دقيقة (Beat).
### 4.10 `contacts` — هوية الزائر
- `Contact(email, phone_e164, name, email_verified_at, phone_verified_at)` يُطابَق/يُنشأ عند أي تقديم أو استفسار.
- `ContactOTP` (بريد / SMS أو WhatsApp) + `VisitorSession` (JWT قصير، نطاق `contact:{id}`, 30 دقيقة).
- صفحة "متابعة طلبي" في الموقع العام: بريد أو هاتف → OTP → كل طلباته واستفساراته، سجل الحالات، رفع مستند ناقص، الرد، سحب طلب. الرقم المرجعي وحده → الحالة فقط. **الاسم ليس مفتاح بحث للزوار.**
### 4.11 `admissions`
- `AdmissionCycle`, `ProgramIntake(form_template override)`, `ApplicationFormTemplate(version, schema JSON, status)` + منشئ نماذج مرئي (خطوات/أقسام/حقول، أنواع متعددة، شرطية، ملفات)؛ الحقول الثابتة: الاسم، البريد، الهاتف، البرنامج.
- `Application(contact FK, intake, form_template_version, answers JSON, reference_no, status, assigned_registrar)`، `ApplicationDocument` (private)، `ApplicationStatusHistory` (append-only)، `ApplicationMessage` (مسجل ↔ متقدم)، `ApplicationAssignment`.
- **التوجيه:** طلب → مسجلو قسم البرنامج؛ لا مسجل → مسؤول المسجلين. التولّي والتوزيع وإعادة التوزيع.
- State machine + صلاحية القرار النهائي لمسؤول المسجلين (تفويض للمسجلين بإعداد).
- `register_applicant` (مسؤول المسجلين) → `StudentRecord` → الرقم الجامعي → تفعيل.
### 4.12 `inquiries` — `Inquiry(contact FK, type, department NULL, status, assigned_to, source)` + `InquiryMessage` + `InquiryStatusHistory`. التوجيه: قبول/برامج + قسم → مسجلو القسم؛ بلا قسم → مسؤول المسجلين؛ باقي الأنواع → مدير الموقع (يستطيع إعادة التوجيه). WhatsApp من الرقم المُطبَّع فقط، رد بريدي صادر، تظهر الردود في صفحة متابعة الزائر.
### 4.13 `content` — Page (Blocks JSON), Announcement (scope/audience/schedule/expiry/featured), Event, News, MediaAsset, Menu/NavItem, SiteSettings؛ عند النشر → Celery يطلق Webhook إعادة بناء الموقع العام.
### 4.15 لوحة رئيس القسم — ضابط ثبات
تُعاد بنفس الأقسام والترتيب والتدفقات الموجودة اليوم في `Dashboard.jsx` لدور `department_manager`: **الرئيسية، المواد، المحاضرات، الأساتذة، طلاب القسم، التقارير، النتائج، سجل العمليات، موادي** — كل صفحة تحتفظ بوظيفتها الحالية (إنشاء المادة وتعيين الأساتذة من نفس الشاشة، محاضرات القسم مع الإحصاءات، قائمة الأساتذة وتفاصيلهم، بحث/فلترة الطلاب ورفعهم، التقارير بالمرشحات نفسها، النتائج، السجل) مع الهوية الجديدة والإصلاحات الأمنية والترقيم الصحيح. تُضاف تبويبات جديدة فقط: طلبات التسجيل، الاختبارات، جلسات البث، الإعلانات. مشرف القسم يرى اللوحة نفسها بلا أزرار حذف.
### 4.14 `reports` — تقارير الأقسام (المحسّنة من الحالية بلا N+1)، تقارير الشؤون العلمية، **تقارير أداء الأساتذة لـ HR** (مؤشرات لكل Term: محاضرات، واجبات، اختبارات، متوسط زمن التصحيح، نسبة غير المصحح، فجوات الرفع، جلسات معلنة، تنبيهات HR) + تصدير PDF.

---

## 5. الإشعارات و PWA

### 5.1 النموذج
```
Notification (sender, kind manual|system, category, title, body, action_url, audience JSON {type: offering|cohort|department|program|college|role|user, ids}, channels [inapp, push, email], created_at)
NotificationRecipient (notification, user, delivered_at, read_at)   -- يُولَّد في Celery حسب الجمهور
PushSubscription (user, endpoint unique, p256dh, auth, user_agent, created_at, last_success_at)
NotificationPreference (user, category, inapp/push/email bool)
HRNotice (teacher, sent_by, subject, body, acknowledged_at) → يولّد Notification(kind=hr_notice) ويبقى في ملف الأستاذ
```
### 5.2 المرسلون والجمهور المسموح (يُفرض في الخادم)
| المرسل | الجمهور |
|---|---|
| teacher/ta | طلاب Offering يدرّسه |
| department_manager | طلاب/أساتذة قسمه (كل القسم، مستوى، برنامج، مادة) |
| head_registrar | طلاب الكلية (كل/قسم/برنامج/مستوى)، المتقدمون، المسجلون |
| registrar | متقدمو أقسامه (بريد + صفحة المتابعة) |
| results_officer | (تلقائي) الطلاب المعنيون بنشر/تعديل نتيجة |
| academic_affairs | الأساتذة والمعيدون (كل/قسم) |
| events_manager / site_manager | الجميع (مرتبط بإعلان/فعالية منشورة) |
| hr | أستاذ محدد (HRNotice) |
| system_admin | أي جمهور |
### 5.3 الإشعارات التلقائية (Events داخلية)
محاضرة جديدة، واجب جديد، اقتراب موعد (24 ساعة)، تصحيح، اختبار منشور/يبدأ خلال ساعة، نتيجة منشورة، جلسة بث خلال 30 دقيقة، تغيير حالة طلب قبول، تسجيل طالب جديد (للمسجل)، تسليم جديد (للأستاذ اختياري).
### 5.4 القنوات
- **In-app:** جرس + قائمة + عدّاد (Polling كل 60 ثانية؛ SSE لاحقًا إن لزم).
- **Push:** Service Worker يستقبل ويعرض؛ النقر يفتح `action_url`؛ حذف الاشتراكات التي ترد 404/410.
- **Email:** للفئات المهمة (نتائج، قبول، OTP) وحسب التفضيل.
### 5.5 PWA
`manifest.webmanifest` (اسم، أيقونات، ألوان الهوية، `display: standalone`)، Workbox: precache للحزمة + `NetworkFirst` للـ API + صفحة Offline؛ شاشة إرشاد التثبيت (Android: Prompt، iPhone: "شارك → أضف إلى الشاشة الرئيسية" — Push على iOS يعمل فقط بعد التثبيت، iOS ≥ 16.4).

---

## 6. الموقع العام (Landing) و CMS

- **Astro SSG** ببناء يقرأ `/api/public/{settings,pages,programs,departments,announcements,events,news}` ويولّد صفحات ثابتة بعربية RTL وإنجليزية LTR (`/ar/...`, `/en/...`)، Sitemap، OpenGraph، Schema.org (`CollegeOrUniversity`, `Event`, `NewsArticle`)، صور محسّنة، Core Web Vitals.
- **إعادة البناء:** أي نشر من لوحة `content` → Celery → Deploy hook (Render Static / Cloudflare Pages) → موقع محدّث خلال دقيقة. الأجزاء الحيّة (نموذج التقديم، التواصل، حالة الطلب، البحث) جزر React تستدعي الـ API مباشرة.
- **الصفحات:** الرئيسية، عن الكلية (رؤية/رسالة/كلمة العميد)، الأقسام والبرامج (من DB)، القبول والتقديم (من `ProgramIntake`)، الأخبار، الإعلانات، الفعاليات، التواصل، سياسات.
- **لوحة فريق الموقع** داخل البوابة: محرر صفحات (Blocks: Hero, RichText, Cards, Gallery, CTA, FAQ)، وسائط، قوائم، إعدادات الموقع، معاينة قبل النشر، جدولة.

---

## 7. الهوية البصرية (أولّدها ثم تُطبَّق في `packages/ui`)

- **الألوان:** أبيض `#FFFFFF` كأساس للأسطح؛ أزرق غامق `#14284B` (Primary: العناوين، التنقل، الأزرار الأساسية)؛ أحمر غامق `#8A1C2B` (Accent: CTA، الشارات، الحالات المهمة)؛ رماديات محايدة للنصوص والحدود؛ ألوان دلالية (نجاح/تحذير/خطأ) متوافقة WCAG AA. وضع داكن اختياري لاحقًا.
- **الخط:** IBM Plex Sans Arabic (عربي + لاتيني متناسقان) مستضاف ذاتيًا (woff2).
- **Tokens:** `--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--font-*` في CSS variables + Tailwind preset.
- **المكوّنات:** Button, Input, Select, Textarea, Checkbox, Radio, Switch, Modal/Drawer (Focus trap), Toast, Table (responsive → بطاقات), Pagination, Tabs, Badge, EmptyState, Skeleton, FileDropzone (مع تقدم), DatePicker, Stepper (للتقديم), Notification bell.
- **RTL/LTR:** `dir` ديناميكي على `<html>`، خصائص منطقية فقط.
- **الشعار:** مكان محجوز (SVG) يُستبدل عند وصول شعارك؛ سأقترح تحسينًا له عند استلامه.

---

## 8. المراحل (بالاعتماديات، لا بالوقت)

كل مرحلة تنتهي بـ: Migrations، Seeds، اختبارات صلاحيات، توثيق API.

### Phase 0 — الأساس
- هيكلة Monorepo (`backend/`, `apps/portal`, `apps/landing`, `packages/*`)، لا `dist` في Git، خدمات Homebrew (postgresql@16 موجود؛ redis + mailpit) + `scripts/dev.sh`، pre-commit، CI.
- Backend جديد: إعدادات مقسمة (base/dev/test/prod)، Redis، Celery، Anymail، Storage خاص/عام، Throttling، CSP، Logging، drf-spectacular.
- **قبول:** `scripts/dev.sh` → API صحي على Postgres المحلي، اختبار واحد يمر، توليد Client من OpenAPI.

### Phase 1 — النواة
- `organization`, `academic`, `students`, `accounts` (تسجيل OTP + اعتماد)، `rbac`, `audit`.
- استيراد الطلاب (Validate → Preview → Commit).
- مصفوفة اختبار الصلاحيات (كل Endpoint × 10 أدوار).
- **قبول:** مسجل يرفع ملفًا، طالب يسجّل بـ OTP، مدير قسم يعتمده، الطالب يرى مواد Term الحالي عبر Enrollment.

### Phase 2 — التعلّم
- `learning`: محاضرات (Bunny private + Stream TUS)، واجبات v2، تسليم بإصدارات، تصحيح، Rule-based grading الأساسي.
- **قبول:** أستاذ يرفع فيديو 500MB مباشرة بلا مرور بالخادم؛ رابط ملف ينتهي بعد 10 دقائق؛ طالب لا يستطيع كتابة درجته (اختبار).

### Phase 3 — الإشعارات و PWA
- `notifications` كاملًا + Web Push + Service Worker + شاشة تثبيت + الإشعارات التلقائية للمراحل السابقة.
- **قبول:** أستاذ يرسل إشعارًا لمادته → يصل Push على Android وiPhone مثبَّت خلال ثوانٍ.

### Phase 4 — النتائج وشؤون الطلاب
- `results`: رفع ملف جاهز (مسؤول النتائج / رئيس القسم لقسمه) مع معاينة، مقياس تقدير، نشر لكل Term، طلب تعديل بموافقة أمين الشؤون العلمية، إعدادات العرض، عرض الطالب، كشف PDF.
- `student_affairs`: اللوائح والإقرارات، حالات الطلاب، بلاغات الغش (الربط بالاختبارات يكتمل في Phase 5)، الإشعارات التنظيمية.

### Phase 5 — الاختبارات
- `exams` كاملًا + اختبار حمل 500 متزامن محليًا (k6).

### Phase 6 — البث والمحتوى والاستفسارات
- `live` (روابط)، `content` (CMS + إعلانات + فعاليات + إعدادات)، `inquiries` (+ WhatsApp).

### Phase 7 — القبول والمسجلون
- `contacts` (OTP + صفحة المتابعة)، `admissions` (قوالب النماذج + المنشئ المرئي، الطلبات، التوجيه والتوزيع، التواصل)، لوحتا مسؤول المسجلين ومسجل القسم، التحويل إلى StudentRecord + التفعيل.
- ربط `inquiries` بـ `Contact` وتوجيه استفسارات القبول للمسجلين.

### Phase 8 — التقارير
- تقارير الأقسام، الشؤون العلمية، **HR** (أداء الأساتذة + تنبيهات)، تصدير PDF.

### Phase 9 — الموقع العام
- `apps/landing` بـ Astro، الهوية، SEO، إعادة البناء عند النشر، الجزر التفاعلية (التقديم/التواصل/متابعة الطلب).

### Phase 10 — واجهة البوابة بالهوية
- تطبيق `packages/ui` على كل صفحات البوابة، لوحة لكل دور، Accessibility، جداول متجاوبة، Onboarding للـ PWA.

### Phase 11 — التصلّب والنشر
- تغطية اختبارات، اختبار حمل، نسخ احتياطي/استعادة، Render (Web + Worker + Redis + Postgres مدفوعة) + Static للموقع + Cloudflare، توثيق تشغيل.

---

## 9. ما أحتاجه منك (ليس الآن بالضرورة)
1. الشعار (SVG/PNG عالي الدقة) — حين يجهز.
2. حساب بريد للإرسال (Brevo/Resend مجاني، أو SMTP نطاق الكلية) — قبل Phase 1 للـ OTP؛ محليًا أستخدم Mailpit.
3. أسماء الأقسام والبرامج والفصول الحقيقية (أو أضع بيانات تجريبية وتستبدلها).
4. تأكيد تفسيري للدورين `academic_affairs` و`hr`.
5. الموافقة على بدء Phase 0.
