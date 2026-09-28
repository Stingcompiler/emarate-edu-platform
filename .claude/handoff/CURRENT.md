# Handoff — Role-by-role walkthrough in progress — 2026-09-28

## Where things stand
- **All phases 0–11 are merged** to `main` (PRs #2–#13). PR #14 (student walkthrough fixes) is also merged.
- **Current work:** the owner asked to sign in as every demo role one after another, try it,
  write a report after each role and move on **without waiting** («سجل بكل المستخدمين وجرب مستخدم بعد الاخر…»).
  - Branch `fix/role-walkthrough` (pushed, **no PR yet**): fixes found while testing, one commit per role.
  - Report: `docs/qa/role-walkthrough-2026-09.md` (Arabic). Done: student, teacher, TA, dept manager,
    dept supervisor, results officer, academic affairs.
  - **Remaining roles, in order:** student_affairs, hr, head_registrar, registrar, site_manager,
    events_manager, system_admin. After the last role: open the PR, merge when CI is green.
- **Next PR after that:** Arabic API messages (docs/05 requires Arabic by `Accept-Language`).
  About 180 service messages plus importer row errors are English and reach users. Plan: wrap them in
  `gettext`, add `locale/ar/LC_MESSAGES/django.po`, enable `LocaleMiddleware`, and make sure stored
  import row errors are Arabic.
- **Dev login:** the demo accounts are `<handle>@demo.ecst.test`. `ta@` and `dept.supervisor@` have a different
  password from the rest (seed_demo does not reset existing passwords). Look it up in the transcript, not here.
- **Browser pane tip:** coordinate clicks don't land while a phone size is emulated. Use refs or JS clicks,
  or the pane's natural width.

## What Phase 11 delivered
- **`render.yaml`:**
  - `ecst-api` (gunicorn gthread 4×4, WhiteNoise, health check, preDeploy migrate plus `check --deploy`), `ecst-worker`, `ecst-beat`, and the `ecst-backup` weekly cron.
  - `ecst-redis`, `ecst-db` (Postgres 16 paid).
  - `ecst-portal` (static; `/api/*` rewritten to the API, SPA fallback, `sw.js` no-cache) and `ecst-site` (static, `LANDING_STRICT=1`).
- **Security:**
  - `core/net.client_ip` and DRF `NUM_PROXIES` both follow `TRUSTED_PROXIES` (0 in dev; the header is ignored).
  - `PermissionsPolicyMiddleware`; optional Sentry (`SENTRY_DSN`, no PII).
  - The grading queue only lists courses the user may grade (teacher, or a TA with `ta_can_grade`).
- **Backups:** `core/backups.py` plus the `backup_database` and `restore_database` commands, using `BACKUP_ENCRYPTION_KEY` and `BACKUP_KEEP`. `BunnyStorage.listdir` was added.
- **Bootstrap:** `create_system_admin --email --name` prints a one-time activation link. The portal page `/activate/:token` (board AuthActivate) was missing since Phase 1 and now exists.
- **Docs:** `docs/runbook.md`; env examples updated.

## Owner actions (not codeable here)
1. Create the Render account and apply the Blueprint. Create the Cloudflare DNS records: `api.`, `portal.`, apex and `www`.
2. Generate and store offline `FIELD_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY` and `SITE_BUILD_TOKEN`, and create the VAPID keys (runbook §2).
3. Set up Bunny Storage, the pull zone and Stream, and Brevo sending (verify the `ecst.edu.sd` domain).
4. Provide the logo (SVG), and the real departments, programs and terms, or replace the demo data (docs/02 §9).
5. After the first deploy, verify `TRUSTED_PROXIES` with `/audit` (runbook §4) and run a restore drill (§5).

## Possible next work (only if the owner asks)
- A university-number pattern check in the student import (board shows `YY-DEPT-NNNN`; no documented rule).
- A teacher reply-rate metric and applicant sources (the boards show them; there is no data today).
- Frontend tests (Vitest/Playwright) and Schemathesis contract tests from docs/05 §11.

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
