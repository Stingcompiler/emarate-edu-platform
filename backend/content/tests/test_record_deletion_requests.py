"""A department's or a programme's head asks to delete students or a course with everything
they hold; the system admin alone decides, approving through the deletion itself (owner,
2026-11-15)."""

import pytest

from academic.models import Course, CourseOffering, Enrollment
from accounts.rbac import Role
from conftest import PASSWORD
from content.models import DeletionRequest
from students.models import StudentRecord

pytestmark = pytest.mark.django_db
ASK = "/api/v1/deletion-requests/records"


@pytest.fixture
def mine(make_student, it_program, ba_program, it_offering):
    """Two IT students with a history, and a BA student."""
    a = make_student(it_program, "26-IT-7001")
    b = make_student(it_program, "26-IT-7002")
    other = make_student(ba_program, "26-BA-7003")
    Enrollment.objects.create(offering=it_offering, student_record=a)
    return {"a": a, "b": b, "other": other, "course": it_offering.course}


def _ask(client, kind, ids, reason="أُضيفوا خطأً"):
    return client.post(ASK, {"kind": kind, "ids": ids, "reason": reason}, format="json")


def test_a_head_asks_within_their_scope_and_nothing_changes_until_decided(
    api, make_user, it_dept, it_program, mine
):
    head = api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))
    ids = [str(mine["a"].public_id), str(mine["b"].public_id)]
    asked = _ask(head, "student", ids)
    assert asked.status_code == 201, asked.data
    assert asked.data["state"] == "pending" and asked.data["preview"]["طالب"] == 2
    assert StudentRecord.objects.filter(public_id__in=ids).count() == 2
    # Not twice, and not another department's student.
    assert _ask(head, "student", ids[:1]).data["code"] == "pending"
    assert _ask(head, "student", [str(mine["other"].public_id)]).status_code == 403
    # A programme's head asks for their programme's course; a teacher may not ask.
    programme_head = api(make_user(Role.PROGRAM_MANAGER, program=it_program))
    assert _ask(programme_head, "course", [str(mine["course"].pk)]).status_code == 201
    assert _ask(api(make_user(Role.TEACHER)), "course", [str(mine["course"].pk)]).status_code == 403
    # They follow their own requests.
    listed = head.get("/api/v1/deletion-requests/mine").data["results"]
    assert [r["kind"] for r in listed] == ["student"]


def test_the_system_admin_alone_decides_and_approving_is_the_deletion(
    api, users, make_user, it_dept, mine
):
    head = api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))
    ids = [str(mine["a"].public_id), str(mine["b"].public_id)]
    req = _ask(head, "student", ids).data
    approve = f"/api/v1/deletion-requests/{req['id']}/approve"
    # The supervisor sees it but decides nothing; the admin approves through the deletion form.
    supervisor = api(users[Role.SYSTEM_SUPERVISOR])
    assert any(
        r["id"] == req["id"] for r in supervisor.get("/api/v1/deletion-requests").data["results"]
    )
    assert supervisor.post(approve).status_code == 403
    assert supervisor.post(f"/api/v1/deletion-requests/{req['id']}/reject").status_code == 403
    admin = api(users[Role.SYSTEM_ADMIN])
    assert admin.post(approve).data["code"] == "use_deletion"
    # A deletion that names other students does not approve it.
    other = admin.post(
        "/api/v1/deletions",
        {
            "kind": "student",
            "ids": ids[:1],
            "confirm": mine["a"].university_number,
            "password": PASSWORD,
            "request": req["id"],
        },
        format="json",
    )
    assert other.status_code == 409 and other.data["code"] == "targets"
    done = admin.post(
        "/api/v1/deletions",
        {"kind": "student", "ids": ids, "confirm": "2", "password": PASSWORD, "request": req["id"]},
        format="json",
    )
    assert done.status_code == 200, done.data
    assert not StudentRecord.objects.filter(public_id__in=ids).exists()
    decided = DeletionRequest.objects.get(pk=req["id"])
    assert decided.state == "approved" and decided.decided_by == users[Role.SYSTEM_ADMIN]
    # The other department's student is untouched.
    assert StudentRecord.objects.filter(pk=mine["other"].pk).exists()


def test_a_rejected_request_deletes_nothing_and_says_why(api, users, make_user, it_dept, mine):
    head = api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))
    req = _ask(head, "course", [str(mine["course"].pk)]).data
    rejected = api(users[Role.SYSTEM_ADMIN]).post(
        f"/api/v1/deletion-requests/{req['id']}/reject", {"note": "ما زالت تُدرَّس"}, format="json"
    )
    assert rejected.status_code == 200 and rejected.data["state"] == "rejected"
    assert Course.objects.filter(pk=mine["course"].pk).exists()
    assert CourseOffering.objects.filter(course=mine["course"]).exists()
    mine_now = head.get("/api/v1/deletion-requests/mine").data["results"]
    assert mine_now[0]["decision_note"] == "ما زالت تُدرَّس"
