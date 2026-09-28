# Handoff — Phase 7 done → Phase 8 (reports + HR + PDF) — 2026-09-28

## Where things stand
- **Phases 1–6 are merged** to `main` (PRs #3–#8).
- **Phase 7 (admissions + registrars)** is complete on `feat/phase-7-admissions`. Its PR is opened in this step; merge it once CI is green with `gh pr merge --merge` (auto-merge is disabled).
- **Verified locally:**
  - 281 tests pass on SQLite; 280 pass plus 1 skip on Postgres;
  - admissions migrations reverse on both databases;
  - the schema has 0 warnings; ruff, typecheck, build and prettier pass;
  - the seed reruns cleanly.
  - Pages were walked in the pane. The visitor flow was checked at 390 (verify, program, form, documents, review, submit, track). The staff flow was checked at 1280 and 390 (list, detail with claim, document review, eligible, accept, register → 26-IT-0029; cycles; form builder new version → publish).

## What Phase 7 delivered
- **`contacts`:** OTP via `accounts.otp` (purpose CONTACT) and `contacts/visitor.py`.
  - VisitorSession lasts 30 minutes. Clients send `Authorization: Visitor <token>`.
  - `VisitorAuthentication` and `IsVisitor` set `request.contact`.
- **`admissions`:**
  - Models: AdmissionCycle, ProgramIntake (`accepting()`, required_documents, capacity), ApplicationFormTemplate (versioned; publishing freezes it; `new-version`), Application, ApplicationDocument (its own private FileField, download resolver "a"), ApplicationStatusHistory (append-only), ApplicationMessage (internal, email or applicant), ApplicationAssignment.
  - The state machine is `services.TRANSITIONS`. `allowed_transitions` and `labels` (field and document labels) come back in staff responses.
  - Routing goes to the program department's registrars, else the head registrar.
  - Deciding needs `admissions.manage`, or a registrar when `delegate_decisions_to_registrars` is on.
  - `register_applicant` creates the StudentRecord with a `YY-DEPT-NNNN` university number and emails it. `complete_registration` and `decide_registration` call `mark_activated`.
  - Submit accepts an `Idempotency-Key`. Beat `expire_applications` runs daily.
  - URLs: `/api/v1/{admission-cycles,intakes,form-templates,applications}`, `/api/public/{intakes,visitor/otp,visitor/verify,applications/<ref>}`, `/api/visitor/*`.
- **Portal:**
  - Public (no account): `/apply` (5-step wizard; resumes with `?app=<id>`; the draft saves) and `/track`. Both live in `routes/visitor/` with `lib/visitor.ts`, and the session is kept in sessionStorage.
  - Staff: `/applications` (counters, filters, cards on phone, table on desktop), `/applications/:id` (answers, documents with link, accept and reject, history, messages, claim, transitions, register), `/admissions/cycles` (new cycle, open or close intakes, add programs) and `/admissions/forms` (field editor, draft, publish, new version).
  - Navigation: `admissions.view` shows "الطلبات"; `admissions.manage` adds cycles and forms.
- **Decision:** the visitor pages are portal public routes. Phase 9 (Astro) links to `/apply` and `/track` and does not rebuild them.
- **Seed:** an open cycle, a published default form, an intake per program, and three applications (one under review with the registrar).

## Next steps (Phase 8 — reports, docs/02 §4.14 and §8 Phase 8)
1. Read docs/02 §4.14, docs/03 §3.11 (hr) and the academic affairs role, and docs/07 §2.11. Boards:
   ```bash
   python3 scripts/boards.py list Report
   python3 scripts/boards.py list HR
   python3 scripts/boards.py list Transcript
   ```
   - Desktop: DesktopDeptReports, DesktopAdmissionsReports, DesktopStudentAffairsReports (no names), DesktopHRReports, DesktopHRTeachers.
   - Phone: HRHome, HRNoticeNew, AcademicAffairsTeacher, StudentTranscript. Where there is no phone or desktop board, derive it from docs/06 §4/§9 and say so in the PR.
2. **`reports` app** (read-only aggregates; no N+1; every query is department-scoped through `rbac.Scope`):
   - Department: offerings, lecture uploads, assignments, grading backlog, results summary.
   - Academic affairs: the college-wide version plus per-teacher files.
   - Admissions: counts by status, program and cycle, conversion to registered.
   - Student affairs: case counts by kind and status, never names.
   - **HR teacher performance per term:** lectures, assignments, exams, average grading time, ungraded ratio, upload gaps, announced live sessions, plus HR notices (directed notifications to a teacher).
3. **PDF export:** the transcript was deferred from Phase 4, plus report PDFs.
   - WeasyPrint needs system libraries (pango), so check `brew list pango` first.
   - If it's unavailable, render HTML-print pages in the portal (print CSS) as a no-dependency fallback and note it. Don't install system packages without evidence they are needed.
4. Portal pages per the boards. The department manager dashboard only gets additions.
5. Add permission-matrix rows for every new endpoint, extend the seed, run both databases, open the PR, merge when green, and update this handoff.

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
