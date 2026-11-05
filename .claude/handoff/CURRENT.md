# Handoff — November review, round 1 done; site UX round — 2026-11-05

Older rounds (2026-10-24 → 11-02): `.claude/handoff/archive/2026-10-24_to_2026-11-02.md`.

## State

- **November review** (owner's work order `docs/qa/comprehensive-review-plan-2026-11.md`),
  round 1 report `docs/qa/comprehensive-review-2026-11.md`: baseline + axes 1.1, 1.2, 1.3, 2, 3
  and part of 4. Findings R26–R56; fixed and merged in #225–#233. Evidence and probes:
  `docs/qa/evidence/review-2026-11/` (one folder per axis; `bash scripts/qa/probe.sh <dir> sqlite`).
- **Running (round 2, no server needed):** axes 1.4/1.5 (exams, notifications), 5 (performance),
  8 (keyboard, contrast in warm/dark, Arabic text) — background audits, then fix PRs.
- **Site UX review** (owner, 2026-11-04, `~/Documents/Codex/2026-11-04/.../website-design-ux-review-ar.md`):
  code items in #234 (small fixes), #235 (programme finder), #236 (home order). Content items
  are the owner's (below).

## Waiting on the owner

1. Department head's name on the site without `public_profile` (R34): hide until consent, or
   institutional (then write it in docs/03).
2. docs/03 wording (recommend: edit the doc): site manager reads cycles/intakes (D7); academic
   affairs hides a staff photo/qualification; head registrar deletes a cycle/intake without
   applications.
3. CSP for site and portal (R56): a line in `/etc/caddy/ecst.caddy` (the owner runs it), start
   with `Content-Security-Policy-Report-Only`.
4. Round 2 on the server: load the SSH key (read-only checks), approve restoring the latest
   backup into a local DB (moves, migrations, `purge_demo` on real data), a real `OPS_ALERT_EMAIL`.
5. Production content: publish the college admission form (blocks applying); move the 15
   programmes entered as departments and delete the empty ones; the duplicate IT diploma;
   2027/2028 year and terms; phone/email/address/hours in site settings (contact page and
   footer show them once filled); a hero image without text; «عن الكلية», full regulations,
   study plans, department descriptions.

## Decisions made (don't revisit)

- docs/03 wins conflicts; D20 (department dashboard: additions only); no Docker, no Zustand.
- Structure: a programme moves department only with no students, courses or applications; a
  code change writes CMS redirects; stopped programme/department takes no applications.
- Announcements: addressing an audience is not owning it — sys all, sm the college's, em event
  ones and own, hreg/aa own. Media: em changes/deletes own uploads; in-use picture → 409.
- Photos: JPEG/PNG/WebP only (`Image.open(formats=…)`), WebP needs RIFF+WEBP, ≤ 50 Mpx; public
  photo only while on «الكوادر»; cache 5 min.
- Site rebuild debounce 30 s; structure writes trigger it.
- Admission form: conditions name an applicant field above; `university_number` is staff/
  release, ≤ 30 chars, unique across applications, frozen after registration.

## Gotchas

- Merge one PR, wait for `main`'s CI, then the next (CI cancels the previous main run; the server
  deploys only a commit whose CI passed). Chained watcher: `.scratch/merge-when-green.sh <n>`
  (the session scratchpad gets wiped; a copy lives in `.scratch/`). `gh pr merge` GraphQL errors
  → `gh api -X PUT repos/…/pulls/<n>/merge -f merge_method=merge`.
- Parallel PRs that add to `backend/locale/ar/LC_MESSAGES/django.po` conflict: merge `main` in,
  keep both sides, rebuild the `.mo` with `msgfmt`.
- CI infra failures (GitHub API timeouts installing tools) → `gh run rerun <id> --failed` after
  the run completes.
- Fix work in separate worktrees (`git worktree add ../ecst-wt-<name> origin/main`, then
  `uv sync` / `pnpm install --frozen-lockfile --prefer-offline && pnpm api:generate`) so a long
  baseline in the main checkout isn't disturbed.
- E2E on ports 8011/5184/4332 (8001 belongs to another project); `E2E_BOOT_MS=480000` under load.
- Local Postgres stops between sessions: `brew services start postgresql@16`.
- Old probes R03/R11 (review-2026-10-08) still "pass": they inject a write after the locked
  re-read, which real locking prevents — not a regression; their regression tests pass.

## Verify

- Backend: `cd backend && uv run pytest` and `DATABASE_URL=postgres:///ecst uv run pytest`.
- Frontend: `pnpm typecheck && pnpm test && pnpm build`; `pnpm lint:ui`; `pnpm format:check`.
- Baseline: `bash scripts/qa/run.sh <dir> lint migrations openapi typecheck backend-sqlite backend-pg frontend lint-ui build seo scripts audit pip-audit e2e` (`QA_PG_URL=postgres:///ecst`).

## Owner's standing rules

- One branch/PR per change; merge when CI is green; never force-push or rebase.
- RBAC in `accounts/rbac.py`; every new endpoint gets a permission-matrix row; writes audited.
- Responsive at 390 and 1280 (`responsive-page` skill).
- Never read or repeat the demo password, `/opt/ecst/env` values or the SMTP key; never touch
  other projects on the shared VPS; no server address in this public repository.
