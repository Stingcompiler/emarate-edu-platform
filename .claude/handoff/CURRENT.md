# Handoff — Phase 8 done → Phase 9 (public site, Astro) — 2026-09-28

## Where things stand
- **Phases 1–7 are merged** to `main` (PRs #3–#9).
- **Phase 8 (reports)** is complete on `feat/phase-8-reports`. Its PR is opened in this step; merge it once CI is green with `gh pr merge --merge` (auto-merge is disabled for the repo).
- **Verified locally:**
  - 299 tests pass on SQLite; 298 pass plus 1 skip on Postgres;
  - migrations reverse on both databases;
  - the schema has 0 warnings; ruff, typecheck, build and prettier pass.
  - Pages were walked in the pane: HR home, teachers, profile, new notice → sent, HR report → export → A4 print page (1280); department report (1280 and 390); admissions and affairs reports (1280); transcript print; the teacher acknowledging a notice (390).

## What Phase 7 delivered (short)
- **Visitor OTP session** (`Authorization: Visitor <token>`, 30 min) with public portal routes `/apply` (5-step wizard) and `/track`. Phase 9 links to them and does not rebuild them.
- **Admissions:** cycles, intakes, versioned forms, the state machine in `admissions/services.TRANSITIONS`, routing, claim and assign, decisions, and `register_applicant` → university number. Staff pages: `/applications`, `/admissions/cycles`, `/admissions/forms`.

## What Phase 8 delivered
- **`reports` app:**
  - `metrics.py` (teacher rows, department, admissions and affairs builders; the query count is fixed and tested).
  - `ReportSnapshot` (frozen exports with a SHA-256 digest; no edit or delete).
  - Views under `/api/v1/reports/*`, `/api/v1/report-snapshots`, `/api/v1/transcripts/<number>`.
- **Settings:** `SystemSettings` gained `grading_days_limit` (3), `upload_min_percent` (75) and `planned_lectures_per_week` (2).
- **HR notices:** `notifications.HRNotice` gained topic, evidence, term, a department-manager CC and `opened_at`. Academic affairs can send too. HR now has `structure.view` (for the term and department filters).
- **Portal:**
  - Report pages: `/reports`, `/reports/admissions`, `/reports/affairs`.
  - HR pages: `/hr`, `/hr/teachers`, `/hr/teachers/:id`, `/hr/notices/new`, `/hr/report`.
  - Teacher side: `/hr-notices/:id`.
  - Transcripts: `/transcripts` → `/print/transcript/:number`.
  - Print views: `/print/report/:id` and `/print/my-results` (a link on `/results`).
  - Shared helpers live in `lib/reports.tsx` (Kpi, Bars, Delta, ExportBar, PastReports, downloadCsv, Picker).
- **PDF decision:** browser print from A4 pages (`routes/print/PrintLayout.tsx`, `@page A4`). No server PDF libraries.
- **Seed:** graded and waiting submissions for the demo teacher and one HR notice.

## Next steps (Phase 9 — public site, docs/02 §6 and §8 Phase 9)
1. Read docs/02 §6 (landing: Astro SSG from `/api/public/*`, `/ar` and `/en`, sitemap, OpenGraph, Schema.org, Core Web Vitals) and docs/06 (identity). Boards (phone): VisitorHome, VisitorAbout, VisitorPrograms, VisitorProgram, VisitorDepartments, VisitorDepartment, VisitorNews, VisitorContact. Desktop boards are missing: derive them from the shell rules and say so in the PR.
   ```bash
   python3 scripts/boards.py list Visitor
   ```
2. `apps/landing` already has an Astro scaffold (`Base.astro`, `index.astro`, `global.css`). Build pages from `/api/public/{site,pages,news,events,announcements,menus,redirects}` plus the program and department endpoints (add public read endpoints if missing; check `content/urls_public.py`).
3. **Interactive islands:** the contact form (`/api/public/inquiries`) and the program search. "Apply" and "Track" link to the portal's `/apply` and `/track` (a `PORTAL_URL` env var).
4. **Rebuild on publish:** `content.request_site_rebuild()` calls `SITE_REBUILD_HOOK_URL` (currently empty). Document the Render static-site deploy-hook value for Phase 11.
5. Handle redirects (`/api/public/redirects` → `_redirects` or Astro redirects at build time), the sitemap, robots, OG images, and `CollegeOrUniversity`/`Event`/`NewsArticle` JSON-LD.
6. Keep it responsive (skill `responsive-page`) and RTL-first, with `astro dev --ignore-lock` (see gotchas). Add a CI build of the landing app.

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
