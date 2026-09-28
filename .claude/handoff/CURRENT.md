# Handoff — Public site: all official pages (phase 3 next) — 2026-09-28

## Current work: «the public site carries every official page» (owner, 2026-09-28)
Owner decisions: scope = **all pages including optional ones**; menus = **edited by the site manager**;
content = **production gets drafts with structure + guidance text (published by the site manager),
dev seed publishes demo texts clearly marked «تجريبي»**. Never invent official facts (names, fees, accreditation).
- Done before: UX review `docs/qa/landing-ux-review-2026-09.md`; #28 sticky apply (item 1), #29 `/admissions` (item 2).
- **Phase 1 — #30 merged:** `/regulations` (Regulation.is_public opt-in), `/calendar`, `/events` (+ past), `/announcements` (+ detail), news RSS.
- **Phase 2 — #31 (`feat/landing-menus`):** two-level CMS menus; migration `content/0002_default_menus` holds the
  full official URL structure; landing `lib/menus.ts` hides links whose page isn't built/published.
  Merge when CI is green.
- **#31 merged.** **Phase 3 is on `feat/landing-official-pages` (PR open), all checks green locally**
  (pytest SQLite 663 / Postgres 662, format, typecheck, Vitest, build 100 pages, e2e landing 6/6).
  Remaining: glance at the portal PageEditor for an official page (slug locked, hint shows the path), commit,
  PR, merge when CI is green. What it does: `backend/content/official.py` (registry, drafts via post_migrate,
  `public_path`, "note" block), Page.slug allows one "/", author nullable (migration 0003), pages list gains
  `path` in registry order, landing `[lang]/[...path].astro`, legal links in the footer bar, dean's word on home,
  about sub-page list, auto heads of department on /about/leadership, and `lib/api.ts` now caps parallel
  requests (6), retries transient failures and never caches a failure (fixed dev/e2e 404s from "fetch failed").
- **Phase 3 — original plan:** editorial official pages at the URLs already in the default menus:
  `/about/{history,vision,dean,leadership,accreditation,partners,careers}`, `/academics/{student-guide,library}`,
  `/admissions/{fees,equivalence}`, `/student-life/{affairs,activities,alumni}`, `/gallery`, legal `/privacy`
  (now `/p/privacy`), `/terms`, `/accessibility`. Plan: CMS `Page` rows with those slugs (slug field may need `/`
  or a separate `path`), created as drafts with guidance blocks in production; seed_demo publishes demo text marked
  تجريبي; landing routes render them and `lib/menus.ts` `builtPath` learns the published ones; dean's word also on home.
- **Phase 4:** remaining UX review items in order 4(b) → 6 → 5 → 7 → 8 → 9 → 12. Open owner decision: credit-hours source (item 3).

## Where things stand
- **All phases 0–11 are merged** (PRs #2–#13); PR #14 (student walkthrough fixes) is merged too.
- **The role-by-role walkthrough is complete** (the owner asked to sign in as every role, write a report after each, and not wait).
  - Report: `docs/qa/role-walkthrough-2026-09.md` (Arabic, 14 roles plus a summary table).
  - Fixes are on branch `fix/role-walkthrough` → one PR, which Claude merges once CI is green.
  - **Main fixes:**
    - Teacher/TA account creation failed (the UI sent a department for a college-wide role).
    - News and events couldn't be published without typing a slug by hand (now auto-filled from the title).
    - A 429 on `/me` sent users to the login page. The admin home made 13 separate count calls, and every window focus refetched everything; fixed with a single `/role-assignments/counts` endpoint, a global `staleTime` of 30 s, and a retry screen in `RequireAuth`.
    - Audit labels are in Arabic, with readable object names.
    - Role forms now offer only the roles the user may create or grant (`/me.creatable_roles` and `/me.grantable_roles`).
    - TA announcements depend on `ta_can_notify`, and TA grading metrics count only where `ta_can_grade` is on.
- **Arabic API messages** (PR `feat/arabic-api-messages`): every service, validation and importer message is wrapped in `gettext` and translated in `backend/locale/ar/LC_MESSAGES/django.po`. The compiled `.mo` is committed because Render has no `msgfmt`. The portal always sends `Accept-Language: ar`. `core/tests/test_i18n.py` fails on any untranslated or uncompiled message; the workflow is in the `.po` header.
- **Arabic counting:** `count(n, N.<noun>)` in `apps/portal/src/lib/format.ts` uses `Intl.PluralRules("ar")`. 1 and 100+ take the singular, 2 the dual without the number, 3–10 the plural, 11–99 the accusative singular. Add new nouns to `N`; don't write number + noun by hand. Phrases with an adjective are written as "label N" (e.g. «غير المصحح 3»).
- **Test layers (docs/05 §11), all in CI:**
  - Backend pytest, 655 tests including `core/tests/test_contract.py` (Schemathesis over all 330 operations: no 5xx).
  - Portal Vitest, 50 tests (`pnpm test`).
  - Playwright `pnpm e2e`: its own API on :8001 and portal on :5174 with fresh demo data; phone and desktop; sign-in, exam, application, no-overflow on 27 pages, and axe AA on 21 pages plus dark mode.
  - The e2e stack also starts the public site on :4322. `landing.spec.ts` crawls its roughly 50 pages (links, overflow, axe, title, description, h1, canonical).
  - `sweep.spec.ts` visits every navigation page of all 14 roles.
  - A one-off tablet run (768×1024) of the sweep passed on 2026-09-28.
  - Locally the e2e tests use the installed Google Chrome.
- **Nothing is pending from the walkthrough.** Remaining work needs the owner (see "Owner actions").
- **Dev login:** demo accounts are `<handle>@demo.ecst.test`. `ta@` and `dept.supervisor@` have a different password from the rest (seed_demo doesn't reset existing passwords); see the transcript.
- **Browser pane tips:**
  - Coordinate clicks don't land while a phone size is emulated; use refs or JS clicks.
  - The pane fires focus events during tool actions.

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
