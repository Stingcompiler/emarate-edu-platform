# Handoff — review of 10 November and the owner's decisions — 2026-11-10

Older rounds: `.claude/handoff/archive/2026-10-24_to_2026-11-02.md`, `.claude/handoff/archive/2026-11-04_to_2026-11-08.md`
(own name, pick-one control, self-registration, roles audit, levels and semesters, first November review).

## State

- **Next review** (owner, 2026-11-10: «اكتب خطة مراجعة بعد قراءة الوثائق»): work order
  `docs/qa/comprehensive-review-plan-2026-11-10.md` — scope #234–#264 since report `c8479a8`;
  the owner added a full-round scope section (coverage registers, journeys, sizes) and sent it
  back to run. **Round 1 done** — report `docs/qa/comprehensive-review-2026-11-10.md`:
  step 0 K1–K8 (#266; «staff» = holds a role other than student), baseline (all green; local
  full E2E is unreliable on this Mac — the browser closes mid-test, CI is the authority),
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
  are world-readable — owner's). Findings continue from R84.
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
