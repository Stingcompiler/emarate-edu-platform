# تقرير التقنيات، تحسين محركات البحث، وإدارة الحالة

> إصدار 1.0 — 2026-09-27. يُكمّل `university-platform-build-plan.md` و`roles-and-permissions-report.md` v2.1.

---

## 1. خريطة التقنيات ولماذا كل واحدة

### 1.1 الطبقات

```
[ الموقع العام ]  Astro (SSG) + React islands + Tailwind  ──▶  CDN ثابت (Cloudflare Pages / Bunny)
[ البوابة ]       React 19 + Vite + TypeScript + Tailwind + PWA   ──▶  CDN ثابت (portal.eust.edu.sd)
        │ HTTPS (كوكيز HttpOnly + CSRF)                 │ HTTPS (بلا كوكيز، Throttled)
        ▼                                                ▼
[ API ]  Django 6 + DRF + drf-spectacular  ──  /api/v1/* (مصادق)   /api/public/* (عام، Cache)
        ├─ PostgreSQL 16 (بيانات)      ├─ Redis 7 (Cache / Throttle / Broker)
        ├─ Celery + Beat (خلفية)       ├─ Bunny Storage (خاص/عام) + Bunny Stream (فيديو)
        └─ Anymail (بريد)  pywebpush (Push)  phonenumbers  python-magic  WeasyPrint  openpyxl
```

### 1.2 الخلفية

| التقنية | الاستخدام | لماذا هذه تحديدًا |
|---|---|---|
| **Django 6 + DRF** | كل منطق الأعمال والـ API | Migrations وORM ناضجان، Permissions/Groups مدمجة تناسب 14 دورًا، Admin مجاني للفريق، الفريق يعرفه. |
| **PostgreSQL 16** (إنتاج) / **SQLite** (تطوير) | قاعدة البيانات | Postgres في الإنتاج: JSONB، قيود Check/Unique، فهارس جزئية، `pg_trgm` للبحث العربي. SQLite في التطوير: صفر إعداد؛ الكود يلتزم بالمشترك بينهما (`JSONField`، قيود قياسية، لا `ArrayField`/`contrib.postgres` إلا خلف شرط `connection.vendor`). |
| **Redis 7** (إنتاج فقط) | Cache، Throttle، Broker، جلسات OTP | خيار واحد يخدم ثلاث حاجات؛ في التطوير: LocMem cache + Celery Eager + جلسات OTP في قاعدة البيانات. |
| **Celery + Beat** | استيراد الطلاب/النتائج، إرسال Push/بريد، إغلاق الاختبارات تلقائيًا، تذكير المواعيد، إعادة بناء الموقع، توليد PDF | أي عمل يزيد عن ثانية يخرج من دورة الطلب حتى لا يجمّد الخادم (المشكلة الحالية في رفع الفيديو). |
| **SimpleJWT (كوكيز HttpOnly) + token_blacklist** | مصادقة البوابة | يبقى النمط الحالي مع إصلاحه: Access 15 دقيقة، Refresh دوّار يُبطل عند الخروج، `SameSite=Lax` + CSRF على الطلبات المُعدِّلة. |
| **drf-spectacular** | OpenAPI 3 | توليد أنواع TypeScript وClient تلقائيًا؛ توثيق حي. |
| **django-anymail** | البريد (Brevo/Resend/SES أو SMTP) | تبديل المزوّد بسطر إعداد؛ Webhooks للارتداد. |
| **pywebpush + VAPID** | Web Push | مجاني بلا FCM/APNs مدفوع؛ يعمل على Android وiOS (بعد التثبيت). |
| **phonenumbers** | E.164 | WhatsApp آمن وتطابق أرقام الزوار. |
| **python-magic + حدود حجم + فحص ZIP** | رفع آمن | يمنع الملفات القابلة للتنفيذ وقنابل الضغط. |
| **openpyxl** | Excel | استيراد الطلاب والنتائج. |
| **WeasyPrint** | PDF | كشوف النتائج وتقارير HR بالعربية وRTL بدقة (jsPDF الحالي ضعيف بالعربية). |
| **pytest-django + factory-boy** | اختبارات | مصفوفة صلاحيات آلية (كل Endpoint × 14 دورًا). |
| **Bunny Storage (منطقتان) + Token Auth** | ملفات | خاص للمحاضرات/التسليمات/المستندات بروابط موقّعة قصيرة العمر؛ عام للشعارات وصور الفعاليات. |
| **Bunny Stream + TUS** | فيديو | رفع مباشر من المتصفح (لا يمر بالخادم)، HLS تكيّفي للإنترنت الضعيف، Embed موقّع. |

