# Handoff — public-site review, large screens, motion and deferred items: all merged — 2026-10-01

## Now: the landing institution review (docs/qa/landing-institution-review-2026-10.md §6)
- **Done and merged:**
  - full review PRs 1–5b, #45–#51;
  - the review plan, #52;
  - the review report, #53.
- **PR 6a #54: merged.** Site settings gained trust signals (licence, figures, hero and share images);
  `TrustStrip`, the header «قدّم الآن», descriptions and `og:image` on every page.
- **PR 6b #55: merged.**
  - Programme fees, outcomes and careers, with an editor in «الهيكل الأكاديمي».
  - The «أساسيات المتقدم» card, print as a brochure, `FeesTable`.
- **PR 6c #56: merged.** Floating WhatsApp button (`[data-whatsapp-float]`), contact quick row and hours, department page,
  programme finder (`lib/fold.ts`), `/parents/`, `isolateNumbers()`.
- **PR 6d `feat/site-polish`** (open).
  - W3: `ArabicOnly.astro`, the `html[lang=en]` plaintext CSS rule, `cycleName()`.
  - W5: the reveal safety net. W8: footer padding. W9: odd-cell spans; news without news.
  - W11: `pages/events/[slug].ics.ts`, directions, `fmtTime()`.
  - `PageHead` builds the trail and the `BreadcrumbList`.
  - 🟢 items, and the visitor layout links back to the site.
  - The crawl skips `a[download]`.
  - The landing crawl takes ~3–3.5 min locally (was ~2): the site has more pages now.
- **PR 6e `feat/site-feature-motion`** (open after 6d).
  - `PageHead feature facts` on about, admissions, department and programme.
  - `motion.css`: `.motion-lift`, `.motion-header[data-scrolled]`, `.motion-details` (via `::details-content`).
  - Staggered `data-reveal` with `--i` on the home cards.
  - `dl` items: `dt` before `dd`.
- **6d #57, 6e #58, 6f #59: merged.** The public-site review series is complete.
- **PR 7a `feat/student-large-screens`** (student group of full review §3 «PR 7 وما بعده»):
  - Today: the acknowledgement banner, then two balanced columns: due today and tomorrow, plus «هذا الأسبوع»; new in
    courses, plus the week's workload.
  - Course: `WithSide`, with figures, «التالي» and the latest announcement; teachers get their own figures.
  - Lecture: the content column, with the course's lecture list beside it (current one highlighted).
  - Courses: `courseTone()` colour per course (`COURSE_TONES`, `CodeTile tone`), and handed-in progress.
  - Results: navy GPA card with earned hours and per-term chips.
- **PR 7a #60: merged.**
- **PR 7b `feat/teacher-large-screens`:**
  - Grade: three columns from xl (the queue with «غير مصحح/مصحح», the work, the grade panel), plus J/K shortcuts.
  - Teacher Today: the HR notice as a banner; the schedule and actions beside the queue card (stacked bar by course
    tone) and the newest hand-ins.
  - Course students: a table on lg. The gradebook shares the filters, gains a lowest-total sort, colours pending and
    suggested cells, and gets % and hand-in columns plus an averages footer.
  - Exam monitor: «لم يبدأ» from the new `students_count`/`started_count` (retrieve only, staff only), a stacked
    bar, a phone action panel, and an empty state.
  - Course: staff see a «منشورة» badge, plus «إعلان» and «جلسة بث» buttons.
- **PR 7b #61: merged.**
- **PR 7c `feat/department-large-screens`** (additions only, docs/02 D20):
  - Lectures: `Kpi` row, search and course filter; `WithSide` with 8-week `Bars` and per-course published share. Cards
    use 2 columns only from 2xl.
  - Reports: chart and comparison beside the table from 1440 (flex column); below 1440 unchanged.
  - Audit: entries are buttons; `AuditDetail` (target, type, id, changed fields before/after) in a side card on lg,
    inline under the entry on phones.
  - Courses: phone cards compact (a `xl:contents` row for students, lectures and actions).
  - The new-course form deliberately stays where it is (moving it would change a flow).
