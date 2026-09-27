# منصة كلية الإمارات للعلوم والتكنولوجيا — Emirates College for Science & Technology Platform

منصة جامعية رقمية متكاملة (موقع عام + بوابة أكاديمية) تُبنى من الصفر وفق المستندات في `docs/`.

## المستندات المرجعية

| الملف | المحتوى |
|---|---|
| [docs/01-review-of-legacy-platform.md](docs/01-review-of-legacy-platform.md) | مراجعة المنصة القديمة (الأمن، قاعدة البيانات، الفجوات) — مرجع لما يجب تجنّبه |
| [docs/02-build-plan.md](docs/02-build-plan.md) | القرارات المثبّتة (D1–D20)، التقنيات، الوحدات، المراحل |
| [docs/03-roles-and-permissions.md](docs/03-roles-and-permissions.md) | الأدوار الـ 14 والزائر، مصفوفة الصلاحيات، سير النتائج والقبول — **المرجع عند أي تعارض** |
| [docs/04-technology-seo-state.md](docs/04-technology-seo-state.md) | لماذا كل تقنية، تحسين محركات البحث للموقع العام، إدارة الحالة |
| [docs/05-system-design.md](docs/05-system-design.md) | تصميم النظام: المكوّنات، البيئات (SQLite/Postgres)، نموذج البيانات الموحّد، الـ API، التدفقات الرئيسية، الأمن |
| [docs/06-design-system.md](docs/06-design-system.md) | نظام التصميم: نظام الألوان الكامل (فاتح/داكن/حالات/رسوم)، الخطوط، الشبكة، المكوّنات وحالاتها، الأنماط |
| [docs/07-pages-spec.md](docs/07-pages-spec.md) | خريطة الصفحات ومواصفة كل صفحة في الموقع العام والبوابة لكل دور |
| [docs/brand/brand-identity.md](docs/brand/brand-identity.md) | الهوية البصرية المشتقة من الشعار: الألوان، الخطوط، Tokens، نسخ الشعار |

## البنية (مخطط)

```
backend/            Django 6 + DRF + Celery        — الـ API الوحيد
apps/portal/        React 19 + Vite + TypeScript   — البوابة (portal.eust.edu.sd)
apps/landing/       Astro + React islands          — الموقع العام (eust.edu.sd)
packages/ui/        مكوّنات + Design Tokens
packages/api/       Client مولَّد من OpenAPI
docs/               المستندات المرجعية
```

## التشغيل محليًا

بلا Docker وبلا خدمات خارجية في التطوير: **SQLite** + Celery Eager + بريد Console. الإنتاج: **PostgreSQL** + Redis + Celery + Bunny. التفاصيل في `docs/05-system-design.md` §4، وتُستكمل أوامر التشغيل في Phase 0 بعد اعتماد الخطة.
