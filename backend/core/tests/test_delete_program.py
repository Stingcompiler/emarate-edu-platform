"""A programme goes with everything in it (owner, 2026-11-16: «حذف برنامج يحذف كل ما به»): its
students and their records, its courses with all they hold, its head's and staff's links. The
department and its other programmes stay. The system admin alone deletes it, after a backup; the
department's head asks."""

# ruff: noqa: F811  (fixtures imported by name)

import pytest

from academic.models import Course, Enrollment
from accounts.models import RoleAssignment
from accounts.rbac import Role
from audit.models import AuditLog
from audit.services import RequestMeta
from conftest import PASSWORD
from content.models import DeletionRequest
from core import deletions
from core.tests.test_restore import fake_database, place  # noqa: F401
from organization.models import Department, Program
from students.models import StudentRecord

pytestmark = pytest.mark.django_db


@pytest.fixture
def programme(make_student, make_user, it_dept, it_program, it_offering):
    """The IT programme with two students (one enrolled), its course, its head; and a sibling
    programme in the same department with a student of its own."""
    course = it_offering.course
    course.program = it_program
    course.save(update_fields=["program"])
    a = make_student(it_program, "26-IT-8001")
    b = make_student(it_program, "26-IT-8002")
    Enrollment.objects.create(offering=it_offering, student_record=a)
    sibling = Program.objects.create(
        department=it_dept,
        code="DIT",
        name_ar="دبلوم تقانة المعلومات",
        degree=Program.Degree.DIPLOMA,
        levels_count=2,
        duration_terms=4,
    )
    kept = make_student(sibling, "26-DIT-8003")
    head = make_user(Role.PROGRAM_MANAGER, program=it_program)
    return {"program": it_program, "course": course, "students": [a, b], "kept": kept, "head": head}


def test_a_programme_goes_with_its_students_and_courses_and_nothing_else(
    programme, make_user, it_dept, monkeypatch, django_capture_on_commit_callbacks
):
    import content.services

    rebuilt = []
    monkeypatch.setattr(content.services, "request_site_rebuild", lambda: rebuilt.append(1))
    program = programme["program"]
    shown = deletions.preview("program", [program])
    assert shown["برنامج"] == 1 and shown["طالب"] == 2 and shown["مادة"] == 1
    meta = RequestMeta(actor=make_user(Role.SYSTEM_ADMIN))
    with django_capture_on_commit_callbacks(execute=True):
        removed = deletions.delete(meta, "program", [program], reason="أُنشئ خطأً")
    assert removed == shown
    assert not Program.objects.filter(pk=program.pk).exists()
    assert not StudentRecord.objects.filter(pk__in=[s.pk for s in programme["students"]]).exists()
    assert not Course.objects.filter(pk=programme["course"].pk).exists()
    assert not RoleAssignment.objects.filter(user=programme["head"], program_id=program.pk).exists()
    # The department and the sibling programme's student stay.
    assert Department.objects.filter(pk=it_dept.pk).exists()
    assert StudentRecord.objects.filter(pk=programme["kept"].pk).exists()
    assert AuditLog.objects.filter(action="program.delete_all").exists()
    assert AuditLog.objects.filter(action="program.links_end").exists()
    assert rebuilt  # the site no longer lists it


def test_the_department_head_asks_and_the_admin_deletes_after_a_backup(
    api, users, make_user, it_dept, ba_dept, programme, place, fake_database
):
    from core import backups

    program = programme["program"]
    ask = {"kind": "program", "ids": [str(program.pk)], "reason": "برنامج مكرر"}
    url = "/api/v1/deletion-requests/records"
    # Not the programme's own head, not another department's head.
    assert api(programme["head"]).post(url, ask, format="json").status_code == 403
    other = api(make_user(Role.DEPARTMENT_MANAGER, department=ba_dept))
    assert other.post(url, ask, format="json").status_code == 403
    head = api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))
    asked = head.post(url, ask, format="json")
    assert asked.status_code == 201, asked.data
    assert asked.data["preview"]["طالب"] == 2
    assert Program.objects.filter(pk=program.pk).exists()  # nothing changes until decided

    admin = api(users[Role.SYSTEM_ADMIN])
    body = {"kind": "program", "ids": [str(program.pk)]}
    shown = admin.post("/api/v1/deletions/preview", body, format="json").data
    assert shown["backup"] is True and shown["confirm"] == program.name_ar
    before = len(backups.existing())
    started = admin.post(
        "/api/v1/deletions",
        {**body, "confirm": program.name_ar, "password": PASSWORD, "request": asked.data["id"]},
        format="json",
    )
    assert started.status_code == 202, started.data
    job = admin.get(f"/api/v1/deletions/jobs/{started.data['job']['id']}").data
    assert job["state"] == "done", job
    assert len(backups.existing()) == before + 1
    assert not Program.objects.filter(pk=program.pk).exists()
    assert DeletionRequest.objects.get(pk=asked.data["id"]).state == "approved"
