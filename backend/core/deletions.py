"""Deleting a student, a course or a department **with everything it holds** (owner, 2026-11-15).

Until then a record with history could not be deleted: the database protects enrolments,
results, attempts and submissions from losing their student or their course. The owner decided
that the system admin deletes them anyway — directly, or by approving a request from a
department's or a programme's head — so this module removes, in one transaction, the record and
every row that belongs to it, and nothing else:

- **An allow-list per kind** (``OWNED``): what may go with a student, a course, a department.
  When something outside it stands in the way, nothing is deleted and the answer names it —
  a deletion never reaches further than the owner decided.
- **A preview** that is the deletion itself, rolled back: the counts shown are exactly what the
  real one removes.
- **A copy on the record:** before the rows go, the audit log keeps what they were — the
  student's details and academic record (courses, grades, GPA), a course's or a department's
  counts. Only the system admin reads it (``ADMINISTRATION`` in audit.views).
- **The files** uploaded with them leave the disk after the transaction commits.
- **An account** goes with its student record only when studying is all it does; a teaching
  assistant who also studies keeps their account.
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict

from django.apps import apps
from django.db import transaction
from django.db.models.deletion import Collector, ProtectedError, RestrictedError
from django.utils.translation import gettext

from core.errors import Conflict

logger = logging.getLogger(__name__)

STUDENT_ROWS = {
    "students.StudentRecord",
    "academic.Enrollment",
    "results.AcademicResult",
    "results.ResultCorrection",
    "learning.Submission",
    "exams.ExamAttempt",
    "student_affairs.StudentCase",
    "student_affairs.MisconductReport",
    "files.StoredFile",
    "files.VideoAsset",
    "learning.LectureResource",
}
COURSE_ROWS = STUDENT_ROWS - {"students.StudentRecord"} | {
    "academic.Course",
    "academic.CourseOffering",
    "learning.Lecture",
    "learning.Assignment",
    "exams.Exam",
}
DEPARTMENT_ROWS = (
    STUDENT_ROWS
    | COURSE_ROWS
    | {
        "organization.Department",
        "organization.Program",
        "admissions.ProgramIntake",
        "admissions.Application",
        "results.ResultImportBatch",
        "reports.ReportSnapshot",
        "accounts.User",
    }
)
OWNED = {
    "student": STUDENT_ROWS | {"accounts.User"},
    "course": COURSE_ROWS,
    "department": DEPARTMENT_ROWS,
}

# What the preview counts, by name (the rest are parts of these: answers, versions, grades…).
LABELS = {
    "students.StudentRecord": "طالب",
    "accounts.User": "حساب",
    "academic.Enrollment": "تسجيل في مادة",
    "results.AcademicResult": "نتيجة",
    "results.ResultCorrection": "طلب تصحيح نتيجة",
    "learning.Submission": "تسليم واجب",
    "exams.ExamAttempt": "محاولة اختبار",
    "student_affairs.StudentCase": "حالة طالب",
    "student_affairs.MisconductReport": "بلاغ مخالفة",
    "files.StoredFile": "ملف مرفوع",
    "files.VideoAsset": "فيديو",
    "academic.Course": "مادة",
    "academic.CourseOffering": "شعبة",
    "learning.Lecture": "محاضرة",
    "learning.Assignment": "واجب",
    "exams.Exam": "اختبار",
    "organization.Department": "قسم",
    "organization.Program": "برنامج",
    "admissions.ProgramIntake": "دورة قبول",
    "admissions.Application": "طلب التحاق",
}


class Refused(Conflict):
    """Something outside what this kind may take with it stands in the way."""


def _model_label(model) -> str:
    return model._meta.label


def _files_in(collector: Collector) -> list[tuple[str, str]]:
    """(storage alias, name) of every uploaded file among the rows about to go."""
    found = []
    for model, rows in collector.data.items():
        for field in model._meta.concrete_fields:
            if field.get_internal_type() == "FileField":
                found += [(field.name, getattr(row, field.name).name) for row in rows]
    return [(alias, name) for alias, name in found if name]


def _purge(rows: list, owned: set[str], counts: Counter, files: list) -> None:
    """Delete ``rows`` and everything the database cascades to — first, whatever protects
    them, as long as it is in ``owned``."""
    if not rows:
        return
    while True:
        collector = Collector(using="default", origin=rows)
        try:
            collector.collect(rows)
        except (ProtectedError, RestrictedError) as error:
            blocking: dict[type, list] = defaultdict(list)
            for row in (
                error.protected_objects
                if isinstance(error, ProtectedError)
                else error.restricted_objects
            ):
                blocking[type(row)].append(row)
            for model, items in blocking.items():
                if _model_label(model) not in owned:
                    raise Refused(
                        gettext(
                            "It cannot be deleted: %(what)s still refers to it. Nothing was "
                            "changed."
                        )
                        % {"what": model._meta.verbose_name_plural},
                        code="in_use_elsewhere",
                    ) from None
                _purge(items, owned, counts, files)
            continue
        files += _files_in(collector)
        _, per_model = collector.delete()
        counts.update(per_model)
        return


def _accounts_of(records) -> list:
    """The accounts that are nothing but a student's: they go with the record."""
    from accounts import rbac
    from accounts.rbac import Role

    users = [r.user for r in records if r.user_id]
    return [u for u in users if rbac.roles_of(u) <= {Role.STUDENT}]


