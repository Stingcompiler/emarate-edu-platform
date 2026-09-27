# Handoff — Phase 5 done → Phase 6 (live, content, inquiries) — 2026-09-28

## Where things stand
- **Phases 1–4 are merged** to `main` (PRs #3–#6).
- **Phase 5 (exams)** is complete on `feat/phase-5-exams`. Its PR is opened in this step; merge it once CI is green.
  - The app's Auto-fix may watch it. GitHub auto-merge is disabled, so merge manually with `gh pr merge --merge`.
- **Verified locally:**
  - 244 tests pass on SQLite; 243 pass plus 1 skip on Postgres;
  - migrations reverse on both databases;
  - the schema has 0 warnings;
  - ruff, typecheck, build and prettier pass;
  - the k6 load test with 500 concurrent students passes (see `scripts/loadtest/README.md`).
  - The exam flow was checked in the browser pane at 390 and 1280: start, answer, reload persistence, submit, result.

## What Phase 5 delivered
- **`exams` app:**
  - `question_types.py` is the registry (`validate` / `clean_answer` / `grade` / `correct_answer`).
  - `services.py`: build and lock, `problems()`, publish/close/release/delete, `start` (resume or race-safe), `save_answer` (time plus grace, no-backtrack), `submit` (idempotent), `close_expired` (beat), extend/reopen/invalidate, `grade_answer`, `stats`.
  - Endpoints: `/exams` (+publish, close, release, problems, questions[/id], questions-order, start, attempts, stats) and `/exam-attempts/<id>` (+answers/<qid>, submit, signals, result, extend, reopen, invalidate, answers/<qid>/grade).
  - Beat tasks: `close-expired-attempts` (1 min) and `remind-exams-starting` (5 min).
  - The `learning.access` flag `publish` means manage or teacher, never a TA.
- `MisconductReport.attempt` links a report to an exam attempt.
- **Load testing:** `config/settings/loadtest.py`, `manage.py seed_loadtest` (refuses other settings), and `scripts/loadtest/exam.js` with its README.
- **Portal pages:**
  - `/exams`, `/exams/new`, `/exams/:id` (student start screen or staff overview), `/exams/:id/edit`, `/exams/:id/monitor`, `/exams/:id/stats`.
  - `/exam-attempts/:id`: the focused TakeExam screen. `lib/exam.ts` holds the clock offset, pending queue and flags.
  - `/exam-attempts/:id/result`.
- **Seed:** `seed_demo` adds an open IT101 quiz with five question types.

## Next steps (Phase 6 — live + content + inquiries, docs/02 §8)
1. Read docs/02 §4.9 (`live`), §4.10–4.12 (`content`, `inquiries`), §6, docs/05 §6, and docs/03 rows for live sessions, content and inquiries (+WhatsApp). Boards:
   ```bash
   python3 scripts/boards.py list Live
   python3 scripts/boards.py list Site
   python3 scripts/boards.py list Inquir
   python3 scripts/boards.py list Announcement
   python3 scripts/boards.py list Event
   ```
2. **`live`:** LiveSession for an offering or a cohort; provider links only.
   - The join URL is encrypted at rest (use a Fernet-like key from settings with the stdlib and `cryptography`, which is already installed via pywebpush).
   - The link is returned only to allowed users; a beat task sends a reminder 30 minutes before.
3. **`content`:** Page (blocks JSON), Announcement (scope + audience, publish/expire, pinned), News, Event, MediaAsset (public storage), Menu, Redirect.
   - Rich text is sanitized server-side (`nh3`, a small dependency).
   - Public endpoints go under `/api/public/*` with Cache-Control.
   - A "rebuild site" hook is a placeholder until Phase 9.
4. **`inquiries`:** from a visitor contact (the OTP visitor session comes in Phase 7; accept a public form with throttling now). Routing per docs/03 §8, status history, email replies, and WhatsApp links (`wa.me` from the normalized phone).
5. **Portal pages:** follow the responsive-page skill with both boards. Add permission-matrix rows, extend the seed, test on both databases, open the PR, merge when green, and update this handoff.

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
