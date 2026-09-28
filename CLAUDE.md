# Working in this repository

Platform for the Emirates College for Science & Technology. Plans and specs
live in `docs/` (01–09); `docs/03-roles-and-permissions.md` wins any conflict.

## Rules

- **Start every session by reading `.claude/handoff/CURRENT.md`** and continue from its
  Next steps. Keep it updated (skill `session-handoff`) at the end of each phase or major
  step, and whenever the conversation grows long, so another session can take over
  without losing anything.

- **Responsive, always.** Every page is built for phone *and* large screens and
  must match both prototype boards (390×844 and 1280×800). Follow the
  `responsive-page` skill for every UI change and verify at both sizes before
  saying a page is done.
- **No Docker.** Development runs on SQLite with zero services (`pnpm dev`);
  production is PostgreSQL + Redis. Code must work on both databases (docs/05 §4);
  tests run on both in CI.
- **One branch and one PR per phase or change**, targeting `main`. When local checks pass (tests on SQLite and Postgres, typecheck, build) and CI is green, **merge it to `main` yourself** (`gh pr merge --merge`), without asking the owner, and continue to the next phase. Never force-push or rebase.
- The department manager dashboard keeps the old sections and workflows; only
  additions are allowed (docs/02 D20).
- **No Zustand.** Server state lives in TanStack Query; UI state is a small Context.
- **Authorization lives in `accounts/rbac.py`** (capabilities + department scope).
  Every new `/api/v1` endpoint needs a row in `core/tests/test_permission_matrix.py`;
  the suite fails otherwise. Writes go through a service that records an audit entry.

## Commands

| Task | Command |
|---|---|
| Run everything | `pnpm dev` |
| Demo data (dev only, idempotent) | `cd backend && DEMO_PASSWORD='…' uv run python manage.py seed_demo` — accounts `<role>@demo.ecst.test` |
| Exam load test (k6, 500 students) | see `scripts/loadtest/README.md` |
| Web Push keys for production | `cd backend && uv run python manage.py vapid_keys` (dev creates `backend/.vapid-dev.json` itself) |
| Backend tests (SQLite / Postgres) | `cd backend && uv run pytest` · `DATABASE_URL=postgres:///ecst uv run pytest` |
| Lint and format the backend | `cd backend && uv run ruff check . && uv run ruff format .` |
| Regenerate the API client | `pnpm api:generate` |
| Typecheck, test and build the frontend | `pnpm typecheck && pnpm test && pnpm build` |
| End-to-end tests (own API :8001 + portal :5174, fresh demo data) | `pnpm e2e` — first run locally uses the installed Google Chrome |
| Find a page's design boards | `python3 scripts/boards.py list "<keyword>"` |
