# Handoff — levels and semesters (3 phases); November review — 2026-11-05

Older rounds (2026-10-24 → 11-02): `.claude/handoff/archive/2026-10-24_to_2026-11-02.md`.

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
  not lowered under students). **Next:** axis 2 (seven operations outside the matrix, role
  combinations), rest of 1.1/1.3 (admission cycles), axis 3; fill `fit.csv`. Never run probes or
  other work while E2E runs. Findings continue from R73.
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
- **Own name** (owner, 2026-11-08): staff change their name in /settings («تعديل الاسم»,
  `PATCH /api/v1/me/name`, audit `account.rename_self`, site rebuilt if they appear on it);
  students get 403. The system admin renames any account from /system/users/:id, a student's
  too (the record follows); a name corrected in the student record reaches the account.
- **Pick-one control** (owner, 2026-11-07: «modernize the dropdowns, system-wide»):
  `apps/portal/src/components/Select.tsx` — `Select` (drop-in for `<select>`, used by every former
  select and by `SelectField`) and `ChoiceField` (form-card row, /register programme). Sheet on
  phones, anchored menu on ≥1024, search from 9 options. e2e drive it with `choose()` in
  `e2e/tests/helpers.ts`. The public site keeps native selects, restyled in `global.css`.
- **Student self-registration** (owner, 2026-11-07; `feat/registration-program-check`): the
  student picks the programme from the list; the record must match number + programme + name
  (Arabic or English, as in the record). A record that already has an account answers 409
  `already_registered` and the page offers «ليس حسابي — أبلّغ عن انتحال» →
  `IdentityReport`; approvers decide on /department/approvals (uphold = disable that account,
  drop the student role, free the record). The official email is alerted when an account is made
  with another address. Level is not asked (the owner listed only name, programme and number).
- **Plan numbering** #251 merged: semesters shown 1–10 through the programme.

- **Roles audit** (owner, 2026-11-06; report `docs/مراجعه الادوار.md`, approved matrix
  `docs/roles-matrix.md`, suite `backend/tests/permissions` reading the matrix): all confirmed gaps
  fixed on `fix/roles-matrix-audit` with the owner's decisions — supervisor unlinks (members,
  course instructors) but deletes nothing (draft regulations too); no one decides their own
  deletion request or result correction (`is_mine` hides the buttons); `users.view` reads every
  account; lectures/assignments/exams/results/HR-notice lists 403 for roles that neither hold the
  capability nor teach/assist/study (`rbac.takes_part`, `core.permissions.capability_or_participant`).
  The matrix now wins over docs/03 on who may do what (CLAUDE.md). Open for the owner: rows for the
  operations outside the matrix (user creation, grants, deletion approval, news, staff profiles)
  and PROF/TA/STD columns (`own`).

- **Levels and semesters** (owner, 2026-11-05: levels 1–5, two semesters a level, no summer;
  option B — the student's semester is stored and advanced by promotion):
  - Phase 1 #246 merged: course semester (1|2) on /department/courses, terms named
    «الفصل الدراسي الأول/الثاني <year>» in /system/structure, bulk enroll by `term.order`.
  - Phase 2 #247 merged: `StudentRecord.semester`, forms, import
    column, «يبدأ الطالب في» on registering an applicant, bulk enroll by student semester.
  - Phase 3 #248 merged: `/student-promotion`
    (`students.promote`: admin + head registrar; supervisor via admin), `PromotionRun` once per
    term per scope; results «التقدم في الخطة» per semester; public study plan by semester.
  - Owner's decisions: failing students move with their cohort (registrar unticks who stays);
    mid-year admissions: the registrar picks the semester; department heads correct the
    semester of existing production courses (all default to 1).
- **Production department merges** (owner clicks «دمج القسم» in /system/structure, says «تم»):
  11 left — into تقنية المعلومات: نظم المعلومات، دبلوم تقنية معلومات، دبلوم نظم المعلومات،
  دبلوم شبكات الحاسوب؛ into علوم الحاسوب: علوم الحاسوب الشرف؛ into إدارة الأعمال: العلوم
  الإدارية، نظم معلومات إدارية، محاسبية، مصرفية، دبلوم تقنية معلومات محاسبية مصرفية، الاقتصاد
  والعلوم المصرفية. Production terms: rename «خريف/ربيع» to «الفصل الدراسي الأول/الثاني» there.

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
