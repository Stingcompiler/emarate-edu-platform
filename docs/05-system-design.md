# تصميم النظام — System Design

> إصدار 1.0 — 2026-09-27. مرجع البناء التقني. يعتمد على `02-build-plan.md` (القرارات D1–D21) و`03-roles-and-permissions.md` v2.1 (الأدوار). عند التعارض: الأدوار ← 03، القرارات ← 02، التقنية ← هذا المستند.

---

## 1. الهدف والمبادئ

المنصة = **موقع عام** (تعريف، برامج، قبول، تواصل) + **بوابة أكاديمية** (طلاب، أساتذة، إدارة) على **Backend واحد**.

| المبدأ | التطبيق |
|---|---|
| الخادم هو المرجع | كل صلاحية، كل حالة، كل زمن (اختبار/مواعيد) يُحسم في الخادم؛ الواجهة تعرض فقط. |
| كيان واحد لكل مفهوم | هوية الطالب = `StudentRecord` وحدها؛ المستخدم `User` للدخول فقط؛ الزائر `Contact` بلا حساب. |
| البُعد الزمني صريح | كل نشاط أكاديمي يرتبط بـ `Term` عبر `CourseOffering`؛ لا "سنة" بمعنى مزدوج. |
| الحالات آلات صريحة | جدول انتقالات واحد لكل كيان + تاريخ append-only + صلاحية لكل انتقال. |
| كل عملية حساسة مسجَّلة | `AuditLog` بقيم قبل/بعد من طبقة Services. |
| ما يزيد عن ثانية يذهب للخلفية | Celery (Eager في التطوير). |
| توافق SQLite/Postgres | التطوير على SQLite، الإنتاج على Postgres؛ الكود يلتزم بالمشترك (§4). |
| الملفات خاصة افتراضيًا | لا رابط مباشر لملف طالب أو محاضرة؛ روابط موقّعة قصيرة العمر. |

---

## 2. السياق

```
الزائر ──▶ الموقع العام (Astro ثابت) ──▶ /api/public  ┐
الطالب/الأستاذ/الإدارة ──▶ البوابة (React PWA) ──▶ /api/v1 ┼──▶ Django API ──▶ DB (SQLite dev / Postgres prod)
                                                        │              ├──▶ Celery (Eager dev / Redis prod)
                                                        │              ├──▶ الملفات (media/ dev / Bunny prod)
                                                        │              ├──▶ البريد (Console dev / Anymail prod)
                                                        │              └──▶ Web Push (VAPID)
خارجي: Teams/Meet/Zoom (روابط فقط) · WhatsApp (روابط wa.me) · Bunny Stream (فيديو، إنتاج) · GitHub Actions/CDN (إعادة بناء الموقع)
```

---

## 3. المكوّنات والمسؤوليات

| المكوّن | التقنية | المسؤولية | لا يفعل |
|---|---|---|---|
| `apps/landing` | Astro SSG + React islands | صفحات عامة ثابتة من `/api/public` وقت البناء؛ جزر: التقديم، التواصل، متابعة الطلب | لا مصادقة، لا كوكيز |
| `apps/portal` | React 19 + Vite + TS + PWA | كل شاشات الأدوار الـ 14؛ إشعارات Push | لا منطق أعمال، لا حساب صلاحيات |
| `backend` | Django 6 + DRF | كل المنطق، الصلاحيات، الحالات، التدقيق، الملفات، الإشعارات، OpenAPI | لا HTML (إلا Admin وPDF) |
| Celery | Eager (dev) / Redis (prod) | استيراد، إشعارات، إغلاق اختبارات، PDF، إعادة بناء الموقع | – |
| التخزين | `media/` (dev) / Bunny (prod) خلف واجهة `MediaService` | حفظ الملفات وإصدار روابط موقّعة | – |
| `packages/ui` | React + Tokens | مكوّنات الهوية (`06-design-system.md`) | – |
| `packages/api` | openapi-typescript | أنواع وClient مولَّدان من الخادم | – |

---

## 4. البيئات وقواعد التوافق SQLite ↔ PostgreSQL