- **PR 7c #62: merged.** It also fixed a time-zone flake in `test_program_intake_state_and_seats`.
- **PR 7d `feat/admissions-large-screens`:**
  - Registrar home: a pipeline card (a stacked bar per stage, each count linking to its list). The head also gets
    each registrar's load from `summary.by_registrar` and the users query `role=registrar`.
  - Cycles: an «يقبل/مغلق» badge and an applications-against-seats bar per intake.
  - Student records: a table on lg.
  - Import: `WithSide` with the steps, the columns (required ones marked), and a blank-template CSV.
  - Form builder: `ApplicantPreview` in both side columns.
- **PR 7d #63: merged.**
- **PR 7e #64 `feat/results-affairs-large-screens`: merged.**
  - Cases: from xl a preview of the chosen row beside the table (details, events timeline, open link).
  - HR teachers: `heat()` cells (red past the threshold, amber near it) and a row tint for «تحت الحد».
  - Academic home: department leadership as a card grid on top (2 columns on the phone, 4 on xl), then the
    decisions.
  - Result batch detail: from xl, the summary and actions in a sticky side column beside the rows. Not visually
    checked: the demo has no batch.
- **PR 7f #65 `feat/site-admin-large-screens`: merged.**
  - New `GET /api/v1/roles` (`users.view`), read-only from `rbac.CAPABILITIES`, with a matrix row and test. Page
    `/system/roles` (`RolesMatrix.tsx`; the name avoids a clash with `admin/roles.ts` on case-insensitive disks) shows
    the matrix with Arabic capability names, a role side panel, and CSV.
  - New `GET /api/v1/system-status` (`settings.manage`): latest backup, email backend (dev/console mailers don't
    count as sending), student records vs active accounts. The admin home shows 6 health tiles with icons.
  - Users: a role filter with counts (`role-assignments/counts`), kept in `?role=`.
  - Events: upcoming and past tabs, with the next event as a hero.
  - Page editor: «+» between blocks, the media library picker for images, a search panel (`seo.description`, a 160
    counter, a result preview), and an edit/preview `Segmented` on phones.
  - Structure: the hours field says «حُفظ ✓».
- **Always run `pnpm format:check` (the whole repo) before pushing:** CI fails on any unformatted file, e.g. JSON
  written by a script.
- **PR #66 `feat/portal-motion`: merged.** `components/Toast.tsx` (`ToastProvider`, `useToast()`): a «حُفظ ✓» note
  above the phone's tab bar after save/send actions; it replaced inline success notes that said the same thing.
  motion.css gains `.motion-grow` (bars), `.motion-next` (grading's next submission), `.motion-leave` (decided
  approvals) and `.motion-flash` (exam monitor rows whose state changed). Nothing moves on the exam screen.
- **PR #67 `feat/plan-progress`: merged.** `/api/v1/me/results` gains `plan` (`services.plan_progress`): per level, the plan's
  hours (the program's active courses plus the department's shared ones, by `default_level`) and the hours earned
  (published passes in released terms, each course once); the total is the program's stated
  `total_credit_hours`, else the plan's sum; `null` with no courses. Results shows «التقدم في الخطة» in the side
  column (lg) and after the courses (phone), and «X ساعة مكتسبة من Y» under the cumulative GPA.
- **PR #68 `feat/editor-toast`: merged.** The page editor's toast says what the save did. Pinned action bars carry
  `data-dock`; while a note shows, the toast follows the highest docked bar near the bottom of the screen (every
  frame), so it never covers buttons on phones. Settings puts the PATCH result in the cache at once.
