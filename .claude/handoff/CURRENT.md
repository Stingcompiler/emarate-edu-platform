# Handoff — review fixes, round 2 — 2026-10-04 (evening)

## Now
- The owner chose «كلية الإمارات للعلوم والتكنولوجيا» and said «نفّذ توصياتك في الباقي» (carry out your recommendations for the rest).
- The review report has merged (#99). Each fix has its own PR, and the merged ones are in `main`:
  - #100: exam integrity (C1, C6, C7, C8).
  - #101: decision locks (C3, C4).
  - #102: deploy-script safety and dependencies (A12, A13, B11, B12).
  - #103: honest draft saving, focus, results states, dialog keyboard (UX1–UX3, G1).
  - #104: the official name. Migration `content` 0007 renames stored copies of the old default.
  - #105: suspension closes learning (C2).
  - #106: results at 200% text, 44px header targets, change programme (UX4, UX8, UX10).
  - #107: matrix write gates (B7).
  - #108: exam list N+1 and lazy route chunks (D1, D2).
- The status table is in `docs/qa/project-review-2026-10.md`, under «حالة الإصلاح».
- **Not deployed yet.** The SSH key isn't loaded. When the owner runs `ssh-add --apple-use-keychain ~/.ssh/ovh_vps_ed25519`:
  1. Run `ECST_SSH=ubuntu@<host> ECST_SSH_KEY=~/.ssh/ovh_vps_ed25519 VITE_SITE_URL=https://ecst.stingdev.pro/ar/ scripts/deploy-vps.sh all`. This is the first run of the new uv-sync and health steps; a failure there rolls back by itself.
  2. Close `/admin` in Caddy (the owner approved it).
  3. Check `deploy-vps.sh status`.
- **Still open:**
  - for the owner: A3, A4, A8, A9, B9, B10;
  - in code: C5, C9, G2, UX5, UX7, UX9, UX11, UX12, A14;
  - needing an environment: D3 (isolated load test) and H (real devices).
- The e2e ports here are `E2E_API_PORT=8011 E2E_PORTAL_PORT=5184 E2E_SITE_PORT=4332`. A second stack in another worktree can use 8021, 5194 and 4342.

## Earlier — design / UX review (Codex, 2026-10-04 morning)


- Branch: `codex/design-ux-review`, started from local `255ca23` on `codex/project-review`. Application code remains `811f1a1`, equal to `origin/main` at the original review start.
- Owner asked: «قم بمراجعه المشروع». This phase delivers a review and remediation plan, with no application fixes or production deployment.
- `docs/qa/project-review-2026-10.md`: current summary, preserved Oct 3 operations/security evidence, new C–I axes (Arabic ج–ط), prioritized PR plan and owner checklist.
- `docs/qa/evidence/project-review-2026-10/`: six backend probes confirmed on SQLite and Postgres, two frontend probes, statement coverage summary, focus measurements and 390/1440 screenshots. Probes assert observed faulty behavior; they are deliberately outside CI tests.
- `docs/runbook.md`: actual VPS vs alternative Render clarified, load-test claim corrected, media restore drill and monitoring notes added.
- SQLite 735 passed; PostgreSQL 734 passed and one SQLite-only skip. Vitest 71 passed. Typecheck, backend lint/format, migration check and OpenAPI validation passed. Statement coverage 94%. Strict landing build produced 104 pages.
- Playwright full run: 77 passed, 2 failed, 1 intentional desktop-exam skip (44.3 minutes). Both phone sweep failures passed a stable `--last-failed` rerun (56.3 seconds): 79 distinct tests passed across runs. Do not describe this as a clean full first run.
- Local review commit: `1852d82`, with a final validation follow-up commit. No remote branch or PR was created; no CI was run for this review branch.
- Owner's latest request: review design, colours/fonts for a university institution, UX and pages across screen sizes, write a report and integrate it into the existing document. Completed in section ي of `docs/qa/project-review-2026-10.md`;12 UX findings, palette/type assessment, page-family matrix, five viewport sizes and remediation acceptance criteria. No UI changes.
- `docs/qa/evidence/design-review-2026-10/`:450 core viewport checks (14-role navigation inventory; common pages deduplicated),70 representative detail/editor checks,5 lecture checks and30 admission-state checks:555 without ordinary horizontal overflow. Text-size200% exposes internal results-summary overlap and4px home overflow at320. Root font enlargement is not browser zoom.
- Confirmed UX1: application screen promises autosave; school-field edit disappears after blur +1500ms +reload without Next. Isolated synthetic local draft. UX2: login inputs focus-visible but outline:none/no shadow. UX3: delayed results body blank;503 displays no-published-results empty state plus generic banner. UX4: result summary numbers overlap under text enlargement.
- Stable axe:16 public +24 portal light/dark cases without violations;initial intermediate theme-transition hit disappeared after400ms settling. Not WCAG certification.41 selected screenshots stored;physical iOS/Android, assistive tech and user study remain owner follow-up.
- Final document validation passed:explicit Prettier check, all JSON parsed, all5 CJS scripts passed `node --check`,41 images verified with Pillow, relative report/evidence links resolved, and `git diff --check`. Six extra pointer-coarse mobile checks had zero overflow and fields16px. No application suite rerun was needed for this documentation-only phase;earlier baseline results remain historical evidence.

## Publication and verification limits

- Review and evidence completed locally. Automatic approval review rejected the push because this security/operations report would leave the workspace for a GitHub repository whose public visibility and publication authorization had not been established. Read-only lookup then confirmed `Stingcompiler/emarate-edu-platform` is PUBLIC. Await explicit owner approval to publish this report and evidence there; do not bypass the rejection with another tool.
- The latest request authorizes local document integration, not public GitHub publication. If publication is explicitly approved: inspect both local branches, create/attach a PR including the intended reports, then required green CI and merge under repository rules. Do not use the old PR body unchanged;scope now includes design/UX review.
- No SSH access: agent has no loaded identities. Asked owner to unlock the key; do not handle its passphrase.
- No changes to production or other projects.

## Next steps (ordered)

1. Review phase completed. Read the integrated report and both evidence READMEs before implementing requested fixes or considering approved publication;do not repeat finished review checks by default.
2. Prioritize UX1 alongside exam queue integrity: persist application drafts or provide truthful explicit-save messaging and leave warning;then keyboard focus, read-error/loading states and text enlargement UX2–UX4. Application fixes are future work unless owner requests implementation.
3. Fix C2: suspended students still open lectures, submit assignments and save exam answers.
4. Fix C1: stale answer save changes a submitted answer without recalculating its mark; share attempt locks across all writers.
5. Fix C6/C7: submit can clear unsent answers after PUT503; pendingStore loses its queue when storage is blocked. Include rejected fetch, deadline and reconnection cases.
6. Fix C3/C4: stale admissions and result-correction decisions overwrite terminal decisions. Lock/recheck within the transaction.
7. Fix C5 and B7: atomic business write+audit and permission tests for write methods.
8. Follow the report's remaining small PR groups: deployment/dependencies, N+1, route bundles, keyboard dialogs, dependency updates and demo cleanup.
9. Owner: off-server backups and keys, final hosting choice, Sentry/uptime, domain/email/content/policies, real iPhone/Android and isolated VPS-sized load test.

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