| العنصر | التطوير (`settings/dev.py`) | الإنتاج (`settings/prod.py`) |
|---|---|---|
| قاعدة البيانات | SQLite `backend/db.sqlite3` (WAL، `foreign_keys=ON`) | PostgreSQL 16 (`DATABASE_URL`) |
| Celery | `task_always_eager=True` | Redis broker + Workers + Beat |
| Cache/Throttle | LocMem | Redis |
| البريد | Console (+ ملف `backend/sent-emails/`) | Anymail (Brevo/Resend/SMTP) |
| الملفات | `backend/media/` عبر `MediaService` بروابط موقّعة محليًا (`/media/signed/...`) | Bunny Storage خاص/عام + Bunny Stream |
| Push | مفاتيح VAPID تطويرية | VAPID إنتاجية |
| Static | Vite dev server | CDN |

**قواعد الالتزام بالمشترك (تُفرض بـ CI الذي يشغّل الاختبارات على المحرّكين):**
1. `models.JSONField` فقط (يعمل على SQLite JSON1 وPostgres JSONB)؛ لا `ArrayField`/`HStoreField`/`contrib.postgres` في الـ Models.
2. القيود: `UniqueConstraint`, `CheckConstraint`, فهارس عادية فقط؛ الفهارس الجزئية/GIN/`pg_trgm` تُضاف في Migration مشروطة `if schema_editor.connection.vendor == "postgresql"`.
3. البحث: `icontains` افتراضيًا؛ تحسين Postgres (trigram/FTS) خلف `if connection.vendor == "postgresql"` داخل Selector واحد.
4. `select_for_update` يُستخدم حيث يلزم (يعمل في Postgres، يتجاهله SQLite) — ولذلك كل عملية حرجة تعتمد أيضًا على قيد فريد أو تحقق حالة داخل `transaction.atomic`.
5. الزمن: تخزين UTC (`USE_TZ=True`)، العرض بـ `Africa/Khartoum`.
6. الأرقام العشرية: `DecimalField(max_digits=6, decimal_places=2)` (SQLite يخزّنها نصًا — Django يعالجها).
7. لا Triggers ولا Views في قاعدة البيانات؛ كل المنطق في Python.
8. Migrations قابلة للعكس وتُختبر على المحرّكين.

---

## 5. بنية الـ Backend

```
backend/
  config/            settings/{base,dev,prod,test}.py, urls.py, celery.py, asgi/wsgi
  core/              mixins (Timestamped, PublicId), audit, permissions (ScopedPermission), pagination, exceptions (problem+json), media (MediaService), state (StateMachine), i18n helpers
  organization/      College, Department, Program, SiteSettings, SystemSettings
  academic/          AcademicYear, Term, Course, CourseOffering, OfferingInstructor, Enrollment, DepartmentMembership
  accounts/          User, RoleAssignment, OTP, ActivationToken, RegistrationRequest, PasswordReset
  students/          StudentRecord, StudentImportBatch/Row, UniversityNumberSequence
  contacts/          Contact, ContactOTP, VisitorSession
  admissions/        AdmissionCycle, ProgramIntake, ApplicationFormTemplate, Application, ApplicationDocument, ApplicationStatusHistory, ApplicationMessage, ApplicationAssignment
  learning/          Lecture, LectureResource, Assignment, AssignmentLinkField, Submission, SubmissionVersion, SubmissionGrade
  exams/             Exam, Question, Choice, ExamAttempt, StudentAnswer, question_types/ (registry)
  results/           ResultImportBatch/Row, AcademicResult, ResultCorrection, GradingScale, ResultDisplaySettings, TermResultRelease
  live/              LiveSession
  student_affairs/   Regulation, RegulationAcknowledgement, StudentCase, StudentCaseEvent, ExamMisconductReport
  inquiries/         Inquiry, InquiryMessage, InquiryStatusHistory
  content/           Page, Announcement, News, Event, MediaAsset, Menu, Redirect
  notifications/     Notification, NotificationRecipient, PushSubscription, NotificationPreference, HRNotice, Outbox
  reports/           selectors + PDF (WeasyPrint)
  audit/             AuditLog
```

**الطبقات داخل كل تطبيق:** `models.py` (بيانات وقيود فقط) → `selectors.py` (استعلامات قراءة، منها `for_user`) → `services.py` (عمليات الكتابة والانتقالات، داخل `transaction.atomic`، تكتب Audit وتطلق Events) → `serializers.py` → `views.py` (رقيقة: تحقق الصلاحية → استدعاء Service) → `tasks.py` → `permissions.py` (`required_perms` + `scope_of`) → `tests/`.