- **PR #69 `feat/lecture-order-views`: merged.** `POST /api/v1/lectures/reorder` (the full list, each lecture once; `edit`
  flag; audited `lecture.reorder`) and `LectureView` + `POST /api/v1/lectures/{id}/view` (an enrolled student
  opening a published lecture; not audited, like `read_at`). `views_count` on lectures for the course's staff only.
  Course page: «ترتيب المحاضرات» (`LectureOrder.tsx`: handle drag with pointer events, arrows, 44px targets on
  phones). Lecture rows and the department lectures page show «فتحها N طالبًا».
- **PR #70 `fix/dept-report-side`: merged.** The last visual checks (screenshots with real data from a temporary e2e
  spec): exam monitor at 390 with a live attempt and its action sheet, grading at 390 with a submission, and result
  batch detail at 390/1280 with an uploaded batch were all fine. Two fixes: the department report's 1440 side
  column (`lg:items-start` beat `min-[1440px]:items-stretch` in the CSS order; now `lg:max-[1439px]:items-start`), and
  the batch summary badge at xl (`xl:items-start`).
- **State:** every planned phase is merged (review series 6a–6f, large screens 7a–7f, motion, plan progress, lecture
  order and views, visual checks). Nothing is open. Next work comes from the owner; content only the college can
  supply (licence, real figures, fees, photos) is still theirs to provide.
- **PR 6f `feat/department-faculty-news`**: the owner approved both 6c deferrals (2026-09-30); docs/03 is now v2.3.
  - `User.public_profile` plus `academic_title_ar/en`, set by the member at `PATCH /api/v1/me/public-profile` (audited
    `profile.public_update`), with a card in «الإعدادات».
  - Public department data gains `faculty` (the opted-in head, then teachers, then TAs) and `news`.
  - `may_announce`: a department manager may post a public, department-scoped announcement
    (`rbac.has_role_in`). The college-wide public list stays college-only.
  - Composer option «خبر على صفحة القسم».
  - Demo: two opted-in members and one department news item.
- **Visual checks of the built site:**
  - Write a temporary `e2e/tests/zz-*.spec.ts`, never committed.
  - PATCH the settings as `site@demo.ecst.test` via the e2e API (:8001).
  - Build the landing with `PUBLIC_API_URL=http://127.0.0.1:8001` (the test process cwd is the **repo root**).
  - Serve `apps/landing/dist` with `python3 -m http.server`, then take screenshots.
- **Content only the college can supply** is listed in report §5: licence, fees, figures, photos, programme
  texts, heads and faculty, office hours.

## Latest (2026-09-29)
- **#42 sticky filters: merged.**
- **`feat/department-scope`** (owner: «department manager only manage his department, he shouldn't see
  anything about other departments, full control… crud, lectures, courses, students»). docs/03 is now v2.2.
  - **Audit recipe:** a scratch probe (Django test client, `force_login` the IT manager on a copy of
    `e2e.sqlite3`) called every `/api/v1` GET and searched each response for other departments' names,
    course codes, programs, students and staff. It also tried `?department=<other>` and other departments'
    object ids.
    - Leaks found: `/departments`, `/programs` (list and detail) and `/intakes`.
    - Every other endpoint was already scoped.
  - **Fix:** structure viewsets are scoped for department roles (registrar, manager, supervisor);
    intakes by `admissions.view` scope. The teachers directory (search to add a teacher to the department)
    stays college-wide by design.
  - **Students:** new capabilities `students.manage` (admin, head registrar, manager, supervisor) and
    `students.delete` (admin, manager).
    - `POST` / `PATCH` / `DELETE /api/v1/students` go through `students/services.py`, which audits
      every write. A blank number is issued with `issue_university_number` (moved there from admissions).
    - The number is locked once the student has an account.
    - Delete is refused (409) when the record has an account, enrolments, results or exam attempts.
    - Status changes stay with student affairs.
  - **Course space:** `/me/courses?offering=<id>` returns one course with `my_role`:
    - `manager` for department managers and supervisors (with `learning.manage`);
    - `viewer` for academic affairs.

    `?managed=1` adds the department's current-term courses to the pickers for new exams, live sessions
    and announcements. The portal hooks are `useCourse` and `isCourseStaff` in `lib/learning.ts`.
  - **Portal:**
    - `/department/courses`: course link, in-place edit (code, name, hours, level, section), delete
      (the offering, then the course if unused).
    - `/department/lectures`: + lecture per course, edit, publish/unpublish.
    - `/department/students`: add, edit and delete in the side panel.
  - **Verified:**
    - e2e scan of the manager's pages found none of the other departments' names;
    - add, edit and delete flows at 1280 and 390;
    - backend tests pass on SQLite (691) and Postgres (690, 1 SQLite-only skip).
