# Handoff — Phase 4 done → Phase 5 (exams) — 2026-09-28

## Where things stand
- **Phases 1–3 are merged** to `main` (PRs #3, #4, #5).
- **Phase 4 (results + student affairs)** is complete on `feat/phase-4-results`. Its PR is opened in this step; merge it once CI is green.
  - The app's Auto-fix watches the PR for CI failures. GitHub auto-merge is disabled, so merge manually with `gh pr merge --merge`.
- **Verified locally:**
  - 224 tests pass on SQLite; 223 pass plus 1 skip on Postgres;
  - migrations reverse on both databases;
  - the schema has 0 warnings;
  - ruff, typecheck, build and prettier pass.
  - Pages were checked in the browser pane at 390 and 1280, using the demo data from `seed_demo`.

## What Phase 4 delivered
- **`results` app:**
  - `importer.py` (reads tables via `students.importer.read_table`), then commit, publish/unpublish and delete (uncommitted only).
  - `GradingScale.for_program()` / `.grade()`.
  - `ResultCorrection`: the results officer requests, academic affairs decides; approval bumps the version and notifies the student.
  - `student_view()` for `/me/results`, which applies `ResultDisplaySettings` and `TermResultRelease` hiding.
  - CSV export: results staff and teachers only.
- **`student_affairs` app:**
  - Regulations: draft, publish, new version supersedes; acknowledgements.
  - StudentCase with events: notes, decide, publish to student, close/reopen. `/me/cases` hides internal notes.
  - MisconductReport: resolve converts it to a case or dismisses it.
  - `students/<id>/status`: suspend or reinstate, with a reason.
- **Files:** a StoredFile's offering is now optional. Purposes `regulation` and `case` have policies with `needs_offering=False`.
- **Capabilities** (`rbac.py`): `results.manage`, `results.view`, `results.correct`, `results.approve`, `results.settings`, `regulations.manage`, `cases.manage`, `cases.view`, `students.status`.
- **Portal pages:**
  - `/results`, `/results/search`, `/results/settings`.
  - `/result-imports` (+`/:id`), `/result-corrections`.
  - `/regulations` (+`/new`, `/:id`).
  - `/cases` (+`/new`, `/new?report=`, `/:id`).
  - `lib/nav.ts` builds navigation from `me.capabilities`. Helpers: `StatusBadge`, `CodeTile`, `lib/upload.ts`.
- **Seed:** now adds published IT level-1 results, two regulations, a case and a misconduct report.

## Next steps (Phase 5 — exams, docs/02 §8, docs/05 §6 `exams`, §8.5)
1. Read docs/05 §6 `exams` and §8.5, docs/03 rows for exams, and the boards:
   ```bash
   python3 scripts/boards.py list Exam
   ```
   Desktop boards: DesktopExamBuilder, DesktopStudentExam, DesktopDeptExams.
2. **Backend `exams` app:**
   - Models: Exam, Question (+config JSON), Choice, ExamAttempt, StudentAnswer.
   - Question types go through a registry.
   - Server-timed attempts: `started_at`/`deadline_at` from the server, answer upsert rejected after deadline + grace, idempotent submit (`Idempotency-Key`).
   - A beat task closes expired attempts. Auto-grading, with `needs_manual` for essays.
   - Permissions: a TA can't publish or close exams; a department manager can delete; a supervisor can't.
3. **Connect the rest:**
   - `MisconductReport.attempt`, linking reports to exam attempts.
   - Exam notifications: published, and starting within the hour.
4. **Portal:**
   - Exam builder (desktop board).
   - Taking an exam in a focused shell with no sidebar: phone + DesktopStudentExam.
   - The exam result screen.
   - The teacher's results and statistics.
5. **Load test:** 500 concurrent attempts locally with k6 (install via brew, not Docker). Record the results in the PR.
6. Add a permission-matrix row for every endpoint, extend the seed, test on both databases, open the PR, merge when green, and update this handoff.

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
