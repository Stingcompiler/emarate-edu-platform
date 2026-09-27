# Handoff — Phase 1 (core backend) — 2026-09-27

## Where things stand
- **Branch:** `feat/phase-1-core`, created from `main` after PRs #1 (docs + 147-board prototype) and #2 (Phase 0 + responsive shell) were merged.
- **PR:** not opened yet. Open it against `main` when the phase is done, then merge it yourself (see CLAUDE.md).
- **Phase 1 scope:** docs/02-build-plan.md §8 Phase 1. Specs: docs/05-system-design.md §6 (models), §7 (API), §8.1–8.2 (registration and login flows); docs/03-roles-and-permissions.md §6–7 (appointments and the permission matrix).

### Done (not committed yet — commit this handoff together with it)
- Dependencies added: djangorestframework-simplejwt, django-filter, openpyxl, phonenumbers (`backend/pyproject.toml`, `uv.lock`).
- **Models and migrations** (fresh dev DB migrates; `makemigrations --check` is clean):
  - `organization`: College, Department, Program, SystemSettings (singleton).
  - `academic`: AcademicYear, Term, Course, CourseOffering, OfferingInstructor, DepartmentMembership, Enrollment.
  - `students`: StudentRecord, StudentImportBatch/Row, UniversityNumberSequence.
  - `audit`: AuditLog (append-only).
  - `accounts`: User switched to email login (username removed, migration 0002), plus RoleAssignment, OneTimeCode, RegistrationRequest, ActivationToken.
- **RBAC** in `backend/accounts/rbac.py`: Role enum (14 roles), `CAPABILITIES` (docs/03 §7), `GRANTS` (§6), `CREATABLE_ACCOUNTS`, and `Scope` / `scope_for` / `can`.
- **Core:** `core/permissions.py` (`capability()` DRF class), `core/viewsets.py` (ScopedModelViewSet: capability + department scope + audit + ProtectedError→409), `core/errors.py` (Conflict 409, Locked 429), `core/text.py` (Arabic name normalisation), `core/models.py` (Bilingual + Singleton mixins).
- **Services:**
  - `accounts/services.py`: registration start/verify/complete/decide, login with lockout, password reset, staff accounts plus activation tokens, grant/revoke role.
  - `accounts/otp.py`, `accounts/emails.py`.
  - `academic/services.py`: membership, instructors, enroll, drop, bulk_enroll.
  - `students/importer.py`: read xlsx/csv → validate → commit/reject.
  - `audit/services.py`.
- **Serializers and views:**
  - accounts: auth cookies, /me, public registration, password, activate, users, role-assignments, registration-requests.
  - organization.
  - academic: years, terms, courses, offerings + instructors, department members, enrollments + bulk/drop, me/courses.
  - students: records, imports + rows/commit/reject.
- **Authentication:** `accounts/authentication.py` (CookieJWTAuthentication + CSRF). Settings: SIMPLE_JWT, cookie names, lockout, throttles `login`/`otp`/`otp_ip`.

## In progress
- Nothing is wired into URLs yet. `accounts/views.py` imports an unused `update_session_auth_hash`; remove it.

## Next steps (ordered)
1. **URLs:** add `config/urls_v1.py`, mounted at `api/v1/` in `config/urls.py`. Public endpoints go under `api/public/`: `csrf`, `registration/start|verify|complete`, `password/forgot|reset`, `activate`. Routers:
   - auth/login|refresh|logout, me, me/courses;
   - colleges, departments, programs, system-settings;
   - academic-years, terms, courses, offerings;
   - departments/<id>/members;
   - enrollments, students, student-imports, users, role-assignments, registration-requests, audit-logs.
2. **Audit log read endpoint** (`audit/views.py`): system admin sees everything; department manager/supervisor see their department (capability `audit.view`).
3. **Admin registrations** for the organization, academic, students and audit apps (audit is read-only).
4. **Tests** (pytest, both DBs):
   - rbac unit tests;
   - registration flow (uniform response, OTP attempts, approval on/off, email-matches-official → active, reject deletes the pending account);
   - login (identifier = email or university number, lockout, pending message);
   - cookies, refresh rotation and CSRF;
   - importer (xlsx + csv, Arabic headers, blank keeps value, duplicates, commit idempotency);
   - enrollment bulk idempotency;
   - **permission matrix**: every endpoint × role × in/out of department scope (docs/05 §11). The test must fail if an endpoint has no row.
5. **Seed:** `manage.py seed_demo` with fictional Sudanese-style data. ECST, 4 departments, 11 programs (match `docs/prototype` names), 2026/2027 terms, courses, offerings, one user per role, ~40 student records. The dev password comes from env `DEMO_PASSWORD`, and the command only runs when DEBUG is on.
6. **Acceptance script/test:** registrar uploads file → student registers with OTP → department manager approves → student's `me/courses` lists current-term courses.
7. `pnpm api:generate`, typecheck and build; README/CLAUDE.md commands; open the PR; merge once CI is green; update this handoff for Phase 2.

## Decisions made (don't revisit)
- **Roles stored as a `role` CharField on RoleAssignment, not Django Groups.** Department scope can't be expressed with Group permissions, and one code table (`rbac.CAPABILITIES`) is testable against docs/03. Mention this in the PR as a deliberate deviation from docs/03 §10.
- **Registration:** with approval ON, an email equal to the official email in the college file activates immediately; any other email → `pending_approval` (docs/02 §4.3). Rejecting deletes the never-activated account so the student can retry.
- **The registration start response is identical for matching and non-matching details.** Only a match gets an email.
- **Staff accounts are created without a password;** an activation link is emailed (7 days, single use).
- **Supervisor = manager without delete/removal:** `courses.delete` and `membership.remove` exclude supervisors. Instructor removal counts as a delete.
- **Structure endpoints are college-wide reference data** (no department filter). Write access is system admin only.
- **The import never touches `status` or `user`,** and a blank cell keeps the existing value.

## Gotchas found
- **Constraint order:** building constraint lists from a Python set gives a non-deterministic migration order. Use `sorted()` (see `_SCOPED` in accounts/models.py).
- **Adding the non-null `full_name_ar`** needed a one-off default. Migration 0002 uses `preserve_default=False`.
- **Django 6.1:** use `MAILERS` (EMAIL_BACKEND is deprecated). The built-in CSP needs a per-view `csp_override` for Swagger.
- **TypeScript is pinned to 5.9** (openapi-typescript). `astro dev` needs `--ignore-lock`. Test phone sizes in the browser pane, not headless Chrome.
- **Audit log actors are PROTECT.** Never make a user you may delete the actor of an entry.

## Verify
```bash
cd backend && uv run python manage.py makemigrations --check --dry-run && uv run python manage.py check
cd backend && uv run pytest && DATABASE_URL=postgres:///ecst uv run pytest
cd backend && uv run ruff check . ../scripts && uv run ruff format --check . ../scripts
pnpm api:generate && pnpm typecheck && pnpm build
```

## Owner's standing rules
- `CLAUDE.md`:
  - responsive always (skill `responsive-page`);
  - no Docker; SQLite in dev, Postgres in prod, tests on both;
  - one PR per phase, **merge to main yourself without asking; never wait**;
  - department manager dashboard: additions only;
  - no Zustand.
- Hand off via this file (skill `session-handoff`) at every phase or major step, or when context is long.