def _remove(kind: str, rows: list) -> tuple[Counter, list]:
    counts: Counter = Counter()
    files: list = []
    if kind == "student":
        accounts = _accounts_of(rows)
        _purge(rows, OWNED[kind], counts, files)
        # The account after its record: what the student uploaded goes with it.
        from files.models import StoredFile, VideoAsset

        for model in (StoredFile, VideoAsset):
            _purge(list(model.objects.filter(uploaded_by__in=accounts)), OWNED[kind], counts, files)
        _purge(accounts, OWNED[kind], counts, files)
    elif kind == "department":
        from academic.models import Course
        from students.models import StudentRecord

        for department in rows:
            students = list(StudentRecord.objects.filter(department=department))
            accounts = _accounts_of(students)
            _purge(students, OWNED[kind], counts, files)
            _purge(accounts, OWNED[kind], counts, files)
            _purge(list(Course.objects.filter(department=department)), OWNED[kind], counts, files)
        _purge(rows, OWNED[kind], counts, files)
    else:
        _purge(rows, OWNED[kind], counts, files)
    return counts, files


def _summary(counts: Counter) -> dict[str, int]:
    return {LABELS[label]: n for label, n in counts.items() if label in LABELS and n}


def preview(kind: str, rows: list) -> dict[str, int]:
    """What deleting ``rows`` removes, counted by doing it and rolling it back."""
    # Fresh copies: a deletion clears the ids of the instances it removes, rolled back or not.
    copies = [type(row)._base_manager.get(pk=row.pk) for row in rows]
    with transaction.atomic():
        counts, _ = _remove(kind, copies)
        transaction.set_rollback(True)
    return _summary(counts)


def _remove_files(files: list) -> None:
    from django.core.files.storage import default_storage

    for _, name in files:
        try:
            default_storage.delete(name)
        except Exception:  # a file already gone is not a failure of the deletion
            logger.warning("deletion: could not remove the file %s", name)


def delete(meta, kind: str, rows: list, *, reason: str = "", request_id: int | None = None) -> dict:
    """Delete ``rows`` (all of one kind) with everything they hold, on the record. The caller
    checked who may: this only does it. Returns the counts removed."""
    from audit.services import record

    rows = list(rows)
    if not rows:
        return {}
    with transaction.atomic():
        for row in rows:
            record(
                meta,
                f"{_ACTION[kind]}.delete_all",
                row,
                old=_copy_of(kind, row),
                new={"reason": reason, "request": request_id},
                department_id=_department_of(kind, row),
            )
        counts, files = _remove(kind, rows)
        transaction.on_commit(lambda: _remove_files(files))
    return _summary(counts)


_ACTION = {"student": "students", "course": "course", "department": "department"}


def _department_of(kind: str, row) -> int | None:
    return row.pk if kind == "department" else row.department_id


def _copy_of(kind: str, row) -> dict:
    """What the audit log keeps of a row before it goes."""
    from audit.services import snapshot

    if kind == "student":
        from results.models import AcademicResult

        results = AcademicResult.objects.filter(student_record=row).select_related(
            "offering__course", "term"
        )
        return {
            **snapshot(row),
            "results": [
                {
                    "term": r.term.name_ar,
                    "course": r.offering.course.code,
                    "name": r.offering.course.name_ar,
                    "score": str(r.score) if r.score is not None else None,
                    "letter": r.letter,
                    "points": str(r.grade_points),
                    "status": r.status,
                    "published": r.is_published,
                }
                for r in results
            ],
        }
    counts = preview(kind, [row])
    return {**snapshot(row), "with": counts}


def find(kind: str, ids) -> list:
    """The rows of ``kind`` named by ``ids`` (public ids for students, numbers otherwise)."""
    model = apps.get_model(
        {
            "student": "students.StudentRecord",
            "course": "academic.Course",
            "department": "organization.Department",
        }[kind]
    )
    field = "public_id" if kind == "student" else "pk"
    return list(model.objects.filter(**{f"{field}__in": list(ids)}))
