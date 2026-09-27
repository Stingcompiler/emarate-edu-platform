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

## Commands

| Task | Command |
|---|---|
| Run everything | `pnpm dev` |
| Backend tests (SQLite / Postgres) | `cd backend && uv run pytest` · `DATABASE_URL=postgres:///ecst uv run pytest` |
| Lint and format the backend | `cd backend && uv run ruff check . && uv run ruff format .` |
| Regenerate the API client | `pnpm api:generate` |
| Typecheck and build the frontend | `pnpm typecheck && pnpm build` |
| Find a page's design boards | `python3 scripts/boards.py list "<keyword>"` |