- **#39 motion, #40 sign-in redesign, #41 shell + pagination: merged.**
  - #41: the desktop top bar and sidebar are sticky; the API pages 10 items at a time (`core/pagination.py`);
    the portal uses `components/Pager.tsx` (`useServerPages`, `useLocalPages`, `ALL` for whole-set reads);
    `ThemeToggle` sits in the top bar and the phone headers.
- **`feat/sticky-filters`** (owner: «make filter and search always at the top on desktop layout»):
  - `FilterBar` in `components/ui.tsx`: `lg:sticky lg:top-[68px]`. Once pinned (IntersectionObserver
    sets `data-stuck`), shadows in the page colour hide the rows beneath, so the layout never moves.
    It sticks within its parent: place it in the list's own column.
  - Used on 17 list pages. `/department/courses` gained search, the filters بلا أستاذ / بلا معيد /
    محاضرات متأخرة, and a «مادة جديدة» button that jumps to the add form.
  - `WithSide`'s side column now sticks at `top-20`; it was hidden under the sticky top bar at `top-6`.
  - Department dashboard tiles: the note goes under the label.
  - Verified: a temporary e2e spec, 7 roles × 19 pages. The bar pins at 68px on desktop, stays in the
    page flow on phones, with no overflow; dark mode checked.
- **Local full e2e:** the 2026-09-29 run was stopped because edits changed files mid-run (the e2e portal
  serves the working tree). Don't edit while `pnpm e2e` runs.
- **Local dev sign-in:** the demo password is the owner's; don't read it from transcripts. Use the e2e
  stack (its own data, password in `e2e/tests/helpers.ts`) for scripted checks.

## Earlier (2026-09-28, evening)
- **#36 merged:** `Program.total_credit_hours` is a manual field (owner decision on UX review item 3).
- **#37 merged (contact form):**
  - status checks have their own throttle scope, `contact_status` 60/hour;
  - «سبق أن راسلتنا؟» checks a reference in place, which also works for phone-only inquirers.
- **#38 (large screens, second pass):**
  - crawled 87 page types × 14 roles at 1440 and 1920;
  - fixed the 8 pages with empty side columns (regulation for students, lecture, new exam, teacher profile,
    form templates, case, HR notice, media).
  - Recipe: a temporary Playwright spec follows in-page links one level below the menus.
- **Motion (`feat/motion`):** chosen from `~/Downloads/motion-effects`, a catalogue of videos only.
  - `packages/ui/src/motion.css`: tokens, keyframes, and `prefers-reduced-motion` turns everything off.
  - Portal, `components/motion.tsx`:
    - `CountUp`, used in `SideFigures` and in `Kpi` when given a number;
    - `ProgressRing`: the apply wizard, grading and the student's tasks;
    - `SuccessMark`: the apply success screen, with confetti;
    - `Segmented`: the theme toggle and the install platform toggle;
    - `.motion-stagger` on lists; `.motion-bars` on charts.
  - Site:
    - `[data-reveal]` / `[data-count]` handled by a script in `Base.astro` (only below-the-fold items are hidden before
      they scroll in);
    - `.motion-lines` on the hero headline, line by line and never per letter;
    - the admissions steps line;
    - image reveal;
    - the contact success check.
  - An e2e guard in `landing.spec.ts` ("motion never leaves content hidden…") also covers reduced motion.
  - The exam screen gets no motion.

