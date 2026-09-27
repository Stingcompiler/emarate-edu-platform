# Handoff — Phase 3 done → Phase 4 (results + student affairs) — 2026-09-28

## Where things stand
- **Phases 1–2 are merged** to `main` (PRs #3 and #4).
- **Phase 3 (notifications + PWA)** is complete on `feat/phase-3-notifications`. Its PR is opened in this step; merge it once CI is green.
  - GitHub auto-merge is disabled for this repo, so merge manually with `gh pr merge --merge`.
- **Verified locally:**
  - 190 tests pass on SQLite; 189 pass plus 1 skip on Postgres;
  - migrations reverse on both databases;
  - the schema has 0 warnings;
  - ruff, typecheck, build and prettier pass.
  - Portal pages were checked in the browser pane at 390, 768 and 1280, plus dark mode.
  - The Service Worker was verified in real headless Chrome over CDP: it registers, activates and caches the shell. The pane itself can't fetch SW scripts, which is a pane limitation.

## What Phase 3 delivered
- **Backend `notifications` app:**
  - `audience.py`: validate, authorize per docs/03 §8, resolve, and `options()` for the compose form (groups: college, department, cohort, course, staff).
  - `services.py`: `send`, `notify`, `notify_audience`, idempotent `fan_out` that honours preferences, and HR notices.
  - `push.py`: VAPID keys; dev creates `backend/.vapid-dev.json`, and `manage.py vapid_keys` prints production keys.
  - `tasks.py`: fan_out, send_push, deliver_outbox with backoff, remind_due_assignments (beat).
  - `events.py`: the automatic notifications.
  - Other apps call `notifications.events.*` inside their transactions.
- **Endpoints:**
  - `/api/v1/notifications` (+read, read-all, unread-count), `notifications/sent` (+preview, audiences), `notifications/preferences`.
  - `push/config`, `push/subscriptions`, `push/subscriptions/remove`.
  - `hr-notices` (+acknowledge).
  - New fields: `CourseOffering.ta_can_notify` and `Assignment.reminder_sent_at`.
- **Portal (`apps/portal`):**
  - Routes: `/login`, `/register`, `/forgot-password`, `/notifications`, `/notifications/new`, `/settings`, `/install`, `/system`, 404.
  - `PortalShell` holds the role nav, unread badges, bell and sign-out. The phone NavigationBar is a light large title that collapses to a glass bar (docs/09).
  - `lib/auth.tsx` provides `useMe`, `RequireAuth` and sign-out. `lib/push.ts`, `lib/theme.ts` and `components/ui.tsx` hold the primitives.
  - `packages/api` refreshes the session once on a 401 and replays the request.
  - `public/sw.js` is hand-written. Dev registers `/sw.js?dev=1`, which handles push only (no caching).
- **Dev servers:** `.claude/launch.json` defines api, portal and boards. The preview tool in this app looked in another folder, so start them from the shell. Vite listens on `localhost`, not 127.0.0.1.

## Next steps (Phase 4 — results + student affairs, docs/02 §8)
1. Read docs/02 §8 Phase 4, docs/05 §6 `results` and `student_affairs`, §8.4, and docs/03 rows for results, corrections and student affairs. Boards:
   ```bash
   python3 scripts/boards.py list Results
   python3 scripts/boards.py list StudentAffairs
   python3 scripts/boards.py list DesktopResults
   ```
2. **Backend `results`:**
   - Import a finished results file (results officer college-wide; department manager/supervisor for their department): validate, preview, commit.
   - GradingScale, publish per term (TermResultRelease) and display settings.
   - ResultCorrection approved by academic affairs.
   - Student view, and a PDF transcript. WeasyPrint is heavy; decide or defer and note it.
   - Notify on publish or correction via `notifications.events`.
3. **Backend `student_affairs`:** regulations with acknowledgement, student cases with events, and misconduct reports (exam linkage completes in Phase 5). Regulatory notifications.
4. **Portal pages:** follow the responsive-page skill. Match both boards where they exist; say "derived" in the PR where one is missing.
5. Add a permission-matrix row for every endpoint, extend the seed, test on both databases, open the PR, merge when green, and update this handoff.

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
- **Pagination:** every paginated model has a default ordering, and a pytest filterwarning turns unordered pagination into an error.

## Gotchas found
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