**اتفاقيات:** كل Model يرث `Timestamped` (`created_at/updated_at`) و`PublicId` (`public_id` UUID للاستخدام في الروابط والـ API بدل الـ PK التسلسلي حيث تُعرض للخارج: الطلبات، الاستفسارات، الملفات). النصوص ثنائية اللغة بحقلين `name_ar`/`name_en` (الإنجليزية اختيارية وتعود للعربية). لا Soft delete عام؛ الكيانات التي تُحذف منطقيًا لها `status=archived`.

---

## 6. نموذج البيانات الموحّد (الحقول الأساسية)

الترميز: `→` FK، `⇄` 1:1، `[u]` فريد، `(idx)` فهرس.

### organization
- **College**: name_ar/en, code[u], logo, is_active — سجل واحد الآن.
- **Department**: college→, name_ar/en, code[u per college], description, is_active.
- **Program**: department→, name_ar/en, code[u], degree {diploma|bachelor|honours|master}, levels_count, duration_terms, is_active.
- **SiteSettings** (singleton): institution names, contact, social, whatsapp_e164, seo defaults.
- **SystemSettings** (singleton): student_registration_requires_approval, applications_fallback_to_head_registrar, delegate_decisions_to_registrars, otp_ttl, max_applications_per_cycle.

### academic
- **AcademicYear**: name "2026/2027"[u], starts_on, ends_on, is_current.
- **Term**: academic_year→, name_ar/en, order, starts_on, ends_on, is_current (واحد فقط)، status {planned|active|closed}.
- **Course**: department→, program→(nullable), code, name_ar/en, credit_hours, default_level, default_term_order; [u (department, code)].
- **CourseOffering**: course→, term→, section "A", capacity, ta_can_grade, status {draft|active|closed}; [u (course, term, section)].
- **OfferingInstructor**: offering→, user→, role {teacher|ta}; [u (offering, user)].
- **DepartmentMembership**: department→, user→, kind {teacher|ta}, added_by→; [u (department, user)].
- **Enrollment**: offering→, student_record→, status {active|dropped|completed}, source {manual|bulk|auto}; [u (offering, student_record)].

### accounts
- **User** (AbstractUser): email[u], full_name_ar/en, phone_e164, avatar, is_active, must_change_password, last_seen. لا حقل `role`.
- **RoleAssignment**: user→, role (Group)→, college→(null), department→(null), created_by→; [u (user, role, department)].
- **OTP**: purpose {register|login_reset|contact}, target (email/phone), code_hash, expires_at, attempts, used_at (idx target).
- **RegistrationRequest**: student_record⇄, email, status {otp_pending|pending_approval|approved|rejected}, decided_by→, decided_at, reason.
- **ActivationToken**: student_record→, token_hash[u], expires_at, used_at.

### students
- **StudentRecord**: university_number[u], full_name_ar/en, program→, department→ (denormalized), level, status {active|suspended|graduated|withdrawn}, user⇄(null), application→(null), email, phone_e164, birth_date, gender, nationality, national_id_hash, admitted_term→, notes. (idx program, level, status)
- **StudentImportBatch**: file, uploaded_by→, status {uploaded|validated|has_errors|committed|rejected}, summary JSON. **StudentImportRow**: batch→, row_no, raw JSON, normalized JSON, action {create|update|skip|error}, errors JSON.
- **UniversityNumberSequence**: college→, year, prefix, last_value; [u (college, year, prefix)].

### contacts
- **Contact**: email[u null], phone_e164[u null], name, email_verified_at, phone_verified_at.
- **VisitorSession**: contact→, token_hash[u], expires_at, ip.

### admissions
- **AdmissionCycle**: academic_year→, name, opens_at, closes_at, is_active.
- **ApplicationFormTemplate**: name, version, status {draft|published|retired}, schema JSON, created_by→; [u (name, version)].
- **ProgramIntake**: cycle→, program→, form_template→(null=الافتراضي), is_open, opens_at, closes_at, capacity, requirements_ar/en, required_documents JSON; [u (cycle, program)].
- **Application**: public_id, reference_no[u], contact→, intake→, form_template_version, answers JSON, status, assigned_registrar→(null), submitted_at, decided_by→, decided_at, decision_note, student_record⇄(null). (idx intake+status, contact)
- **ApplicationDocument**: application→, doc_type, file (خاص), status {pending|accepted|rejected}, note.
- **ApplicationStatusHistory**: application→, from_status, to_status, changed_by→(null=المتقدم), note, at — append-only.
- **ApplicationMessage**: application→, author→(null=المتقدم), channel {portal|email|whatsapp_note|internal}, body, sent_at.
- **ApplicationAssignment**: application→, registrar→, assigned_by→, at.

