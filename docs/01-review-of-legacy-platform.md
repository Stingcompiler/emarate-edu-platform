# تقرير المراجعة الهندسية والوظيفية الشاملة — منصة كلية الإمارات للعلوم والتكنولوجيا (`un_platform`)

> تاريخ المراجعة: 2026-09-27  
> نطاق المراجعة: الكود الموجود في المستودع (`backend/` + `frontend/` + `render.yaml`) عند الـ commit `a1b9434 (v33)`.  
> **لم يتم تعديل أي ملف أو تنفيذ أي Migration.** كل ما يلي هو فحص وتحليل وتوصيات.  
> طريقة الاستشهاد: `مسار/الملف.py:رقم_السطر`.

---

## فهرس

- [A. Executive Summary](#a-executive-summary)
- [B. Current Architecture](#b-current-architecture)
- [C. Existing Features](#c-existing-features)
- [D. Missing Features](#d-missing-features)
- [E. Bugs & Problems](#e-bugs--problems)
- [F. Security Report](#f-security-report)
- [G. Database Review](#g-database-review)
- [H. Permissions Review](#h-permissions-review)
- [I. Student Lifecycle Review](#i-student-lifecycle-review)
- [J. Teacher Lifecycle Review](#j-teacher-lifecycle-review)
- [K. Applicant & Admission Lifecycle Review](#k-applicant--admission-lifecycle-review)
- [L. Inquiry & Communication Review](#l-inquiry--communication-review)
- [M. Exams Architecture](#m-exams-architecture)
- [N. Assignments Architecture](#n-assignments-architecture)
- [O. Academic Results Architecture](#o-academic-results-architecture)
- [P. Live Rooms Architecture](#p-live-rooms-architecture)
- [Q. Announcements & Public Website](#q-announcements--public-website)
- [R. Infrastructure Review](#r-infrastructure-review)
- [S. Technology Review](#s-technology-review)
- [T. UI/UX Review](#t-uiux-review)
- [U. Scalability Review](#u-scalability-review)
- [V. Recommended Architecture](#v-recommended-architecture)
- [W. Gap Analysis](#w-gap-analysis)
- [X. Roadmap](#x-roadmap)
- [Y. الإجابة على أسئلة القسم 53](#y-الإجابة-على-أسئلة-القسم-53)

---

## A. Executive Summary

المشروع هو **بوابة أكاديمية لكلية واحدة** (كلية الإمارات للعلوم والتكنولوجيا) مبنية بـ Django 6 + DRF على الخلفية و React 19 + Vite 7 + Tailwind 4 على الواجهة، مستضافة على Render (خطة مجانية للويب وقاعدة البيانات) مع تخزين الملفات على Bunny Storage. الكود منظم في ثلاث تطبيقات Django (`accounts`, `academic`, `public`) و 12 Model و نحو 60 Endpoint، والواجهة عبارة عن SPA واحدة تضم الموقع العام ولوحة التحكم معًا.

**ما يعمل فعليًا اليوم:** تسجيل الطلاب بمطابقة الرقم الجامعي والاسم مع سجل مرفوع مسبقًا، تسجيل الدخول بكوكيز JWT، إدارة الأقسام والمواد وتعيين المدرسين، رفع المحاضرات (ملفات وفيديو) إلى Bunny، الواجبات والتسليم والتصحيح اليدوي، إدخال النتائج النهائية يدويًا ونشرها، الفعاليات، رسائل التواصل، تقارير إحصائية للأقسام، سجل عمليات مبسّط، وتصدير PDF/Word من الواجهة.

**الحالة العامة:** المشروع في مرحلة **MVP مبكر** وليس Production-Ready من ناحية الأمن وسلامة البيانات، رغم أنه على Production فعليًا. أخطر ما وجدته:

| # | المشكلة | الخطورة |
|---|---|---|
| 1 | أي مستخدم مسجّل (حتى طالب) يستطيع إنشاء حساب `system_manager` عبر `POST /api/auth/users/` — لا يوجد أي قيد على الإنشاء | **Critical** |
| 2 | الطالب يستطيع تعديل درجته بنفسه عبر `PATCH /api/academic/submissions/{id}/` لأن `grade` قابل للكتابة | **Critical** |
| 3 | أي مستخدم مسجّل يرى ويعدّل ويحذف سجلات **كل** الطلاب (`UniversityStudent`) بما فيها الهاتف والعنوان وتاريخ الميلاد، ويستطيع إدخال سجل طالب وهمي ثم التسجيل عليه | **Critical** |
| 4 | مدير القسم/المشرف يستطيع تغيير `role` و `password` لأي مدرس → الاستيلاء على النظام | **Critical** |
| 5 | كل ملفات المحاضرات وتسليمات الطلاب على روابط CDN عامة بدون Signed URLs | **High** |
| 6 | أي مدرس/معيد يستطيع إدخال/تعديل نتائج أي مادة في الكلية ونشرها (المعيد يتجاوز قيد النشر عبر PATCH) | **High** |
| 7 | لا يوجد Rate limiting ولا حماية من Brute-force على تسجيل الدخول، والدخول ممكن بالاسم الكامل | **High** |
| 8 | Refresh Token يبقى صالحًا 7 أيام بعد تسجيل الخروج (Blacklist مضبوط في الإعدادات لكن التطبيق غير مثبّت) | **High** |

**الفجوة الوظيفية:** لا يوجد أي شيء من: القبول والتقديم، دور المسجل، الاختبارات الإلكترونية، استيراد النتائج، غرف البث، الإعلانات (يوجد فعاليات فقط)، الإشعارات، Enrollment حقيقي، السنة الأكاديمية/الفصل كـ Entities. الهيكل الأكاديمي الحالي هو `Department → Course` فقط، و"السنة الدراسية" في الكود تعني المستوى (1–6) وليس عامًا تقويميًا.

**هل Architecture الحالية مناسبة؟** الأساس (Django/DRF/Postgres/React/Bunny/Render) مناسب ويجب الاحتفاظ به. ما يحتاج إعادة تصميم: نموذج الصلاحيات (سلاسل نصية للأدوار متناثرة في ~35 موضعًا)، الهيكل الأكاديمي (غياب Term/Program/Enrollment)، هوية الطالب (مزدوجة بين `User` و `UniversityStudent`)، ونموذج الوصول للملفات. هذه الأربعة يجب إصلاحها **قبل** بناء الاختبارات أو القبول، وإلا ستُبنى الميزات الجديدة فوق أساس سيُعاد تغييره.

---

## B. Current Architecture

### B.1 المكوّنات

```
Browser (SPA React)  ──HTTPS──▶  Render Web Service (gunicorn, 2 sync workers)
                                     │  Django 6 + DRF
                                     │  ├─ يقدّم frontend/dist/index.html (TemplateView)
                                     │  ├─ /assets/* عبر django.views.static.serve
                                     │  └─ /api/auth, /api/academic, /api/public
                                     ▼
                              Render PostgreSQL (free)          Bunny Storage (CDN عام)
                                                                  ▲ رفع عبر Django (requests.put)
```

- **Backend**: `backend/core/settings.py`, ثلاثة تطبيقات: `accounts` (المستخدمون، سجل الطلاب الرسمي، سجل العمليات)، `academic` (أقسام، مواد، مدرسون، محاضرات، واجبات، تسليمات، نتائج)، `public` (فعاليات، رسائل تواصل، سياسات).
- **Auth**: SimpleJWT مع كوكيز HttpOnly (`accounts/authentication.py`)، access 15 دقيقة، refresh 7 أيام.
- **Frontend**: SPA واحدة (`frontend/src/App.jsx`) تضم الموقع العام (`pages/public/*`) ولوحة التحكم (`pages/dashboard/*`) تحت `/dashboard/*`. مبنية مسبقًا و**مُلتزَمة في Git** (`frontend/dist/`) ليقدّمها Django بدون خطوة Node على Render (`.gitignore:19-21`).
- **الملفات**: `bunny/storage.py` كـ Django Storage backend افتراضي عند وجود المفاتيح؛ الفيديو يُرفع كملف عادي إلى Storage (`Lecture.video_file`). وحدة `bunny/stream.py` (Bunny Stream) **موجودة لكنها غير مستخدمة** بعد Migration `0007` (تم حذف حقول `bunny_video_id`)، ورغم ذلك ما زالت مستوردة في `academic/views.py:8`.
- **النشر**: `render.yaml` — خدمة ويب مجانية بفرانكفورت، `migrate` يعمل داخل `buildCommand`، قاعدة بيانات مجانية.
- **غير موجود**: Background jobs، Cache، WebSocket، Email backend، Notifications، Tests (ملفات `tests.py` فارغة)، CI، API docs، Logging/Monitoring.

### B.2 نموذج البيانات الحالي (12 Model)

```
accounts.User (AbstractUser + role + full_name_ar + phone)
   └─ university_student  1:1 (SET_NULL) ─▶ accounts.UniversityStudent (university_number, full_name, department FK, year, semester, is_registered, PII...)
accounts.ActivityLog (user CASCADE, department, action, target_type, target_name, details)

academic.Department (department_manager 1:1 User, supervisor FK User, is_deleted)
academic.Course (department PROTECT, code unique, academic_year=المستوى, semester, credit_hours, is_deleted)
academic.CourseInstructor (user, course, role teacher/ta) unique(user,course)
academic.Lecture (course CASCADE, file, video_file, video_url, reference_url, lecture_type, order)
academic.Assignment (course CASCADE, lecture SET_NULL, due_date, max_grade, file)
academic.Submission (assignment CASCADE, student=User CASCADE, content, file, grade, feedback) unique(assignment,student)
academic.CourseResult (student=User CASCADE, course CASCADE, total_grade, letter_grade, passed, is_published) unique(student,course)

public.Event, public.ContactMessage (name,email,phone,subject,message,is_read), public.Policy
```

### B.3 الأدوار الحالية (`accounts/models.py:8-16`)

`system_manager`, `department_manager`, `supervisor`, `teacher`, `ta`, `student`, `event_manager`.

نطاق الدور يُستنتج من علاقات جانبية: مدير القسم عبر `Department.department_manager` (1:1)، المشرف عبر `Department.supervisor`، المدرس عبر `CourseInstructor`، الطالب عبر `(university_student.department, university_student.year)`.

### B.4 كيف يرى الطالب مواده؟

لا يوجد Enrollment. الطالب يرى كل المواد التي `department == قسمه` و `academic_year == مستواه` (`academic/views.py:178-182`) بغض النظر عن الفصل الحالي أو ما إذا كان مسجلًا فيها فعلًا. وهو نفسه يستطيع تغيير مستواه من صفحة الملف الشخصي (`accounts/views.py:251-261`).

---

## C. Existing Features

| المجال | ما هو موجود ويعمل | الملفات |
|---|---|---|
| تسجيل الطالب | مطابقة `university_number` + `full_name` مع `UniversityStudent`، منع التسجيل المكرر عبر `is_registered` | `accounts/serializers.py:117-180` |
| تسجيل الدخول | بالـ username أو الاسم الكامل أو الرقم الجامعي؛ كوكيز JWT HttpOnly؛ Silent refresh في axios | `accounts/views.py:97-166`, `frontend/src/services/api.js` |
| إدارة الطلاب الرسميين | CRUD + رفع جماعي CSV/XLSX مع مطابقة أسماء الأقسام بالعربية (Fuzzy) + بحث وترقيم صفحات | `accounts/views.py:299-508`, `StudentsManage.jsx` |
| إدارة المستخدمين | CRUD للموظفين، إعادة تعيين كلمة مرور من المدير | `accounts/views.py:511-600`, `UsersManage.jsx`, `PasswordManagePage.jsx` |
| الأقسام | CRUD + Soft delete + مدير ومشرف لكل قسم؛ عرض عام | `academic/views.py:80-131` |
| المواد | CRUD + تعيين مدرسين/معيدين + عرض عام | `academic/views.py:134-245` |
| المحاضرات | ملف + فيديو (Bunny Storage) + رابط خارجي (YouTube/Vimeo embed) + نوع نظري/عملي + ترتيب؛ شريط تقدم رفع | `academic/views.py:247-317`, `TeacherCourses.jsx`, `LectureDetail.jsx` |
| الواجبات | إنشاء بموعد ودرجة قصوى وملف؛ ربط بمحاضرة | `academic/models.py:149-193` |
| التسليم | نص + ملف واحد؛ الطالب يرى تسليماته فقط | `academic/views.py:367-400` |
| التصحيح | درجة + ملاحظات من المدرس (ليس المعيد) | `academic/views.py:402-412`, `GradingPage.jsx` |
| النتائج النهائية | إدخال يدوي لكل طالب/مادة، نشر، تصدير PDF/DOCX | `academic/views.py:415-464`, `ResultsPublish.jsx` |
| الفعاليات | CRUD + صورة + نشر؛ عرض عام | `public/views.py:47-58` |
| التواصل | نموذج عام → رسالة → عرض للإدارة + mailto | `public/views.py:64-89`, `MessagesView.jsx` |
| السياسات | نص خصوصية/شروط | `public/models.py:44-64` |
| التقارير | إحصاءات القسم، قائمة الأساتذة، تقرير شامل بمرشحات | `academic/views.py:546-1158`, `ReportsPage.jsx` |
| سجل العمليات | إنشاء/تعديل/حذف/نشر/تصحيح للمواد والمحاضرات والواجبات والتعيينات، مقيّد بالقسم | `accounts/utils.py`, `OperationsLog.jsx` |
| البنية | HTTPS/HSTS/Secure cookies في الإنتاج، WhiteNoise، Health check | `core/settings.py:194-210` |

**ملاحظة إنصاف:** أجزاء جيدة في الكود: فصل `UniversityStudent` كمصدر حقيقة لهوية الطالب فكرة صحيحة؛ Soft delete للأقسام والمواد؛ رفع الملفات Streaming إلى Bunny بدون تحميلها في الذاكرة (`bunny/storage.py:70-80`)؛ تقسيم Chunks في Vite؛ HttpOnly cookies بدل localStorage.

---

## D. Missing Features

مرتبة حسب التصور المطلوب في الطلب:

| المطلوب | الحالة | ملاحظة |
|---|---|---|
| University / College / Program / AcademicYear / Term / Level / Enrollment | **غير موجود** | يوجد `Department` و `Course(academic_year=level, semester=int)` فقط |
| صفحة التقديم العامة + Applicant + Documents + Workflow + Reference Number | **غير موجود** | لا يوجد أي Model أو Endpoint |
| Registrar Role + Dashboard | **غير موجود** | |
| تحويل Applicant → Student | **غير موجود** | |
| استيراد النتائج من Excel/CSV مع Preview | **غير موجود** | يوجد إدخال يدوي فقط؛ ويوجد كود رفع Excel للطلاب يمكن إعادة استخدام أسلوبه (ليس الكود نفسه) |
| نتائج الفصل الحالي فقط + تاريخ أكاديمي | **غير موجود** | النتيجة بلا بُعد زمني |
| Exams Module (أسئلة، محاولات، تصحيح آلي) | **غير موجود** | |
| Assignments: أنواع ملفات، حجم، روابط بأسماء، إعادة تسليم، Late policy، Versions | **غير موجود** | يوجد ملف واحد ونص بلا أي قيود |
| Automatic/AI grading | **غير موجود** | |
| Live Rooms / Sessions / Attendance / Recordings | **غير موجود** | |
| Announcements (عام/كلية/قسم) مع Draft/Schedule/Expiry | **غير موجود** | يوجد `Event` بـ `is_published` فقط |
| Content & Announcements Manager | **جزئي** | `event_manager` يدير الفعاليات فقط |
| Inquiries: أنواع، حالات، تعيين مسؤول، WhatsApp، سجل ردود | **جزئي** | `ContactMessage` بحقل `is_read` فقط؛ لا توجد حالات ولا مسؤول ولا نوع |
| Inquiries Officer role | **غير موجود** | يرى الرسائل `system_manager` و `department_manager` (كل مديري الأقسام يرون كل الرسائل) |
| Audit Log بقيم قبل/بعد | **جزئي** | `ActivityLog` نصي، لا يغطي النتائج/المستخدمين/الصلاحيات/كلمات المرور/الرفع الجماعي |
| Notifications | **غير موجود** | لا Email backend ولا Model |
| فصل الموقع العام عن البوابة | **غير موجود** | SPA واحدة، Backend واحد |
| اللغة الإنجليزية | **غير موجود** | i18n مهيأ بالعربية فقط (`frontend/src/i18n/index.js`) رغم وجود حقول `name`/`name_ar` في الـ Models |
| Tests / CI | **غير موجود** | |

---

## E. Bugs & Problems

التصنيف: **Bug** = سلوك خاطئ فعلي، **Design** = يعمل لكن التصميم غير مناسب، **Improvement** = تحسين.

### Critical

**E1. أي مستخدم مسجّل يستطيع إنشاء مستخدم بأي دور (Privilege Escalation)** — Bug/Security
- **الدليل:** `accounts/views.py:516-518` — `UserViewSet.get_permissions` يعيد `[IsAuthenticated()]` لكل الأفعال بما فيها `create`. و`UserManageSerializer` (`accounts/serializers.py:33-57`) يجعل `role` و `password` و `is_active` قابلة للكتابة. تقييد `get_queryset` لا يؤثر على `create`.
- **التأثير:** طالب يرسل `POST /api/auth/users/ {"username":"x","password":"...","role":"system_manager"}` ويحصل على حساب مدير نظام.
- **الحل:** `create/update/destroy` لـ `system_manager` فقط؛ منع تعديل `role` إلا من `system_manager`؛ تمرير كلمة المرور عبر `validate_password`. (تفصيل في F).
- **Breaking Change:** No.

**E2. الطالب يعدّل درجته** — Bug/Security
- **الدليل:** `academic/serializers.py:169-170` — `read_only_fields` لا تشمل `grade` و `feedback`; `SubmissionViewSet.get_permissions` (`academic/views.py:373-376`) يسمح بـ `update/partial_update` لأي مستخدم مصادق؛ `get_queryset` للطالب يعيد تسليماته → `get_object` ينجح.
- **التأثير:** `PATCH /api/academic/submissions/{id}/ {"grade": 100}` من حساب الطالب.
- **الحل:** جعل `grade/feedback/graded_by/graded_at` read-only في `SubmissionSerializer`؛ قصر `update` على صاحب التسليم وقبل الموعد؛ التصحيح فقط عبر `grade` action.
- **Breaking:** No.

**E3. سجل الطلاب الرسمي مكشوف لأي مستخدم مصادق (قراءة وكتابة وحذف)** — Bug/Security/Privacy
- **الدليل:** `accounts/views.py:303` `permission_classes = [IsAuthenticated]`؛ `get_queryset` (306-353) يقيد `department_manager` و `supervisor` فقط، أما `student`/`teacher`/`ta`/`event_manager` فيرون **كل** السجلات بكل حقول PII (`UniversityStudentSerializer` يعرض email/phone/birth_date/address). `perform_destroy` يمنع المشرف فقط.
- **التأثير:** تسريب بيانات آلاف الطلاب؛ طالب يعدّل قسم/مستوى زميله؛ طالب ينشئ `UniversityStudent` وهميًا ثم يسجّل حسابًا عليه (تجاوز التحقق من الهوية بالكامل).
- **الحل:** قصر الـ ViewSet على `system_manager` + (لاحقًا) `registrar`، ومدير القسم للقراءة داخل قسمه فقط. الطالب يصل لبياناته عبر `/auth/me/` فقط.
- **Breaking:** No (الواجهة تستدعيه من صفحات الإدارة فقط).

**E4. مدير القسم/المشرف يستطيع الاستيلاء على أي حساب مدرس** — Bug/Security
- **الدليل:** `accounts/views.py:544-547` — يعيد المدرسين والمعيدين (كل الكلية، وليس قسمه) و`update` مسموح؛ الـ Serializer يسمح بتغيير `role` و `password`.
- **التأثير:** تغيير `role` لمدرس إلى `system_manager` + تعيين كلمة مرور جديدة = سيطرة كاملة.
- **الحل:** كما في E1؛ وقصر مدير القسم على القراءة فقط لمستخدمي قسمه.
- **Breaking:** No.

### High

**E5. المعيد ينشر النتائج والمدرس يعدّل نتائج أي مادة** — Bug
- **الدليل:** `academic/views.py:420-425` — `create/update/partial_update` لـ `IsTeacherOrTA` بلا تحقق من `CourseInstructor`؛ `CourseResultSerializer` يجعل `is_published` قابلًا للكتابة (`academic/serializers.py:184-187`)؛ الواجهة نفسها تنشر عبر `PATCH {is_published:true}` (`ResultsPublish.jsx:80`) فلا يُضبط `published_by/published_at` ولا يُسجَّل في `ActivityLog`.
- **التأثير:** سلامة النتائج الأكاديمية غير مضمونة؛ لا أثر تدقيقي.
- **الحل:** التحقق من ملكية المادة، `is_published` read-only، النشر عبر action فقط مع تسجيل تدقيقي.
- **Breaking:** تعديل بسيط في الواجهة (استدعاء `/publish/` بدل PATCH).

**E6. المدرس يرى/يعدّل واجبات وتسليمات كل الكلية** — Bug
- **الدليل:** `AssignmentViewSet.get_queryset` (`academic/views.py:332-352`) لا يفلتر `teacher/ta/student` إطلاقًا؛ `SubmissionViewSet.get_queryset` (378-397) يفلتر الطالب والمشرف فقط → المدرس يرى تسليمات كل الطلاب ويستطيع تصحيحها (`grade` action يتحقق من الدور فقط).
- **الحل:** فلترة بـ `CourseInstructor` للمدرس/المعيد، وبمواد الطالب (لاحقًا Enrollment) للطالب.
- **Breaking:** No.

**E7. تسجيل الحساب بمعلومات شبه علنية + الطالب يحدد مستواه** — Design/Security
- **الدليل:** `accounts/serializers.py:132-153` يكتفي بالرقم الجامعي والاسم؛ `create` (161-165) يكتب `year/semester` من إدخال الطالب فوق السجل الرسمي؛ `ProfileUpdateView` (`accounts/views.py:251-261`) يسمح بتغييرهما لاحقًا.
- **التأثير:** أي شخص يعرف رقم واسم طالب لم يسجّل بعد (قوائم الفصول) يستولي على حسابه؛ الطالب يغيّر مستواه فيرى مواد مستويات أخرى وتختل التقارير.
- **الحل:** انظر I.2 (OTP/بريد أو تفعيل بواسطة المسجل)؛ حذف `year/semester` من التسجيل والملف الشخصي (مصدرها السجل الرسمي فقط).
- **Breaking:** Yes للواجهة (إزالة الحقول).

**E8. الملفات على CDN عام بدون توقيع** — Design/Security
- **الدليل:** `bunny/storage.py:88-92` يعيد `https://{cdn}/{name}` مباشرة؛ `MEDIA_URL` عام (`core/settings.py:131`)؛ الواجهة تفتح `lecture.file`/`submission.file` مباشرة.
- **التأثير:** أي رابط مسرّب = وصول دائم لمحاضرات مدفوعة وتسليمات طلاب (ملكية فكرية + خصوصية).
- **الحل:** Bunny Token Authentication (Signed URLs بصلاحية قصيرة) تُولَّد من الخادم لكل طلب بعد التحقق من الصلاحية؛ منطقة تخزين خاصة للتسليمات ومستندات القبول.
- **Breaking:** No (الرابط ما زال يأتي من الـ API).

**E9. لا يوجد Rate limiting / Brute-force protection / Password policy موحّدة** — Security
- **الدليل:** `REST_FRAMEWORK` (`core/settings.py:156-166`) بلا `DEFAULT_THROTTLE_CLASSES`؛ `LoginView` يسمح بالدخول عبر `full_name_ar__iexact` (`accounts/views.py:110-117`) مما يسهّل التخمين؛ `ChangePasswordView:287` و `AdminResetPasswordView:585` يتحققان من الطول فقط متجاوزين `AUTH_PASSWORD_VALIDATORS`؛ `UserManageSerializer` بلا أي تحقق.
- **الحل:** DRF throttling (`AnonRateThrottle` على login/register/contact) + `django-axes` أو قفل مؤقت؛ إلغاء الدخول بالاسم؛ استخدام `validate_password` في كل مسار.
- **Breaking:** إلغاء الدخول بالاسم قد يؤثر على مستخدمين اعتادوه (منخفض).

**E10. Refresh token لا يُبطل عند الخروج** — Bug/Security
- **الدليل:** `core/settings.py:171-172` يفعّل `ROTATE_REFRESH_TOKENS` و `BLACKLIST_AFTER_ROTATION` لكن `rest_framework_simplejwt.token_blacklist` غير موجود في `INSTALLED_APPS`؛ `RefreshTokenView` (`accounts/views.py:180-210`) لا يُصدر refresh جديدًا ولا يُبطل القديم؛ `LogoutView` يحذف الكوكي فقط.
- **التأثير:** الكوكي المسروق يبقى صالحًا 7 أيام مهما فعل المستخدم.
- **الحل:** تثبيت `token_blacklist` + `migrate`، استخدام `TokenRefreshView` منطق الدوران، `refresh.blacklist()` في الخروج.
- **Breaking:** No.

**E11. ترقيم الصفحات مُتجاهَل في الواجهة → بيانات مبتورة عند 20** — Bug
- **الدليل:** `PAGE_SIZE = 20` عالمي (`core/settings.py:165`)؛ 41 موضعًا في الواجهة تستخدم `res.data.results || res.data` وتأخذ الصفحة الأولى فقط. مثال حرج: `ResultsPublish.jsx:49` يجلب `/auth/users/?role=student` (كل طلاب الكلية، أول 20 فقط، وليس طلاب المادة).
- **التأثير:** عند تجاوز 20 مادة/محاضرة/طالب تختفي البيانات بصمت؛ صفحة النتائج غير قابلة للاستخدام فعليًا مع أكثر من 20 طالبًا.
- **الحل:** إما ترقيم حقيقي في كل القوائم أو `page_size` قابل للتحديد مع حد أقصى؛ وصفحة النتائج يجب أن تجلب طلاب المادة (Enrollment) لا كل المستخدمين.
- **Breaking:** No.

**E12. الرفع الجماعي يدمّر بيانات موجودة** — Bug
- **الدليل:** `accounts/views.py:478-493` — `year` يُضبط إلى `1` إذا غاب العمود ثم `update_or_create` يكتب `full_name/department/year` فوق السجلات الموجودة (حتى المسجّلة). المطابقة الضبابية للأقسام (449-472) تختار أول قسم يتقاطع بكلمتين. لا Preview، لا Transaction، الأخطاء مقطوعة عند 10.
- **التأثير:** إعادة رفع ملف بدون عمود السنة تعيد كل الطلاب للمستوى 1؛ تغيير أسماء بصمت.
- **الحل:** مرحلة معاينة (Validate → Preview → Commit) داخل `transaction.atomic`، عدم لمس الحقول الغائبة، رفض المطابقة الضبابية غير الحاسمة، تسجيل Batch.
- **Breaking:** No.

**E13. Cascade deletes خطيرة** — Design
- **الدليل:** `Submission.student` و `CourseResult.student` و `ActivityLog.user` جميعها `CASCADE` على `User` (`academic/models.py:201-206, 246-251`, `accounts/models.py:97-102`)؛ `UserViewSet.perform_destroy` يحذف فعليًا.
- **التأثير:** حذف مستخدم = محو سجله الأكاديمي وأثره التدقيقي؛ حذف `UniversityStudent` يترك حساب طالب يتيمًا يستطيع الدخول (`SET_NULL`).
- **الحل:** `PROTECT` أو Soft delete للمستخدمين؛ ربط السجل الأكاديمي بـ `StudentRecord` لا بـ `User`.
- **Breaking:** Migration لتغيير `on_delete` (غير مكسر للبيانات).

**E14. رفع الفيديو عبر Django على خطة مجانية** — Design/Performance
- **الدليل:** `Lecture.video_file` يمر عبر gunicorn sync worker (`render.yaml:15` — 2 workers، timeout 120s) ثم `requests.put` إلى Bunny (`bunny/storage.py:74-79`، timeout 120s).
- **التأثير:** فيديو 300MB يشغل نصف السعة لدقائق ويفشل غالبًا؛ يُقدَّم MP4 خام بلا Adaptive bitrate (سيئ للإنترنت الضعيف).
- **الحل:** رفع مباشر من المتصفح إلى Bunny Stream عبر TUS بتوقيع من الخادم؛ الخادم يحفظ `video_id` فقط. (الوحدة `bunny/stream.py` أساس قابل للتوسيع.)
- **Breaking:** تغيير في الواجهة والنموذج.

### Medium

- **E15.** إعادة التسليم تُرجع 500: `unique_together(assignment, student)` (`academic/models.py:227`) + `perform_create` بلا معالجة `IntegrityError`. ولا يُفرض `due_date` على الخادم إطلاقًا (التسليم بعد الموعد مقبول).
- **E16.** لا يوجد أي تحقق من نوع/حجم الملفات على الخادم (`Lecture.file`, `Lecture.video_file`, `Assignment.file`, `Submission.file`) — فقط `accept` في الواجهة، وحقل تسليم الطالب بلا `accept` (`StudentCoursesView.jsx:461`).
- **E17.** تسريب بيانات موظفين عامًا: `DepartmentSerializer` و `DepartmentListSerializer` يعرضان `username/email` للمدير والمشرف على Endpoint عام (`academic/serializers.py:17-47`, `academic/views.py:95`).
- **E18.** `Course.code` `unique` عالميًا (`academic/models.py:46`) — يمنع نفس الرمز في أقسام مختلفة أو أعوام مختلفة.
- **E19.** `Course.academic_year` تعني "المستوى" لكن اسمها يوحي بالعام؛ `semester` عدد 1–10 بلا كيان؛ لا يمكن التمييز بين "الفصل الأول 2025/2026" و"الفصل الأول 2026/2027" → النتائج والمحاضرات تتراكم بلا بُعد زمني، و`CourseResult unique(student, course)` يمنع إعادة المادة.
- **E20.** `CourseResult.student` يشير إلى `User` لا `UniversityStudent` → لا يمكن إدخال نتيجة لطالب لم ينشئ حسابًا؛ الهوية الأكاديمية مزدوجة.
- **E21.** الواجهة بلا Route guards حسب الدور (`Dashboard.jsx:256-284`) — الطالب يفتح `/dashboard/users` وتظهر الصفحة (الحماية الحقيقية في الخلفية فقط وهي ناقصة كما في E1-E4).
- **E22.** `ActivityLog`: لا `target_id`، لا قيم قبل/بعد، لا تسجيل لعمليات النتائج (`CourseResultViewSet` بلا `perform_create/update/destroy` مسجِّلة)، المستخدمين، الأدوار، كلمات المرور، الرفع الجماعي، حذف الرسائل؛ ولا تُسجَّل عمليات `system_manager` (`ActivityLogListView` يفلترها).
- **E23.** N+1 في التقارير: `DepartmentReportView` استعلامان لكل مادة (`academic/views.py:727-741`)، `ProfessorsListView` استعلامان لكل أستاذ (842-860)، `ComprehensiveReportView` 4 لكل أستاذ و2 لكل مادة (1053-1091)، `AssignmentSerializer.get_submission_count` (`academic/serializers.py:157`)، `DepartmentSerializer.get_course_count`.
- **E24.** `/assets/*` تُقدَّم بـ `django.views.static.serve` في الإنتاج (`core/urls.py:22-33`) بلا Cache headers ولا ضغط، رغم وجود WhiteNoise؛ و`/college_logo.png` (favicon في `dist/index.html`) لا يطابق أي مسار فيُعاد `index.html` بدلًا منه.
- **E25.** تناقض إعدادات النطاق: الواجهة مبنية بـ `VITE_API_BASE_URL=https://platform.eust.edu.sd/api` (`frontend/.env`) بينما `render.yaml` يذكر `eust.edu.sd`/`www`/`un-platform.onrender.com` فقط في `ALLOWED_HOSTS` و`CORS`. يعمل حاليًا إما لأن `platform.eust.edu.sd` مضاف يدويًا في لوحة Render أو لأن الطلبات من نفس الموقع؛ لكن الإعداد المُلتزَم لا يعكس الواقع.
- **E26.** `Department.supervisor` FK (متعدد) بينما `department_manager` OneToOne؛ و`get_user_department` يأخذ `.first()` للمشرف — سلوك غير محدد إذا أشرف على قسمين.
- **E27.** `DashboardStatsView` يعيد `pending_assignments: 0` و `credit_hours: 0` ثابتة (`academic/views.py:533,538`).
- **E28.** الحذف الفعلي للمحاضرة لا يحذف الملف من Bunny (`academic/views.py:312-317`) — تراكم تكلفة تخزين.
- **E29.** `CookieJWTAuthentication` لا يفرض CSRF (كوكيز + `SameSite=Lax` هي الحماية الوحيدة) — مقبول حاليًا لكنه هش إذا تغيرت النطاقات الفرعية أو أُضيفت طلبات GET ذات أثر.

### Low

- **E30.** ملفات PDF حقيقية (4 نسخ من مستند مدرسة) مُلتزَمة في `backend/lectures/` — تلوّث المستودع وقد تكون بيانات خاصة.
- **E31.** كود ميت: `bunny/stream.py` مستورد وغير مستخدم؛ تعليقات "❌ تم حذف" في `serializers.py`/`views.py`.
- **E32.** اسم الصنف `IsAdminUser` في `public/views.py:12` يحجب صنف DRF بنفس الاسم.
- **E33.** `frontend/README.md` قالب Vite الافتراضي؛ لا توثيق للمشروع.
- **E34.** بيانات اتصال وهمية مُدمجة في الكود (`Contact.jsx:535-537`: `+249 123 456 789`, `info@emiratescollege.edu.sd`)، واسم الكلية مكرر بثلاث صيغ (`Dashboard.jsx:143`, `dist/index.html`, `ar.json`).
- **E35.** `SECRET_KEY` له قيمة افتراضية معروفة و`DEBUG` افتراضيه `True` (`core/settings.py:17,20`) — آمن على Render لأن `render.yaml` يضبطهما، لكنه خطر عند أي نشر آخر.
- **E36.** `manualChunks` في `vite.config.js` يشير إلى `html2canvas` و`dompurify` غير المذكورين في `package.json` (تأتي كتبعيات لـ jspdf) — هشاشة في البناء.

---

## F. Security Report

مرتبة حسب الأولوية. (المشاكل E1–E4 و E7–E10 و E16–E17 و E29 مفصلة أعلاه؛ هنا الملخص التنفيذي الأمني والملاحظات الإضافية.)

| # | الفئة | المشكلة | الدليل | الأولوية |
|---|---|---|---|---|
| S1 | Broken Access Control | إنشاء مستخدمين بأي دور من أي حساب | `accounts/views.py:516` | Critical |
| S2 | IDOR / Mass assignment | الطالب يكتب `grade` | `academic/serializers.py:169` | Critical |
| S3 | Broken Access Control + Privacy | قراءة/تعديل/حذف كل `UniversityStudent` من أي حساب | `accounts/views.py:303-360` | Critical |
| S4 | Privilege escalation | مدير القسم يغيّر دور/كلمة مرور المدرسين | `accounts/views.py:544-547` + serializer | Critical |
| S5 | Authorization | نتائج/واجبات/تسليمات بلا تحقق ملكية المادة | `academic/views.py:332, 378, 427` | High |
| S6 | Identity | تسجيل حساب بمعلومات شبه علنية بلا تحقق ثانٍ | `accounts/serializers.py:132` | High |
| S7 | Auth hardening | لا Throttling، دخول بالاسم، سياسة كلمات مرور متجاوَزة | `core/settings.py:156`, `accounts/views.py:110,287,585` | High |
| S8 | Session | Refresh token لا يُبطل | `core/settings.py:171` + غياب `token_blacklist` | High |
| S9 | Media access | Signed URLs غائبة؛ كل الوسائط عامة | `bunny/storage.py:88` | High |
| S10 | File upload | لا تحقق من النوع/الحجم/المحتوى؛ ملفات قابلة للتنفيذ تُخزَّن وتُقدَّم من CDN | `academic/models.py` (FileFields) | Medium |
| S11 | Information disclosure | بريد وأسماء مستخدمي الموظفين على Endpoint عام | `academic/serializers.py:17-47` | Medium |
| S12 | Enumeration | رسائل خطأ التسجيل تكشف وجود الرقم الجامعي والتطابق مع الاسم ("الرقم غير موجود" / "الاسم غير متطابق" / "مسجل مسبقًا") | `accounts/serializers.py:142-150` | Medium |
| S13 | CSRF | الاعتماد على `SameSite=Lax` فقط | `accounts/authentication.py` | Medium |
| S14 | Spam/Abuse | نموذج التواصل بلا Throttle/Captcha | `public/views.py:64` | Medium |
| S15 | Audit | لا أثر لعمليات حساسة (أدوار، كلمات مرور، نتائج، رفع بيانات) | `accounts/utils.py` واستخدامه | Medium |
| S16 | Secrets/Config | مفاتيح افتراضية غير آمنة في الإعدادات؛ ملفات PDF في المستودع | `core/settings.py:17,20`, `backend/lectures/` | Low |
| S17 | XSS | لم أجد `dangerouslySetInnerHTML` أو HTML غير مُطهَّر؛ React يهرّب النصوص افتراضيًا. `escapeValue:false` في i18n على نصوص ثابتة فقط | — | Info |
| S18 | SQL Injection | كل الاستعلامات عبر ORM؛ لم أجد `raw()`/`extra()` | — | Info |
| S19 | Debug/Exposed endpoints | `DEBUG=False` في Render؛ `/admin/` مكشوف بلا قيد IP (مقبول مع كلمات مرور قوية + Throttle) | `render.yaml`, `core/urls.py:10` | Info |
| S20 | Headers | HSTS/Secure cookies/NOSNIFF موجودة؛ لا CSP ولا Referrer-Policy | `core/settings.py:194-210` | Low |

**ملاحظة على Applicant data privacy:** غير قابلة للتقييم لعدم وجود النظام؛ يجب أن يُبنى من البداية بمنطقة تخزين خاصة، Signed URLs، وحد أدنى من الحقول (انظر K).

---

## G. Database Review

### G.1 تعريفات المصطلحات (كما يجب أن تكون)

قبل أي اقتراح، التعريفات التي سأستخدمها في بقية التقرير (لأن الكود الحالي يخلط بينها):

| المصطلح | التعريف | الوضع الحالي في الكود |
|---|---|---|
| **University** | المؤسسة الأم (قد تكون كلية مستقلة) | غير ممثل؛ ثابت في النصوص |
| **College** | وحدة أكاديمية تضم أقسامًا ولها مسجل | غير ممثل (النظام لكلية واحدة) |
| **Department** | قسم أكاديمي يضم برامج ومواد وأساتذة | `academic.Department` ✔ |
| **Program** | برنامج يمنح مؤهلًا (بكالوريوس تقنية معلومات) ويُتقدَّم إليه | غير ممثل (يُستنتج من اسم القسم في الرفع الجماعي `accounts/views.py:454-455` حيث تُحذف كلمات "بكالوريوس/دبلوم/ماجستير"!) |
| **Academic Year** | عام تقويمي أكاديمي (2025/2026) | غير ممثل |
| **Term (Semester)** | فصل داخل عام أكاديمي (خريف 2025) | `Course.semester` و `UniversityStudent.semester` أعداد 1–10 بلا كيان — تُستخدم بمعنى "الفصل التسلسلي في الخطة" |
| **Level** | المستوى الدراسي في الخطة (سنة 1..6) | `Course.academic_year` و `UniversityStudent.year` (اسم مضلل) |
| **Course** | مقرر في الخطة الدراسية (كتالوج) | `academic.Course` ✔ لكنه يخلط الكتالوج مع التقديم الفعلي |
| **Course Offering (Section)** | تقديم مقرر في Term معين بأستاذ معين | غير ممثل؛ `CourseInstructor` يربط بالمقرر الكتالوجي بلا زمن |
| **Cohort / Class** | مجموعة طلاب (برنامج + مستوى + Term) | مُستنتج ضمنيًا من `(department, year)` |
| **Enrollment** | تسجيل طالب في Course Offering | غير ممثل |

### G.2 مشاكل الـ Schema الحالية

| المشكلة | الدليل | التوصية |
|---|---|---|
| هوية الطالب مزدوجة (`User` ↔ `UniversityStudent`) والسجل الأكاديمي (`Submission`, `CourseResult`) مرتبط بـ `User` | `academic/models.py:201, 246` | جعل `StudentRecord` (تطوير `UniversityStudent`) هو المرجع لكل السجلات الأكاديمية؛ `User` للمصادقة فقط |
| لا بُعد زمني للنتائج/المحاضرات/الواجبات | `CourseResult unique(student, course)` | إضافة `Term` و `CourseOffering`؛ النتيجة على Offering |
| `Course.code` unique عالميًا | `academic/models.py:46` | `unique_together(department, code)` أو (program, code) |
| `Course.academic_year` = مستوى | `academic/models.py:55` | إعادة تسمية إلى `level` (Migration `RenameField` غير مكسر للبيانات) |
| `Department.supervisor` FK غير محدد التعدد | `academic/models.py:20-28` | إما OneToOne أو جدول `RoleAssignment` (انظر H) |
| `Lecture.title/content/lecture_type` nullable بلا سبب | `academic/models.py:110-113` (Migration 0008) | `blank=True` بدل `null=True` للنصوص |
| `UniversityStudent.department` nullable | `accounts/models.py:56-62` | إلزامي بعد التنظيف؛ الطالب بلا قسم حالة غير صالحة |
| Cascade على `User` | `Submission.student`, `CourseResult.student`, `ActivityLog.user` | `PROTECT` + Soft delete |
| `Lecture.course` / `Assignment.course` CASCADE مع Soft delete للمادة | تناقض: الحذف الناعم لا يخفي المحاضرات من `LectureViewSet` (لا يوجد فلتر `course__is_deleted=False`) | فلترة موحدة عبر Manager؛ أو `PROTECT` |
| Soft delete غير متسق | `Department`, `Course` فقط | Mixin موحّد أو حذف فعلي مع PROTECT |
| فهارس ناقصة | `CourseResult(student, is_published)`, `Submission(assignment, grade)`, `UniversityStudent(department, year)`, `Lecture(course, order)` | إضافة `Meta.indexes` |
| قيود ناقصة | لا `CheckConstraint` على `grade <= max_grade`، `total_grade 0..100`، `year 1..6` | `CheckConstraint` |
| `ActivityLog` بلا `target_id`/قيم | `accounts/models.py:87-121` | استبداله بـ `AuditLog` عام (انظر V) |
| `ContactMessage.phone` نص حر 20 حرفًا | `public/models.py:30` | تخزين E.164 مع تحقق |
| N+1 محتملة | انظر E23 | `select_related/prefetch_related/annotate` |

### G.3 العلاقات المطلوبة (Target Model)

الترميز: `A ─< B` يعني A واحد إلى B متعدد.

```
University ─< College ─< Department ─< Program
Program ─< Level (1..n)                     (أو حقل levels_count في Program مع Level ككيان خفيف)
AcademicYear ─< Term
Program ─< Course (كتالوج: code, credit_hours, default_level, default_term_no)
Course + Term ─> CourseOffering (instructors عبر OfferingInstructor{teacher|ta}, capacity, section)
StudentRecord (university_number, program, current_level, status, application FK nullable) 1─1 User (nullable)
StudentRecord + CourseOffering ─> Enrollment (status, enrolled_at, source manual|bulk|auto)
CourseOffering ─< Lecture ─< LectureResource (file|video|link, storage ref, visibility)
CourseOffering ─< Assignment ─< AssignmentLinkField
Assignment + StudentRecord ─> Submission ─< SubmissionVersion ; Submission 1─1 SubmissionGrade
CourseOffering ─< Exam ─< Question ─< Choice
Exam + StudentRecord ─< ExamAttempt ─< StudentAnswer
Term + StudentRecord + CourseOffering ─> AcademicResult (import_batch FK)
ResultImportBatch ─< ResultImportRow
AdmissionCycle(AcademicYear) ─< ProgramIntake(Program) ─< Application ─< ApplicationDocument, ApplicationStatusHistory
Inquiry ─< InquiryMessage ; Inquiry ─< InquiryStatusHistory ; Inquiry ─> Application (nullable, manual link)
Announcement (scope: university|college|department|program|offering), Event
LiveRoom (scope: Cohort | CourseOffering) ─< LiveSession ─< SessionAttendance ; LiveSession 1─1 Recording ─> LectureResource
AuditLog (actor, action, target_ct/target_id, old JSON, new JSON, at, ip)
Notification (recipient, type, payload, read_at) + NotificationOutbox (channel, status)
RoleAssignment (user, role, college?, department?, program?)
```

**إعادة الاستخدام:** `Department` يبقى كما هو؛ `Course` يصبح الكتالوج؛ `UniversityStudent` تتطور إلى `StudentRecord` (إعادة تسمية + حقول)؛ `CourseInstructor` تنتقل إلى `OfferingInstructor`؛ `Lecture/Assignment/Submission/CourseResult` تُهاجَر إلى Offering يُنشأ تلقائيًا لـ "Term قديم" (Legacy term) حفاظًا على البيانات.

---

## H. Permissions Review

### H.1 الوضع الحالي

- الدور حقل نصي واحد على `User`؛ التحقق يتم بمقارنات نصية موزعة في **~35 موضعًا** في الخلفية (`academic/views.py:23-69` + شروط داخل كل View) و**~40 موضعًا** في الواجهة.
- لا توجد Object-level permissions؛ التقييد يتم أحيانًا عبر `get_queryset` (وهو ما لا يحمي `create`، ولا الـ Actions المخصصة).
- نطاق مدير القسم/المشرف عبر حقول على `Department`؛ نطاق المدرس عبر `CourseInstructor`؛ لا نطاق كلية.
- جدول ما هو مطبّق فعلًا:

| الدور | ما يراه فعلًا | ما يجب |
|---|---|---|
| student | مواده (قسم+مستوى) ✔، تسليماته ✔، نتائجه المنشورة ✔، **كل الواجبات في الكلية** ✖، **كل UniversityStudent** ✖، **إنشاء مستخدمين** ✖ | بياناته ومواده المسجل فيها فقط |
| teacher/ta | مواده ✔ ومحاضراتها ✔، **كل الواجبات والتسليمات والنتائج** ✖، **كل الطلاب** ✖، **إنشاء مستخدمين** ✖ | مواده وطلابها فقط |
| supervisor | قسمه ✔ لكن **كل المدرسين عبر UserViewSet** ✖ | قسمه |
| department_manager | قسمه ✔، **تعديل أي مدرس/معيد بما فيه الدور** ✖، كل رسائل التواصل | قسمه؛ لا يدير حسابات |
| event_manager | الفعاليات ✔ | + الإعلانات والمحتوى |
| system_manager | كل شيء ✔ | كل شيء |

### H.2 التوصية: Roles + Permissions + Scope

لا حاجة لإنشاء دور لكل حالة. المقترح:

1. **Roles (ثابتة، قليلة):** `system_admin`, `university_admin`, `registrar`, `department_manager`, `teacher`, `ta`, `student`, `content_manager`, `inquiries_officer`.  
   - `supervisor` الحالي يُبقى مؤقتًا ثم يُدمج كـ `department_manager` بصلاحية `can_delete=false` (هو نفس الدور بقدرات أقل).  
   - `event_manager` → يُعاد تسميته `content_manager`.  
   - `college_admin` لا يُضاف الآن (الكلية واحدة)؛ يُغطّى بـ `university_admin` مقيّدًا بالكلية عبر النطاق.
2. **Permissions:** Django `Permission`/`Group` القياسية لكل Model + صلاحيات مخصصة (`publish_result`, `import_results`, `review_application`, `register_student`, `host_live_session`, `manage_announcements`, `resolve_inquiry`). كل دور = Group.
3. **Scope:** جدول `RoleAssignment(user, role, college NULL, department NULL, program NULL)` يحل محل `Department.department_manager/supervisor` ويسمح بمدير لأكثر من قسم أو مسجل لكلية.
4. **التطبيق في DRF:** صنف واحد `ScopedPermission` يقرأ `required_perms` من الـ View ويستدعي `has_object_permission` عبر دالة نطاق لكل Model (`scope_of(obj) → (college, department, offering)`)، مع Managers توفر `for_user(user)` لكل Model بدل تكرار الشروط في كل `get_queryset`.
5. **الواجهة:** `/auth/me/` يعيد قائمة `permissions` + `scopes`؛ الواجهة تُخفي/تحرس المسارات بناءً عليها (تحسين UX فقط، الحماية في الخلفية).
6. **الانتقال:** الإبقاء على `User.role` كدور أساسي مُشتق خلال مرحلة انتقالية، ثم إزالته.

**مصفوفة الأدوار المستهدفة (مختصرة):**

| القدرة | sys_admin | univ_admin | registrar | dept_mgr | teacher | ta | student | content_mgr | inquiries |
|---|---|---|---|---|---|---|---|---|---|
| إدارة المستخدمين والأدوار | ✔ | ✔ (بلا sys_admin) | – | – | – | – | – | – | – |
| الهيكل الأكاديمي (كليات/أقسام/برامج/Terms) | ✔ | ✔ | قراءة | قسمه (المواد/التعيين) | – | – | – | – | – |
| طلبات القبول: مراجعة/قبول/رفض | ✔ | ✔ | ✔ (كليته) | قراءة قسمه | – | – | – | – | قراءة (حالة فقط) |
| تسجيل الطالب/الرقم الجامعي/Enrollment | ✔ | ✔ | ✔ | – | – | – | – | – | – |
| رفع سجل الطلاب | ✔ | ✔ | ✔ | – | – | – | – | – | – |
| محاضرات/واجبات في Offering | ✔ | ✔ | – | قسمه | مواده | مواده (بلا حذف) | قراءة مواده | – | – |
| تصحيح | ✔ | – | – | – | مواده | مواده (إن سُمح) | – | – | – |
| اختبارات: إنشاء/نشر | ✔ | – | – | قراءة | مواده | – | تأدية | – | – |
| نتائج: استيراد/نشر | ✔ | ✔ | ✔ | قراءة قسمه | قراءة مواده | – | نتائجه | – | – |
| Live rooms: إنشاء ثابتة / جلسة | ✔ / ✔ | ✔ / – | – | قسمه / – | – / مواده | – | انضمام | – | – |
| إعلانات/فعاليات/محتوى | ✔ | ✔ | – | قسمه (إعلان قسم) | مادته (إعلان مادة) | – | قراءة | ✔ | – |
| استفسارات | ✔ | قراءة | قراءة قبول | – | – | – | – | – | ✔ |
| Audit log | ✔ | ✔ | نطاقه | نطاقه | – | – | – | – | – |

---

## I. Student Lifecycle Review

| المرحلة | الحالة | الفجوة |
|---|---|---|
| Registration (إنشاء حساب) | موجود | التحقق ضعيف (E7)؛ الطالب يحدد مستواه |
| Identity Verification | جزئي | رقم + اسم فقط؛ لا OTP/بريد/تفعيل من المسجل؛ رسائل خطأ كاشفة |
| Account Creation | موجود | ربط `User↔UniversityStudent` صحيح المبدأ لكن السجل الأكاديمي يرتبط بـ `User` |
| Enrollment | **مفقود** | مُستنتج من (قسم، مستوى) |
| Semester (Term) | **مفقود** | لا كيان زمني |
| Courses | موجود | كل مواد المستوى بلا فصل حالي |
| Lectures | موجود | روابط عامة؛ لا تتبع مشاهدة/إكمال |
| Learning materials | موجود (ملف واحد + فيديو + رابط لكل محاضرة) | لا تعدد موارد لكل محاضرة |
| Assignments | موجود | بلا Late policy، إعادة تسليم، أنواع ملفات، روابط |
| Exams | **مفقود** | |
| Grades (داخل المادة) | جزئي | درجات التسليمات فقط؛ لا Gradebook مجمّع |
| Results (نهائية) | موجود بشكل بدائي | يدوي، بلا Term، بلا تاريخ |
| Notifications | **مفقود** | |
| Academic status (منتظم/موقوف/متخرج) | **مفقود** | |
| Transcript / تاريخ أكاديمي | **مفقود** | |

**I.2 توصية للتحقق من هوية الطالب الحالي:** مطابقة الرقم والاسم وحدها **غير كافية**. المقترح (بترتيب الأثر/التكلفة):
1. **إلزامي:** عدم كشف سبب الفشل بالتفصيل (رسالة واحدة: "البيانات غير متطابقة")، Throttle على `/register/`، ومنع أكثر من حساب لكل سجل (موجود عبر `is_registered` + OneToOne).
2. **إلزامي:** عامل تحقق ثانٍ من السجل الرسمي المرفوع: بريد أو هاتف مسجل لدى الكلية → OTP، **أو** "رمز تفعيل" يُطبع/يُوزَّع من المسجل لكل طالب (مناسب حين لا تتوفر بريد/هواتف موثوقة)، **أو** حقل تحقق إضافي غير علني (تاريخ الميلاد أو رقم الهوية جزئيًا).
3. **بديل تشغيلي:** حالة `pending_activation` يعتمدها المسجل من لوحته (مناسبة للأعداد الصغيرة).
4. منع الوصول لبيانات طالب آخر: يُحل بإصلاح E3 وربط كل السجلات بـ `StudentRecord` + `for_user()` managers.
5. التلاعب بالرقم/الاسم: الرقم يُنشأ من المسجل فقط (Sequence)؛ الاسم لا يُعدَّل من الطالب (موجود جزئيًا: `ProfileUpdateView` يمنع `full_name_ar` للطالب).

---

## J. Teacher Lifecycle Review

| القدرة | الحالة | ملاحظة |
|---|---|---|
| مشاهدة مقرراته فقط | ✔ للمواد والمحاضرات | ✖ للواجبات/التسليمات/النتائج (E6, E5) |
| رفع المحاضرات | ✔ | عبر Django (E14) |
| إدارة ملفات المقرر | جزئي | ملف واحد لكل محاضرة؛ لا مجلد موارد |
| إنشاء الاختبارات | ✖ | |
| إنشاء التمارين | ✔ | بدائي |
| متابعة الطلاب | ✖ | لا قائمة طلاب المادة (لا Enrollment) — `ResultsPublish` يجلب كل مستخدمي الكلية |
| مشاهدة التسليمات | ✔ | |
| التصحيح | ✔ (المدرس فقط) | المعيد ممنوع بالكامل — يُستحسن جعله إعدادًا لكل Offering |
| متابعة درجات الطلاب (Gradebook) | ✖ | |
| إحصائيات الاختبارات | ✖ | |
| من لم يسلّم | ✖ | يتطلب Enrollment |
| إعلانات المقرر | ✖ | |
| أداء الطلاب | ✖ | |
| حذف محاضراته/واجباته | ✖ (مدير القسم فقط) | قرار تصميمي مقبول، لكن يُفضّل السماح بالحذف قبل أي تسليم/مشاهدة |

---

## K. Applicant & Admission Lifecycle Review

### K.1 الموجود / المفقود

| المرحلة | موجود | مفقود | يحتاج Model جديد | قابل لإعادة الاستخدام |
|---|---|---|---|---|
| Visitor → Browse Programs | صفحات الأقسام العامة (`Departments.jsx`, `DepartmentDetail.jsx`) | Program، حالة فتح التقديم | `Program`, `ProgramIntake`, `AdmissionCycle` | `Department` + نمط الصفحات العامة |
| Select Program | – | كل شيء | – | – |
| Application | – | كل شيء | `Application` | نمط `ContactMessageCreateView` (AllowAny + Throttle) |
| Document Submission | – | كل شيء | `ApplicationDocument`, `DocumentType` | `BunnyStorage` (بمنطقة خاصة) |
| Application Review | – | كل شيء | `ApplicationStatusHistory`, `ApplicationNote` | نمط `ActivityLog` كبذرة لـ AuditLog |
| Acceptance/Rejection | – | كل شيء | – | – |
| Registration → University ID | جزئي (رفع `UniversityStudent` يدويًا/جماعيًا) | توليد الرقم، الربط بالطلب | `StudentRecord.application`, `UniversityNumberSequence` | `UniversityStudent` |
| Student Account | موجود (Register) | التفعيل برابط/رمز | `ActivationToken` | `StudentRegistrationSerializer` (تعديل) |
| Enrollment | – | كل شيء | `Enrollment`, `CourseOffering`, `Term` | – |

### K.2 Visitor / Applicant / Student / User

- **Visitor:** بلا سجل.  
- **Applicant:** صف في `Application` **بدون `User`**. المتابعة عبر `reference_no` + تحقق (OTP على البريد أو الهاتف، أو رابط سحري موقّع بصلاحية زمنية). هذا يمنع تكدّس حسابات في `auth_user` ويبسّط الخصوصية (حذف الطلبات المرفوضة بعد مدة).  
- **Student:** `StudentRecord` (يُنشأ فقط عند التسجيل الرسمي).  
- **User:** يُنشأ فقط عند التفعيل. `StudentRecord.user` nullable.

### K.3 Data Model المقترح للقبول

```
AdmissionCycle(academic_year FK, name, opens_at, closes_at, is_active)
ProgramIntake(cycle, program, is_open, opens_at, closes_at, capacity NULL, requirements_ar/en, required_documents M2M DocumentType, form_schema JSON NULL)
   unique(cycle, program)
Application(reference_no unique [مثال: APP-2026-000123], intake, status,
            full_name, email, phone_e164, birth_date NULL, nationality NULL, address NULL, national_id NULL(مشفّر/مقنّع),
            prev_certificate, graduation_year, school, score, prev_major NULL, study_type NULL,
            extra JSON (الحقول القابلة للتهيئة), submitted_at, verified_email_at, verified_phone_at,
            reviewer FK NULL, decision_at, decision_by, decision_note, student_record 1─1 NULL)
   index(email), index(phone_e164), index(intake, status)
ApplicationDocument(application, doc_type, file (منطقة خاصة), uploaded_at, status pending|accepted|rejected, note)
ApplicationStatusHistory(application, from_status, to_status, changed_by NULL(المتقدم نفسه), note, at)  -- append-only
ApplicationVerification(application, channel email|sms, code_hash, expires_at, used_at)
```

**الحقول:** الضرورية فقط في الأعمدة (الاسم، البريد، الهاتف، البرنامج، الشهادة السابقة، سنة التخرج، النسبة) والباقي في `extra` JSON وفق `ProgramIntake.form_schema` ليكون النموذج Configurable لاحقًا بلا Migrations.

### K.4 Workflow الحالات

```
draft ─▶ submitted ─▶ under_review ─┬─▶ missing_documents ─▶ under_review (تكرار)
                                    ├─▶ eligible ─┬─▶ accepted ─▶ registered ─▶ activated
                                    │             ├─▶ waitlisted ─▶ accepted | rejected
                                    │             └─▶ rejected
                                    └─▶ rejected
أي حالة قبل accepted ─▶ withdrawn (بطلب المتقدم)   ;   submitted/under_review بعد إغلاق الدورة ─▶ expired
```

- الانتقالات مُعرَّفة في جدول انتقال واحد (State machine) مع الدور المسموح لكل انتقال؛ كل انتقال يكتب صفًا في `ApplicationStatusHistory` (لا حذف) و`AuditLog`.
- `registered` = تم إنشاء `StudentRecord` وربطه؛ `activated` = أنشأ المتقدم حسابه.

### K.5 تحويل Applicant → Student بلا تكرار

عملية واحدة ذرّية `register_applicant(application, registrar)`:
1. التحقق أن الحالة `accepted` ولا يوجد `student_record`.
2. إنشاء `StudentRecord` من الطلب (الاسم، البريد، الهاتف، الجنسية، تاريخ الميلاد، البرنامج، المستوى 1، Term الحالي) — **نسخ الحقول الهوياتية فقط**؛ الشهادات والمستندات **لا تُنسخ** بل يُشار إليها عبر `StudentRecord.application`.
3. توليد `university_number` من `UniversityNumberSequence(college, year)` بصيغة قابلة للتهيئة (مثلًا `26-IT-0123`) — أو إدخاله يدويًا إن كانت الكلية تعتمد نظامًا خارجيًا (خيار في الإعدادات).
4. إنشاء `ActivationToken` وإرساله (بريد/SMS) أو طباعته.
5. الحالة → `registered`، وتسجيل تدقيقي.

الطالب لاحقًا يفتح رابط التفعيل → يضع كلمة المرور → `User` يُنشأ ويُربط. لا إدخال يدوي مكرر.

### K.6 سياسة منع التكرار

- **داخل نفس الدورة:** تُسمح حتى N طلبات (إعداد، افتراضي 2–3) لبرامج مختلفة **لنفس البريد المُتحقَّق منه**؛ يُرفض طلب ثانٍ لنفس البرنامج ما لم يكن السابق `rejected/withdrawn/expired`.
- **الهاتف:** إشارة تحذير للمراجع (Duplicate hint) لا مانع صلب (أُسر تشترك في هاتف).
- **رقم الهوية (إن استُخدم):** تخزين Hash (SHA-256 + pepper) لكشف التكرار بلا كشف الرقم؛ عند التطابق يُعرض للمراجع "طلب سابق مرتبط".
- **دورة جديدة:** مسموح؛ يُعرض تاريخ الطلبات السابقة للمراجع.
- **التعديل:** فقط في `draft` و `missing_documents` (والحقول المطلوبة فقط).
- **طلب قديم مرفوض:** لا يمنع؛ يُظهر ملاحظة الرفض للمراجع.

### K.7 دور المسجل (College Registrar)

المسمى المقترح: **مسجل الكلية (College Registrar)**؛ النطاق: كلية. الصلاحيات (Least privilege): كل ما في K.1–K.5 + إدارة `StudentRecord` (الحالة الأكاديمية، المستوى، البرنامج) + Enrollment + رفع سجل الطلاب + استيراد/نشر النتائج (بالتنسيق مع الإدارة) + قراءة الاستفسارات من نوع "قبول". **لا** يدير المستخدمين، الأقسام، المواد، المحاضرات، الاختبارات.

**Dashboard المسجل:** عدادات الحالات، الطلبات حسب البرنامج/القسم/الفترة، المقبولون غير المسجلين، المسجلون غير المفعّلين؛ جدول بحث/فلترة/فرز/ترقيم (Server-side)؛ تصدير CSV. هذه الحاجة حقيقية لأن حجم الطلبات موسمي وكبير.

---

## L. Inquiry & Communication Review

**الموجود:** `ContactMessage` (اسم، بريد، هاتف نصي، موضوع، رسالة، `is_read`) + عرض للإدارة + زر `mailto:`. لا حالات، لا نوع، لا مسؤول، لا سجل ردود، لا WhatsApp، لا Throttle على النموذج العام.

**المقترح (المرحلة الأولى — Inquiry Management System بلا دمج بريد وارد):**

```
Inquiry(reference_no, name, email, phone_e164 NULL, phone_raw, type admission|registration|fees|programs|study|technical|general,
        college NULL, program NULL, subject, message, status new|in_progress|waiting_for_user|resolved|closed,
        assigned_to NULL, application NULL (ربط يدوي فقط), source web|whatsapp|phone, created_at, first_response_at, resolved_at)
InquiryMessage(inquiry, author NULL(الزائر)|User, channel internal_note|email_out|whatsapp_note, body, sent_at)
InquiryStatusHistory(inquiry, from, to, by, at, note)
```

- **الدور:** `inquiries_officer` (مسؤول الاستفسارات والقبول — Admissions & Inquiries Support Officer). يرى ويعالج الاستفسارات فقط.
- **WhatsApp:** عند الحفظ يُطبَّع الهاتف إلى E.164 بمكتبة `phonenumbers` (رمز الدولة الافتراضي `SD`); يُخزَّن `phone_e164` فقط إن كان صالحًا. الواجهة تبني الرابط **من `phone_e164` القادم من الـ API حصرًا**: `https://wa.me/<digits>?text=<urlencoded>` مع نص مبدئي قابل للتحرير ("مرحبًا، نتواصل معك بخصوص استفسارك لدى الكلية")؛ لا إرسال تلقائي؛ الضغط يفتح تبويبًا جديدًا (`rel="noopener"`). إذا لم يكن الرقم صالحًا يُعرض الرقم الخام بلا زر.
- **الرد بالبريد (المرحلة الأولى):** إرسال صادر فقط من داخل المنصة عبر Email backend (SMTP/Resend/SES) مع حفظ نسخة في `InquiryMessage`؛ الرد الوارد يبقى في صندوق البريد الرسمي (بلا Parsing). Templates لاحقًا.
- **الربط بالتقديم:** اقتراح تلقائي (بريد متطابق **ومُتحقَّق منه**، أو `reference_no` مذكور في الرسالة) يُعرض للمسؤول ليؤكده يدويًا — لا ربط تلقائي.
- **تحويل Inquiry → Lead:** زر "إنشاء طلب مسودة" يُنشئ `Application(draft)` مسبق التعبئة ويرسل رابط الاستكمال للبريد المُتحقَّق منه.
- **حماية النموذج العام:** Throttle (مثلًا 5/ساعة لكل IP)، Honeypot field، وCaptcha (Turnstile) اختياريًا.

---

## M. Exams Architecture

### M.1 Data Model

```
Exam(offering FK, title, description, start_at, end_at, duration_minutes, total_marks (محسوب/مُخزَّن), pass_marks,
     max_attempts=1, result_visibility immediate|after_end|manual, allow_backtrack bool, shuffle_questions bool, shuffle_choices bool,
     status draft|published|closed|archived, grace_seconds=30, created_by, published_at)
Question(exam, order, type, text (rich text مطهَّر), marks, explanation, config JSON, is_required)
Choice(question, order, text, is_correct)                      -- لأنواع الاختيار
ExamAttempt(exam, student_record, attempt_no, started_at, deadline_at, submitted_at NULL, status in_progress|submitted|auto_submitted|expired|invalidated,
            score NULL, passed NULL, question_order JSON, choice_orders JSON, client_meta JSON, last_saved_at)
   unique(exam, student_record, attempt_no)
StudentAnswer(attempt, question, answer JSON, saved_at, is_correct NULL, marks_awarded NULL, graded_by NULL, graded_at NULL, needs_manual bool)
   unique(attempt, question)
```

### M.2 أنواع الأسئلة القابلة للتوسع

Registry في الكود: `QUESTION_TYPES = {"single_choice": SingleChoiceType, "multiple_choice": ..., "true_false": ..., "short_answer": ..., "fill_blank": ...}` وكل نوع يطبّق واجهة:
- `validate_question(config, choices)`
- `validate_answer(answer_json)`
- `grade(question, answer_json) -> (marks, is_correct, needs_manual)`
- `render_schema()` للواجهة (لتوليد النموذج ديناميكيًا).

`Question.type` سلسلة، `config` JSON (مثلًا: `case_sensitive`, `accepted_answers[]`, `partial_credit`). إضافة نوع جديد = صنف جديد + إدخال في الـ Registry، بلا Migration. `true_false` هو `single_choice` بخيارين ثابتين.

### M.3 التصحيح وسيناريوهات الفشل

- **Server time هو المرجع:** `started_at = now()` عند بدء المحاولة؛ `deadline_at = min(started_at + duration, exam.end_at)`؛ الواجهة تستقبل `server_now` و `deadline_at` وتحسب العداد بالفرق لا بساعة الجهاز.
- **Autosave:** `PUT /attempts/{id}/answers/{question_id}` كل تغيير (Idempotent, upsert)؛ يُرفض بعد `deadline_at + grace_seconds`.
- **Submit idempotent:** `POST /attempts/{id}/submit` يقبل مرة واحدة (تحقق الحالة داخل `select_for_update`)؛ الطلب المكرر يعيد النتيجة نفسها 200.
- **انقطاع/إغلاق المتصفح/إعادة الفتح:** المحاولة تبقى `in_progress` بإجاباتها المحفوظة؛ إعادة الفتح تستأنف بنفس `question_order` إن كان `allow_backtrack` وإلا من آخر سؤال غير مُجاب.
- **انتهاء الوقت:** مهمة دورية (كل دقيقة) تُحوِّل المحاولات المتجاوزة إلى `auto_submitted` وتصحّحها؛ وأيضًا يُصحَّح عند أول وصول بعد الموعد.
- **آخر ثانية:** يُقبل ضمن `grace_seconds`.
- **التصحيح الآلي:** فوري للأنواع الموضوعية؛ `short_answer` بقائمة إجابات مقبولة (تطبيع عربي: همزات/تاء مربوطة/تشكيل) وإلا `needs_manual`.
- **الأمان:** الإجابات الصحيحة **لا تُرسل** للواجهة أثناء المحاولة (Serializer خاص)؛ Throttle على Endpoints المحاولة؛ منع بدء محاولة خارج النافذة أو بلا Enrollment؛ `client_meta` للتحقيق (IP, UA, عدد إعادة الاتصال).
- **الأداء تحت الحمل:** انظر U.

---

## N. Assignments Architecture

### N.1 توسيع النموذج

```
Assignment(+ submission_types JSON [file, text, link], allowed_extensions JSON, max_file_size_mb, max_files,
           allow_resubmission bool, late_policy none|allow|penalty, late_penalty_percent, late_until NULL,
           grading_mode manual|rule|ai_assisted, rubric JSON NULL, status draft|published|closed)
AssignmentLinkField(assignment, label ["GitHub Repository"], required bool, url_pattern NULL ["^https://github\.com/"])
Submission(assignment, student_record, current_version FK, first_submitted_at, is_late)   unique(assignment, student_record)
SubmissionVersion(submission, version_no, content, files JSON[{name,key,size,mime,sha256}], links JSON[{field_id,url}], submitted_at, is_late)
SubmissionGrade(submission 1─1, score, feedback, rubric_scores JSON, source manual|rule|ai_suggested, status suggested|approved, graded_by, graded_at)
```

### N.2 الملفات

- التحقق على الخادم: الامتداد + MIME عبر توقيع الملف (`python-magic`) + الحجم؛ قائمة سماح افتراضية (pdf, docx, xlsx, pptx, zip, png, jpg) مع منع (exe, bat, sh, js, html, svg مع سكربت).
- التخزين في منطقة Bunny **خاصة** (Token auth) تحت `submissions/{offering}/{student}/{version}/`؛ التنزيل عبر Signed URL قصير العمر من الخادم بعد التحقق.
- فحص ZIP: حد للحجم بعد فك الضغط، منع مسارات `../`، وحد لعدد الملفات (Zip bomb).
- فحص فيروسات: اختياري عبر ClamAV في Worker (يضع `scan_status` ويحجب التنزيل حتى النجاح).
- الرفع المباشر للمتصفح (Signed upload إلى Bunny) عند تجاوز ~20MB لتجنب E14.

### N.3 التصحيح التلقائي — تصنيف صريح

| الفئة | أمثلة | الآلية |
|---|---|---|
| **موثوق آليًا** | إجابات نصية قصيرة بقيم محددة؛ ملفات Excel بخلايا/معادلات معروفة النتيجة (openpyxl)؛ اختبارات وحدة لمشاريع برمجية داخل Sandbox معزول بلا شبكة وبحدود وقت/ذاكرة (خدمة تنفيذ خارجية أو عزل على مستوى النظام — لا Docker) | Rule engine → `SubmissionGrade(source=rule, status=approved)` إذا فعّل الأستاذ "اعتماد تلقائي" |
| **جزئي بالقواعد** | PDF: وجود الملف، عدد الصفحات، وجود عناوين مطلوبة (نص مستخرج)؛ GitHub: المستودع عام، يحتوي README، عدد Commits، اللغة؛ Live demo: الرابط يرد 200 | يحدد الحد الأدنى/الأقصى ويترك الباقي للأستاذ |
| **AI مع Rubric** | مقالات، تقارير، إجابات مفتوحة، مراجعة كود | LLM يقيّم وفق Rubric مهيكل ويعيد درجة لكل معيار + مبرر → `status=suggested` **دائمًا**؛ الأستاذ يعتمد/يعدّل |
| **بشري فقط** | مشاريع تصميم، عروض، أعمال إبداعية، ما لا Rubric له | يدوي |

**Architecture آمنة لـ AI-assisted grading:**
- خدمة داخلية `grading_ai` تُستدعى من Worker (ليس من الطلب المتزامن)، تستقبل Rubric + نص مُستخرج (لا الملف الخام إن أمكن) مع إزالة اسم الطالب ورقمه (Pseudonymization).
- Prompt وإخراج بصيغة JSON مُحكمة (`{criteria:[{id, score, max, justification}], flags:[]}`)؛ يُخزَّن كاملًا مع `model_id` و`prompt_version` للتدقيق.
- الدرجة **لا تُعتمد** ولا تُعرض للطالب إلا بعد اعتماد الأستاذ؛ اختلاف > X% بين AI والأستاذ يُسجَّل لتحسين الـ Rubric.
- Rate/Cost limits لكل Offering؛ خيار تعطيل على مستوى الكلية.
- الطلاب يُعلَمون بالسياسة (شفافية).

---

## O. Academic Results Architecture

### O.1 Data Model

```
ResultImportBatch(file, uploaded_by, term, college NULL, status uploaded|validated|has_errors|committed|rejected,
                  detected_columns JSON, summary JSON {rows, matched, unmatched, duplicates, invalid, to_create, to_update}, committed_at, committed_by)
ResultImportRow(batch, row_no, raw JSON, student_record NULL, offering NULL, normalized JSON, errors JSON, action create|update|skip|error)
AcademicResult(student_record, offering, term (denormalized للفهرسة), score DECIMAL(5,2) NULL, letter, grade_points NULL,
               status pass|fail|incomplete|withdrawn|absent, is_published, published_at, published_by, import_batch NULL, entered_by NULL, notes)
   unique(student_record, offering)  -- إعادة المادة = Offering مختلف في Term مختلف → صف جديد
GradingScale(program NULL, ranges JSON [{min, max, letter, points}])  -- لحساب التقدير آليًا من الدرجة
TermResultRelease(term, college NULL, program NULL, is_visible_to_students, released_at, released_by)
```

### O.2 خط الاستيراد

1. **Upload** (CSV/XLSX ≤ 10MB) → Worker: قراءة الرؤوس، مطابقتها بقاموس أسماء (عربي/إنجليزي) → `detected_columns`؛ لو غابت أعمدة إلزامية (الرقم الجامعي، رمز المقرر، الدرجة أو التقدير) → `has_errors`.
2. **Validate** كل صف: مطابقة الطالب بالرقم الجامعي (**وحده**؛ الاسم للتحقق التحذيري فقط)، المقرر بالرمز → Offering في الـ Term المحدد (يُرفض إن لم يوجد؛ خيار "إنشاء Offering تلقائيًا" للمسؤول)، الفصل/العام يجب أن يطابقا Term المختار، الدرجة رقم 0..100، التكرار داخل الملف (نفس طالب+مقرر) يُعلَّم، النتيجة الموجودة مسبقًا تُعلَّم `update` مع القيمة القديمة.
3. **Preview**: جدول بصفوف ملونة (إنشاء/تحديث/خطأ) مع فلاتر، وتنزيل تقرير الأخطاء.
4. **Commit** داخل `transaction.atomic` (بحجم دفعات) → `AcademicResult` + `AuditLog` لكل تغيير بقيمه القديمة/الجديدة + `import_batch`. الصفوف الخاطئة تُستبعد (أو يُرفض الملف كله حسب خيار).
5. **Publish** خطوة منفصلة على مستوى Batch أو Term (`TermResultRelease`).

### O.3 عرض الطالب

- الواجهة الأساسية: نتائج `Term` الحالي فقط حيث `TermResultRelease.is_visible` و`is_published`.
- تبويب "السجل الأكاديمي": كل الفصول السابقة، مقيّد بإعداد `show_history_to_students` (Policy لكل كلية) وبصلاحية.
- المعدل الفصلي/التراكمي يُحسب من `grade_points × credit_hours` عند الطلب (أو يُخزَّن Snapshot لكل Term).

### O.4 الهجرة من الوضع الحالي

`CourseResult` (student=User, course) → لكل صف: `student_record = user.university_student`، `offering = get_or_create(course, term=LEGACY)`. الصفوف بلا `university_student` تُسجَّل في تقرير هجرة. الجدول القديم يُبقى للقراءة ثم يُحذف.

---

## P. Live Rooms Architecture

### P.1 أين تقع الغرفة في الهيكل؟

بعد مراجعة الـ Models: المجموعة الطبيعية للطلاب اليوم هي `(department, level)` والمادة هي `Course`. بعد إضافة `Term`/`Offering`/`Program`:

- **الغرفة الثابتة (Room)** تنتمي إلى **Cohort** = `(program, level, term)` (يُبسَّط إلى `(department, level, term)` ما دام البرنامج ≈ القسم). مثال: "غرفة المستوى الأول — تقنية المعلومات — خريف 2026".
- **الجلسة (Session)** تنتمي إلى **CourseOffering** (وهو نفسه مرتبط بـ Term وبالأساتذة). مثال: "محاضرة قواعد البيانات — الاثنين 10ص".
- إذًا **النموذج الثاني** في الطلب (Department → Program → Level → Semester → Course → Live Session) هو الصحيح للجلسات، و**النموذج الأول** (… → Semester → Live Room) هو الصحيح للغرف الثابتة. كلاهما يُمثَّل بحقل نطاق واحد:

```
LiveRoom(name, scope_type cohort|offering, cohort FK NULL, offering FK NULL, provider jitsi|livekit|zoom..., provider_room_id,
         owner FK User, is_persistent bool, is_active, settings JSON)   CHECK(exactly one scope)
LiveSession(room, offering NULL (للغرف الثابتة حين تُستخدم لمادة), title, host FK, scheduled_start, scheduled_end, actual_start NULL, actual_end NULL,
            status scheduled|live|ended|cancelled, join_policy enrolled_only|cohort|open_internal, recording_enabled, provider_session_id)
SessionAttendance(session, student_record, joined_at, left_at NULL, duration_seconds (مجمّع), rejoin_count, source webhook|client_ping)
Recording(session 1─1, provider_recording_id, status processing|ready|failed, bunny_video_id, duration, lecture_resource FK NULL)
```

### P.2 الملكية والصلاحيات

- إنشاء غرفة Cohort: `department_manager` (قسمه)، `university_admin`, `system_admin`.
- إنشاء غرفة/جلسة Offering: أستاذ المادة (عبر `OfferingInstructor`) + ما سبق.
- بدء الجلسة: `host` أو مدرس المادة.
- الانضمام: **الخادم يُصدر رمز انضمام (JWT للمزوّد) لكل مستخدم بعد التحقق** من (Enrollment في Offering) أو (StudentRecord ∈ Cohort) أو (دور إداري في النطاق). لا يوجد URL عام؛ روابط المزوّد تُخفى خلف `POST /sessions/{id}/join` الذي يعيد الرمز بصلاحية دقائق.
- **الحضور:** يُسجَّل من Webhooks المزوّد (joined/left) ويُكمَّل بـ Heartbeat من الواجهة كل 60 ثانية. **الاتصال ≠ حضور**: تُعرَّف Policy لكل Offering: `attendance_threshold_percent` (مثلًا ≥ 70% من مدة الجلسة الفعلية) → `present`، وإلا `partial`/`absent`؛ الأستاذ يستطيع التعديل يدويًا مع أثر تدقيقي. لا يُعتبر رسميًا إلا بعد اعتماد الأستاذ.

### P.3 اختيار التقنية — لا بناء WebRTC من الصفر

| المعيار | Jitsi (JaaS / Self-host) | BigBlueButton (Hosted) | LiveKit Cloud | Zoom (SDK/API) | MS Teams / Google Meet |
|---|---|---|---|---|---|
| التكلفة | Self-host: VPS ~20–60$/شهر؛ JaaS: مجاني حتى 25 MAU ثم بالدقائق | مزوّدون 50–200$/شهر | بالدقائق/الحجم؛ مجاني محدود | ترخيص لكل Host (~15$/شهر) | يتطلب اشتراكًا مؤسسيًا؛ Meet API محدود |
| عدد المستخدمين/غرفة | 50–100 عملي | 100–300 (مصمم للتعليم) | مئات–آلاف (SFU) | 100–1000 حسب الخطة | 250–1000 |
| التحكم بالصلاحيات | JWT بأدوار moderator/participant ✔ | API بأسرار + أدوار ✔ | JWT Grants دقيقة ✔ | عبر API؛ Guest links | ضعيف للتضمين |
| API/Webhooks | JaaS Webhooks (joined/left/recording) ✔؛ Self-host يحتاج Prosody events | ✔ (meeting ended, recording ready) | ✔ ممتاز | ✔ | محدود/معقّد |
| التسجيل | Jibri (ثقيل) / JaaS مدمج | مدمج ✔ | Egress → S3/HTTP ✔ | Cloud recording ✔ | ✔ لكن في حسابهم |
| الحضور | عبر Webhooks | ✔ تقرير مدمج | عبر Webhooks ✔ | تقارير API ✔ | محدود |
| Self-hosting | ✔ | ✔ (ثقيل: ≥ 8GB RAM) | ✔ (OSS) | ✖ | ✖ |
| الإنترنت الضعيف | جيد (Simulcast، خيار صوت فقط) | متوسط | ممتاز (SVC/Adaptive) | جيد جدًا | جيد |
| Bandwidth للطالب | ~0.3–1 Mbps | ~0.5–1.5 | ~0.2–1 (تكيّفي) | ~0.6–1.5 | ~1 |
| التضمين في المنصة | iframe/SDK ✔ | iframe ✔ | SDK كامل ✔ | Meeting SDK (ثقيل) | ✖ |

**التوصية:**
- **البداية (Phase Live-1):** **Jitsi** — إما JaaS (سرعة تشغيل، Webhooks وتسجيل جاهزان) أو Self-hosted على VPS واحد إذا كانت الميزانية هي القيد؛ ربط عبر JWT يولّده الخادم لكل انضمام. يغطي المحاضرات ≤ 100 طالب بتكلفة شبه معدومة.
- **الترقية عند الحاجة (تسجيل واسع، حضور دقيق، > 100 متزامن):** **LiveKit** (Cloud أو Self-host) بواجهة `LiveProvider` مجردة (`create_room`, `issue_token`, `start_recording`, `handle_webhook`) حتى يكون التبديل بلا تغيير في الـ Models.
- Zoom خيار عملي **فقط** إذا كانت الكلية تملك تراخيص أصلًا (تكامل بالـ API والتقارير)، Teams/Meet غير مناسبين للتضمين والتحكم.

### P.4 التسجيلات → Bunny

`Recording ready (webhook)` → Worker يطلب من **Bunny Stream** جلب الفيديو من رابط المزوّد (`POST /videos/fetch`) → عند اكتمال المعالجة (Bunny webhook) يُنشأ `LectureResource(type=video, bunny_video_id)` مرتبط بمحاضرة جديدة/موجودة في نفس Offering، فيرث Access Control المادة (Signed embed URLs بـ Token Authentication في Bunny Stream). الوحدة `bunny/stream.py` أساس صالح لإعادة الاستخدام بعد إضافة `fetch` و Token signing.

---

## Q. Announcements & Public Website

### Q.1 المحتوى

```
Announcement(title/ar, body/ar (Markdown مطهَّر), scope university|college|department|program|offering, scope_id, audience public|students|staff|all_internal,
             status draft|scheduled|published|expired|archived, publish_at, expires_at, is_featured, is_pinned, cover_image, attachments JSON, author, category news|academic|admission|event)
Event(الموجود + status/publish_at/expires_at/registration_url/scope/audience)
Page(slug, title, body, is_published)  -- عن الكلية، الرؤية، ... بدل النصوص الثابتة في ar.json
SiteSettings(singleton: اسم المؤسسة، الشعار، ألوان، بيانات الاتصال، روابط اجتماعية، WhatsApp الرسمي)
```
- الظهور: Manager `Announcement.objects.visible_for(user|None, now)` يطبق النطاق والجمهور والزمن.
- الدور `content_manager` (تطوير `event_manager`) يدير: Announcements (كل النطاقات)، Events، Pages، SiteSettings. مدير القسم يستطيع إعلان قسم؛ الأستاذ إعلان مادة.
- النشر المجدول عبر مهمة دورية أو حساب `status` ديناميكيًا من `publish_at/expires_at` (أبسط ولا يحتاج Worker).

### Q.2 الموقع العام والبوابة — التقسيم

الوضع الحالي: SPA واحدة وBackend واحد. التقييم:

| الخيار | الإيجابيات | السلبيات |
|---|---|---|
| نفس Frontend (الحالي) | بساطة النشر | حزمة الطالب تحمّل كود الموقع العام والعكس؛ SEO ضعيف للموقع العام (SPA بلا SSR)؛ كوكيز الجلسة على نفس النطاق العام؛ صعوبة تطوير الهويتين بشكل مستقل |
| **Monorepo بتطبيقي Frontend + Backend واحد** (موصى به) | فصل الحزم والنشر والهوية؛ الموقع العام يمكن أن يكون ثابتًا (SSG) ويُقدَّم من CDN؛ البوابة على `portal.` بكوكيز مستقلة؛ مشاركة `packages/ui` و`packages/api-client` | إعداد Monorepo (pnpm workspaces) وخطوة بناء ثانية |
| Backends منفصلة | – | لا مبرر: نفس البيانات (البرامج، الإعلانات، الطلبات) |

**التوصية:** Monorepo: `apps/public-site` (React/Vite أو Astro لـ SSG — Astro أفضل للـ SEO والأداء على الإنترنت الضعيف مع إبقاء React للمكونات التفاعلية) + `apps/portal` (React/Vite الحالي) + `packages/ui` + `packages/api`. Backend واحد بمساحتي API: `/api/public/*` (AllowAny، Cache-Control، Throttle) و `/api/v1/*` (مصادقة). النطاقات: `eust.edu.sd` (عام) و `portal.eust.edu.sd` (بوابة)؛ الكوكيز بـ `Domain` صريح للبوابة و`SameSite=Lax`؛ `CORS` للبوابة فقط. الموقع العام يُنشر على Bunny (Static) أو Render Static Site بتكلفة صفرية ولا يتأثر بتوقف الخادم.

**مرحلة انتقالية مقبولة:** إبقاء SPA واحدة مع Lazy loading لمسارات `/dashboard/*` والعكس، وبناء واجهة القبول العامة فيها — ثم الفصل في Phase الموقع العام.

---

## R. Infrastructure Review

| العنصر | الوضع | التقييم | التوصية |
|---|---|---|---|
| Render Web (free) | 2 sync workers، ينام بعد 15 دقيقة خمول، 512MB | غير مناسب للإنتاج: Cold start ~30–60s، لا تجاوز الحمل، الرفع يجمّد الخادم | **Starter** أو أعلى؛ gunicorn `--worker-class gthread --threads 4` أو uvicorn؛ خدمة **Worker** منفصلة (Celery) لاحقًا |
| Render Postgres (free) | خطة مجانية | **خطر DR حقيقي**: قواعد Render المجانية **تنتهي بعد 30 يومًا** ولا نسخ احتياطي | خطة مدفوعة (Basic+) بنسخ يومية؛ + `pg_dump` أسبوعي مشفّر إلى Bunny Storage عبر Cron؛ اختبار استعادة |
| Migrations في buildCommand | `render.yaml:10-13` | مقبول لخادم واحد؛ خطر مع عدة Instances | نقلها إلى `preDeployCommand` |
| Bunny Storage (عام) | يعمل | مناسب للتكلفة والـ CDN؛ **غير مناسب أمنيًا كما هو** | منطقتان: `public` (شعارات/صور فعاليات) و `private` بـ Token Authentication؛ الخادم يوقّع الروابط (`token`, `expires`, `path`) |
| الفيديو عبر Storage | MP4 خام عبر Django | سيئ للإنترنت الضعيف والتكلفة | **Bunny Stream** (HLS تكيّفي، Token embed، رفع مباشر TUS من المتصفح)؛ الوحدة موجودة جزئيًا |
| Static assets | `django.views.static.serve` | بطيء بلا Cache | WhiteNoise لـ `/assets` (تعديل `STATIC_URL`/الروابط) أو نشر الواجهة على CDN |
| Cache | لا يوجد | – | Redis (Render Key-Value) لـ Cache + Throttle + Celery broker؛ Cache-Control على `/api/public/*` |
| Email | لا يوجد | لازم للتفعيل والقبول والاستفسارات | مزوّد SMTP/API (Resend/SES/Mailgun) + قالب + Outbox |
| Monitoring/Logs | لا يوجد | – | Sentry (مجاني) + Logging JSON + Uptime check |
| WAF/Rate limiting | لا يوجد | – | Cloudflare أمام Render (مجاني): WAF، Rate rules، Bot protection، Cache للموقع العام |
| DB connections | `conn_max_age=600` | مناسب لـ 2–8 Workers على Postgres Render (97 اتصال) | عند > 20 Worker/Thread: PgBouncer |
| Backups/DR | لا شيء | **Critical** | كما أعلاه + توثيق RTO/RPO |
| Secrets | عبر Env ✔ | مقبول | تدوير مفاتيح Bunny؛ إزالة الافتراضيات غير الآمنة |

**الخلاصة:** Render و Bunny **مناسبان ويُبقيان**؛ التغيير المطلوب هو **الخطط** (لا المزوّد) وإضافة Redis + Worker + Email + منطقة تخزين خاصة + Bunny Stream.

---

## S. Technology Review

| التقنية | الاستخدام | التصنيف | السبب |
|---|---|---|---|
| Django 6 + DRF 3.16 | Backend/API | **Keep** | ناضج، Admin مجاني، ORM/Migrations، Permissions/Groups جاهزة، مناسب للفريق الحالي |
| PostgreSQL | DB | **Keep** | JSONB للحقول المرنة (Form schema، Answers)، قيود قوية |
| SQLite fallback | Dev | Keep (dev only) | – |
| SimpleJWT (كوكيز) | Auth | **Improve** | تثبيت Blacklist، دوران Refresh، Throttle؛ بديل مقبول: Django sessions (أبسط للـ SPA على نفس النطاق) — لا داعي للتغيير الآن |
| Custom role CharField | Authorization | **Replace (بالتدريج)** | استبداله بـ Groups/Permissions + RoleAssignment (H.2) |
| `ActivityLog` | Audit | **Replace** | بـ AuditLog عام بقيم قبل/بعد (يمكن عبر `django-auditlog` أو `django-pghistory`) |
| WhiteNoise + gunicorn | Serving | **Improve** | تفعيل WhiteNoise للـ assets، Threads/ASGI |
| Bunny Storage (Custom backend) | Files | **Improve** | Signed URLs، منطقة خاصة، حذف الملفات عند حذف السجل |
| Bunny Stream (وحدة مهملة) | Video | **Improve → Use** | إعادة تفعيلها برفع مباشر |
| requests | HTTP | Keep | – |
| openpyxl | Excel | Keep | يُستخدم للاستيراد؛ أضف `pandas` فقط إن لزم |
| React 19 + Vite 7 | Frontend | **Keep** | – |
| Tailwind 4 + CSS variables | Styling | **Keep + Improve** | إضافة طبقة Tokens ومكوّنات موحدة؛ Light theme |
| react-router 7 | Routing | Keep + Improve | Lazy routes + Role guards |
| axios | HTTP | Keep | إضافة معالجة ترقيم مركزية |
| i18next | i18n | Keep | إضافة EN + `dir` ديناميكي |
| jspdf/docx/file-saver | تصدير من المتصفح | **Improve** | التصدير من المتصفح مقبول للتقارير الصغيرة؛ التقارير الرسمية (كشوف نتائج) يفضّل توليدها في الخادم (WeasyPrint) لدعم العربية بدقة وللختم/التوقيع |
| JavaScript (بلا TypeScript) | Frontend | **Improve** | TypeScript تدريجيًا للملفات الجديدة (Exams/Admissions) — مشروع بهذا الحجم يستفيد كثيرًا |
| Committed `dist/` | Deploy | **Replace** | بناء الواجهة في CI/Render (Static Site) بدل الالتزام بها؛ يمنع تعارضات Git ويضمن تطابق المصدر |
| لا Background jobs | – | **Add** | Celery + Redis (أو `django-q2`/Huey لتقليل التعقيد) — ضروري للاستيراد، التصحيح الآلي، التسجيلات، الإشعارات، الإغلاق التلقائي للاختبارات |
| لا Cache | – | **Add** | Redis |
| لا WebSocket | – | **Later** | Django Channels عند الحاجة للإشعارات الفورية/حالة الاختبار؛ ليس ضروريًا في البداية (Polling كافٍ) |
| لا Email | – | **Add** | – |
| لا Tests/CI | – | **Add** | pytest-django + GitHub Actions؛ اختبارات صلاحيات لكل Endpoint أولًا |

لا يوجد مبرر لتغيير Stack؛ التغييرات المقترحة إضافات وتصحيحات.

---

## T. UI/UX Review

**الملاحظات (بلا تنفيذ):**

1. **الهوية:** الثيم الحالي (Dark glassmorphism، ذهبي على كحلي، `index.css:8-27`) ثيم عام لا يعكس هوية رسمية؛ يجب استبدال الألوان بلوحة الجامعة الرسمية عبر طبقة Tokens واحدة (`--brand-primary`, `--brand-secondary`, `--surface-*`) ودعم Light (افتراضي للمؤسسات) + Dark.
2. **الشعار:** `college_logo.png` مكرر في 3 مواضع؛ يُستخدم أيقونة بدل الشعار في الهيدر (`Dashboard.jsx:140-143`). يجب شعار SVG رسمي وقواعد استخدام (حد أدنى للحجم، مسافة آمنة).
3. **الخط:** Cairo من Google Fonts (`index.css:1`) — اعتماد خارجي بطيء على الإنترنت الضعيف ومحجوب أحيانًا؛ استضافة ذاتية (woff2) مع `font-display: swap`؛ اختيار خط عربي/لاتيني متناسق (IBM Plex Arabic / Noto Naskh / Tajawal).
4. **RTL:** يُطبَّق عبر `body{direction:rtl}` فقط؛ `index.html` بلا `dir="rtl"`؛ استخدام `pl-12`/`mr-auto` (فيزيائي) بدل `ps-`/`ms-` (منطقي) يكسر LTR عند إضافة الإنجليزية. التوصية: `dir` ديناميكي على `<html>` + Tailwind logical utilities.
5. **المكوّنات:** لا مكتبة مكوّنات؛ كل صفحة تعيد بناء Modals/Tables/Forms (مثلًا `TeacherCourses.jsx` 1338 سطرًا يحوي 4 Modals). التوصية: `packages/ui` بمكوّنات (Button, Input, Select, Modal, Table, Pagination, Toast, EmptyState, Badge) + `react-hook-form` + `zod`.
6. **الجداول والموبايل:** جداول الإدارة (`StudentsManage`, `UsersManage`, `ResultsPublish`) عريضة بلا تحويل لبطاقات على الشاشات الصغيرة؛ قائمة التنقل أفقية بتمرير (`Dashboard.jsx:186`).
7. **الحوارات:** `window.confirm/alert` (E.g. `MessagesView.jsx:716`, `StudentCoursesView.jsx:105`) — تُستبدل بمكوّن حوار وToast.
8. **Accessibility:** أزرار أيقونية بلا `aria-label` (بعضها بـ `title` فقط)، تباين `--color-text-muted` (#9ca3af) على `#0a0f1a` مقبول لكن على البطاقات الشفافة يقل؛ رسائل الخطأ غير مرتبطة بالحقول (`aria-describedby`)؛ لا `focus-visible` واضح؛ Modals بلا Focus trap/Esc.
9. **التنقل:** لا Breadcrumbs داخل المادة؛ الطالب والمدرس يشتركان في مسار `/dashboard/my-courses` بمكوّن مختلف (`Dashboard.jsx:273`) — يُفضَّل مسارات واضحة لكل دور (`/portal/student/...`, `/portal/teacher/...`).
10. **الاتساق:** أسماء المؤسسة الثلاثة المختلفة؛ بيانات اتصال وهمية؛ نصوص ثابتة في `ar.json` يجب أن تأتي من `SiteSettings/Page`.
11. **التغذية الراجعة:** شريط تقدم الرفع موجود (جيد) لكن أخطاء الـ API تُطبع في Console غالبًا بلا رسالة للمستخدم (`ResultsPublish.jsx:68`).
12. **Empty states و Loading skeletons:** Spinner موحّد فقط.

---

## U. Scalability Review

| الحجم | ما سيحدث بالبنية الحالية | المطلوب |
|---|---|---|
| **1,000 طالب** | يعمل بعد إصلاح E11 (الترقيم) و N+1 (E23)؛ رفع فيديو واحد يعطّل نصف السعة؛ الخادم المجاني ينام؛ صفحة النتائج غير قابلة للاستخدام | Phase 0+1: خطط مدفوعة، Threads، Redis، Bunny Stream، فهارس، ترقيم حقيقي |
| **10,000 طالب** | اختبار متزامن لـ 500 طالب = ~500 Autosave/5 ثوانٍ → 100 req/s على 2 workers = فشل؛ تقارير الكلية (`ComprehensiveReportView`) تستغرق ثوانٍ (N+1)؛ الرفع الجماعي للنتائج (10k صف) يتجاوز Timeout 120s؛ `ActivityLog` يتضخم | Workers 8–16 threads أو ASGI؛ Autosave مُجمَّع (Batch كل 10–15 ثانية) + Redis للحالة المؤقتة ثم Flush؛ الاستيراد في Worker؛ Materialized views للتقارير؛ Partition/Archive للـ Audit؛ Bunny CDN لكل الوسائط؛ Cloudflare Cache للموقع العام؛ Postgres Standard |
| **50,000 طالب** | غير ممكن بخادم واحد: الجلسات المتزامنة (Live) تحتاج SFU مُدار (LiveKit/JaaS)؛ الاختبارات تحتاج فصل مسار الاختبارات (Service/Instances مخصصة أثناء نافذة الاختبار) | Autoscaling (Render Pro أو الانتقال إلى Kubernetes/ECS)، Read replica للتقارير، PgBouncer، Rate limiting لكل مستخدم، Queue للأسئلة الثقيلة، Observability كاملة، اختبار حمل دوري (k6) |

**نقاط ساخنة محددة:** `ProfessorsListView`/`ComprehensiveReportView` (حلقات استعلام)، `AssignmentSerializer.get_submission_count`، `UserViewSet` بلا فهارس بحث، `LoginView` بثلاث استعلامات وبلا Throttle، رفع الملفات المتزامن مع الطلبات.

---

## V. Recommended Architecture

### V.1 المخطط المستهدف

```
                 ┌──────────────────────────────┐        ┌──────────────────────────────┐
  eust.edu.sd ──▶│ Public Site (SSG/React)      │        │ Portal SPA (React/Vite/TS)   │◀── portal.eust.edu.sd
  (CDN/Bunny)    │ برامج، إعلانات، تقديم، استفسار│        │ طالب/أستاذ/مسجل/إدارة       │  (CDN + Render static)
                 └──────────────┬───────────────┘        └──────────────┬───────────────┘
                                │ /api/public/*  (AllowAny, cached, throttled)            │ /api/v1/* (cookie JWT, CSRF)
                                ▼                                                         ▼
                 ┌────────────────────────────────────────────────────────────────────────────┐
  Cloudflare ──▶ │ Django API (Render Web, gthread/ASGI)                                      │
  (WAF/Rate)     │  apps: organization | academic | students | admissions | assignments | exams │
                 │        results | live | inquiries | content | audit | notifications | rbac  │
                 │  Services layer (use-cases): register_applicant, import_results, grade_attempt… │
                 └───────┬───────────────┬───────────────────┬───────────────────┬───────────┘
                         │               │                   │                   │
                   PostgreSQL        Redis (cache,        Celery Worker(s)    Webhooks in:
                   (managed,         throttle, broker)    - imports/exports    Bunny Stream, Jitsi/LiveKit,
                    backups)                              - AI grading         Email provider
                                                          - recordings ingest
                                                          - notifications outbox
                                                          - exam auto-submit (beat)
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
  Bunny Storage (private zone,       Bunny Stream (videos, HLS,
  signed URLs: docs/submissions/     token-auth embeds, TUS direct upload)
  application documents)
        Email/SMS provider (Resend/SES + SMS gateway محلي) ; Live provider (Jitsi → LiveKit)
```

### V.2 مبادئ التنفيذ

1. **طبقة Services:** كل عملية حساسة (تسجيل، قبول، نشر نتائج، تصحيح) دالة واحدة داخل `transaction.atomic` تكتب `AuditLog` — لا منطق أعمال في الـ Views.
2. **Managers `for_user()`** لكل Model بدل تكرار الشروط في `get_queryset`.
3. **Permissions مركزية** (H.2)؛ اختبار آلي لكل Endpoint × دور (Matrix test) يمنع تكرار E1–E6.
4. **Media Access Service:** دالة واحدة `signed_url(resource, user)` هي المخرج الوحيد لروابط الملفات.
5. **Provider abstractions:** `LiveProvider`, `EmailProvider`, `SmsProvider`, `VideoProvider` لتقليل الارتباط بمزوّد.
6. **Events داخلية** (Django signals أو Outbox) تغذي Notifications دون أن تعرفها الميزات (يسمح بإضافة الإشعارات لاحقًا).
7. **API versioning** `/api/v1/` + OpenAPI (drf-spectacular) لتوليد Client للواجهة.
8. **Frontend:** Monorepo، TypeScript للأجزاء الجديدة، `packages/ui` و`packages/api` (Client مولَّد)، Route guards من `permissions` القادمة من `/me`.

---

## W. Gap Analysis

| Module | Current State | Missing | Problem | Recommended Solution | Priority |
|---|---|---|---|---|---|
| Admissions | لا شيء | كل شيء | لا يمكن استقبال طالب قبل دخوله | `admissions` app (K.3–K.6)، صفحة تقديم عامة تقرأ `ProgramIntake` من DB | High |
| Applicant Management | لا شيء | Workflow، مستندات، تاريخ حالات، تحقق بريد/هاتف | – | State machine + History + Signed docs | High |
| Registrar Dashboard | لا شيء | الدور واللوحة | القبول يقع على `system_manager` | دور `registrar` + لوحة بإحصاءات/جدول Server-side | High |
| Inquiry Management | `ContactMessage` + `is_read` | أنواع، حالات، تعيين، سجل ردود، دور مختص، Throttle | مديرو الأقسام يرون كل الرسائل؛ لا متابعة | `inquiries` app (L) + `inquiries_officer` | Medium |
| WhatsApp Contact | لا شيء | زر آمن | الهاتف نص حر | `phonenumbers` → E.164 → `wa.me` من الـ API فقط | Medium |
| Academic Programs | لا شيء (القسم يمثّل البرنامج ضمنيًا) | Program، Intake، شروط، مستندات | التقديم مستحيل؛ الرفع الجماعي يحذف كلمة "بكالوريوس" من اسم القسم! | `Program` + `ProgramIntake` | High |
| Student Accounts | تسجيل بمطابقة رقم+اسم | تحقق ثانٍ، منع تعديل المستوى، ربط السجلات بـ `StudentRecord` | استيلاء على حسابات؛ تلاعب بالمستوى؛ PII مكشوف | I.2 + إصلاح E3/E7 | Critical |
| Courses | كتالوج بلا زمن | Term، Offering، Enrollment، Level واضح | لا يمكن التمييز بين الفصول؛ لا قائمة طلاب المادة | `Term`/`CourseOffering`/`Enrollment` + هجرة | High |
| Lectures | ملف+فيديو+رابط | موارد متعددة، Signed URLs، Bunny Stream، تتبع مشاهدة | روابط عامة؛ رفع يعطّل الخادم | `LectureResource` + Private zone + Stream | High |
| Exams | لا شيء | كل شيء | – | `exams` app (M) بعد Phase 1 | High |
| Assignments | أساسي | أنواع/حجم/روابط/إصدارات/Late/تصحيح آلي | الطالب يعدّل درجته؛ إعادة التسليم 500؛ لا موعد مفروض | N + إصلاح E2/E15/E16 | High (الأمني Critical) |
| Results | إدخال يدوي لكل طالب | استيراد، Term، Preview، تاريخ، تقدير محسوب، أثر | أول 20 مستخدم فقط؛ المعيد ينشر؛ لا Term | O + إصلاح E5/E11 | High |
| Live Rooms | لا شيء | كل شيء | – | P (Jitsi ثم LiveKit) | Medium |
| Live Sessions | لا شيء | كل شيء | – | P | Medium |
| Attendance | لا شيء | كل شيء | – | Webhooks + Heartbeat + Policy | Low–Medium |
| Recordings | لا شيء | كل شيء | – | Provider → Bunny Stream → LectureResource | Medium |
| Announcements | `Event` فقط | Announcement بنطاق/جمهور/جدولة/انتهاء، Pages، SiteSettings | نصوص ثابتة في الكود | Q.1 + `content_manager` | Medium |
| Notifications | لا شيء | كل شيء | – | Outbox + In-app أولًا ثم Email/Push | Low (بعد الأساس) |
| RBAC / Audit / Infra | أدوار نصية؛ `ActivityLog`؛ خطط مجانية | Groups/Permissions/Scope؛ AuditLog قبل/بعد؛ Redis/Worker/Email/Backups | كل الثغرات الحرجة؛ فقدان بيانات محتمل | Phase 0–1 | Critical |

---

## X. Roadmap

أعدت ترتيب المراحل عن المقترح في الطلب لسببين: (1) كل الميزات الجديدة تحتاج `Term/Offering/Enrollment/StudentRecord/RBAC` أولًا، (2) الاستفسارات والمحتوى صغيرة ومستقلة ويمكن تنفيذها بالتوازي مبكرًا لتحقيق قيمة سريعة.

### Phase 0 — Critical Fixes (أسبوع–أسبوعان، بلا Breaking changes)
- إغلاق E1/E4 (`UserViewSet`)، E2 (`SubmissionSerializer`)، E3 (`UniversityStudentViewSet`)، E5/E6 (ملكية المادة)، E17 (إخفاء بريد الموظفين).
- Throttling على login/register/contact/refresh؛ إلغاء الدخول بالاسم؛ `validate_password` في كل مسار.
- تثبيت `token_blacklist` + دوران Refresh + إبطال عند الخروج.
- تحقق نوع/حجم الملفات على الخادم؛ Bunny Token Authentication للمنطقة الحالية (تفعيل + توقيع في `BunnyStorage.url`).
- منع تعديل `year/semester` من الطالب.
- ترقية خطة Postgres + نسخ احتياطي فوري؛ Sentry.
- اختبارات صلاحيات آلية (Matrix) لكل Endpoint موجود + CI.
- إزالة PDFs من المستودع، تنظيف الكود الميت، إصلاح Favicon/assets serving.

### Phase 1 — Core Architecture (4–6 أسابيع)
- RBAC: Groups/Permissions + `RoleAssignment` + `ScopedPermission` + Managers `for_user()`؛ تعريف الأدوار الجديدة (registrar, content_manager, inquiries_officer) كـ Groups.
- الهيكل: `College`(اختياري كسجل واحد)، `Program`, `AcademicYear`, `Term`, `CourseOffering`, `Enrollment`؛ `Course.academic_year → level`؛ `UniversityStudent → StudentRecord` وربط `Submission/CourseResult` به؛ Migrations بيانات مع Term قديم.
- `AuditLog` عام (قبل/بعد) واستبدال `ActivityLog`.
- Redis + Worker (Celery/django-q2) + Email provider + Outbox.
- Bunny Stream برفع مباشر للفيديو؛ منطقة خاصة للتسليمات.
- ترقيم صفحات حقيقي في الواجهة + `packages/ui` أولية + Route guards + TypeScript للملفات الجديدة.
- OpenAPI + Client مولَّد.

### Phase 2 — Academic Results (2–3 أسابيع)
- `ResultImportBatch/Row`, `AcademicResult`, `GradingScale`, `TermResultRelease`؛ خط الاستيراد (Validate→Preview→Commit) في Worker؛ عرض الطالب للفصل الحالي + السجل الأكاديمي بصلاحية؛ هجرة `CourseResult`.

### Phase 3 — Admissions + Registrar Workflow (5–7 أسابيع)
- `Program/ProgramIntake/AdmissionCycle`، صفحة التقديم العامة (تقرأ من DB)، `Application` + مستندات خاصة + State machine + History + تحقق بريد/OTP + متابعة بالرقم المرجعي.
- دور المسجل ولوحته؛ `register_applicant` + Sequence الرقم الجامعي + تفعيل الحساب؛ سياسة التكرار؛ توليد `StudentRecord` بلا نسخ مستندات.

### Phase 4 — Inquiries & Content (2–3 أسابيع، يمكن بالتوازي مع 2–3)
- `Inquiry` + حالات + تعيين + E.164 + زر WhatsApp + رد بريدي صادر + `inquiries_officer`.
- `Announcement/Page/SiteSettings` + `content_manager` + جدولة/انتهاء + نطاق/جمهور.

### Phase 5 — Assignments v2 (3–4 أسابيع)
- الأنواع/الحجم/الروابط المسماة/الإصدارات/Late policy/إعادة التسليم؛ Signed downloads؛ فحص ZIP؛ Rule-based grading الأساسي؛ AI-assisted كـ Suggestion خلف Feature flag.

### Phase 6 — Exams (5–7 أسابيع)
- الـ Models + Registry الأنواع + المحاولات بزمن الخادم + Autosave + Auto-submit (beat) + تصحيح آلي + إحصاءات للأستاذ؛ اختبار حمل (k6) لـ 500 متزامن قبل الإطلاق.

### Phase 7 — Live Classes (3–4 أسابيع)
- `LiveProvider` + Jitsi (JaaS/Self-host) + JWT join + `LiveRoom/LiveSession` + Webhooks حضور + Policy + Recording → Bunny Stream → `LectureResource`.

### Phase 8 — Public Website Split (3–4 أسابيع)
- Monorepo، `apps/public-site` (SSG) على CDN بنطاق عام، `apps/portal` على `portal.`؛ Cookies/CORS مضبوطة؛ Cloudflare.

### Phase 9 — Notifications (2–3 أسابيع)
- In-app (Polling ثم Channels إن لزم)، Email، تفضيلات؛ Push لاحقًا (PWA/FCM).

### Phase 10 — UI/UX & Identity (متوازٍ من Phase 1، اكتمال 3–4 أسابيع)
- Tokens بالهوية الرسمية، Light theme، خط مستضاف، RTL/LTR منطقي، مكوّنات موحدة، Accessibility، جداول متجاوبة، إزالة `confirm/alert`.

### Phase 11 — Performance & Scaling (مستمر)
- Materialized views للتقارير، فهارس، Cache، Autoscaling، PgBouncer، اختبارات حمل دورية، Runbooks للنسخ والاستعادة.

**التقدير الإجمالي:** ~8–10 أشهر بفريق 2–3 مطورين؛ Phase 0 يجب أن يبدأ فورًا لأن النظام على Production بثغرات Critical.

---

## Y. الإجابة على أسئلة القسم 53

- **أين المنصة الآن؟** MVP لبوابة كلية واحدة يغطي المحاضرات والواجبات والنتائج اليدوية والفعاليات، على خطط مجانية، بثغرات صلاحيات حرجة وبلا بُعد زمني أكاديمي.
- **ما المشاكل؟** أخطرها 4 ثغرات Critical (E1–E4) و10 High؛ ثم غياب Term/Enrollment، هوية مزدوجة، ملفات عامة، ترقيم مكسور، رفع فيديو عبر الخادم، لا نسخ احتياطي.
- **ما الذي ينقصها؟** القبول، المسجل، الاختبارات، استيراد النتائج، البث، الإعلانات، الاستفسارات المهيكلة، الإشعارات، الصلاحيات المركزية، التدقيق، الاختبارات الآلية.
- **هل Architecture مناسبة؟** الأساس نعم؛ الطبقات الأربع (صلاحيات، هيكل أكاديمي، هوية الطالب، وصول الملفات) تحتاج إعادة تصميم قبل أي ميزة جديدة.
- **هل التقنيات مناسبة؟** نعم (Keep) مع إضافات (Redis/Worker/Email/Stream/TS) واستبدالين (أدوار نصية → RBAC؛ `dist` مُلتزَم → بناء في CI).
- **ما الذي يُصلح قبل الميزات؟** Phase 0 ثم Phase 1 كاملة.
- **هل تستقبل طالبًا قبل دخوله؟** لا حاليًا؛ نعم بعد Phase 3 عبر Application بلا حساب.
- **كيف يتحول Applicant إلى Student بلا تكرار؟** خدمة `register_applicant` تنشئ `StudentRecord` بالحقول الهوياتية فقط وتربطه بالطلب (المستندات والتاريخ تبقى في مكانها)، ثم رقم جامعي من Sequence، ثم تفعيل ينشئ `User`.
- **هل نظام البرامج/الأقسام مناسب للقبول؟** لا؛ لا يوجد Program ولا Intake. يُضافان في Phase 1/3.
- **صلاحيات المسجل؟** نطاق كلية: الطلبات، المستندات، القرارات، التسجيل، الرقم الجامعي، Enrollment، الحالة الأكاديمية، رفع سجل الطلاب، استيراد/نشر النتائج، قراءة استفسارات القبول. لا مستخدمين/مواد/محتوى.
- **إدارة استفسارات الزوار؟** `Inquiry` بحالات وتعيين ودور مختص + رد بريدي صادر + سجل.
- **WhatsApp ببساطة وأمان؟** تطبيع E.164 على الخادم، الرابط يُبنى من الرقم المُتحقَّق فقط، نص مبدئي قابل للتحرير، بلا إرسال تلقائي.
- **تغطية دورة الطالب والأستاذ؟** عبر Enrollment/Offering (قوائم طلاب المادة، من لم يسلّم، Gradebook)، الاختبارات، الإعلانات، الإشعارات، السجل الأكاديمي.
- **النتائج/الاختبارات/التكليفات/الإعلانات بشكل قابل للتوسع؟** الأقسام M/N/O/Q: نماذج مستقلة، Registry للأنواع، Workers للمهام الثقيلة، Signed media، AuditLog.
- **أين Live Rooms؟** الغرف الثابتة على Cohort (برنامج/قسم + مستوى + Term)، الجلسات على CourseOffering.
- **نبني البث أم نتكامل؟** نتكامل: Jitsi أولًا خلف `LiveProvider`، LiveKit عند الحاجة.
- **التسجيلات على Bunny؟** نعم: Provider → Bunny Stream (`fetch`) → `LectureResource` بنفس صلاحيات المادة.
- **مسؤولية المنصة من أول زيارة حتى التخرج؟** Visitor → Inquiry/Application → StudentRecord → Enrollment لكل Term → محاضرات/واجبات/اختبارات/بث → AcademicResult لكل Term → حالة أكاديمية → تخرج (حالة `graduated` على `StudentRecord` + Transcript).
- **خارطة الطريق الأفضل؟** القسم X.

---

*نهاية التقرير.*
