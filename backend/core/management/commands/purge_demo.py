"""Remove the demo data before the college starts using the platform (review 2026-10-04 C9).

    manage.py purge_demo --before 2026-10-20            # preview: what would go, nothing changes
    manage.py purge_demo --before 2026-10-20 --apply    # do it, in one transaction

The demo data cannot be told apart from real data by its shape (its university numbers
follow the college's pattern), so the rule is explicit and chosen by the owner:

* **Records made before ``--before``** go: student records with their enrollments,
  submissions, exam attempts, results and corrections, cases and reports; applications,
  inquiries and visitor contacts; notifications, HR notices and queued mail.
* **Content made before ``--before`` by a demo account** (``@demo.ecst.test``) goes:
  lectures, assignments, exams, live sessions, announcements, news, events, regulations,
  images and result batches. Content written by a real account stays whatever its date.
* **Demo accounts** are switched off and lose their roles and memberships; they are not
  deleted, so the audit log keeps its actors. **The audit log itself is never touched**
  (docs/03).
* **«(مثال)» texts** in the site settings, programme and department descriptions are
  cleared, and sample images are removed from pages.
* **The structure stays**: college, departments, programmes, courses, terms, offerings,
  cycles, templates and pages. They are edited from the portal.

Rows are deleted in passes, because many links PROTECT: each pass deletes what nothing
else holds any more, until nothing is left or nothing moves (then the blockers are listed).
Uploaded files of removed rows stay on the disk; they are listed by the next backup only.
"""

from __future__ import annotations

from datetime import datetime, time

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import ProtectedError, Q, RestrictedError
from django.utils import timezone

DEMO_DOMAIN = "demo.ecst.test"
EXAMPLE = "(مثال)"

# Records: everything made before the cut-off.
RECORDS = [
    "learning.Submission",
    "exams.ExamAttempt",
    "student_affairs.MisconductReport",
    "student_affairs.StudentCase",
    "results.ResultCorrection",
    "results.AcademicResult",
    "academic.Enrollment",
    "students.StudentRecord",
    "admissions.Application",
    "inquiries.Inquiry",
    "contacts.Contact",
    "notifications.Notification",
    "notifications.HRNotice",
    "notifications.Outbox",
]
# Content: made before the cut-off by a demo account.
CONTENT = [
    "learning.Lecture",
    "learning.Assignment",
    "exams.Exam",
    "live.LiveSession",
    "content.Announcement",
    "content.News",
    "content.Event",
    "student_affairs.Regulation",
    "results.ResultImportBatch",
    "content.MediaAsset",
]
AUTHOR_FIELDS = ("created_by", "author", "uploaded_by", "host")


