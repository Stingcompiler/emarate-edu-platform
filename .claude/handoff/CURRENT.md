# Handoff — after the redesign, owner follow-ups — 2026-10-30

- **Restore drill passed 2026-10-30** (owner ran it): backup `20261030T012118Z` restored into a
  scratch DB, counts match live, 32 files in the archive; result in runbook §5. The `ecst`
  role cannot create databases (kept): `postgres` makes `ecst_drill` (#196). Still to test:
  the off-site copy. Dependabot alerts turned on 2026-10-30. Open: real `OPS_ALERT_EMAIL`.

- #181 site header: short college name between 1024 and 1279 (the full one was cut off).
- #182 «الوضع الفاتح لا يعمل» was **Phoenix** (Android, auto-darkens pages): `tokens.css`
  `color-scheme: only light` stops the repaint (verified with Chromium forced dark; a
  `<meta name=color-scheme>` alone does not help). Deployed CSS reads `light only` (minifier).
  Also the next-step button text is navy (primary-700 turns pale in dark).
- #183 phone tab bar docked to the bottom edge (owner); docs/06, docs/09, responsive-page skill.
- #184 visitor home band «بوابة الكلية تطبيقًا على هاتفك» → `portal/install` (a PWA installs
  only from its own origin; `/login?next=/install` returns there).
- #185 `NavIcon`: the current page's icon filled (tabs, «المزيد» sheet, sidebar), all roles.
  Owner asked about glass icons: advised against (flat surfaces, low-end phones, `lint:ui`).
- #186 lucide-react 1.63 (1.64 is under pnpm's minimum release age; no exception kept).
- Production verified 2026-10-30 after `2bbe31f`: app band and floating header on the site,
  portal health 200, both CSS bundles carry the light-only colour scheme.
- Owner confirmed 2026-10-30: light mode works on Phoenix after #182.
- #189 academic affairs opens with «يحتاج قرارك» at every size; affairs/results side cards
  are panels. #190 `SideFigures` → quiet rows with the heading inside (4 pages).
- e2e parts take 12/12/8 min (2026-10-30): rebalancing no longer worth it.
- Later: lucide 1.64 once past pnpm's minimum release age (no exception).
- #192 visitor pages: `VisitorLayout` (apply/track) form + side column (steps, help) on large
  screens; `components/VisitorNav.tsx` (site sections, sign-in, apply, track) on apply, track and
  every `AuthLayout` page; `useHideOnScroll` + the site header script hide the header while
  scrolling down, back after 400 ms still or on scrolling up.
- #193 three modes: light, warm (`data-theme="warm"`, dim grey-brown, only by choice), dark
  softened (slate navy, ≈11:1). Switch cycles light → warm → dark (`lib/theme.ts` `Mode`,
  `MODE_LABEL`); Settings has فاتح · دافئ · داكن · النظام (own line on phones — fit test).
  a11y spec audits warm too. Comparison: `~/Desktop/before-after-1030/index.html`.
- Comparison page `~/Desktop/redesign-before-after/index.html`: 13 screens, after = production.

# Handoff — redesign from the owner's mockups (2026-10-29), all phases merged — 2026-10-30

Plan and decisions: `docs/qa/redesign-plan-2026-10-29.md` (owner: «نفذ جميع توصياتك»).

- #174 shell: navy full-height sidebar (college mark on top), white top bar with «ابحث عن صفحة»
  (`components/PageSearch.tsx`, searches the person's own nav, Arabic letters folded), bell,
  account initials → `/settings`. Every role at once.
- #175 dashboard kit `components/dashboard.tsx`: `Panel` (heading inside the card),
  `NextStepCard` (the one filled card; its title links too — `exam.spec` taps the exam name),
  `AckBanner`, `QuickLinks`; `Inbox` count in a neutral square + optional inner heading.
  Student «اليوم» and system admin home (status line + «يحتاج إجراءك» from health/backups/
  students without accounts/test-mode email) built on it.
- #176 other homes: teacher («التالي في يومك»), registrar, results, affairs, academic, HR,
  department (D20: only the heading moved inside). #179 site manager and events manager homes.
- #177 visitor site: floating rounded header (`.motion-header-bar`, `overHero` on the home),
  college photo beside the hero words, deadline band under both, audience icons.
- #178 `StatusBadge` dot.
- Not adopted from the mockups (decisions in the plan): tinted course cards (rows stay),
  tinted icon squares (`lint:ui`), generated photos, mockup text.
- Before/after page for the owner: `~/Desktop/redesign-before-after/index.html` (9 screens).
  Before = `bdf9e84`; shots via `SHOTS=<label> pnpm e2e shots.spec.ts -g "... \(light"`.

## Still open (owner)

- Programme pages: structure exists, college content missing. Restore-drill result, real
  `OPS_ALERT_EMAIL`, SEO steps after the domain move, Dependabot alerts off.

# Handoff — review 2026-10-25 and its decisions, all implemented — 2026-10-26

## Review `docs/qa/comprehensive-review-2026-10-25.md` (R12–R25)

- Fixed, each with a test that fails on the old code: #156 R12/R14/R15 + course deletion
  (`courses.unassign`), #157 R16–R18 (lock then re-read), #158 R13/R22–R25, #159 R19/R20/R21
  (admissions key), #168 R21 shared `Idempotency-Key` store (`core.IdempotencyRecord`,
  `core/idempotency.py`; exam submit repeated after a reopen → 409 `stale`, owner decision).
