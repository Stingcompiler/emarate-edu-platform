# Handoff — Phase 10 in progress (portal identity + role dashboards) — 2026-09-28

## Where things stand
- **Phases 1–9 are merged** to `main` (PRs #3–#11).
- **Phase 10** is in progress on `feat/phase-10-portal` (pushed; no PR yet — open one PR when the phase is done).
  - **Done (commit 23f8728):** student learning pages — `/` role home (student Today), `/courses`, `/courses/:id`, `/lectures/:id`, `/assignments/:id` (submit; staff see submissions), `/tasks`. Assignments API gained `course_code`, `course_name`, `mine`.
  - **Next chunks:** (2) teacher: TeacherToday home, lecture editor (`/lectures/new?offering=`, resources: file/link/video TUS), assignment editor (`/assignments/new?offering=`), grading `/submissions/:id`, course students and gradebook; (3) department manager sections (§4.15) + approvals; (4) registrar/head registrar student records and imports; (5) system admin users/structure/settings; (6) remaining role homes, accessibility, responsive tables, PWA onboarding.
- **Verified locally:**
  - 304 tests pass on SQLite; 303 pass plus 1 skip on Postgres;
  - the schema is clean;
  - the landing builds 48 pages in strict mode against the dev API.
  - The site was walked in the pane: home at 390 and 1280, program page at 390, departments at 390, EN programs filter at 1280. The contact form was submitted cross-origin (got a reference number), and the 404 page followed a CMS redirect.

## Earlier phases (short)
- **Phase 7:** visitor OTP session; public portal routes `/apply` and `/track`; the admissions workflow; staff pages `/applications`, `/admissions/*`.
- **Phase 8:** the `reports` app (teacher indicators, department, admissions and affairs reports, frozen snapshots, transcripts); HR pages `/hr/*`; `/reports*`; print views `/print/*` (browser PDF).

## What Phase 9 delivered
- **`apps/landing` (Astro SSG):**
  - `lib/api.ts` handles build-time reads, strict mode and the build token; `lib/i18n.ts` holds ar/en, direction, `pick()` fallback and arrows; `layouts/Base.astro` holds the header, footer, SEO and hreflang.
  - Components: ProgramCard, Blocks (CMS page blocks), PageHead.
  - Pages under `[lang]/`: index, about, departments (+[code]), programs (+[code]), news (+[slug]), events/[slug], contact, p/[slug]. Root pages: `/` → `/ar/`, `404.astro` (redirect lookup), `sitemap.xml.ts`, `robots.txt.ts`.
- **API:**
  - `organization/public.py`: `/api/public/{departments,departments/<code>,programs,programs/<code>,pages,stats}`. `Program` gained `description_ar/en`.
  - `core/middleware.PublicCorsMiddleware`: CORS for `/api/public/*` from `PUBLIC_SITE_ORIGINS` only.
  - `core/throttles.PublicReadThrottle` (scope `public_read`, 120/min per IP) covers catalogue and content reads. It skips the limit when `X-Site-Build` matches `SITE_BUILD_TOKEN`.
  - `SITE_REBUILD_HOOK_URL` is now read from the environment.
- **Env:** `backend/.env.example` (PUBLIC_SITE_ORIGINS, SITE_BUILD_TOKEN, SITE_REBUILD_HOOK_URL) and `apps/landing/.env.example` (PUBLIC_API_URL, PUBLIC_PORTAL_URL, SITE_BUILD_TOKEN, LANDING_STRICT=1).

## Next steps (Phase 10 — portal identity, docs/02 §8 Phase 10, §4.15)
1. **Role home dashboards** ("لوحة لكل دور"). Boards: AdminHome (department manager), RegistrarHome, HeadRegistrarHome, ResultsOfficerHome, AcademicAffairsHome, StudentAffairsHome, SiteManagerHome, SystemAdminHome, EventsManagerHome, plus the student and teacher homes (`python3 scripts/boards.py list Home`, `list Student`, `list Teacher`). Make `/` land on the role's home instead of `/notifications`.
2. **Department manager dashboard constraint (§4.15, owner rule):**
   - Keep exactly these sections: الرئيسية، المواد، المحاضرات، الأساتذة، طلاب القسم، التقارير، النتائج، سجل العمليات، موادي.
   - New tabs are additions only: طلبات التسجيل، الاختبارات، جلسات البث، الإعلانات.
   - The supervisor sees the same dashboard without delete buttons.
   - Check which of these pages exist in the portal (many APIs exist from Phases 1–3: courses, offerings, lectures, members, students, audit) and build the missing ones.
3. **Accessibility pass:** focus rings, labels, contrast, keyboard navigation in sheets and menus, `lang`/`dir` on mixed text.
4. **Responsive tables:** audit wide tables at 390 (use the card-on-phone pattern).
5. **PWA onboarding:** first-run install hint (Android prompt, iOS share → add to home screen); `/install` exists.
6. Checks at 390 and 1280 for every new page, then docs, PR and merge.

## Decisions made (don't revisit)
- **Roles are rows (`role`, `department`), not Django Groups.** Mention this deviation from docs/03 §10 in PRs that touch roles.
- **Registration:**
  - With approval ON, an email equal to the official one in the file activates immediately; any other email goes to `pending_approval`.
  - Rejecting deletes the pending account.
  - The start response is identical whether or not the details match.
- **Staff accounts:** no password is set; a 7-day, single-use activation link is emailed.
- **Supervisor = manager without delete/removal.** Instructor removal counts as a delete.
- **Structure** (college, departments, programs, years, terms) is college-wide reference data: readable by staff roles, written only by the system admin.
- **Import:**
  - Only the head registrar and the system admin can import.
  - The import never touches `status` or `user`; a blank cell keeps the existing value.
- **Files are never public.** Everything goes through `files.services.signed_url` after the owning app's policy. Lecture files and videos reach students only through a *published* lecture.
- **Assignments:** an assignment with submissions can't be deleted (409; close it instead). A graded (approved) submission can't be resubmitted.
- **Notifications:**
  - A fan-out never includes the sender.
  - The `account` category always reaches the inbox.
  - Categories that email by default: results and account.
  - A TA may notify only if `ta_can_notify` is set.
  - Action URLs must be portal paths or https (serializer, SW and UI all check).
- **Portal:**
  - Links point only to pages that exist (`lib/links.ts`, `lib/nav.ts`); notification links to future pages still mark items read.
  - Active chips use `bg-text text-bg`, which contrasts in both themes.
- **Results:** committed results change only through approved corrections (the admin is read-only too). Re-importing an existing student+course is an error row.
- **Display:** RTL layouts need `dir="ltr"` (or \u2066…\u2069) around letter grades and university numbers, otherwise "C+" renders as "+C".
- **Exams:** the server owns time. Answers are saved per question; the client keeps a local queue and must sync **one request at a time** (overlapping PUTs let an older answer win). Focus signals are throttled to one per kind every 15 s. The focused exam shell has no sidebar or tabs.
- **Content:** rich HTML is always sanitized server-side (nh3 allow-list), so the portal may render it with `dangerouslySetInnerHTML`. Public announcements are college-wide only. Visitors are never looked up by name.
- **Pagination:** every paginated model has a default ordering, and a pytest filterwarning turns unordered pagination into an error.

## Gotchas found
- **Tailwind order:** `hidden` does not beat a component's own `inline-flex`. Wrap the component in a `hidden lg:block` element instead.
- **Load testing on macOS:** `kern.ipc.somaxconn` is 128, so don't open 500 sockets in the same millisecond. Spread arrivals over time.
- **Response timing:** responses are serialized before `transaction.on_commit` fan-outs run. Read counts from the DB in tests, not from the create response.
- **Localized names:** the API's `name` field follows Accept-Language (English browsers get English), so server-built labels use `name_ar` explicitly.
- **Empty Q():** `Q() | x` drops the empty Q, which silently lost college-wide viewers. Use `Q(pk__isnull=False)` or `Q(<fk>__isnull=False)` for "everything" (see `learning.access.staff_offerings_q`, `rbac.Scope.q`).
- **drf-spectacular:** views with user-dependent `get_queryset` need a `swagger_fake_view` guard.
- **DRF parsers:** `get_parsers()` runs before `self.action` is set. Use `parser_classes`; the import upload was broken by this.
- **GROUP BY ordering:** `annotate(Count)` drops the model's default ordering. Restate `order_by` (see OfferingViewSet).
- **Emails in tests:** they are sent via `transaction.on_commit`. Wrap calls in `django_capture_on_commit_callbacks(execute=True)` and read the code with `conftest.last_code()`.
- **Test settings:** InMemoryStorage for uploads, all throttle scopes at 10000/min, and a long SECRET_KEY (short keys trigger a JWT warning).
- **Enum names:** drf-spectacular's `ENUM_NAME_OVERRIDES` covers RoleEnum and TeachingKindEnum. Add new shared choice sets there, or the schema gate fails.
- **Audit IP:** `RequestMeta.from_request` trusts `X-Forwarded-For`. Restrict it to the proxy in Phase 11 (Render sets it).
- **Visitor auth:** visitor endpoints use `VisitorAuthentication` only. Staff cookies never apply there, and the portal adds the header through the `visitorApi` middleware for `/api/visitor/` URLs only.
- **SerializerMethodField types:** a method returning nested serializer data needs `@extend_schema_field(Serializer(many=True))`. Otherwise the TypeScript type is `unknown`.
- **Seed reruns:** seed helpers must be idempotent (`get_or_create`) because an app can be migrated to zero while `contacts` keeps its rows.
- **Pane screenshots:** they can lag a click. Use `get_page_text` to confirm the step changed before assuming a bug.
- **Reports:** "now" drives weeks elapsed and grading age, so tests pass a fixed `now` to the metrics functions. Warm up once before counting queries (the first call creates the SystemSettings row).
- **Print pages** live outside PortalShell and set `document.title` themselves. Wide report tables go full width; a 320px sidebar squeezes them at 1280.
- **Landing build:** a burst of anonymous reads hits the throttle (HTTP 429). Production builds send `X-Site-Build`; dev relies on the 120/min `public_read` scope. The build treats 404 as "absent" and any other failure as fatal only when `LANDING_STRICT=1`.
- **Astro `[lang]` routes:** `getStaticPaths` must return every language × item; English arrows and links must not use absolute site URLs (the `alternate()` helper is for `<link hreflang>` only).
- **Earlier gotchas:**
  - build constraint lists with sorted sets;
  - Django 6.1 uses `MAILERS`;
  - TypeScript is pinned to 5.9;
  - `astro dev` needs `--ignore-lock`;
  - test phone sizes in the browser pane;
  - audit actors are PROTECT.

## Verify
```bash
cd backend && uv run python manage.py makemigrations --check --dry-run && uv run python manage.py check
cd backend && uv run pytest && DATABASE_URL=postgres:///ecst uv run pytest
cd backend && uv run ruff check . ../scripts && uv run ruff format --check . ../scripts
cd backend && uv run python manage.py spectacular --fail-on-warn --validate --file /dev/null
# migrations reversible: migrate <app> zero && migrate, on SQLite and Postgres
pnpm api:generate && pnpm typecheck && pnpm build && pnpm format:check
```

## Owner's standing rules
- `CLAUDE.md`:
  - responsive always (skill `responsive-page`);
  - no Docker; SQLite in dev, Postgres in prod, tests on both;
  - one PR per phase, **merge to main yourself without asking; never wait**;
  - department manager dashboard: additions only;
  - no Zustand;
  - every endpoint gets a permission-matrix row.
- Hand off via this file (skill `session-handoff`) at every phase or major step, or when context is long.
