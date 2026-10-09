# Handoff — review 2026-10-08 fixed; main auto-deploys — 2026-10-09

## Where things stand

- The 8 October review (`docs/qa/comprehensive-review-2026-10-08.md`, PR #118) was verified
  first: its probes reproduced every finding on SQLite and PostgreSQL (9/9) and in Vitest (3/3).
- Every finding is fixed, one PR per group, each probe turned into a permanent regression test
  that fails on the old code:
  - #119 exam integrity: R11 sync in the attempt's order, R09 refused answers kept and shown
    (`rejectedStore`), R10 `GET /exam-attempts/{id}/clock` polled every 30 s and asked again
    at the deadline, R04 active enrollment needed to save an answer.
  - #120 R01 admissions `update`/`submit` lock and re-read the row (`_locked`, in place).
  - #121 R02 registration decision locks the request; R03 `invalidate` and manual close use
    the attempt lock.
  - #122 R08 new document stored first, old file deleted on commit; R07 backup format
    `ECSTBAK2` (numbered records with a file id + sealed end), `BackupCorrupt`.
  - #123 R05 `User.token_version` («tv» claim; reset/disable raise it), R06 unique index on
    `COALESCE(program, 0)` + 400 + migration keeping the default in use.
  - #124 `source-map-js` 1.2.2, `sharp` 0.35.5 via pnpm overrides; `pnpm audit` clean.
- README phase table and the report's «حالة الإصلاح» section updated (docs PR).
- #118–#124 all merged with green CI. Deployed `4d558e6` (backend, portal, site) on
  2026-10-09: health 200, `/clock` answers 401 without a session, migrations
  `accounts/0006_user_token_version` and `results/0002_one_default_grading_scale` applied
  (production had no grading scales, so the R06 cleanup removed nothing), api and worker active.

- **Auto-deploy (#126, owner request «when it's merged it must be auto deployed»):** the VPS
  pulls. `ecst-autodeploy.timer` (every 2 min) runs `/opt/ecst/bin/autodeploy`; once the four
  CI jobs pass on a new `main` commit it builds everything in a temp folder, then runs that
  commit's `scripts/vps/release.sh` (shared with `deploy-vps.sh`). State in
  `/opt/ecst/deployed/autodeploy`; failures alert via `ecst-alert@`; settings in
  `/opt/ecst/autodeploy.env`. Installed and enabled 2026-10-09 (runbook §3).
  **So: never deploy by hand after a merge; just merge and check the state file.**

## In progress

- Nothing. This docs PR (README, report status, this handoff) is the last of the round.

## Next steps (ordered)

1. After the next nightly backup (03:15), run a restore drill with that `ECSTBAK2` file
   (`restore_database --name … --out …`, then `pg_restore` into a scratch database).
2. Owner items still open: off-server backup copy (A3), the backup key kept offline (A4),
   external monitoring and `OPS_ALERT_EMAIL` (A9), hosting choice (A8), permission
   differences B9/B10, the college's content (UX11), load test (D3), real devices (H).

## Decisions made (don't revisit)

- Official college name: كلية الإمارات للعلوم والتكنولوجيا. docs/03 wins conflicts; D20 (the
  department dashboard takes additions only); no Docker, no Zustand.
- A withdrawn enrollment closes a running exam like a suspension: saved answers stay.
- Refused answers do not block submission (they can never be accepted); the student is told
  under the question, in the submit dialog and on the result page.
- Tokens without «tv» count as version 0, so the R05 deploy signs nobody out.
- R06 migration keeps the oldest default scale (the one `for_program` applied).
- `ECSTBAK1` and single-token backups remain readable.

## Gotchas found

- `admissions._locked` refreshes the caller's object in place: callers such as `seed_demo`
  keep using their instance after `submit`.
- Polling hooks: depend on `query.refetch` (stable), never the query object, or intervals reset
  every render.
- Vitest + fake timers: advance a second at a time inside separate `act` calls so React renders
  between steps.
- `core/tests/test_backups.py`: stub `media_archive_to` when shrinking `CHUNK`, or the local
  media folder is encrypted in 4-byte records.
- E2E on ports 8011/5184/4332 (8001 belongs to another project). Playwright screenshot paths
  are relative to `e2e/`.
- macOS has no `timeout`; use pytest `-o faulthandler_timeout=…` to locate hangs.

## Verify

- Backend: `cd backend && uv run pytest` and `DATABASE_URL=postgres:///ecst uv run pytest --create-db`.
- Portal: `pnpm typecheck && pnpm test && pnpm build`; `pnpm format:check`; `pnpm audit`.
- E2E: `E2E_API_PORT=8011 E2E_PORTAL_PORT=5184 E2E_SITE_PORT=4332 pnpm e2e exam.spec.ts`.

## Owner's standing rules

- One branch/PR per change, merge with `gh pr merge --merge` when CI is green; never
  force-push or rebase. Tests on SQLite and Postgres. Verify UI at 390 and 1440.
- RBAC in `accounts/rbac.py`; every new endpoint gets a permission-matrix row; writes audited.
- Never read or repeat the demo password, `/opt/ecst/env` values or the SMTP key; never touch
  other projects on the shared VPS; no server address in this public repository.
