# Handoff — the department is a container; coordination by programme — 2026-11-13

Older rounds: `.claude/handoff/archive/2026-10-24_to_2026-11-02.md`, `.claude/handoff/archive/2026-11-04_to_2026-11-08.md`
(own name, pick-one control, self-registration, roles audit, levels and semesters, first November review).

## State

- **Backups: download and restore from the portal** (owner, 2026-11-14: «لا أرى من أين أحمّل النسخة،
  ولا زر للاستعادة… قد ننقل النظام لاستضافة أخرى… أريد أزرارًا»; he approved my three
  recommendations with «نفذ»): (1) the downloaded file is encrypted with a password typed at
  download, not the server key; (2) download and restore are the **system admin's alone**
  (`backups.download`, `backups.restore` in `rbac.ADMIN_ONLY` — the supervisor is not added;
  two new matrix rows); (3) restoring an **uploaded** file only on an empty platform (no
  students). Three phases, one PR each:
  1. **Download — `feat/backup-download`.** `core/backups.py`: `package()`/`read_package()`
     (format `ECSTPKG1`: scrypt salt + sealed records I/D/F/E), `iter_plain`, an
     `ecst-info-<stamp>.json.enc` note of counts beside each copy, SQLite copies in dev
     (`dump_to`). `organization/backups.py` (views moved out of `organization/views.py`):
     `GET /backups` gains `copies` and `now`; `POST /backups/download` (own password again →
     one-time link, audited `backup.download`, all admins notified) and
     `GET /backups/file/<ticket>` (streamed). Portal: `components/FormDialog.tsx`, rows per copy
     with «تنزيل». E2E `backups.spec.ts`; **E2E now has its own media folder**
     (`backend/media-e2e`, emptied by `serve-api.sh`) and dev has a backup key.
  2. **Restore a kept copy — `feat/backup-restore`.** `core/restore.py` (`run`: check →
     maintenance → a copy of the present → database all or nothing → files swapped into
     `media/.replaced-<time>` → migrate; state in the cache key `restore-state`),
     `core/maintenance.py` + `MaintenanceMiddleware` (503 `maintenance` on `/api`; health and
     `GET /api/public/maintenance` stay open; the switch expires 3 min after its keeper stops),
     task `core.tasks.restore_backup`, `POST /backups/restore` (own password; queued with
     `transaction.on_commit`). PostgreSQL: `pg_restore` to SQL, then
     `psql --single-transaction` after dropping every table of the schema. Portal:
     `MaintenanceGate` (signal `MAINTENANCE_EVENT` from `@ecst/api`), «استعادة» with the
     numbers now/in the copy, the word «استعادة» and the password. Proven on real PostgreSQL
     (`test_a_real_restore_on_postgresql`) and in E2E on SQLite.
  3. **Restore an uploaded file on an empty platform**, chunked upload, then a full move drill.

