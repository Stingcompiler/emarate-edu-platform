# Handoff — comprehensive review complete — 2026-10-08

## Where things stand

- Current local branch: `codex/comprehensive-review-2026-10-08`, based on `d2f0368` (main at review start; no fresh remote synchronization claimed).
- User asked in Arabic to read the project, perform a comprehensive review, identify errors and write a report, then twice said to continue. This is a review, not authorization to implement fixes or deploy.
- Report: `docs/qa/comprehensive-review-2026-10-08.md`.
- Evidence and reproduction instructions: `docs/qa/evidence/review-2026-10-08/README.md`.
- Eleven demonstrated behavioral defects R01–R11: five P1, six P2. Two additional High npm dependency advisories (source-map-js 1.2.1 and sharp 0.35.4); exploitability in this application was not demonstrated.
- Original checks: SQLite 752 passed; isolated PostgreSQL 16 751 passed / 1 SQLite-only skip; Vitest 77 passed; typecheck, lint, Python formatting, migrations, schema and builds passed. Strict landing build: 104 pages. Selected E2E: 11 passed / 1 intentional desktop-exam skip. Final Prettier passed.
- Additional probes: 9 backend probes on each database and 3 frontend probes. These assert the faulty behavior, not acceptance of correct behavior. They are outside CI in evidence files. Temporary copies under backend/core/tests and portal source were removed.
- No application source changes, deployment, production access, public push or PR. Existing untracked `.scratch/` belongs to prior work and was untouched.
- Temporary PostgreSQL was shut down; test browser servers are no longer listening.

## In progress

- Review is complete. Only report/evidence and this handoff are authored deliverables.

## Next steps (ordered)

1. Read the new report and reproduction README before implementing anything. User has requested a review only in this session.
2. If fixes are requested: R11/R09 (offline exam order and rejected answers), R10 (server time extensions), R04 (dropped enrollment), R01 (stale applicant writes).
3. Then R02/R03 (decision and attempt races), R08/R07 (file replacement and backup integrity), R05/R06 (access-token revocation and default grading scale).
4. Update affected frontend dependencies with compatible patched versions and rerun audit/build/critical journeys.
5. Production restore drill, off-server backup verification, isolated load and real-device/accessibility checks remain unverified by this review.

## Decisions made (don't revisit)

- Official college name: كلية الإمارات للعلوم والتكنولوجيا.
- docs/03 is authoritative for permissions. Keep the department dashboard workflows (D20); no Docker or Zustand.
- Suspended students retain record/results/cases/notifications, not the learning space (prior owner decision).
- Do not re-list historical repaired findings as open without new evidence. R02 is self-registration approval; R01 is applicant autosave; neither is the previously fixed admissions staff transition.
- Stale-object probes demonstrate an allowed interleaving, not a measured concurrent load rate.
- Public repository publication of security/operations findings requires explicit current authorization; no report was published in this session.

## Gotchas found

- Local socket/shared-memory creation was restricted in the sandbox; isolated PostgreSQL and Playwright required approved local execution.
- Use backend/.venv/bin/python for installed checks. Temporary uv cache/tool directories were under /tmp, not application dependency changes.
- Don't edit portal files during E2E; Vite reloads can invalidate browser tests.
- Non-strict landing builds can succeed without API with partial content. Use LANDING_STRICT=1 and a test API.
- The iPhone Playwright profile uses Chromium, not real Safari/iOS.
- Previous deployment state (not reverified): October 6 handoff recorded 79cf8a1 deployed, health timers installed, and OPS_ALERT_EMAIL still needing owner configuration. See prior review and runbook; do not treat this as current production evidence.

## Verify

- See `docs/qa/evidence/review-2026-10-08/README.md` for exact commands, logs, and safe reproduction instructions.
- Review probes must not be used as passing acceptance tests: a successful fix should reverse their expectations.
- No need to rerun unchanged full application suites for report-only edits.

## Owner's standing rules

- See CLAUDE.md: scoped RBAC, audited writes, permission-matrix coverage, no Docker/Zustand, responsive verification for UI changes.
- One branch/PR per implementation change, green checks before merge; never force-push/rebase.
- Never expose secrets or affect other projects; no load or penetration tests on shared production.
