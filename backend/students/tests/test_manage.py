"""The department manager runs their department's student records (owner 2026-09-29).

Manager and supervisor add and correct records of their own department; only the
manager deletes, and only a record added by mistake. Nothing outside the department
is visible or writable.
"""

import pytest

from academic.models import Enrollment
from accounts.rbac import Role
from audit.models import AuditLog
from students.models import StudentRecord

URL = "/api/v1/students"


@pytest.fixture
def manager(make_user, it_dept):
    return make_user(Role.DEPARTMENT_MANAGER, department=it_dept)


@pytest.fixture
def supervisor(make_user, it_dept):
    return make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept)


def test_manager_adds_a_student_with_a_new_number(api, manager, it_program):
    response = api(manager).post(
        URL,
        {
            "full_name_ar": " سارة   عمر ",
            "program": it_program.pk,
            "level": 2,
            "phone_e164": "0912345678",
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    assert response.data["university_number"].endswith("-IT-0001")
    assert response.data["full_name_ar"] == "سارة عمر"
    record = StudentRecord.objects.get()
    assert record.department == it_program.department and record.phone_e164 == "+249912345678"
    entry = AuditLog.objects.get(action="students.create")
    assert entry.department_id == it_program.department_id and entry.actor == manager


def test_level_must_fit_the_program(api, manager, it_program):
    response = api(manager).post(
        URL, {"full_name_ar": "سارة", "program": it_program.pk, "level": 9}, format="json"
    )
    assert response.status_code == 400
    assert "level" in response.data["errors"] or "level" in str(response.data)


def test_no_writes_outside_the_department(api, manager, ba_program, make_student):
    create = api(manager).post(
        URL, {"full_name_ar": "سارة", "program": ba_program.pk, "level": 1}, format="json"
    )
    assert create.status_code == 400  # another department's program is not a choice
    other = make_student(ba_program, "26-BA-0001")
    assert (
        api(manager).patch(f"{URL}/{other.public_id}", {"level": 2}, format="json").status_code
        == 404
    )
    assert api(manager).delete(f"{URL}/{other.public_id}").status_code == 404
    assert api(manager).get(f"{URL}/{other.public_id}").status_code == 404
    other.refresh_from_db()
    assert other.level == 1


def test_manager_corrects_a_record(api, manager, it_program, ba_program, make_student):
    record = make_student(it_program, "26-IT-0100")
    response = api(manager).patch(
        f"{URL}/{record.public_id}",
        {"full_name_ar": "أحمد علي", "level": 3, "university_number": "26-it-0200"},
        format="json",
    )
    assert response.status_code == 200, response.data
    record.refresh_from_db()
    assert (record.full_name_ar, record.level, record.university_number) == (
        "أحمد علي",
        3,
        "26-IT-0200",
    )
    assert AuditLog.objects.filter(action="students.update").count() == 1
    # Moving the student to another department's program is outside the scope.
    move = api(manager).patch(
        f"{URL}/{record.public_id}", {"program": ba_program.pk}, format="json"
    )
    assert move.status_code == 400


def test_number_is_fixed_once_the_student_has_an_account(
    api, manager, it_program, make_student, make_user
):
    record = make_student(it_program, "26-IT-0100", user=make_user(Role.STUDENT))
    response = api(manager).patch(
        f"{URL}/{record.public_id}", {"university_number": "26-IT-0999"}, format="json"
    )
    assert response.status_code == 400


def test_only_the_manager_deletes_and_only_without_history(
    api, manager, supervisor, it_program, it_offering, make_student
):
    fresh = make_student(it_program, "26-IT-0100")
    assert api(supervisor).delete(f"{URL}/{fresh.public_id}").status_code == 403
    assert api(manager).delete(f"{URL}/{fresh.public_id}").status_code == 204
    assert not StudentRecord.objects.filter(pk=fresh.pk).exists()
    assert AuditLog.objects.filter(action="students.delete").count() == 1

    enrolled = make_student(it_program, "26-IT-0101")
    Enrollment.objects.create(offering=it_offering, student_record=enrolled)
    response = api(manager).delete(f"{URL}/{enrolled.public_id}")
    assert response.status_code == 409
    assert StudentRecord.objects.filter(pk=enrolled.pk).exists()


def test_supervisor_adds_and_corrects(api, supervisor, it_program):
    response = api(supervisor).post(
        URL, {"full_name_ar": "منى", "program": it_program.pk, "level": 1}, format="json"
    )
    assert response.status_code == 201
    patch = api(supervisor).patch(
        f"{URL}/{response.data['public_id']}", {"level": 2}, format="json"
    )
    assert patch.status_code == 200


@pytest.mark.parametrize("role", [Role.STUDENT_AFFAIRS, Role.TEACHER, Role.REGISTRAR, Role.HR])
def test_other_roles_cannot_write(api, make_user, it_dept, it_program, role):
    user = make_user(role, department=it_dept)
    response = api(user).post(
        URL, {"full_name_ar": "منى", "program": it_program.pk, "level": 1}, format="json"
    )
    assert response.status_code == 403
