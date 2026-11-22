"""What the database must hold that its constraints cannot say (review 2026-11-22).

A copy of a parent's value kept on a row for speed (a course's department, a result's term) and
a link that must stay inside one course or one student: a constraint cannot reach across tables,
so the code keeps them — and ``manage.py check_data`` proves it did, read-only, on any copy of
the platform (the production database included). Each check counts the rows that break it.
"""

from __future__ import annotations

from collections.abc import Callable

from django.apps import apps
from django.db import connection
from django.db.models import Count, F
from django.db.models.functions import Lower


def _m(label: str):
    return apps.get_model(label)


def _same_email(label: str) -> int:
    rows = _m(label).objects.exclude(email=None).exclude(email="")
    return (
        rows.annotate(e=Lower("email")).values("e").annotate(n=Count("pk")).filter(n__gt=1).count()
    )


def _foreign_keys() -> int:
    """Rows pointing at a row that is gone (SQLite keeps no such guard for old rows)."""
    if connection.vendor != "sqlite":
        return 0  # PostgreSQL enforces every foreign key it has, always
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA foreign_key_check")
        return len(cursor.fetchall())


CHECKS: list[tuple[str, Callable[[], int]]] = [
    (
        "a course's department is its programme's",
        lambda: (
            _m("academic.Course")
            .objects.filter(program__isnull=False)
            .exclude(department=F("program__department"))
            .count()
        ),
    ),
    (
        "a student's department is their programme's",
        lambda: (
            _m("students.StudentRecord")
            .objects.exclude(department=F("program__department"))
            .count()
        ),
    ),
    (
        "a teacher's membership department is its programme's",
        lambda: (
            _m("academic.DepartmentMembership")
            .objects.filter(program__isnull=False)
            .exclude(department=F("program__department"))
            .count()
        ),
    ),
    (
        "a result's term is its course offering's",
        lambda: _m("results.AcademicResult").objects.exclude(term=F("offering__term")).count(),
    ),
    (
        "a student is enrolled only in their programme's courses",
        lambda: (
            _m("academic.Enrollment")
            .objects.filter(offering__course__program__isnull=False)
            .exclude(offering__course__program=F("student_record__program"))
            .count()
        ),
    ),
    (
        "a student's level is within their programme's levels",
        lambda: (
            _m("students.StudentRecord")
            .objects.filter(level__gt=F("program__levels_count"))
            .count()
        ),
    ),
    (
        "a course's level is within its programme's levels",
        lambda: (
            _m("academic.Course")
            .objects.filter(program__isnull=False, default_level__gt=F("program__levels_count"))
            .count()
        ),
    ),
    (
        "a programme's semesters are twice its levels",
        lambda: (
            _m("organization.Program").objects.exclude(duration_terms=F("levels_count") * 2).count()
        ),
    ),
    (
        "a submission's current version is its own",
        lambda: (
            _m("learning.Submission")
            .objects.filter(current_version__isnull=False)
            .exclude(current_version__submission=F("pk"))
            .count()
        ),
    ),
    (
        "a lecture's file belongs to the lecture's course offering",
        lambda: (
            _m("learning.LectureResource")
            .objects.filter(file__isnull=False, file__offering__isnull=False)
            .exclude(file__offering=F("lecture__offering"))
            .count()
        ),
    ),
    (
        "an assignment's lecture is in the assignment's course offering",
        lambda: (
            _m("learning.Assignment")
            .objects.filter(lecture__isnull=False)
            .exclude(lecture__offering=F("offering"))
            .count()
        ),
    ),
    ("no two accounts share an email (any case)", lambda: _same_email("accounts.User")),
    ("no two contacts share an email (any case)", lambda: _same_email("contacts.Contact")),
    ("every link points at a row that exists", _foreign_keys),
]

# Worth knowing, not wrong: courses kept from before the programmes (owner, 2026-11-13).
NOTES: list[tuple[str, Callable[[], int]]] = [
    (
        "courses without a programme (shared, from before 2026-11-13)",
        lambda: _m("academic.Course").objects.filter(program__isnull=True).count(),
    ),
    (
        "videos still waiting to reach Bunny",
        lambda: _m("files.VideoAsset").objects.filter(status="processing").count(),
    ),
]


def run() -> tuple[list[tuple[str, int]], list[tuple[str, int]]]:
    """(check, rows breaking it) for every check, and (note, rows) for every note."""
    return [(name, check()) for name, check in CHECKS], [(name, note()) for name, note in NOTES]
