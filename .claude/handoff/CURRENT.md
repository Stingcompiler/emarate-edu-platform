# Handoff — Phase 10 done → Phase 11 (hardening + deploy) — 2026-09-28

## Where things stand
- **Phases 1–9 are merged** to `main` (PRs #3–#11).
- **Phase 10 (portal identity + role dashboards)** is complete on `feat/phase-10-portal`. Its PR is opened in this step; merge it once CI is green with `gh pr merge --merge` (auto-merge is disabled for the repo).
- **Verified locally:**
  - 313 tests pass on SQLite and on Postgres (plus 1 SQLite-only skip);
  - the schema is clean; ruff, typecheck, build and prettier pass.
  - Every new page was walked in the pane at 1280 and most at 390, signed in as student, teacher, department manager, head registrar, system admin, academic affairs, student affairs and results officer.

## Earlier phases (short)
- **Phase 7:** visitor OTP and the admissions workflow; public `/apply` and `/track`.
- **Phase 8:** reports, HR indicators and notices, frozen snapshots, print/PDF views.
- **Phase 9:** the Astro public site (ar/en), the public catalogue API, public CORS, the build token and strict builds.

## What Phase 10 delivered
- **Role homes (`/` via `routes/Home.tsx`):**
  - Student: Today. Teacher: TeacherToday. Department manager/supervisor: `/department`. Registrars: `/registrar`.
  - `/results-office`, `/academic`, `/affairs`, `/system` (admin), `/hr`, `/site`, `/events`.
- **Student pages:** `/courses`, `/courses/:id`, `/lectures/:id`, `/assignments/:id` (submit), `/tasks`, `/me`, `/me/status`. Students get exactly five tabs: Today, My courses, Tasks, Notifications, Me.
- **Teacher pages:**
  - Editors: `/lectures/new|:id/edit` (TUS client in `lib/tus.ts`) and `/assignments/new|:id/edit`.
  - Grading: `/grading` and `/submissions/:id`.
  - Roster and gradebook: `/courses/:id/students`.
- **Department manager (§4.15):** `/department` plus `/department/{courses,lectures,teachers,students,approvals,audit}`. The nav is the fixed list in `lib/nav.ts` `departmentNav()`.
- **Registrar:** `/registrar`, `/students` (+`:id`), `/student-imports` (+`:id`), `/registrars`.
- **System admin:** `/system`, `/system/{users,users/:id,structure,settings}`, `/audit`.
- **New APIs:**
  - `/gradebooks/<offering>`, `/grading-queue`, `/teachers-directory`.
  - `users/<id>/set-active`, `terms/<id>/set-current`.
  - Assignments `mine`/`course_code`/`course_name`; enrollments `?student_record__public_id=`; `/me` student typed; role assignments `user_name`.
- **Behaviour changes:**
  - The user throttle is now 240/min.
  - Department and program names in several serializers now use `name_ar`.
- **Accessibility and install:** skip link and `#main`, bidi isolation for Latin codes and numbers, a phone install hint (`components/InstallHint.tsx`) for students and teachers.
- **Not done / follow-ups:**
  - The student import does not enforce the `YY-DEPT-NNNN` university number pattern shown on the board; there is no documented rule.
  - The site and events manager homes reuse the Phase 6 workspaces.

## Next steps (Phase 11 — hardening and deploy, docs/02 §8 Phase 11, docs/05 §9)
1. **Coverage:** add tests where the Phase 10 APIs have only happy paths (gradebook scoping for TAs without `ta_can_grade`, grading queue for TAs). Consider a coverage report in CI.
2. **Load:** re-run `scripts/loadtest` (k6) against Postgres with the 240/min user throttle. Also load the landing build (static).
3. **Backups:** daily Postgres backups plus a weekly encrypted `pg_dump` to Bunny, and a documented restore drill (runbook).
4. **Deploy on Render** (no Docker — native Python and Node environments):
   - Web (gunicorn/uvicorn), a Celery worker, Beat, Redis, and paid Postgres.
   - Static sites for `apps/portal` (SPA rewrite to `index.html`) and `apps/landing` (`LANDING_STRICT=1`, `SITE_BUILD_TOKEN`), with the deploy hook in `SITE_REBUILD_HOOK_URL`.
   - Cloudflare in front of the API.
   - Write `render.yaml` and the environment variables from `.env.example` files.
5. **Security:**
   - Restrict `X-Forwarded-For` trust to the proxy (see the audit IP gotcha).
   - Set HSTS and cookie flags in prod settings.
   - Add Sentry (optional dependency), JSON logging, and an uptime check on `/api/public/health`.
6. **Runbook docs** (`docs/runbook.md`): deploy, rollback, rotate keys, restore, incident steps. Then the final PR and merge.

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
- **Portal routes vs Django:** the Vite dev proxy forwards `/admin` to Django, so portal admin pages live under `/system/*`.
- **Throttle:** SPA pages fan out; prefer one aggregated endpoint (grading queue, gradebook) over per-item requests. The user rate is 240/min.
- **Seeded submissions** need a `SubmissionVersion`. Pages still guard `current_version?.` for old rows.
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