### 1.3 الواجهات (Monorepo — pnpm workspaces)

| الحزمة | التقنية | لماذا |
|---|---|---|
| `apps/landing` | **Astro 5** (SSG) + React islands + Tailwind + `@astrojs/sitemap` + `astro-seo` | HTML ثابت كامل لكل صفحة = أفضل نتيجة SEO وأسرع تحميل؛ JavaScript يُحمَّل فقط للجزر التفاعلية (نموذج التقديم، التواصل، متابعة الطلب). |
| `apps/portal` | **React 19 + Vite + TypeScript + Tailwind 4** + react-router 7 + **TanStack Query** + React Context (إعدادات الجلسة فقط) + react-hook-form + zod + vite-plugin-pwa (Workbox) | تطبيق داخلي غني بالحالة؛ لا يحتاج SEO (`noindex`). لا مكتبة حالة عامة: حالة الخادم كلها في Query، والباقي Context صغير. |
| `packages/ui` | React + CSS variables (Tokens) + Radix primitives للوصولية (Dialog, Tabs, Select, Toast) | هوية واحدة، مكوّنات قابلة للوصول، RTL/LTR منطقي. |
| `packages/api` | `openapi-typescript` + `openapi-fetch` | أنواع مولَّدة من الخادم؛ أي تغيير في الـ API يكسر البناء بدل الإنتاج. |
| `packages/config` | tsconfig/eslint/prettier/tailwind preset | توحيد. |

### 1.4 أدوات التطوير والنشر
بلا Docker وبلا خدمات محلية: التطوير على SQLite + Celery Eager + بريد Console + Cache محلي (`scripts/dev.sh` يكفي)؛ الإنتاج Postgres + Redis + Celery + Anymail + Bunny. GitHub Actions (ruff/black/pytest على SQLite وPostgres + tsc/eslint/vitest/build)، pre-commit، Renovate للتحديثات. النشر لاحقًا: Render (Web + Worker + Redis + Postgres مدفوعة) + Cloudflare Pages للموقع والبوابة + Cloudflare أمام الـ API.

---

## 2. تحسين محركات البحث والظهور (الموقع العام)

### 2.1 لماذا Astro يحل مشكلة SEO الحالية
الموقع الحالي SPA: يرسل `index.html` فارغًا ثم يبني الصفحة بالـ JavaScript ويطلب البيانات من الـ API. محركات البحث ترى صفحة شبه فارغة، وعنوان الصفحة ثابت لكل المسارات، ولا يوجد وصف أو بيانات مهيكلة. Astro يولّد **HTML كاملًا لكل صفحة وقت البناء** من قاعدة البيانات، فيرى Google المحتوى فورًا بدون تنفيذ JavaScript.

### 2.2 التقنيات والممارسات المطبَّقة

