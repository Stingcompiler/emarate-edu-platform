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
| [docs/08-ux-research.md](docs/08-ux-research.md) | بحث المراجع: Canvas/Classroom/Moodle/Pulse، قدرات PWA على iPhone 2026، أفضل ممارسات التنزيل دون اتصال (بالمصادر) |
| [docs/09-mobile-experience.md](docs/09-mobile-experience.md) | تجربة الهاتف بملمس iOS: التنقل بالتبويبات، شاشات الطالب والأستاذ، مكوّنات الهاتف، الإيماءات، دون اتصال والتنزيل، الأداء |
| [docs/brand/brand-identity.md](docs/brand/brand-identity.md) | الهوية البصرية المشتقة من الشعار: الألوان، الخطوط، Tokens، نسخ الشعار |

## البنية

```
backend/            Django 6.1 + DRF + Celery      — الـ API الوحيد (config/settings: base · dev · test · prod)
apps/portal/        React 19 + Vite + TypeScript   — البوابة (PWA)
apps/landing/       Astro (SSG)                    — الموقع العام
packages/ui/        Design Tokens + Tailwind theme — مصدر واحد للألوان والخطوط
packages/api/       Client مولَّد من OpenAPI       — أنواع مشتركة بين الخادم والواجهتين
packages/config/    tsconfig مشترك
scripts/dev.sh      تشغيل الكل محليًا
docs/               المستندات المرجعية
```

## التشغيل محليًا

بلا Docker وبلا أي خدمة خارجية: **SQLite** + Celery يعمل داخل العملية + بريد يُطبع في الطرفية ويُحفظ في `backend/sent-emails/` + ذاكرة مؤقتة محلية. الإنتاج: **PostgreSQL** + Redis + Celery + Bunny (التفاصيل في `docs/05-system-design.md` §4).

**المتطلبات:** [uv](https://docs.astral.sh/uv/) (Python 3.13) و[pnpm](https://pnpm.io/) (Node ≥ 22.12). لا شيء غيرهما.

```bash
pnpm dev
```

يثبّت الاعتماديات، يطبّق الـ Migrations، يولّد عميل الـ API، ثم يشغّل:

| الخدمة | العنوان |
|---|---|
| الـ API (Django) | http://127.0.0.1:8000/api/public/health — التوثيق: `/api/docs/` |
| البوابة | http://localhost:5173 (تمرّر `/api` إلى Django عبر الوكيل) |
| الموقع العام | http://localhost:4321 |

`Ctrl+C` يوقف الخدمات الثلاث. للـ API وحده: `scripts/dev.sh --api-only`.

### أوامر مفيدة

| الأمر | ماذا يفعل |
|---|---|
| `cd backend && uv run pytest` | الاختبارات على SQLite |
| `cd backend && DATABASE_URL=postgres:///ecst uv run pytest` | الاختبارات نفسها على PostgreSQL محلي |
| `cd backend && uv run ruff check . && uv run ruff format .` | الفحص والتنسيق (ruff بدل black + isort) |
| `pnpm api:generate` | إعادة توليد عميل الـ API بعد تغيير أي Endpoint |
| `pnpm typecheck && pnpm build` | فحص الأنواع وبناء الواجهتين |
| `uvx pre-commit install` | تفعيل فحوص ما قبل الـ Commit |

الـ CI (GitHub Actions) يشغّل اختبارات الخادم على **SQLite وPostgreSQL** معًا، ويولّد العميل ويبني الواجهتين في كل Pull Request.

## الحالة

| المرحلة | الحالة |
|---|---|
| التخطيط والتصميم والنموذج الأولي | ✅ (المستندات 01–09 + 147 شاشة في `docs/prototype/`) |
| Phase 0 — الأساس | ✅ |
| Phase 1 — النواة (الهيكل الأكاديمي، الحسابات، الأدوار، الاستيراد) | التالي |