- R13: cycles follow docs/03 §3.6 (department roles see their departments' cycles only); the
  doc was NOT changed — docs/03 line 88 names admission cycles explicitly.
- Decision table `docs/qa/review-2026-10-25-open-differences.md` (#160), owner approved all
  recommendations: docs amended (#163: items 1–4, 10, 12); implemented — #161 items 4/9/11
  (aa sees live sessions without joining, delete draft regulation, registrar fallback switch),
  #162 item 5 (events manager writes news linked to an event; migration content/0009),
  #164 item 7 (admissions report scoped for reg/dm/ds), #165 item 6 («أدائي» /me/teaching),
  #166 item 8 (audit log by field of work, `audit.views.DOMAINS`), #167 item 13 (student
  email with a code, phone, photo; migrations accounts/0007, files/0003).
- Also this round: emails carry the college design (#154, `notifications/mail.py`), security
  updates (#155, Pillow 13), «طلباتي» overflow fix and the `offscreen()` e2e guard (#152/#153).

## Gotchas learned

- Merge a PR only after its four checks exist AND pass: the watcher in the session scratchpad
  (`merge-when-green.sh`) waits 45 s first; an early version merged #152 before CI started.
- Parallel PRs appending tests to the same file conflict after each merge: merge `main` in and
  keep both sides (never rebase). Regenerate the API client (`pnpm api:generate`) after merging
  before trusting a local typecheck.
- e2e `lastCode` skips `#`-prefixed six-digit colours (the branded emails contain `#576075`).
- Port 8001 is used by another local project: run e2e with `E2E_API_PORT=8011
  E2E_PORTAL_PORT=5184 E2E_SITE_PORT=4332`; `CI=1` uses Playwright's Chromium (local Chrome
  crashes under load). Local Postgres was down on 2026-10-25 (not started on purpose).
- Query-count tests: clear `connection.queries_log` first (it keeps 9000 entries).

## Still open (owner)

- Restore-drill result, real `OPS_ALERT_EMAIL`, college content, SEO launch steps after the
  domain move (runbook §11), Dependabot alerts are off on the repo.

# Handoff — design-gaps work order B1–B10 — 2026-10-24

## Work order `ecst-design-gaps-work-order.md` (2026-10-23)

- Merged: B1/B2/B3 #144 (offline-first drafts, connectivity bar, email-only OTP), B4 #145 (one
  red action on the public site, `docs/06 §2.7`), B5 #146 (ops category, demo contact guard).
- Also merged on 2026-10-24: #147 B8, #148 B6, #149 B7, #150 B9/B10. The grey "cancelled"
  CI runs for #147–#149 are by design (each merge cancels the previous `main` run); the run
  for #150 (`ec03160`) is green and deployed everything.
- Verified on production: AVIF/WebP hero at 3 widths, `/site-logo.webp`; home page weight
  326 KB (budget 500 KB, was 487 KB) via `node scripts/page-weight.mjs https://ecst.stingdev.pro/ar/`.
  Not verified: autodeploy state file (needs `ECST_SSH`), folded sidebar/density toggle by eye.
- Gotchas: macOS has no `sed -i`/`timeout` (use python); local Chrome crashes under load
  ("Target page ... closed") are not code failures; e2e CI takes ~30 min.
- Owner items still open: restore-drill result, real `OPS_ALERT_EMAIL`, college content,
  SEO launch steps after the domain move (runbook §11).

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

- **Site logo and redirects page (owner, 2026-10-09):** `SiteSettings.logo` (media library
  image, migration `content/0008_site_logo`), `logo_url` in the public settings; the site
  header, footer, favicon, schema.org logo and the share-image fallback use it, the portal top
  bar and sign-in screen too (`useSiteLogo`, `lib/site.ts`); chosen in «إعدادات الموقع». The
  redirects page stacks its form on phones and shows both paths in full.

- **Admin password reset (owner, 2026-10-13):** `POST /users/{id}/reset-password` (system admin only,
  capability `users.reset_password`) returns a random 12-character temporary password once
  (`no-store`, never logged), sets `must_change_password`, ends the account's sessions
  (`token_version`). `POST /auth/change-password` is the account's own change (also the forced
  step); `RequireAuth` holds such accounts at `/change-password`. Portal: button + one-time panel
  on the admin user page, «تغيير كلمة المرور» in Settings. `core/exceptions.py` now turns a stray
  Django `ValidationError` into a 400. Gotcha: port 8000 may belong to another project on this
  Mac: build the site with `PUBLIC_API_URL=http://127.0.0.1:1 pnpm build`.

- **Delete account (owner, 2026-10-13):** `DELETE /users/{id}` (system admin, `users.delete`) deletes
  only an account nothing points at; `ProtectedError` (audit log actor, content, grades…) → 409
  `has_history`, disable instead. Never one's own account. Logged as `account.delete`. Button
  at the bottom of the admin user page.

- **Rename users (owner, 2026-10-13):** `PATCH /users/{id}` (system admin, `users.rename`): Arabic name required, English optional, logged as `account.rename`; student accounts refused (name lives on the student record). «الاسم» card on the admin user page.

- **Design review 2026-10-16 (`docs/qa/ui-design-review-2026-10-16.md`, plan `…-plan-2026-10-16.md`):** all
  deployed (production on `53a324a` at 2026-10-17). PR-1 #134 empty/loading/failed states (`Inbox`+`inboxState`,
  `ListStatus` incl. «جارٍ تحميل المزيد…»), portal link on phones, two-line task titles; PR-2 #135 visible labels
  (`Field`/`SelectField`/`Labeled`) and login wording; PR-3 #136 media alt editing (`PATCH /content/media/{id}`,
  audit `media.update`), folded phone menu, WhatsApp steps aside; PR-4 #137 partial-plan notice; SEO #138
  (dated sitemap, `/site-icon.png` via `sharp`, home title/description, `pnpm seo:check`, runbook §11);
  #139 **sample content hidden from visitors** (`apps/landing/src/lib/sample.mjs`: marks «(مثال)», «(نص تجريبي)»,
  demo note; `SITE_SHOW_SAMPLE=1` shows it; CI runs `E2E_HIDE_SAMPLE=1 pnpm e2e hidden-sample.spec.ts`);
  `journeys.spec.ts` (visitor/student/teacher/registrar, phone + desktop).
  Still open: U03/U04 real content (plans, photo, contacts, dean text: the college), U10 (task sessions with real
  staff before any table view), label-less add-rows left alone in PR-2 (form builder, site media, page editor,
  lecture/assignment link rows), the search launch when the college's domain is ready (runbook §11: domain first,
  drop `SITE_NOINDEX`, `pnpm seo:check`, Search Console).
  Gotchas: CI cancels the previous `main` run on every merge, and the server deploys only a commit whose CI passed
  (a failed one is recorded `ci-failed` and skipped): merge one PR, wait for main's CI, then the next. Two `astro dev`
  servers on one project break the full crawl: never add a second site server to the e2e config. The phone menu
  e2e taps the widest gap of the top bar (`emptyTopBarX`). `node --test` needs a glob on Node 22.
  **DNS (2026-10-17):** a Brevo «branded links» CNAME on host `ecst` next to the `A ecst` record took the site down on
  some resolvers; the owner deleted it. Never add a CNAME on `ecst`. Restore drill from the 2026-10-16 backup is still
  not run: the production-read command was refused by the permission classifier (needs a Bash rule), and the SSH key
  must be re-added each day (`ssh-add --apple-use-keychain ~/.ssh/ovh_vps_ed25519`).

