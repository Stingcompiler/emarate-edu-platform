# Handoff — Phase 1 done → Phase 2 (learning) — 2026-09-28

## Where things stand
- **Phase 1 (core backend) is complete** on branch `feat/phase-1-core`. PR against `main` is opened in this step and merged once CI is green (CLAUDE.md: merge yourself, never wait).
  - If you find the PR still open, check CI (`gh pr checks`), fix any failure, merge with `gh pr merge --merge`, then start Phase 2 from a fresh branch off `main`.
- **Verified locally:**
  - 130 tests pass on SQLite; 129 pass plus 1 SQLite-only skip on Postgres;
  - ruff is clean;
  - `makemigrations --check` is clean;
  - the OpenAPI schema has 0 warnings (now a CI gate);
  - `pnpm api:generate`, typecheck and build pass;
  - `seed_demo` runs on the dev DB, and a live login as the department manager sees only the IT courses.

## What Phase 1 delivered (for orientation)
- **API:**
  - `/api/public/`: health, csrf, registration start/verify/complete, password forgot/reset, activate.
  - `/api/v1/` (`config/urls_v1.py`, SimpleRouter, no trailing slash): auth login/refresh/logout, me, me/courses, colleges, departments, programs, system-settings, academic-years, terms, courses, offerings (+instructors), departments/<id>/members, enrollments (+bulk, drop), students, student-imports (+rows, commit, reject), users, role-assignments, registration-requests (+decide), audit-logs.
- **Authorization:**
  - `accounts/rbac.py` is the single table; `core/permissions.capability()` and `core/viewsets.ScopedModelViewSet` apply it.
  - Out-of-scope objects return 404; in scope but without the capability returns 403.
- **Tests:**
  - `backend/conftest.py`: fixtures for a college, IT/BA departments, programs, current term, courses, offerings, `users` (one per role, scoped roles on IT), `make_user`, `make_student`, `api(user)`, `last_code()`.
  - `core/tests/test_permission_matrix.py`: READS table plus COVERED_ELSEWHERE. A new endpoint fails the suite until it gets a row.
  - `core/tests/test_acceptance_phase1.py`: the full journey.
- **Demo data:** `DEMO_PASSWORD=… uv run python manage.py seed_demo` (DEBUG only, idempotent).
  - Creates 4 departments, 11 programs, 23 courses, 40 students, and accounts `<handle>@demo.ecst.test`.
  - Handles: admin, head.registrar, registrar, results, academic, student.affairs, dept.manager, dept.supervisor, teacher, ta, hr, site, events, student.

## Next steps (Phase 2 — learning, docs/02 §8 and docs/05 §6 `learning`)
1. Read docs/02 §8 Phase 2, docs/05 §6 (`learning` models) and §7, and docs/03 §7 rows for lectures, assignments and grading. Then look at the prototype boards for teacher and student courses:
   ```bash
   python3 scripts/boards.py list Teacher
   python3 scripts/boards.py list Course
   ```
2. **New app `learning`:**
   - Models: lectures (video/file/link) per offering, assignments v2 with versioned submissions, grading, and basic rule-based grading.
   - Everything is scoped via the offering → course → department, plus instructor membership (teacher/TA; `ta_can_grade`).
3. **Storage:**
   - Bunny (private storage + Stream TUS) in production.
   - In dev, a local adapter with the same interface: signed URLs that expire in 10 minutes, and direct upload to a local endpoint, so there is no external service and no Docker.
   - Keep `core.W001` meaningful.
4. **Acceptance (tests):**
   - A teacher gets a direct-upload ticket for a 500 MB video; the bytes never pass through Django in prod mode (test the ticket and signature, not the transfer).
   - A file link expires after 10 minutes.
   - **A student cannot write their own grade.** Add a permission-matrix row for every new endpoint.
5. Extend `seed_demo` with lectures and assignments. Then run `pnpm api:generate`, open the PR, merge when green, and update this handoff.
6. **UI:** Phase 10 applies the brand to every portal page, but any page built earlier must follow the `responsive-page` skill: match the phone and desktop boards, and verify at 390, 768 and 1280.

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
- **Pagination:** every paginated model has a default ordering, and a pytest filterwarning turns unordered pagination into an error.

## Gotchas found
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
