"""Promotion at the end of a term (owner, 2026-11-05): (L, 1) → (L, 2) → (L + 1, 1)."""

import pytest

from accounts.rbac import Role
from audit.models import AuditLog
from students.models import PromotionRun

URL = "/api/v1/student-promotion"


@pytest.fixture
def head(make_user):
    return make_user(Role.HEAD_REGISTRAR)


@pytest.fixture
def cohort(make_student, it_program, ba_program):
    """IT has 4 levels (conftest)."""

    def at(program, number, level, semester, status="active"):
        student = make_student(program, number, level=level, status=status)
        student.semester = semester
        student.save(update_fields=["semester"])
        return student

    return {
        "first": at(it_program, "26-IT-0001", 1, 1),
        "second": at(it_program, "26-IT-0002", 1, 2),
        "last": at(it_program, "26-IT-0003", 4, 2),
        "stays": at(it_program, "26-IT-0004", 2, 1),
        "suspended": at(it_program, "26-IT-0005", 1, 1, status="suspended"),
        "ba": at(ba_program, "26-BA-0001", 3, 2),
    }


def _place(student):
    student.refresh_from_db()
    return student.level, student.semester


def test_preview_says_where_each_goes(api, head, cohort, term):
    data = api(head).get(URL).data
    assert data["term_name"] == term.name_ar and data["done_at"] is None
    rows = {r["university_number"]: r for r in data["students"]}
    assert "26-IT-0005" not in rows  # only active students
    assert (rows["26-IT-0001"]["to_level"], rows["26-IT-0001"]["to_semester"]) == (1, 2)
    assert (rows["26-IT-0002"]["to_level"], rows["26-IT-0002"]["to_semester"]) == (2, 1)
    assert rows["26-IT-0003"]["to_level"] is None  # the programme's last semester
    assert _place(cohort["first"]) == (1, 1)  # nothing written


def test_promote_moves_everyone_on_once(api, head, cohort, term, it_dept):
    body = {"exclude": [str(cohort["stays"].public_id)]}
    done = api(head).post(URL, body, format="json")
    assert done.status_code == 200, done.data
    assert done.data["promoted"] == 3 and done.data["kept"] == 1
    assert done.data["last_semester"] == 1
    assert _place(cohort["first"]) == (1, 2)
    assert _place(cohort["second"]) == (2, 1)
    assert _place(cohort["last"]) == (4, 2)
    assert _place(cohort["stays"]) == (2, 1)
    assert _place(cohort["suspended"]) == (1, 1)
    assert _place(cohort["ba"]) == (4, 1)
    entry = AuditLog.objects.get(action="students.promote")
    assert entry.new["kept_numbers"] == ["26-IT-0004"]
    again = api(head).post(URL, {}, format="json")
    assert again.status_code == 409
    assert _place(cohort["first"]) == (1, 2)
    assert api(head).get(URL).data["done_at"] is not None


def test_a_department_at_a_time(api, head, cohort, term, it_dept, ba_dept):
    assert api(head).post(URL, {"department": it_dept.pk}, format="json").status_code == 200
    assert _place(cohort["ba"]) == (3, 2)  # the other department waits
    assert api(head).post(URL, {"department": it_dept.pk}, format="json").status_code == 409
    assert api(head).post(URL, {"department": ba_dept.pk}, format="json").status_code == 200
    assert _place(cohort["ba"]) == (4, 1)
    # The whole college after a department: refused, the department would move twice.
    assert api(head).post(URL, {}, format="json").status_code == 409
    assert PromotionRun.objects.count() == 2


@pytest.mark.parametrize("role", [Role.DEPARTMENT_MANAGER, Role.REGISTRAR, Role.SYSTEM_SUPERVISOR])
def test_who_promotes(api, make_user, it_dept, cohort, term, role):
    user = make_user(role, department=it_dept)
    allowed = role == Role.SYSTEM_SUPERVISOR  # stands in for the admin; promoting deletes nothing
    assert (api(user).post(URL, {}, format="json").status_code == 200) is allowed
    assert (_place(cohort["first"]) == (1, 2)) is allowed


def test_needs_a_current_term(api, head, cohort):
    assert api(head).post(URL, {}, format="json").status_code == 400
