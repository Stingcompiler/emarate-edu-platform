"""Deleting a student, a course or a department with everything it holds (owner, 2026-11-15;
core.deletions): every row that belongs to it goes, nothing else does, all or nothing, and the
audit log keeps a copy."""

# ruff: noqa: F811  (fixtures imported by name)

import pytest
from django.apps import apps
from django.db import connection

from academic.models import Course, CourseOffering, Enrollment
from audit.models import AuditLog
from audit.services import RequestMeta
from core import deletions
from core.tests.test_permission_matrix import other, world  # noqa: F401
from core.tests.test_restore import fake_database, place  # noqa: F401
from organization.models import Department
from students.models import StudentRecord

pytestmark = pytest.mark.django_db


def _counts() -> dict[str, int]:
    """Rows in every table of the platform's own apps."""
    found = {}
    for model in apps.get_models():
        if model._meta.app_label in ("contenttypes", "sessions", "admin", "auth"):
            continue
        if model._meta.managed and not model._meta.proxy:
            found[model._meta.label] = model._base_manager.count()
    return found


def _meta(make_user):
    from accounts.rbac import Role

    return RequestMeta(actor=make_user(Role.SYSTEM_ADMIN))


def test_a_student_with_a_history_goes_with_it_and_nothing_else_does(
    world,
    other,
    make_user,
):
    student = (
        StudentRecord.objects.filter(enrollments__isnull=False)
        .exclude(pk=other["student"].pk)
        .first()
    )
    assert student is not None
    meta = _meta(make_user)
    shown = deletions.preview("student", [student])
    before = _counts()
    assert shown.get("طالب") == 1 and shown.get("تسجيل في مادة", 0) >= 1
    removed = deletions.delete(meta, "student", [student], reason="أُضيف خطأً")
    assert removed == shown
    assert not StudentRecord.objects.filter(pk=student.pk).exists()
    # The other department's student, course and enrolment are untouched.
    assert StudentRecord.objects.filter(pk=other["student"].pk).exists()
    assert Enrollment.objects.filter(pk=other["enrollment"].pk).exists()
    after = _counts()
    assert after["audit.AuditLog"] == before["audit.AuditLog"] + 1
    entry = AuditLog.objects.get(action="students.delete_all")
    assert entry.old["university_number"] == student.university_number
    assert entry.new["reason"] == "أُضيف خطأً"


def test_a_course_goes_with_its_offerings_and_their_rows(
    world,
    other,
    make_user,
):
    course = (
        Course.objects.filter(offerings__enrollments__isnull=False)
        .exclude(pk=other["course"].pk)
        .first()
    )
    assert course is not None
    shown = deletions.preview("course", [course])
    assert shown.get("مادة") == 1 and shown.get("شعبة", 0) >= 1
    removed = deletions.delete(_meta(make_user), "course", [course])
    assert removed == shown
    assert not Course.objects.filter(pk=course.pk).exists()
    assert not CourseOffering.objects.filter(course_id=course.pk).exists()
    assert Course.objects.filter(pk=other["course"].pk).exists()
    assert StudentRecord.objects.count() >= 1  # students stay: only their enrolments went


def test_a_department_goes_with_everything_in_it(world, other, make_user):
    department = (
        Department.objects.exclude(pk=other["dept"].pk).filter(students__isnull=False).first()
    )
    assert department is not None
    number = department.pk
    shown = deletions.preview("department", [department])
    assert shown.get("قسم") == 1 and shown.get("برنامج", 0) >= 1
    removed = deletions.delete(_meta(make_user), "department", [department])
    assert removed == shown
    assert not Department.objects.filter(pk=number).exists()
    assert not StudentRecord.objects.filter(department_id=number).exists()
    assert StudentRecord.objects.filter(pk=other["student"].pk).exists()
    # The log outlives it: its entries keep the department's number.
    assert AuditLog.objects.filter(department_id=number).exists()


def test_nothing_changes_when_the_deletion_fails_half_way(world, make_user, monkeypatch):
    student = StudentRecord.objects.filter(enrollments__isnull=False).first()
    meta = _meta(make_user)
    before = _counts()
    real = deletions._purge
    calls = []

    def fail_late(rows, owned, counts, files):
        calls.append(1)
        if len(calls) > 2:
            raise RuntimeError("disk full")
        return real(rows, owned, counts, files)

    monkeypatch.setattr(deletions, "_purge", fail_late)
    with pytest.raises(RuntimeError):
        deletions.delete(meta, "student", [student])
    assert _counts() == before


def test_the_preview_changes_nothing(world, make_user):
    department = Department.objects.filter(students__isnull=False).first()
    before = _counts()
    deletions.preview("department", [department])
    assert _counts() == before
    assert connection.in_atomic_block is True  # the test's own transaction, still open