### learning
- **Lecture**: offering→, title_ar/en, description, order, type {theory|lab}, is_published, published_at.
- **LectureResource**: lecture→, kind {file|video|link|recording}, file (خاص) / bunny_video_id / url, title, size, mime, order.
- **Assignment**: offering→, lecture→(null), title, description, type, opens_at, due_at, late_until, late_policy {none|allow|penalty}, late_penalty_percent, max_grade, submission_types JSON, allowed_extensions JSON, max_file_size_mb, max_files, allow_resubmission, grading_mode {manual|rule|ai_assisted}, rubric JSON, status {draft|published|closed}.
- **AssignmentLinkField**: assignment→, label, required, url_pattern.
- **Submission**: assignment→, student_record→, current_version→, first_submitted_at, is_late; [u (assignment, student_record)].
- **SubmissionVersion**: submission→, version_no, content, files JSON, links JSON, submitted_at, is_late.
- **SubmissionGrade**: submission⇄, score, feedback, rubric_scores JSON, source {manual|rule|ai_suggested}, status {suggested|approved}, graded_by→, graded_at.

### exams
- **Exam**: offering→, title, description, start_at, end_at, duration_minutes, total_marks, pass_marks, max_attempts, result_visibility {immediate|after_end|manual}, allow_backtrack, shuffle_questions, shuffle_choices, grace_seconds, status {draft|published|closed|archived}, created_by→.
- **Question**: exam→, order, type, text, marks, explanation, config JSON, is_required. **Choice**: question→, order, text, is_correct.
- **ExamAttempt**: exam→, student_record→, attempt_no, started_at, deadline_at, submitted_at, status {in_progress|submitted|auto_submitted|expired|invalidated}, score, passed, question_order JSON, choice_orders JSON, client_meta JSON, last_saved_at; [u (exam, student_record, attempt_no)].
- **StudentAnswer**: attempt→, question→, answer JSON, saved_at, is_correct, marks_awarded, needs_manual, graded_by→, graded_at; [u (attempt, question)].

### results
- **ResultImportBatch**: file, scope {college|department}, department→(null), term→, uploaded_by→, status {uploaded|validated|has_errors|committed|published|unpublished|rejected}, detected_columns JSON, summary JSON. **ResultImportRow**: batch→, row_no, raw JSON, student_record→(null), offering→(null), normalized JSON, action, errors JSON.
- **AcademicResult**: student_record→, offering→, term→ (denorm), score, letter, grade_points, status {pass|fail|incomplete|withdrawn|absent}, is_published, published_at, published_by→, import_batch→, version; [u (student_record, offering)].
- **ResultCorrection**: result→, requested_by→, old JSON, new JSON, reason, status {pending|approved|rejected}, decided_by→, decided_at, decision_note.
- **GradingScale**: program→(null=افتراضي), ranges JSON. **ResultDisplaySettings** (singleton per college). **TermResultRelease**: term→, program→(null), is_visible, released_at, released_by→.

### live
- **LiveSession**: scope {offering|cohort}, offering→(null), department→/program→/level (للـ cohort), title, provider {teams|meet|zoom|other}, join_url (مشفّر في الراحة), starts_at, ends_at, host→, status {scheduled|live|ended|cancelled}, recording_url. CHECK: نطاق واحد بالضبط.

### student_affairs
- **Regulation**: title, body, file, category, version, effective_from, requires_acknowledgement, status {draft|published|superseded}. **RegulationAcknowledgement**: regulation→, student_record→, at; [u].
- **StudentCase**: student_record→, kind {academic|exam_misconduct|conduct|welfare}, title, description, attachments JSON (خاص), decision, sanction, effective_from, effective_to, status {open|decided|closed}, published_to_student, opened_by→. **StudentCaseEvent**: case→, kind, note, by→, at.
- **ExamMisconductReport**: attempt→(null), exam→, student_record→, reported_by→, evidence, status {new|converted|dismissed}, case→(null).

