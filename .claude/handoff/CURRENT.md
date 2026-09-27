# Handoff — Phase 2 done → Phase 3 (notifications + PWA) — 2026-09-28

## Where things stand
- **Phase 1** merged to `main` (PR #3).
- **Phase 2 (learning)** is complete on branch `feat/phase-2-learning`. Its PR against `main` is opened in this step; merge it as soon as CI is green.
  - If you find it still open, check CI once, fix failures, `gh pr merge --merge`, then branch Phase 3 off `main`.
  - GitHub auto-merge is disabled for this repo, so merge manually.
- **Verified locally:**
  - 164 tests pass on SQLite; 163 pass plus 1 skip on Postgres;
  - migrations reverse cleanly on both databases;
  - the OpenAPI schema has 0 warnings;
  - ruff is clean; `pnpm api:generate`, typecheck, build and format:check pass;
  - `seed_demo` now also creates lectures and assignments.

## What Phase 2 delivered
- **`files` app:**
  - `StoredFile` (private, purpose `lecture` or `submission`, tied to an offering) and `VideoAsset` (local or Bunny).
  - `MEDIA_BACKEND` is `local` in dev: signed links from `django.core.signing`, 10 minutes, served at `/api/public/files/<token>`.
  - In prod it is `bunny`: `files/bunny.py` provides BunnyStorage, token CDN links, Stream TUS tickets, embed tokens and the webhook `/api/public/webhooks/bunny-stream?secret=`.
  - Upload checks live in `files/validation.py` (extension allow-list + content signature + size + zip-bomb check).
  - Who may upload or read is decided by the owning app through `files/access.py` (`register(purpose, Policy)` and `register_video`); `learning` registers in `AppConfig.ready`.
- **`learning` app:** Lecture + LectureResource (file, video or link), Assignment (+AssignmentLinkField), Submission + SubmissionVersion, SubmissionGrade.
  - Access: `learning/access.py` `for_offering(user, offering)` → flags `view_all`, `view_published`, `edit`, `delete`, `delete_own`, `grade`, `submit`.
  - List filters: `staff_offerings_q` / `student_offerings_q`.
  - Grading: rule-based grading suggests a grade and the teacher approves it. A TA cannot approve AI-suggested grades. Students see approved grades only.
  - Late policies: none, allow, or penalty (`final_score`).
- **Endpoints:**
  - `/api/v1/files`, `files/<id>/url`, `videos/upload-ticket`, `videos/<id>/upload` (local), `videos/<id>/playback`.
  - `lectures` (+publish, unpublish, resources), `assignments` (+publish, close, submit, my-submission, submissions), `submissions` (+grade, grade/approve).
- **Errors:** `core.errors.Invalid(detail, code)` gives a 400 with a specific problem `code`; a plain ValidationError renders `invalid`.

## Next steps (Phase 3 — notifications + PWA, docs/02 §8, docs/05 §6 `notifications`, §8.6)
1. Read docs/02 §8 Phase 3, docs/05 §6 `notifications` and §8.6, docs/03 §8 (who notifies whom), and the prototype boards:
   ```bash
   python3 scripts/boards.py list Notif
   python3 scripts/boards.py list Install
   ```
2. **Backend app `notifications`:**
   - Models: Notification, NotificationRecipient, PushSubscription, NotificationPreference, HRNotice, Outbox.
   - Fan-out task computes the audience within the sender's allowed scope.
   - Web Push via `pywebpush` (VAPID keys from env; dev keys generated locally). Delete a subscription on 404/410.
   - Email goes through the Outbox with retries.
   - Automatic notifications for earlier phases: a new lecture or assignment published, a grade approved, a registration pending or decided, an assignment on a course.
3. **Portal (first real UI work):**
   - A Service Worker (Vite PWA without heavy deps, or a hand-written SW), an install screen, a notification centre, and preferences.
   - Every page follows the `responsive-page` skill and must match the phone and desktop boards at 390, 768 and 1280.
4. **Acceptance:** a teacher sends a notification to their course, and it reaches subscribed browsers. Test the fan-out, scope limits (a teacher can't target other courses) and push payloads with the push call mocked.
5. Add permission-matrix rows for every new endpoint, extend the seed, run `pnpm api:generate`, open the PR, merge when green, and update this handoff.

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
- **Pagination:** every paginated model has a default ordering, and a pytest filterwarning turns unordered pagination into an error.

## Gotchas found
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