# ─── The API (core.deletion_views) ───────────────────────────────────────────────────────


def test_only_the_system_admin_deletes(api, users, world):
    """docs/roles-matrix.md `records.delete_all`: the system admin alone — not the system
    supervisor, not a department's or a programme's head (they ask, in the next PR)."""
    from accounts.rbac import Role

    student = StudentRecord.objects.filter(enrollments__isnull=False).first()
    body = {"kind": "student", "ids": [str(student.public_id)]}
    for role in Role:
        got = api(users[role]).post("/api/v1/deletions/preview", body, format="json")
        assert got.status_code == (200 if role == Role.SYSTEM_ADMIN else 403), role
        assert api(users[role]).post("/api/v1/deletions", {}, format="json").status_code == (
            400 if role == Role.SYSTEM_ADMIN else 403
        ), role
        assert api(users[role]).get("/api/v1/deletions/jobs/nope").status_code == (
            404 if role == Role.SYSTEM_ADMIN else 403
        ), role
    assert api().post("/api/v1/deletions/preview", body, format="json").status_code == 401


def test_the_admin_sees_what_goes_then_confirms_with_its_number_and_password(
    api,
    users,
    world,
):
    from accounts.rbac import Role
    from conftest import PASSWORD

    admin = api(users[Role.SYSTEM_ADMIN])
    student = StudentRecord.objects.filter(enrollments__isnull=False).first()
    body = {"kind": "student", "ids": [str(student.public_id)]}
    shown = admin.post("/api/v1/deletions/preview", body, format="json").data
    assert shown["confirm"] == student.university_number and shown["backup"] is False
    assert shown["counts"]["طالب"] == 1
    wrong = admin.post(
        "/api/v1/deletions",
        {**body, "confirm": student.university_number, "password": "not-mine"},
        format="json",
    )
    assert wrong.status_code == 400 and wrong.data["code"] == "wrong_password"
    typo = admin.post(
        "/api/v1/deletions", {**body, "confirm": "123", "password": PASSWORD}, format="json"
    )
    assert typo.status_code == 400 and typo.data["code"] == "confirm"
    assert StudentRecord.objects.filter(pk=student.pk).exists()
    done = admin.post(
        "/api/v1/deletions",
        {**body, "confirm": student.university_number, "password": PASSWORD, "reason": "خطأ"},
        format="json",
    )
    assert done.status_code == 200, done.data
    assert done.data["removed"] == shown["counts"] and done.data["job"] is None
    assert not StudentRecord.objects.filter(pk=student.pk).exists()


def test_a_department_is_deleted_by_the_worker_after_a_backup(
    api,
    users,
    world,
    place,
    fake_database,
):
    from accounts.rbac import Role
    from conftest import PASSWORD
    from core import backups

    admin = api(users[Role.SYSTEM_ADMIN])
    department = Department.objects.filter(students__isnull=False).first()
    number = department.pk
    body = {"kind": "department", "ids": [str(number)]}
    shown = admin.post("/api/v1/deletions/preview", body, format="json").data
    assert shown["backup"] is True and shown["confirm"] == department.name_ar
    before = len(backups.existing())
    started = admin.post(
        "/api/v1/deletions",
        {**body, "confirm": department.name_ar, "password": PASSWORD},
        format="json",
    )
    assert started.status_code == 202, started.data
    job = admin.get(f"/api/v1/deletions/jobs/{started.data['job']['id']}").data
    assert job["state"] == "done", job
    assert job["backup"] and len(backups.existing()) == before + 1
    assert job["removed"] == shown["counts"]
    assert not Department.objects.filter(pk=number).exists()
    assert backups.lock_holder() is None


def test_a_department_is_not_deleted_when_the_backup_fails(
    api,
    users,
    world,
    place,
    fake_database,
    monkeypatch,
):
    from accounts.rbac import Role
    from conftest import PASSWORD
    from core import backups

    def broken(keep):
        raise RuntimeError("pg_dump failed")

    monkeypatch.setattr(backups, "create", broken)
    department = Department.objects.filter(students__isnull=False).first()
    started = api(users[Role.SYSTEM_ADMIN]).post(
        "/api/v1/deletions",
        {
            "kind": "department",
            "ids": [str(department.pk)],
            "confirm": department.name_ar,
            "password": PASSWORD,
        },
        format="json",
    )
    job = api(users[Role.SYSTEM_ADMIN]).get(f"/api/v1/deletions/jobs/{started.data['job']['id']}")
    assert job.data["state"] == "failed" and "فلم يُحذف شيء" in job.data["error"]
    assert Department.objects.filter(pk=department.pk).exists()