- **UI cards review (owner, 2026-10-15; guide `ui-cards-review-guide`):** direction «الأولوية أولًا» (C) with
  quiet list rows (A), recorded in `docs/ui-profile.md`. Shared: `Inbox` (big plain count + action button;
  first row primary), `Summary` (flat figures, status in words, `wide` = 2 columns on lg), `ActionLinks`
  (list instead of 3 equal tiles), `Avatar` (the one initials avatar), `Skeleton`. Migrated: admin,
  department (D20: all sections kept, the 12-tile «اللوحة» became a quiet link list «صفحات القسم»),
  registrar, results, affairs, academic homes. `pnpm lint:ui` now runs in CI; exceptions need a
  `ui-allow: <reason>` comment on the line or within 3 lines above. Screens: `SHOTS=<label> pnpm e2e
  shots.spec.ts` (resumable; `E2E_BOOT_MS=300000` and ports 8011/5184/4332 on a busy Mac).
  Not redone: AcademicHome has no screenshot (typecheck only); the public site keeps its date/code tiles
  and gradient page head as documented exceptions; inner pages (lists, forms) were not restyled.

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
  are relative to the repository root (`.scratch/shots/x.png`). Temporary visual specs: keep the
  source in `.scratch/` and copy it into `e2e/tests/` only for the run. When the Mac is loaded
  (load average ~20), sign-in can exceed 5 s; rerun before suspecting the code.
- `/api/public/*` answers carry `Cache-Control: max-age=60`: the portal fetches the site
  settings with `cache: "no-cache"` so a new logo shows after a reload.
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