### inquiries
- **Inquiry**: public_id, reference_no[u], contact→, type {admission|registration|fees|programs|study|technical|general}, department→(null), subject, message, status {new|in_progress|waiting_for_user|resolved|closed}, assigned_to→, source, first_response_at, resolved_at. **InquiryMessage**: inquiry→, author→(null), channel, body, sent_at. **InquiryStatusHistory**.

### content
- **Page**: slug[u], title_ar/en, blocks JSON, seo JSON, status {draft|scheduled|published|archived}, publish_at, author→. **Announcement**: scope {university|college|department|program|offering}, scope_id, audience {public|students|staff|all_internal}, title, body, status, publish_at, expires_at, is_featured, is_pinned, cover→, attachments JSON. **News**: slug, title, body, cover, status, publish_at. **Event**: slug, title, description, starts_at, ends_at, location, cover, registration_url, status. **MediaAsset**: file (عام), alt_ar/en, width, height. **Menu/MenuItem**. **Redirect**: from_path[u], to_path.

### notifications
- **Notification**: sender→(null=النظام), kind {manual|system|hr_notice}, category, title, body, action_url, audience JSON, channels JSON. **NotificationRecipient**: notification→, user→, delivered_at, read_at; [u]. **PushSubscription**: user→, endpoint[u], p256dh, auth, user_agent, last_success_at. **NotificationPreference**: user→, category, inapp, push, email. **HRNotice**: teacher→, sent_by→, subject, body, requires_ack, acknowledged_at, notification→. **Outbox**: channel, payload JSON, status, attempts, next_try_at.

### audit
- **AuditLog**: actor→(null), action, target_type, target_id, target_repr, old JSON, new JSON, ip, user_agent, at (idx target, actor, at). لا يُحذف أبدًا.

---

## 7. تصميم الـ API

| الجانب | القرار |
|---|---|
| المسارات | `/api/v1/...` (مصادق) و`/api/public/...` (عام، AllowAny، Cache-Control، Throttle)؛ `/api/visitor/...` (جلسة الزائر بعد OTP). |
| المصادقة | كوكيز HttpOnly `access` (15 دقيقة) + `refresh` (7 أيام، دوّار، Blacklist عند الخروج/الدوران)؛ `SameSite=Lax`؛ CSRF Header مزدوج (`X-CSRFToken`) على كل طلب مُعدِّل؛ الزائر: Bearer JWT قصير بنطاق `contact:{id}`. |
| `/api/v1/me` | يعيد المستخدم + الأدوار بنطاقاتها + قائمة الصلاحيات المسطّحة + الإعدادات المؤثرة على الواجهة. |
| الترقيم | `?page=&page_size=` (افتراضي 25، أقصى 100) للقوائم الإدارية؛ Cursor (`?cursor=`) للأسفل اللانهائي (الإشعارات، السجل). الاستجابة `{count, next, previous, results}`. |
| الفلترة/الفرز/البحث | `django-filter` معلَن لكل View؛ `?ordering=`؛ `?search=`. |
| الأخطاء | `application/problem+json` (RFC 9457): `{type, title, status, detail, errors:{field:[...]}, code}`؛ رسائل عربية/إنجليزية حسب `Accept-Language`. |
| الحالات | أفعال صريحة: `POST /applications/{id}/transition {to, note}`؛ الاستجابة تحمل `allowed_transitions`. |
| Idempotency | Header `Idempotency-Key` مطلوب على: تسليم اختبار، إرسال طلب تقديم، اعتماد استيراد، إرسال إشعار. يُخزَّن 24 ساعة. |
| الحدود | Throttle: عام 60/دقيقة للمستخدم؛ OTP 5/ساعة للهدف؛ login 10/دقيقة للـ IP؛ التواصل 5/ساعة؛ Autosave 30/دقيقة للمحاولة. |
| الملفات | الرفع عبر `POST /files` (multipart، تحقق نوع/حجم) يعيد `file_id`؛ الوصول عبر `GET /files/{id}/url` يعيد رابطًا موقّعًا (10 دقائق) بعد تحقق الصلاحية. الفيديو: `POST /videos/upload-ticket` (Bunny Stream TUS في الإنتاج؛ رفع محلي في التطوير). |
| الإصدار والتوثيق | drf-spectacular → `/api/schema` + Swagger UI في التطوير؛ `packages/api` يولَّد منه في CI. |
| الحقول ثنائية اللغة | تُرسل الحقول كلها (`name_ar`, `name_en`) + حقل مشتق `name` حسب اللغة. |
| الزمن | ISO-8601 بـ UTC؛ الخادم يرسل `server_time` في استجابات الاختبار. |

