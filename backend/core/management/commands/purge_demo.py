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
* **Pictures the site uses stay** (logo, share and hero images, staff photos), whoever
  uploaded them (review 2026-11-10, R84).
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
# seed_demo's fees (diploma, bachelor): SDG per year, USD per year.
DEMO_FEES = {(900_000, 700), (1_600_000, 1_200)}
EXAMPLE = "(مثال)"
# What seed_demo writes into the site settings (core/management/commands/seed_demo.py).
DEMO_CONTACT = {
    "email": "info@demo.ecst.test",
    "phone": "+249 000 000 000",
    "address": "عنوان تجريبي — الخرطوم، السودان",
    "whatsapp_e164": "+249000000000",
}

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


def in_use_pictures() -> set[int]:
    """Pictures the site shows, but the demo's samples: the site settings' logo, share and hero
    images, and the photos of people on «الكوادر»."""
    site = apps.get_model("content", "SiteSettings").objects.first()
    used = {site.logo_id, site.share_image_id, site.hero_image_id} if site is not None else set()
    used |= set(
        apps.get_model("content", "StaffEntry")
        .objects.exclude(photo=None)
        .values_list("photo_id", flat=True)
    )
    # The demo's own sample pictures (alt «(مثال) …») go even when the settings show them.
    return set(
        apps.get_model("content", "MediaAsset")
        .objects.filter(pk__in=[pk for pk in used if pk is not None])
        .exclude(alt_ar__startswith=EXAMPLE)
        .values_list("pk", flat=True)
    )


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
        kept = len(in_use_pictures())
        if kept:
            self.stdout.write(f"  pictures kept because the site uses them: {kept}")
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
        if not fields:
            return model.objects.none()
        rows = model.objects.filter(by_demo, created_at__lt=cutoff)
        if label == "content.MediaAsset":
            # A picture the site uses stays, whoever uploaded it: on the production copy the
            # college's logo, share image and hero image were uploaded with a demo account,
            # and the purge left the site without them (review 2026-11-10, R84).
            rows = rows.exclude(pk__in=in_use_pictures())
        return rows

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
            # The contact details seed_demo writes (exactly, never a real one that merely looks like
            # them): fake channels must not outlive the demo (design review B5).
            for field, fake in DEMO_CONTACT.items():
                if (getattr(settings_, field) or "").strip() == fake:
                    setattr(settings_, field, "")
                    changed.append(field)
            if (settings_.office_hours_ar or "").startswith(EXAMPLE):
                settings_.office_hours_ar = ""
                changed.append("office_hours_ar")
            if (settings_.office_hours_en or "").startswith("(Example)"):
                settings_.office_hours_en = ""
                changed.append("office_hours_en")
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
                (
                    "description_ar",
                    "description_en",
                    "outcomes_ar",
                    "outcomes_en",
                    "careers_ar",
                    "careers_en",
                ),
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
                # The demo fees were seeded beside the example outcomes (seed_demo): when a
                # programme still had those and its fees are exactly the seeded pair, they go
                # too — never a fee the college typed (review 2026-11 I2).
                if (
                    label == "organization.Program"
                    and {"outcomes_ar", "careers_ar"} & set(changed)
                    and (row.annual_fee_sdg, row.annual_fee_usd) in DEMO_FEES
                ):
                    row.annual_fee_sdg = row.annual_fee_usd = None
                    changed += ["annual_fee_sdg", "annual_fee_usd"]
                for f in changed:
                    if f not in ("annual_fee_sdg", "annual_fee_usd"):
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