- **Next review** (owner, 2026-11-10: «اكتب خطة مراجعة بعد قراءة الوثائق»): work order
  `docs/qa/comprehensive-review-plan-2026-11-10.md` — scope #234–#264 since report `c8479a8`;
  the owner added a full-round scope section (coverage registers, journeys, sizes) and sent it
  back to run. **Round 1 done** — report `docs/qa/comprehensive-review-2026-11-10.md`:
  step 0 K1–K8 (#266; «staff» = holds a role other than student), baseline (all green; local
  local E2E: the installed Google Chrome closes mid-test; run with `CI=1 pnpm e2e …` (Playwright's own Chromium) and it is reliable),
  inventory registers (`bash scripts/qa/inventory.sh <dir>` → site/portal/backend/fit CSVs),
  axis 1.1 known hypotheses proven by probes and fixed (#267: R57–R60, R62, R63; statuses
  `move_pending`, `stale`; `StudentRecord.account_moved_at`). **Open for the owner:** K1's
  definition, R61 (new student in a stopped programme), R65 (download manager D25 not built),
  docs differences. **Round 2 done** (#269): axes 1.3 and 1.2 — R67–R72 proven and fixed (merge:
  member of both departments, inquiries and news follow, no merge into a stopped department,
  roles end; promotion: no run for nobody, the college after departments moves the rest; levels
  not lowered under students). **Round 3 done** (#270): axis 2 — the 19 writes added since the
  roles audit × 15 roles match the matrix (`tests/permissions/test_new_surface_writes.py`); R73:
  `/me` → `deletes` + `canDelete()` hide deletes the server refuses (structure, redirects, media,
  result batch). **The owner's decisions («نفذ توصياتك», 2026-11-10; `feat/review-decisions`):**
  five rows added to roles-matrix (`users.create`, `roles.grant` — new capabilities derived
  from `CREATABLE_ACCOUNTS`/`GRANTS` —, `deletions.approve`, `site.news`,
  `staff_profiles.moderate`); «staff» = holds a role other than student, the name still from the
  student record; a stopped programme takes a hand-added student and the form warns (R61); the
  download manager D25 is written as deferred (02, 07, 09); the docs differences are fixed (03
  v2.5, 05 §6/§8.7/§12, 07 v1.1 with §2.18 «actual routes» generated from the inventory,
  ui-profile, runbook §1). Not decided: an «undo the last promotion» button. **Round 4**
  (`fix/admissions-identity-review`): admission intakes R74–R77 (an intake with applications
  keeps its programme and cycle; its window is checked; a stopped programme is not opened),
  identity R78–R80 (import upper-cases the number; registration matches it in any case; one
  notification per account's first report), axis 3 (the migrations go down and up on both
  engines; no new write without an audit entry). **Round 5** (`fix/review-round5`): R81 (a hidden
  notification's queued push and pending emails are stopped: `Outbox.notification`, status
  `cancelled`), R82 (a staff photo is in use in the media library); axes 1.4–1.7, 4, 5 sound
  (Select keyboard test, six constant query counts). **Next:** axis 8, bundle size/Lighthouse;
  fill `fit.csv`. Never run probes or other work while E2E runs. Axis 6 read-only done (owner ran `scripts/qa/vps-readonly.sh`; all healthy; R83: backup files
  are world-readable — fixed #275, owner ran chmod 600). **Rehearsal on a restored production copy**
  (owner's approval; `scripts/qa/vps-export-backup.sh`; local copy deleted after): the 11 merges all
  succeed (20 → 9 departments); the 2 pending migrations take 2 s; R84 — `purge_demo` deleted the
  college's logo/share/hero (uploaded with a demo account): fixed, pictures in use stay unless
  samples. **Gotcha:** dev settings ignore `DATABASE_URL` (always `backend/db.sqlite3`); for any
  other database use `DJANGO_SETTINGS_MODULE=config.settings.test` and print the engine first.
  Axis 8 (PR «qa/review-axis8-a11y»): R85–R87 English reaching pages (exam builder, applicant
  form, import) fixed with gettext + Arabic; permanent guards `core/tests/test_messages_in_arabic.py`
  (AST scan for un-gettext'd English sentences + no untranslated/fuzzy .po entries). R88 in-page
  search uses `matches()` (`apps/portal/src/lib/search.ts`). axe now covers 7 new pages + the
  /register report form; larger text for every role. Bundle 148.5 kB JS first load (budget 200).
  #277 merged. fit.csv filled (inventory/fit_run.spec.ts + fit_fill.py, run with CI=1): 276 ok,
  30 unreachable by link, 0 fail after R89 (application print email overflow, fixed).
  #278 merged. Journeys (§3) as permanent E2E: journey-admission / journey-coursework /
  journey-site-event; the dev site now re-reads the API per request (astro dev cache hid new
  content). Left: results→student and deletion-request journeys in the browser; Lighthouse.
  #279 merged (journeys + R91 audit column). Then R90 (university number case in results
  import, transcript address, admission staff number) + journey-results.spec.ts.
  #280 merged (R90). Then journey-deletion.spec.ts and perf (docs/qa/evidence/review-2026-11-10/perf:
  site LCP ok, portal login 2.7–2.9 s > 2.5 → R92 on the owner's list: 3 font weights, raw logo).
  #281 merged. **Review 2026-11-10 closed** (report §6): all 26 probes fail on 7848dd0
  (verify-7848dd0.txt); only R92 open (owner: font weights, resized logo). Findings continue from R93.
- **After the review (2026-11-11/12):** #283 — from the installed app, links to the college site
  leave for the phone's browser (`siteLink()` in `apps/portal/src/lib/site.ts`: iOS 17+
  `x-safari-https://…`, an installed iPad without a version judged by `Object.groupBy`; Android
  `intent://…#Intent;…;S.browser_fallback_url=…;end`; computer `target=_blank`). Not yet tried on a
  real phone: ask the owner which phone if it still stays in the app. #284 — the warm mode is a
  warm paper (cream + dark brown ink, brand blue/red), owner: «الوضع الدافئ سيئ»; first version
  was a muddy dark grey-brown. #285 — CI E2E survives apt outages (Chromium must still start).
  #286 — code-review fixes of #283–#285 (one `isStandalone()` in `lib/push.ts`, E2E checks every
  site link on /login and /track).
- **The department is only a container (owner, 2026-11-13)** — «الأساس هو تنسيق البرامج، لكل
  برنامج رئيس»: courses, lectures and students live in a programme; a department head is
  optional and, where appointed, runs every programme of the department.
  - #296 a course belongs to one programme (`Course.program` required for new ones, department
    derived, code unique in the programme); staff are linked to programmes, many to many, any
    department (`DepartmentMembership.program`). Migration `academic/0006` guesses nothing:
    legacy rows with no programme keep working (a shared course, a department-wide member).
  - #297 roles `program_manager` / `program_supervisor` (`RoleAssignment.program`),
    `Scope.programs`: `allows(department, programme)`, `filter/q(dept_path, programme_path)` —
    an endpoint that names no programme path shows a programme role nothing. Matrix columns
    PH/PS with `prog`; `tests/permissions/test_programme_scope.py` checks every cell and a
    sibling programme of the same department. Granted by SA, SS, ACA.
  - Programme portal PR: the programme's report (`reports.department`, `reports.teachers`
    limited to the programme; saved snapshots stay by department), the department pages
    narrowed to the programme (`useDepartment` takes the department the server lists),
    `/programs/:id` (leaders appointed there, `LeadCard` shared with `/departments/:id`), the
    academic affairs home lists «برامج بلا رئيس» (no head of its own and no department manager).
  - Programme parity PR: `reports.admissions` (`program_ids`), the audit log
    (`AuditLog.program`, filed by `audit.services.record` from the target — `program_of` — or an
    explicit `program_id` for people: staff links, programme roles; older entries carry none and
    stay the department's) and results files (`ResultImportBatch.program`, scope `program`;
    `importer.validate_file(scope=…, program=…)`). Every DH/DS `dept` cell is now `prog` for
    PH/PS.
  - The public programme page names who leads it (`head` in `/api/public/programs/<code>`:
    its own head, else the department's manager, with consent; an object so the sample filter
    hides it).
  - Review of #296–#301 (owner, 2026-11-13: «review last changes then fix»): a deleted
    programme logs the head, supervisor and staff links that go with it
    (`organization.services.end_program_links`, entry `program.links_end`) — they went by
    cascade, unlogged; a programme's head addresses the programme's staff
    (`{"type": "program", "members": "staff"}`), and a department's staff audience holds its
    programmes' heads; a college-wide role that also heads a programme keeps its own nav and
    home (`COLLEGE_ROLES` in `lib/nav.ts`; «برنامجي» → `/programs/<id>`); a programme's results
    file names the programme; axe covers `/departments/1`, `/programs/1` and the programme
    head's pages.
  - Demo: `program.manager@` / `program.supervisor@demo.ecst.test` on the IT bachelor's.
  - Gotcha: local `backend/media` (198 MB) made a backup test take minutes — test settings now
    use an unused `MEDIA_ROOT`. A lazy route changes the address before it renders: in E2E wait
    for the new page before picking a control whose label also exists on the old one.
- **Roles, departments and staff review (owner, 2026-11-12; «راجع … قدّم خطة»، then «اوافقك
  ابدأ التنفيذ»)** — five PRs:
  - #290 the site rebuilds on writes that change who it shows: `add_member`/`remove_member`,
    `grant_role`/`revoke_role`, `set_active`, `delete_account` (they waited for the 6-hourly
    build). `rename_account` in `accounts/services.py` has no caller (renames go through
    `update_profile`).
  - #291 a department head is named only where their card shows: API `manager` needs consent
    and an active account (settles R34: hidden until consent); the site takes the head's name
    from the filtered faculty card (`lib/api.ts departments()`), so a sample («(مثال)» in the
    title — `lib/sample.mjs` drops the whole person) is named nowhere; «تصنيف الكوادر» shows
    `sample`. Seen on production: the demo head (title «(مثال) أستاذ مشارك») was missing from
    the staff but named in the header — it goes with `purge_demo`, or once the title is fixed.
  - #292 `teachers-directory` lists academic affairs with `kinds`; the add-member message
    names the role in Arabic and who grants it.
  - #293 matrix: `users.create` = `-` for academic affairs; `rbac.ACTIVATABLE_ACCOUNTS` keeps
    its disable/enable of teacher and TA accounts; a programme follows its department's
    leadership (no programme role); academic affairs teaches with «أستاذ» granted by the admin
    or supervisor (nobody grants themselves a role). docs/03 v2.6.
  - #294 `/departments/:id` (courses.view, scoped): details, programmes, staff, leadership;
    SA/SS/ACA appoint and relieve the head and supervisor from existing accounts there
    (`GET /api/v1/departments/{id}/leaders` + `/role-assignments`). Linked from «الهيكل
    الأكاديمي» («صفحة القسم», and «عيّن مديره ومشرفه» after adding one) and the academic
    affairs home. E2E `department-page.spec.ts`.
  Not decided: whether the department supervisor appears on the public department page (today
  only the head, teachers and TAs). Server check left: does a rebuild hook that arrives while
  `ecst-site-build` is running get lost (units are on the server, not in the repo)?
- **Phone checklist — links to the site from the installed app** (review 2026-11-12; the tests only
  check each link's address, never that a phone obeys it). Install the portal on the home screen,
  open it, tap «العودة إلى موقع الكلية» on the sign-in page and «تواصل مع القبول» on /track:
  1. iPhone/iPad, iOS 17+: the Safari app opens (not a sheet over the app). Note what happens
     when Safari is restricted under Screen Time — `x-safari-` has no fallback.
  2. Android, installed from Chrome: Chrome itself opens. Suspected (Chromium's
     external_intents README): Chrome keeps the `intent://` and loads the fallback inside the
     app's own window. Phase 2 (2026-11-12): the TEMPORARY page `/link-test` (system admin
     only; Settings ← «تجربة روابط الموقع من التطبيق المثبّت (مؤقت)») lists six forms
     (current, intent, intent with package=com.android.chrome, googlechrome://, x-safari-,
     new window). Waiting for the owner's answer per number (أ browser app / ب sheet over the
     app / ج replaced the app's page / د nothing). Then: put the winning form in
     `siteLinkFor()` (Chrome only; a new window elsewhere), add a fall-back to a new window
     when nothing opens within ~1s, and delete `routes/LinkTest.tsx`, its route, its
     `ROUTE_ACCESS` row, the Settings link and its test in `pwa.spec.ts`.
  3. A computer: a new browser window opens; the app's window stays the portal.
- **Staff review fixes** (2026-11-09; `fix/site-staff-review`): any staff account (not only
  teachers) may now choose to appear (`accounts.staff_profile.on_staff`, Settings card for all
  staff); a placed account that is no longer staff drops off (`content.staff.shown`); the people
  search needs 2 letters and matches names only; the edit panel lays its edits over the current
  placements; groups reorder by renumbering 1..n; the supervisor sees no delete buttons; the demo
  seed reuses a department of the same name (production «الطب» is M); a new engineering/medicine
  programme defaults to 5 levels in /system/structure. The page lives at `/site-staff` with its
  own sidebar link (#263).
- **Medicine has five levels** (owner, 2026-11-09; #261): MBBS was entered with four; data
  migration `organization/0007` raises it to 5 (semesters 9–10). Forms follow `levels_count`.
- **Add a student by hand, college-wide** (owner, 2026-11-08; `feat/students-add-college-wide`):
  «سجل الطلاب» (/students) has «+ طالب» → `/students/new` for `students.manage` holders with
  college scope (system admin, system supervisor, head registrar; they already held it in the
  matrix, only the page was missing). The form is shared with /department/students
  (`components/StudentForm.tsx`); the college-wide list groups programmes under departments and
  needs an explicit pick. Programme labels add the degree unless the name already says it.
- **Programmes, not departments** (owner, 2026-11-08): a department/specialisation is only a
  container; a student belongs to one programme, sees that programme, and staff address a
  programme's or a department's students (both exist in notifications/audience). Registration
  matches number + the programme picked by name (the code is only the internal key) + name.
  New students never self-verify until their record exists (admission → `register_applicant`,
  or added by hand/import). **Master's** (owner, decided): a graduate who continues to a master's
  is added by hand on a new record with a **new** university number (numbers never repeat —
  owner's decision). Registering on it with their own email **moves their account** to the new
  record (`accounts/services._request_move`/`_move`): only from a graduated/withdrawn record with
  the same name and an active account. Review fixes (`fix/account-move-review`): an email other
  than the new record's official one waits for approval (`RegistrationRequest.moves_account`,
  card «نقل حساب خريج»; reject keeps the account where it was); a move with no card notifies the
  department; the old record gets `account_moved_to` and is never offered an account again.
  `/students/new` is for college-scope `students.manage` only (`canEverywhere`).
- **Production department merges** (owner clicks «دمج القسم» in /system/structure, says «تم»):
  11 left — into تقنية المعلومات: نظم المعلومات، دبلوم تقنية معلومات، دبلوم نظم المعلومات،
  دبلوم شبكات الحاسوب؛ into علوم الحاسوب: علوم الحاسوب الشرف؛ into إدارة الأعمال: العلوم
  الإدارية، نظم معلومات إدارية، محاسبية، مصرفية، دبلوم تقنية معلومات محاسبية مصرفية، الاقتصاد
  والعلوم المصرفية. Production terms: rename «خريف/ربيع» to «الفصل الدراسي الأول/الثاني» there.

## Waiting on the owner

1. Whether the department supervisor shows on the public department page (review 2026-11-12).
   Production: press the 11 merges first, then appoint each programme's head from its page
   (a merge deletes the merged department's role assignments).
2. docs/03 wording (recommend: edit the doc): site manager reads cycles/intakes (D7); academic
   affairs hides a staff photo/qualification; head registrar deletes a cycle/intake without
   applications.
3. CSP for site and portal (R56): a line in `/etc/caddy/ecst.caddy` (the owner runs it), start
   with `Content-Security-Policy-Report-Only`.
4. Server: done (read-only checks, restore rehearsal: the 11 merges are safe to press). Left: a
   real `OPS_ALERT_EMAIL`; before `purge_demo`, create the real admin and keep wanted media.
   R92: two font weights on first load? a resized-logo endpoint for the portal?
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
- **A migration that changes rows and then adds a constraint or index fails on PostgreSQL when
  the table has rows** («cannot CREATE INDEX … pending trigger events»): CI and the suites
  migrate an empty database and pass. `academic/0006` stopped every production deploy from #296
  until #300 (it rolled back whole; the old release kept running). End the data step with
  `SET CONSTRAINTS ALL IMMEDIATE` on PostgreSQL, and test it over rows through the executor
  (`academic/tests/test_migration_with_rows.py`). After merging a migration, confirm the deploy
  on the server — a green `main` does not mean deployed.
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