---

## 8. التدفقات الرئيسية

### 8.1 تسجيل طالب حالي
1. `POST /api/public/registration/start {university_number, full_name, email}` → مطابقة السجل (رسالة موحّدة عند الفشل) → إنشاء `RegistrationRequest(otp_pending)` + `OTP(email)` → بريد.
2. `POST .../verify {request_id, code}` → تحقق (5 محاولات، 10 دقائق).
3. `POST .../complete {password}` → إنشاء `User` مرتبط بـ `StudentRecord`؛ إن كان `student_registration_requires_approval` → `pending_approval` (إشعار لمدير/مشرف القسم ومسؤول المسجلين) وإلا `active`.
4. الاعتماد: `POST /api/v1/registration-requests/{id}/decide {approve|reject, reason}` → تفعيل + إشعار الطالب.
5. حساب واحد لكل سجل (قيد 1:1)، وكل خطوة في Audit.

### 8.2 الدخول والتجديد
`POST /auth/login` (throttle، `django-axes`-like قفل مؤقت بعد 10 فشل) → كوكيز؛ `POST /auth/refresh` يدوّر ويُبطل القديم؛ `POST /auth/logout` يُبطل ويحذف؛ Silent refresh في الواجهة على 401 مرة واحدة.

### 8.3 التقديم
Visitor → `POST /api/public/contacts/otp` → جلسة زائر → `POST /api/visitor/applications` (draft من قالب الـ Intake) → رفع مستندات → `transition submitted` (Idempotent، يولّد `reference_no`، يوجّه لمسجلي القسم أو مسؤولهم، إشعار) → المسجل: تولّي/مراجعة/طلب مستندات/مراسلة → `eligible` → القرار (مسؤول المسجلين أو مفوَّض) → `accepted` → `register_applicant` (StudentRecord + رقم جامعي + ActivationToken + بريد) → المتقدم يفعّل → `activated`.

### 8.4 النتائج
رفع الملف (نطاق) → Task: قراءة الأعمدة (قاموس عربي/إنجليزي)، مطابقة الطالب بالرقم الجامعي، المقرر بالرمز → Offering في Term الدفعة → تحقق القيم والتكرار → `validated|has_errors` + معاينة → `commit` (Idempotent، atomic بدفعات) → `publish` (إشعار الطلاب) — التعديل عبر `ResultCorrection` بموافقة أمين الشؤون العلمية.

### 8.5 الاختبار
`POST /exams/{id}/attempts` (تحقق نافذة/Enrollment/محاولات) → `started_at/deadline_at` من الخادم → الواجهة تعرض العداد بالفرق → `PUT /attempts/{id}/answers/{qid}` upsert (تُرفض بعد `deadline+grace`) → `POST /attempts/{id}/submit` (Idempotent) → تصحيح آلي فوري؛ Beat كل دقيقة يُغلق المتأخر؛ `needs_manual` للأستاذ.

### 8.6 الإشعارات
Service يطلق `Event(kind, payload)` → Task `fan_out`: حساب المستلمين من `audience` (وفق نطاق المرسل المسموح) → `NotificationRecipient` لكل مستخدم → لكل قناة مفعّلة في التفضيلات: In-app فوري، Push عبر `pywebpush` (حذف الاشتراك عند 404/410)، Email عبر Outbox بإعادة محاولة. الواجهة: Polling 60 ثانية + Service Worker يعرض Push ويُبطل الاستعلام.

### 8.7 نشر المحتوى → الموقع العام
`publish` في `content` → Task `trigger_site_rebuild` (Debounce دقيقتين) → Deploy hook للمنصة الثابتة → البناء يقرأ `/api/public/*` (Cache-Control قصير) → نشر. زر يدوي "إعادة بناء" لمدير الموقع.

### 8.8 الوصول للملفات
`MediaService.sign(file, user)`: تحقق الصلاحية (`scope_of(file.owner)`) → في التطوير رابط موقّع محلي (`itsdangerous`, 10 دقائق) تخدمه View؛ في الإنتاج Bunny Token Auth. لا يُعاد أي مسار خام.

---

## 9. الأمن (التهديد → الضابط)