## Owner rule, said twice: large screens are designed, not only phones
On 2026-09-28 the owner said «قم بمراجعه الصفحات لعرض الشاشات الكبري لا يجب ان يختصر عملك فقط علي شاشات الموبايل».
Skill `responsive-page` §2a says how: use the width with grids and a side column, keep the header's container, and
look at 1280/1440/1920 captures (an overflow check alone does not count).
- **#33 merged (public site):** `WithAside` + `SideLinks` components; every page type reviewed at 1024–1920. The e2e
  landing crawl (desktop) fails any `<main>` block narrower than 90% of the header container.
- **Portal (`fix/portal-large-screens`, PR next):** `WithSide`, `SideFigures` and `SideNote` in `components/ui.tsx`.
  No portal page keeps a `max-w-2xl/3xl` column any more. Every page is list + side column (figures, how it works),
  a form + side column (settings, preview, actions), or a full-width table (exams, per board DesktopDeptExams).
- **How to review:** a temporary Playwright spec signs in as each role through the e2e stack, captures every
  navigation page at 1440 full-page, and `uv run --with pillow` builds contact sheets.
  The script is in the scratchpad and not committed; recreate it if needed.

## «The public site carries every official page» (owner, 2026-09-28) — phases 1–3 merged
Owner decisions:
- Scope: all pages, including the optional ones.
- Menus: edited by the site manager.
- Content: production gets drafts with structure and guidance text, which the site manager publishes; the dev seed
  publishes demo texts clearly marked «تجريبي».
- Never invent official facts (names, fees, accreditation).

Delivered:
- #28 sticky apply button; #29 `/admissions`.
- #30 official data pages: regulations, calendar, events, announcements, RSS.
- #31 two-level CMS menus; their default structure is in migration `content/0002`.
- #32 19 official pages, from `backend/content/official.py`:
  - drafts are created after every migrate; slugs may be paths; a "note" block type;
  - the site builds and links a page only once it is published;
  - site API reads are capped at 6 at a time, retried, and failures are never cached.
- **Phase 4 (`feat/landing-ux-phase4`):** 4(b) description fallback, 5 map link + demo contact, 7 compact programme rows, 8 news dates (bug: editor publishing never set `publish_at`; migration `content/0004` backfills), 9 contact per-field errors, 12 programme FAQ + FAQPage, 13, 16. Status table at the end of `docs/qa/landing-ux-review-2026-09.md`. Item 3 decided by the owner: a manual field — `Program.total_credit_hours` (branch `feat/program-credit-hours`).