| المجال | ما سيُنفَّذ |
|---|---|
| **التوليد** | صفحة ثابتة لكل: قسم، برنامج، خبر، إعلان، فعالية، صفحة ثابتة، سياسة. إعادة بناء تلقائية عند أي نشر من لوحة فريق الموقع (Webhook)؛ زمن البناء < دقيقتين. |
| **العناوين والوصف** | `<title>` و`<meta description>` فريدان لكل صفحة من حقول `seo_title`/`seo_description` (يحررها فريق الموقع مع معاينة Google)، مع قيم افتراضية مولَّدة. |
| **اللغتان** | `/ar/...` و`/en/...` مع `hreflang` متبادل و`x-default`؛ `lang`/`dir` صحيحان على كل صفحة. |
| **الروابط** | Slugs ثابتة قابلة للقراءة (يحددها فريق الموقع، عربية أو لاتينية)، `canonical` لكل صفحة، تحويلات 301 عند تغيير Slug (جدول `Redirect`). |
| **البيانات المهيكلة (JSON-LD)** | `CollegeOrUniversity` (الرئيسية)، `EducationalOccupationalProgram` (كل برنامج)، `Event`، `NewsArticle`، `FAQPage`، `BreadcrumbList`، `ContactPoint`. تُولَّد من قاعدة البيانات. |
| **المشاركة الاجتماعية** | Open Graph + Twitter Cards مع صورة مولَّدة تلقائيًا لكل خبر/فعالية (Satori/OG image) إن لم تُرفع صورة. |
| **Sitemap / Robots** | `sitemap.xml` مقسّم بالنوع مع `lastmod`؛ `robots.txt`؛ البوابة `noindex`. |
| **الأداء (Core Web Vitals)** | HTML ثابت من CDN، صور `AVIF/WebP` بأحجام متعددة + `loading=lazy`، خطوط مستضاتة ذاتيًا `font-display: swap`، CSS حرج مضمَّن، JavaScript فقط للجزر، ميزانية أداء (LCP < 2.5s على 3G، CLS < 0.1). |
| **الوصولية** | تباين WCAG AA، عناوين هرمية، نص بديل إلزامي للصور (حقل في CMS)، تنقل بلوحة المفاتيح. |
| **المحتوى** | صفحات هبوط لكل برنامج (الأكثر بحثًا: "بكالوريوس تقنية معلومات السودان")، أسئلة شائعة، أخبار منتظمة، روابط داخلية تلقائية (قسم ↔ برامجه ↔ أخباره). |
| **الظهور خارج الموقع** | Google Search Console + Bing Webmaster (إرسال Sitemap، متابعة الفهرسة)، Google Business Profile للكلية، RSS للأخبار، روابط اجتماعية موحدة (`sameAs`). |
| **التحليلات** | Plausible أو Umami (خفيفة، بلا كوكيز) بدل GA الثقيل؛ أحداث للتقديم والتواصل. |
| **القياس** | Lighthouse CI في GitHub Actions يفشل البناء إن هبط الأداء/SEO عن 90. |

### 2.3 ما يديره فريق الموقع من لوحة التحكم
لكل صفحة/خبر/برنامج: العنوان والوصف لمحركات البحث، Slug، صورة المشاركة، النص البديل، الكلمات المفتاحية (للتنظيم الداخلي)، الجدولة والانتهاء، إعادة التوجيه عند تغيير الرابط. زر "معاينة" يعرض الصفحة قبل النشر، وزر "إعادة بناء الموقع" اليدوي.

---

## 3. إدارة الحالة (State Management)

### 3.1 في البوابة (React)

| نوع الحالة | الأداة | القاعدة |
|---|---|---|
| **حالة الخادم** (مواد، محاضرات، طلبات، إشعارات…) | **TanStack Query** | المصدر الوحيد لبيانات الـ API: Cache بمفاتيح مهيكلة (`['offerings', termId]`)، إبطال تلقائي بعد أي تعديل (`invalidateQueries`)، إعادة جلب عند العودة للنافذة، Optimistic updates للعمليات الخفيفة (قراءة إشعار)، Prefetch عند التحويم. يمنع تكرار الطلبات وحالة "الصفحة الأولى فقط" الحالية لأن الترقيم جزء من مفتاح الاستعلام (`useInfiniteQuery`). |
| **المستخدم الحالي وصلاحياته** (`/me`) وعدّاد الإشعارات | **TanStack Query أيضًا** (`useMe()` بـ `staleTime` طويل؛ `useUnreadCount()` بـ `refetchInterval: 60s` ويُبطَل عند وصول Push) | هي بيانات خادم؛ نسخها في متجر منفصل يخلق مصدرين للحقيقة. الصلاحيات من `useMe()` تحرس المسارات وتخفي الأزرار. |
| **إعدادات الجلسة** (الثيم، اللغة، الاتجاه) | **React Context واحد صغير** (`AppSettingsContext`) + `localStorage` | تتغير مرة في الجلسة؛ لا حاجة لمكتبة (Zustand/Redux) لأن مشكلة إعادة التصيير المتكرر غير موجودة. نفس نمط `AuthContext.jsx` الحالي. |
| **حالة الاتصال** (online/offline) | Hook على `navigator.onLine` | – |
| **حالة النماذج** | react-hook-form + zod | التحقق نفسه المولَّد من مخطط OpenAPI حيث أمكن؛ رسائل عربية. |
| **حالة الواجهة المحلية** (نافذة مفتوحة، تبويب) | `useState` داخل المكوّن | لا تُرفع للمتجر العام إلا إذا شاركتها صفحتان. |
| **حالة الرابط** (فلاتر، بحث، صفحة، ترتيب) | URL Search Params | كل قائمة قابلة للمشاركة والرجوع؛ التحديث يعيد نفس الحالة. |
| **حالة العمل غير المتصل** | Workbox + IndexedDB | الإجابات في الاختبار تُحفظ محليًا فورًا ثم تُزامَن؛ الإشعارات المقروءة تُصطف عند الانقطاع. |

