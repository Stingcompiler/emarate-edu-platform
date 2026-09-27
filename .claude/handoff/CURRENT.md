# Handoff — Phase 6 done → Phase 7 (admissions + registrars) — 2026-09-28

## Where things stand
- **Phases 1–5 are merged** to `main` (PRs #3–#7).
- **Phase 6 (live, content, inquiries)** is complete on `feat/phase-6-content`. Its PR is opened in this step; merge it once CI is green.
  - GitHub auto-merge is disabled, so merge manually with `gh pr merge --merge`.
- **Verified locally:**
  - 268 tests pass on SQLite; 267 pass plus 1 skip on Postgres;
  - migrations reverse on both databases;
  - the schema has 0 warnings;
  - ruff, typecheck, build and prettier pass.
  - Pages were checked in the pane: inquiries at 1280 (read via page text; pane screenshots at 1280 can be stale), live and announcements at 390.

## What Phase 6 delivered
- **`live`:** LiveSession for an offering or a cohort.
  - `join_url` is a property that encrypts and decrypts via `core/crypto.py` (Fernet + HKDF from `FIELD_ENCRYPTION_KEY`, falling back to SECRET_KEY).
  - `/live-sessions` (+join, cancel). Beat `remind-live-sessions`.
- **`content`:**
  - Page (blocks cleaned by `content/sanitize.py`), Announcement (scope and audience; `services.may_announce`, `feed_q`, `public_q`), News, Event, MediaAsset (ImageField on the `public` storage), Menu/MenuItem, Redirect, SiteSettings.
  - Management endpoints under `/api/v1/content/*` (capabilities `content.manage` and `events.manage`) and `/api/v1/announcements`.
  - Public endpoints under `/api/public/{site,pages,news,events,announcements,menus,redirects}`, with a 60 s cache.
  - `request_site_rebuild()` is debounced and calls `SITE_REBUILD_HOOK_URL` (empty until Phase 9).
- **`contacts`:** `Contact` plus `match_or_create` (by email or phone, never by name).
- **`inquiries`:**
  - Public: `/api/public/inquiries` (POST; `contact` throttle 5/hour; `website` honeypot) and `/api/public/inquiries/<ref>` (status only).
  - Staff: `/api/v1/inquiries` (+reply by email or internal note, whatsapp, transition, assign, reroute). Routing is in `inquiries/services.py`.
- **Dependencies:** nh3, pillow, cryptography (explicit).
- **Portal pages:**
  - `/live` (+new), `/announcements` (+new), `/inquiries` (+`/:id`; two panes on desktop).
  - `/site` (+pages/:id, news/:id, media, redirects), `/events` (+`/:id`).
- **Seed:** a live session, public and course announcements, the "about" page, an open-day event, and two inquiries.

## Next steps (Phase 7 — admissions + registrars, docs/02 §4.10–4.11, §8.3)
1. Read docs/02 §4.10–4.11 and §8 Phase 7, docs/05 §6 (`contacts`, `admissions`) and §8.3, and docs/03 §3.2–3.3 (head registrar, registrar). Boards:
   ```bash
   python3 scripts/boards.py list Visitor
   python3 scripts/boards.py list Registrar
   python3 scripts/boards.py list Head
   python3 scripts/boards.py list FormBuilder
   python3 scripts/boards.py list Application
   ```
2. **`contacts`:** ContactOTP (email now; SMS/WhatsApp later) and VisitorSession (a short JWT scoped to `contact:{id}`, 30 minutes) under `/api/visitor/*`.
   - "Track my request": email or phone, then OTP, then everything for that contact. A reference number alone shows status only.
3. **`admissions`:**
   - AdmissionCycle, ProgramIntake (form template override), ApplicationFormTemplate (versioned JSON schema plus the visual builder board DesktopFormBuilder).
   - Application with a state machine: draft → submitted → under_review → missing_documents → eligible → accepted/rejected/waitlisted → registered/activated; append-only history; `allowed_transitions` in responses.
   - ApplicationDocument (private files, purpose `application`), ApplicationMessage, ApplicationAssignment.
   - Routing to the program department's registrars or the head registrar, with claim and assign.
   - Final decision by the head registrar, or delegated per `SystemSettings.delegate_decisions_to_registrars`.
   - `register_applicant` creates a StudentRecord (via UniversityNumberSequence) plus an ActivationToken and an email.
   - `Idempotency-Key` on submit.
4. Link inquiries to the contact visitor session. Admission inquiries already route to registrars.
5. **Portal:** head registrar dashboard (DesktopHeadRegistrar), registrar application pages (DesktopApplicationDetail), form builder, cycles and intakes.
   - The visitor apply wizard (5 steps) belongs to the public site; build the API now, and the UI either in the portal as a public route or in Phase 9 (Astro islands). Decide and note it.
6. Add permission-matrix rows, extend the seed, test on both databases, open the PR, merge when green, and update this handoff.

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