## Where things stand
- **All phases 0–11 are merged** (PRs #2–#13); PR #14 (student walkthrough fixes) is merged too.
- **The role-by-role walkthrough is complete** (the owner asked to sign in as every role, write a report after each, and not wait).
  - Report: `docs/qa/role-walkthrough-2026-09.md` (Arabic, 14 roles plus a summary table).
  - Fixes are on branch `fix/role-walkthrough` → one PR, which Claude merges once CI is green.
  - **Main fixes:**
    - Teacher/TA account creation failed (the UI sent a department for a college-wide role).
    - News and events couldn't be published without typing a slug by hand (now auto-filled from the title).
    - A 429 on `/me` sent users to the login page. The admin home made 13 separate count calls, and every window focus refetched everything; fixed with a single `/role-assignments/counts` endpoint, a global `staleTime` of 30 s, and a retry screen in `RequireAuth`.
    - Audit labels are in Arabic, with readable object names.
    - Role forms now offer only the roles the user may create or grant (`/me.creatable_roles` and `/me.grantable_roles`).
    - TA announcements depend on `ta_can_notify`, and TA grading metrics count only where `ta_can_grade` is on.
- **Arabic API messages** (PR `feat/arabic-api-messages`): every service, validation and importer message is wrapped in `gettext` and translated in `backend/locale/ar/LC_MESSAGES/django.po`. The compiled `.mo` is committed because Render has no `msgfmt`. The portal always sends `Accept-Language: ar`. `core/tests/test_i18n.py` fails on any untranslated or uncompiled message; the workflow is in the `.po` header.
- **Arabic counting:** `count(n, N.<noun>)` in `apps/portal/src/lib/format.ts` uses `Intl.PluralRules("ar")`. 1 and 100+ take the singular, 2 the dual without the number, 3–10 the plural, 11–99 the accusative singular. Add new nouns to `N`; don't write number + noun by hand. Phrases with an adjective are written as "label N" (e.g. «غير المصحح 3»).
- **Test layers (docs/05 §11), all in CI:**
  - Backend pytest, 655 tests including `core/tests/test_contract.py` (Schemathesis over all 330 operations: no 5xx).
  - Portal Vitest, 50 tests (`pnpm test`).
  - Playwright `pnpm e2e`: its own API on :8001 and portal on :5174 with fresh demo data; phone and desktop; sign-in, exam, application, no-overflow on 27 pages, and axe AA on 21 pages plus dark mode.
  - The e2e stack also starts the public site on :4322. `landing.spec.ts` crawls its roughly 50 pages (links, overflow, axe, title, description, h1, canonical).
  - `sweep.spec.ts` visits every navigation page of all 14 roles.
  - A one-off tablet run (768×1024) of the sweep passed on 2026-09-28.
  - Locally the e2e tests use the installed Google Chrome.
- **Nothing is pending from the walkthrough.** Remaining work needs the owner (see "Owner actions").
- **Dev login:** demo accounts are `<handle>@demo.ecst.test`. `ta@` and `dept.supervisor@` have a different password from the rest (seed_demo doesn't reset existing passwords); see the transcript.
- **Browser pane tips:**
  - Coordinate clicks don't land while a phone size is emulated; use refs or JS clicks.
  - The pane fires focus events during tool actions.

## What Phase 11 delivered
- **`render.yaml`:**
  - `ecst-api` (gunicorn gthread 4×4, WhiteNoise, health check, preDeploy migrate plus `check --deploy`), `ecst-worker`, `ecst-beat`, and the `ecst-backup` weekly cron.
  - `ecst-redis`, `ecst-db` (Postgres 16 paid).
  - `ecst-portal` (static; `/api/*` rewritten to the API, SPA fallback, `sw.js` no-cache) and `ecst-site` (static, `LANDING_STRICT=1`).
- **Security:**
  - `core/net.client_ip` and DRF `NUM_PROXIES` both follow `TRUSTED_PROXIES` (0 in dev; the header is ignored).
  - `PermissionsPolicyMiddleware`; optional Sentry (`SENTRY_DSN`, no PII).
  - The grading queue only lists courses the user may grade (teacher, or a TA with `ta_can_grade`).
- **Backups:** `core/backups.py` plus the `backup_database` and `restore_database` commands, using `BACKUP_ENCRYPTION_KEY` and `BACKUP_KEEP`. `BunnyStorage.listdir` was added.
- **Bootstrap:** `create_system_admin --email --name` prints a one-time activation link. The portal page `/activate/:token` (board AuthActivate) was missing since Phase 1 and now exists.
- **Docs:** `docs/runbook.md`; env examples updated.

## Owner actions (not codeable here)
1. Create the Render account and apply the Blueprint. Create the Cloudflare DNS records: `api.`, `portal.`, apex and `www`.
2. Generate and store offline `FIELD_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY` and `SITE_BUILD_TOKEN`, and create the VAPID keys (runbook §2).
3. Set up Bunny Storage, the pull zone and Stream, and Brevo sending (verify the `ecst.edu.sd` domain).
4. Provide the logo (SVG), and the real departments, programs and terms, or replace the demo data (docs/02 §9).
5. After the first deploy, verify `TRUSTED_PROXIES` with `/audit` (runbook §4) and run a restore drill (§5).

## Possible next work (only if the owner asks)
- A university-number pattern check in the student import (board shows `YY-DEPT-NNNN`; no documented rule).
- A teacher reply-rate metric and applicant sources (the boards show them; there is no data today).
- Frontend tests (Vitest/Playwright) and Schemathesis contract tests from docs/05 §11.

## Decisions made (don't revisit)
- **Roles are rows (`role`, `department`), not Django Groups.** Mention this deviation from docs/03 §10 in PRs that touch roles.
- **Registration:**
  - With approval ON, an email equal to the official one in the file activates immediately; any other email goes to `pending_approval`.
  - Rejecting deletes the pending account.
  - The start response is identical whether or not the details match.
- **Staff accounts:** no password is set; a 7-day, single-use activation link is emailed.
- **Supervisor = manager without delete/removal.** Instructor removal counts as a delete.
- **Structure** (college, departments, programs, years, terms) is college-wide reference data: readable by staff roles, written only by the system admin.
- **Import:**
  - Only the head registrar and the system admin can import.
  - The import never touches `status` or `user`; a blank cell keeps the existing value.
- **Files are never public.** Everything goes through `files.services.signed_url` after the owning app's policy. Lecture files and videos reach students only through a *published* lecture.
- **Assignments:** an assignment with submissions can't be deleted (409; close it instead). A graded (approved) submission can't be resubmitted.
- **Notifications:**
  - A fan-out never includes the sender.
  - The `account` category always reaches the inbox.
  - Categories that email by default: results and account.
  - A TA may notify only if `ta_can_notify` is set.
  - Action URLs must be portal paths or https (serializer, SW and UI all check).
- **Portal:**
  - Links point only to pages that exist (`lib/links.ts`, `lib/nav.ts`); notification links to future pages still mark items read.
  - Active chips use `bg-text text-bg`, which contrasts in both themes.
- **Results:** committed results change only through approved corrections (the admin is read-only too). Re-importing an existing student+course is an error row.
- **Display:** RTL layouts need `dir="ltr"` (or \u2066…\u2069) around letter grades and university numbers, otherwise "C+" renders as "+C".
- **Exams:** the server owns time. Answers are saved per question; the client keeps a local queue and must sync **one request at a time** (overlapping PUTs let an older answer win). Focus signals are throttled to one per kind every 15 s. The focused exam shell has no sidebar or tabs.
- **Content:** rich HTML is always sanitized server-side (nh3 allow-list), so the portal may render it with `dangerouslySetInnerHTML`. Public announcements are college-wide only. Visitors are never looked up by name.
- **Pagination:** every paginated model has a default ordering, and a pytest filterwarning turns unordered pagination into an error.

## Gotchas found
- **Tailwind order:** `hidden` does not beat a component's own `inline-flex`. Wrap the component in a `hidden lg:block` element instead.
- **Load testing on macOS:** `kern.ipc.somaxconn` is 128, so don't open 500 sockets in the same millisecond. Spread arrivals over time.
- **Response timing:** responses are serialized before `transaction.on_commit` fan-outs run. Read counts from the DB in tests, not from the create response.
- **Localized names:** the API's `name` field follows Accept-Language (English browsers get English), so server-built labels use `name_ar` explicitly.
- **Empty Q():** `Q() | x` drops the empty Q, which silently lost college-wide viewers. Use `Q(pk__isnull=False)` or `Q(<fk>__isnull=False)` for "everything" (see `learning.access.staff_offerings_q`, `rbac.Scope.q`).
- **drf-spectacular:** views with user-dependent `get_queryset` need a `swagger_fake_view` guard.
- **DRF parsers:** `get_parsers()` runs before `self.action` is set. Use `parser_classes`; the import upload was broken by this.
- **GROUP BY ordering:** `annotate(Count)` drops the model's default ordering. Restate `order_by` (see OfferingViewSet).
- **Emails in tests:** they are sent via `transaction.on_commit`. Wrap calls in `django_capture_on_commit_callbacks(execute=True)` and read the code with `conftest.last_code()`.
- **Test settings:** InMemoryStorage for uploads, all throttle scopes at 10000/min, and a long SECRET_KEY (short keys trigger a JWT warning).
- **Enum names:** drf-spectacular's `ENUM_NAME_OVERRIDES` covers RoleEnum and TeachingKindEnum. Add new shared choice sets there, or the schema gate fails.
- **Audit IP:** `RequestMeta.from_request` trusts `X-Forwarded-For`. Restrict it to the proxy in Phase 11 (Render sets it).
- **Visitor auth:** visitor endpoints use `VisitorAuthentication` only. Staff cookies never apply there, and the portal adds the header through the `visitorApi` middleware for `/api/visitor/` URLs only.
- **SerializerMethodField types:** a method returning nested serializer data needs `@extend_schema_field(Serializer(many=True))`. Otherwise the TypeScript type is `unknown`.
- **Seed reruns:** seed helpers must be idempotent (`get_or_create`) because an app can be migrated to zero while `contacts` keeps its rows.
- **Pane screenshots:** they can lag a click. Use `get_page_text` to confirm the step changed before assuming a bug.
- **Reports:** "now" drives weeks elapsed and grading age, so tests pass a fixed `now` to the metrics functions. Warm up once before counting queries (the first call creates the SystemSettings row).
- **Print pages** live outside PortalShell and set `document.title` themselves. Wide report tables go full width; a 320px sidebar squeezes them at 1280.
- **Landing build:** a burst of anonymous reads hits the throttle (HTTP 429). Production builds send `X-Site-Build`; dev relies on the 120/min `public_read` scope. The build treats 404 as "absent" and any other failure as fatal only when `LANDING_STRICT=1`.
- **Astro `[lang]` routes:** `getStaticPaths` must return every language × item; English arrows and links must not use absolute site URLs (the `alternate()` helper is for `<link hreflang>` only).
- **Portal routes vs Django:** the Vite dev proxy forwards `/admin` to Django, so portal admin pages live under `/system/*`.
- **Throttle:** SPA pages fan out; prefer one aggregated endpoint (grading queue, gradebook) over per-item requests. The user rate is 240/min.
- **Seeded submissions** need a `SubmissionVersion`. Pages still guard `current_version?.` for old rows.
- **Earlier gotchas:**
  - build constraint lists with sorted sets;
  - Django 6.1 uses `MAILERS`;
  - TypeScript is pinned to 5.9;
  - `astro dev` needs `--ignore-lock`;
  - test phone sizes in the browser pane;
  - audit actors are PROTECT.

## Verify
```bash
cd backend && uv run python manage.py makemigrations --check --dry-run && uv run python manage.py check
cd backend && uv run pytest && DATABASE_URL=postgres:///ecst uv run pytest
cd backend && uv run ruff check . ../scripts && uv run ruff format --check . ../scripts
cd backend && uv run python manage.py spectacular --fail-on-warn --validate --file /dev/null
# migrations reversible: migrate <app> zero && migrate, on SQLite and Postgres
pnpm api:generate && pnpm typecheck && pnpm build && pnpm format:check
```

## Owner's standing rules
- `CLAUDE.md`:
  - responsive always (skill `responsive-page`);
  - no Docker; SQLite in dev, Postgres in prod, tests on both;
  - one PR per phase, **merge to main yourself without asking; never wait**;
  - department manager dashboard: additions only;
  - no Zustand;
  - every endpoint gets a permission-matrix row.
- Hand off via this file (skill `session-handoff`) at every phase or major step, or when context is long.