| التهديد | الضابط |
|---|---|
| تصعيد صلاحيات عبر الـ API | `ScopedPermission` إلزامي على كل View (اختبار يفشل إن غاب)؛ لا حقل `role` قابل للكتابة؛ `RoleAssignment` من أدوار محددة فقط |
| IDOR | `for_user()` في كل Selector + `has_object_permission`؛ `public_id` UUID للكيانات المعروضة للزوار |
| Mass assignment | Serializers بحقول صريحة؛ الدرجات والحالات لا تُكتب إلا عبر Services |
| Brute force / OTP | Throttle + قفل مؤقت + OTP مُجزّأ (hash) بمحاولات محدودة |
| CSRF | كوكيز Lax + Header CSRF على الطلبات المُعدِّلة + `Origin` check |
| XSS | React يهرّب؛ المحتوى الغني (إعلانات/صفحات) يُطهَّر بـ `nh3` في الخادم وقائمة سماح؛ CSP صارمة |
| رفع ملفات خبيثة | امتداد + MIME بالتوقيع + حجم + فحص ZIP + منطقة خاصة + `Content-Disposition: attachment` |
| تسريب PII | حد أدنى من الحقول في كل Serializer؛ `national_id_hash` بدل الرقم؛ Audit للقراءات الحساسة (تصدير) |
| الجلسات | Blacklist للـ refresh؛ خروج من كل الأجهزة يزيد `token_version` |
| الأسرار | `.env` خارج Git؛ `SECRET_KEY` بلا افتراضي في الإنتاج (يفشل التشغيل) |
| الاعتماد على وقت العميل | كل مواعيد الاختبارات/التسليم من الخادم |
| Enumeration | رسائل موحّدة في التسجيل/الاستعادة/OTP |
| Headers | HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |

---

## 10. الأداء والتوسع

- كل Endpoint قائمة: `select_related/prefetch_related` إلزامية، واختبار `assertNumQueries` للقوائم الرئيسية.
- Cache: `/api/public/*` (5 دقائق + إبطال عند النشر)، `/me` (60 ثانية)، إحصاءات اللوحات (5 دقائق).
- الاختبارات المتزامنة: Autosave مُجمَّع كل 10–15 ثانية، فهارس `(attempt, question)`، Beat للإغلاق، Throttle لكل محاولة.
- الاستيراد: بدفعات 500 صف داخل Task؛ التقارير الثقيلة تُحسب في Task وتُخزَّن.
- الإنتاج: gunicorn `gthread` 4×4 أو uvicorn، Postgres مع PgBouncer عند > 20 اتصالًا، Redis، CDN للواجهتين والوسائط.

---

## 11. الاختبارات

| المستوى | الأداة | التغطية الدنيا |
|---|---|---|
| مصفوفة الصلاحيات | pytest + جدول `endpoint × role × scope` | 100% من الـ Endpoints (اختبار يفشل عند إضافة Endpoint بلا صف) |
| Services والحالات | pytest | كل انتقال مسموح/ممنوع |
| API contract | Schemathesis على OpenAPI | كل المسارات |
| الواجهة | Vitest + Testing Library؛ Playwright للتدفقات الحرجة (تسجيل، اختبار، تقديم) | – |
| الأداء | k6 لسيناريو 500 طالب في اختبار | قبل إطلاق Exams |
| المحرّكان | CI matrix: SQLite + Postgres | كل الاختبارات |

---

## 12. المراقبة والنسخ والنشر (إنتاج — لاحقًا)

Sentry (API + الواجهة)، Logging JSON، Uptime، نسخ Postgres يومية + `pg_dump` أسبوعي مشفّر إلى Bunny + اختبار استعادة ربع سنوي، Runbook. النشر: Render (Web + Worker + Beat + Redis + Postgres) أو مكافئ، Cloudflare Pages للواجهتين، Cloudflare أمام الـ API (WAF/Rate). كل ذلك خارج نطاق التطوير الحالي.

---

## 13. هيكل المستودع

```
emarate-edu-platform/
  backend/                 Django (§5)
  apps/portal/             React PWA
  apps/landing/            Astro
  packages/ui/             مكوّنات + tokens
  packages/api/            OpenAPI client
  packages/config/         إعدادات مشتركة
  scripts/dev.sh           تشغيل الكل محليًا (SQLite)
  docs/                    هذه المستندات
  .github/workflows/       CI (SQLite + Postgres matrix)
  pnpm-workspace.yaml, package.json, pyproject.toml (ruff/black/pytest config)
```