**الاختبار الإلكتروني (أهم حالة حساسة):** الخادم هو المرجع (بداية/نهاية/الوقت المتبقي). المتصفح يحتفظ بمسودة الإجابات في IndexedDB ويرسلها دفعات كل 10–15 ثانية (Idempotent upsert)؛ عند الانقطاع يستمر الحفظ محليًا ويُزامَن عند العودة؛ عند إعادة فتح الصفحة تُستعاد المحاولة من الخادم وتُدمج مع المسودة الأحدث. الإرسال النهائي مرة واحدة (Idempotency key).

### 3.2 في الموقع العام (Astro)
لا حالة تقريبًا: الصفحات ثابتة. الجزر الثلاث (التقديم، التواصل، متابعة الطلب) تستخدم React + react-hook-form + طلبات `fetch` مباشرة إلى `/api/public/*`؛ حالة جلسة الزائر (بعد OTP) في `sessionStorage` كـ JWT قصير العمر يُرسل في Header (لا كوكيز).

### 3.3 حالات سير العمل في الخادم (Workflow State)
كل كيان له دورة حياة يُدار بـ **آلة حالات صريحة** (جدول انتقالات واحد في الكود + صلاحية لكل انتقال + سجل تاريخ append-only + إشعار عند الانتقال):

| الكيان | الحالات | من ينتقل |
|---|---|---|
| طلب التقديم | draft → submitted → under_review ⇄ missing_documents → eligible → accepted / rejected / waitlisted → registered → activated؛ withdrawn، expired | المتقدم (OTP)، المسجل، مسؤول المسجلين |
| حساب الطالب الجديد | otp_pending → pending_approval → active / rejected (أو active مباشرة حسب الإعداد) | الطالب، مدير/مشرف القسم، مسؤول المسجلين |
| دفعة نتائج | uploaded → validated / has_errors → committed → published / unpublished | الرافع في نطاقه |
| طلب تعديل نتيجة | pending → approved / rejected | مسؤول النتائج (ينشئ)، أمين الشؤون العلمية (يقرر) |
| محاولة اختبار | in_progress → submitted / auto_submitted / expired / invalidated | الطالب، الخادم (Beat)، الأستاذ |
| الاختبار | draft → published → closed → archived | الأستاذ (المعيد بلا نشر) |
| تسليم واجب | none → submitted → resubmitted → graded (suggested → approved) | الطالب، الأستاذ/المعيد |
| استفسار | new → in_progress ⇄ waiting_for_user → resolved → closed | مدير الموقع / المسجل |
| حالة طالب (شؤون الطلاب) | open → decided → closed (+ published flag) | أمين شؤون الطلاب |
| لائحة | draft → published → superseded | أمين شؤون الطلاب |
| إعلان/صفحة/خبر | draft → scheduled → published → expired/archived | فريق الموقع |
| إشعار | queued → sent → delivered/failed (لكل قناة) | النظام |

القواعد: الانتقال غير المعرَّف يُرفض بـ 409؛ كل انتقال داخل `transaction.atomic` + صف تاريخ + `AuditLog`؛ الزمن من الخادم فقط؛ العمليات المكررة آمنة (Idempotent).

### 3.4 الاتساق بين الخادم والواجهة
- الـ API يعيد الحالة + **الانتقالات المتاحة للمستخدم الحالي** (`allowed_transitions`) فتعرض الواجهة الأزرار الصحيحة بلا تكرار المنطق.
- إبطال Cache مركزي بعد كل Mutation بحسب المفتاح.
- الإشعارات داخل التطبيق تُحدَّث بـ Polling كل 60 ثانية (وفوريًا عند وصول Push)؛ SSE لاحقًا إن لزم.

---

## 4. ضابط: لوحة رئيس القسم
تُعاد لوحة `department_manager` بنفس الأقسام والترتيب والتدفقات الحالية (الرئيسية، المواد، المحاضرات، الأساتذة، طلاب القسم، التقارير، النتائج، سجل العمليات، موادي) بالهوية الجديدة، مع إصلاح الأمن والترقيم فقط، وإضافة تبويبات جديدة (طلبات التسجيل، الاختبارات، البث، الإعلانات) دون تغيير أي تدفق قائم. مشرف القسم يرى اللوحة نفسها بلا أزرار حذف.
