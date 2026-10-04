# Handoff — project review — 2026-10-04

## Where things stand

- Branch: `codex/project-review`; reviewed `811f1a1`, equal to `origin/main` at session start.
- Owner asked: «قم بمراجعه المشروع». This phase delivers a review and remediation plan, with no application fixes or production deployment.
- `docs/qa/project-review-2026-10.md`: current summary, preserved Oct 3 operations/security evidence, new C–I axes (Arabic ج–ط), prioritized PR plan and owner checklist.
- `docs/qa/evidence/project-review-2026-10/`: six backend probes confirmed on SQLite and Postgres, two frontend probes, statement coverage summary, focus measurements and 390/1440 screenshots. Probes assert observed faulty behavior; they are deliberately outside CI tests.
- `docs/runbook.md`: actual VPS vs alternative Render clarified, load-test claim corrected, media restore drill and monitoring notes added.
- SQLite 735 passed; PostgreSQL 734 passed and one SQLite-only skip. Vitest 71 passed. Typecheck, backend lint/format, migration check and OpenAPI validation passed. Statement coverage 94%. Strict landing build produced 104 pages.
- Playwright full run: 77 passed, 2 failed, 1 intentional desktop-exam skip (44.3 minutes). Both phone sweep failures passed a stable `--last-failed` rerun (56.3 seconds): 79 distinct tests passed across runs. Do not describe this as a clean full first run.
- Local review commit: `1852d82`, with a final validation follow-up commit. No remote branch or PR was created; no CI was run for this review branch.

## Publication and verification limits

- Review and evidence completed locally. Automatic approval review rejected the push because this security/operations report would leave the workspace for a GitHub repository whose public visibility and publication authorization had not been established. Read-only lookup then confirmed `Stingcompiler/emarate-edu-platform` is PUBLIC. Await explicit owner approval to publish this report and evidence there; do not bypass the rejection with another tool.
- If approved: push `codex/project-review`, create and attach the report PR, then required green CI and merge under the standing repository rules. The prepared body is `/tmp/ecst-review-pr-body.md` if still available.
- No SSH access: agent has no loaded identities. Asked owner to unlock the key; do not handle its passphrase.
- No changes to production or other projects.

## Next steps (ordered)

1. Read the report and evidence README for final validation/PR status before repeating checks.
2. Fix C2: suspended students still open lectures, submit assignments and save exam answers.
3. Fix C1: stale answer save changes a submitted answer without recalculating its mark; share attempt locks across all writers.
4. Fix C6/C7: submit can clear unsent answers after PUT503; pendingStore loses its queue when storage is blocked. Include rejected fetch, deadline and reconnection cases.
5. Fix C3/C4: stale admissions and result-correction decisions overwrite terminal decisions. Lock/recheck within the transaction.
6. Fix C5 and B7: atomic business write+audit and permission tests for write methods.
7. Follow the report's remaining small PR groups: deployment/dependencies, N+1, route bundles, keyboard dialogs, dependency updates and demo cleanup.
8. Owner: off-server backups and keys, final hosting choice, Sentry/uptime, domain/email/content/policies, real iPhone/Android and isolated VPS-sized load test.

## Decisions made (don't revisit)

- This request is a review; the report's application fixes are proposed work, not completed work.
- Existing operations/security fixes #94–#97 are preserved as historical evidence, not claimed reverified over SSH.
- docs/03 wins permission conflicts. B9/B10 remain owner choices; don't silently redefine them.
- No load or penetration tests on shared production. No Docker. No changes to other server projects.
- Playwright iPhone profile is Chromium; it does not prove iOS/Safari or physical-device push.

## Gotchas found

- Sandbox blocks uv's default cache and local sockets. Use the existing `.venv/bin/python` for ordinary checks; approved local network runs for PostgreSQL/browser tests. Temporary uv tools used `/tmp/ecst-review-uv-cache`.
- Coverage tools must use Python 3.13 (the project version); system Python 3.12 cannot import native dependencies. Coverage excludes .venv, tests, migrations, config, conftest and management commands; not branch coverage.
- Never modify portal source files during an E2E run: Vite reloads can destroy axe's execution context. Initial student sweep lost axe's context while source probes were being moved; both initial sweep failures passed a stable rerun. This does not establish that the suite has no flakes.
- `pnpm build` without the API succeeds with partial landing content; use LANDING_STRICT=1 with test API for a full build.
- Lighthouse/Chrome hung and was stopped with no result. No valid current LCP/CLS/INP or VPS load figures.

## Verify

- `cd backend && .venv/bin/python -m pytest`
- `cd backend && DATABASE_URL=postgres:///ecst .venv/bin/python -m pytest`
- `cd backend && .venv/bin/ruff check . ../scripts && .venv/bin/ruff format --check . ../scripts`
- `pnpm typecheck && pnpm test && pnpm build && pnpm format:check`
- `E2E_API_PORT=8011 E2E_PORTAL_PORT=5184 E2E_SITE_PORT=4332 pnpm e2e`
- Reproduction commands for confirmed faults: `docs/qa/evidence/project-review-2026-10/README.md`.

## Owner's standing rules

- See `CLAUDE.md`: responsive phone and large-screen verification, scoped RBAC, audited services, endpoint matrix, department dashboard additions only, no Docker/Zustand.
- One branch/PR per change, merge after checks and green CI, no force-push/rebase.
- VPS: `/opt/ecst`, PostgreSQL ecst, Redis DB3, Caddy, `ecst-api` and `ecst-worker --beat`; never print env/secrets or affect other projects. Last recorded deployed backend `5dd996f` (Oct 3; not independently checked today).