class Command(BaseCommand):
    help = "Preview or remove the demo data made before a date (see the module docstring)."

    def add_arguments(self, parser):
        parser.add_argument("--before", required=True, help="Cut-off date, YYYY-MM-DD.")
        parser.add_argument("--apply", action="store_true", help="Change the database.")

    def handle(self, *args, before: str, apply: bool, **options):
        try:
            day = datetime.strptime(before, "%Y-%m-%d").date()
        except ValueError:
            raise CommandError("--before must be a date: YYYY-MM-DD.") from None
        cutoff = timezone.make_aware(datetime.combine(day, time.min))
        User = apps.get_model("accounts", "User")
        demo_users = User.objects.filter(email__iendswith=DEMO_DOMAIN)

        targets = {label: self._records(label, cutoff) for label in RECORDS}
        for label in CONTENT:
            targets[label] = self._content(label, cutoff, demo_users)

        self.stdout.write(f"Cut-off: before {day} ({'APPLY' if apply else 'preview'})")
        for label, queryset in targets.items():
            self.stdout.write(f"  {label}: {queryset.count()}")
        self.stdout.write(
            f"  demo accounts to switch off: {demo_users.filter(is_active=True).count()}"
        )
        if not apply:
            self.stdout.write("Nothing changed. Add --apply to remove the above.")
            return

        with transaction.atomic():
            left = self._delete_in_passes(targets)
            if left:
                raise CommandError(
                    "Some rows are still held by others (nothing was changed):\n"
                    + "\n".join(f"  {label}: {count}" for label, count in left.items())
                )
            self._switch_off(demo_users)
            cleared = self._clear_examples()
        self.stdout.write(
            self.style.SUCCESS(f"Demo data removed; {cleared} example texts cleared.")
        )

    # ── selections ──────────────────────────────────────────────────────────
    @staticmethod
    def _records(label, cutoff):
        return apps.get_model(label).objects.filter(created_at__lt=cutoff)

    @staticmethod
    def _content(label, cutoff, demo_users):
        model = apps.get_model(label)
        fields = [f.name for f in model._meta.fields if f.name in AUTHOR_FIELDS]
        by_demo = Q()
        for name in fields:
            by_demo |= Q(**{f"{name}__in": demo_users})
        return (
            model.objects.filter(by_demo, created_at__lt=cutoff) if fields else model.objects.none()
        )

    # ── changes ─────────────────────────────────────────────────────────────
    def _delete_in_passes(self, targets) -> dict[str, int]:
        for _ in range(len(targets) + 1):
            moved = False
            for queryset in targets.values():
                if not queryset.exists():
                    continue
                try:
                    with transaction.atomic():
                        queryset.delete()
                    moved = True
                except (ProtectedError, RestrictedError):
                    continue  # something else still holds it; a later pass will try again
            left = {label: q.count() for label, q in targets.items() if q.exists()}
            if not left:
                return {}
            if not moved:
                return left
        return {label: q.count() for label, q in targets.items() if q.exists()}

    @staticmethod
    def _switch_off(demo_users):
        apps.get_model("accounts", "RoleAssignment").objects.filter(user__in=demo_users).delete()
        apps.get_model("academic", "DepartmentMembership").objects.filter(
            user__in=demo_users
        ).delete()
        apps.get_model("academic", "OfferingInstructor").objects.filter(
            user__in=demo_users
        ).delete()
        demo_users.update(is_active=False)

    @staticmethod
    def _clear_examples() -> int:
        cleared = 0
        settings_ = apps.get_model("content", "SiteSettings").objects.first()
        if settings_ is not None:
            changed = []
            for field in ("tagline", "licence_ar", "licence_en"):
                if EXAMPLE in (getattr(settings_, field) or "") or "(Example)" in (
                    getattr(settings_, field) or ""
                ):
                    setattr(settings_, field, "")
                    changed.append(field)
            figures = [
                f for f in (settings_.figures or []) if EXAMPLE not in str(f.get("label_ar", ""))
            ]
            if figures != (settings_.figures or []):
                settings_.figures = figures
                changed.append("figures")
            if changed:
                settings_.save(update_fields=changed)
                cleared += len(changed)
        for label, fields in (
            (
                "organization.Program",
                ("description_ar", "description_en", "outcomes_en", "careers_en"),
            ),
            ("organization.Department", ("description",)),
        ):
            for row in apps.get_model(label).objects.all():
                changed = [
                    f
                    for f in fields
                    if f in {x.name for x in row._meta.fields}
                    and (
                        EXAMPLE in (getattr(row, f) or "") or "(Example)" in (getattr(row, f) or "")
                    )
                ]
                for f in changed:
                    setattr(row, f, "")
                if changed:
                    row.save(update_fields=changed)
                    cleared += len(changed)
        for page in apps.get_model("content", "Page").objects.all():
            blocks = [
                b
                for b in (page.blocks or [])
                if not (b.get("type") == "image" and EXAMPLE in str(b.get("alt", "")))
            ]
            if blocks != (page.blocks or []):
                page.blocks = blocks
                page.save(update_fields=["blocks"])
                cleared += 1
        return cleared
