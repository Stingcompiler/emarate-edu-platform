"""Matrix-driven API writes on fresh unlinked records with persisted-effect checks."""

import pytest

from academic.models import Course
from accounts.rbac import Role
from learning.models import Lecture
from organization.models import Department
from results.models import ResultImportBatch
from student_affairs.models import Regulation

from .matrix import MATRIX, ROLES, UNCOVERED

OPERATIONS = {
    "courses.manage": ("courses", "patch", "name_ar"),
    "courses.delete": ("courses", "delete", "name_ar"),
    "students.manage": ("students", "patch", "full_name_ar"),
    "students.delete": ("students", "delete", "full_name_ar"),
    "structure.edit": ("departments", "patch", "name_ar"),
    "content.manage": ("lectures", "patch", "title_ar"),
    "content.delete": ("lectures", "delete", "title_ar"),
    "results.delete_batch": ("result-imports", "delete", "file_name"),
    "regulations.publish": ("regulations", "post", "status"),
    "users.edit_username": ("users", "patch", "full_name_ar"),
    "users.reset_password": ("users", "post", "password"),
    "users.delete": ("users", "delete", "full_name_ar"),
}
CASES = [
    (key, code, side)
    for key in OPERATIONS
    for code in ROLES
    if code not in UNCOVERED
    for side in ("own", "other")
]


@pytest.mark.parametrize("key,code,side", CASES, ids=[f"{k}-{c}-{s}" for k, c, s in CASES])
def test_approved_write_effect(
    key,
    code,
    side,
    api,
    make_user,
    make_student,
    it_dept,
    ba_dept,
    it_program,
    ba_program,
    it_offering,
    ba_offering,
    record_property,
):
    # Exercise both directions, with a distinct scoped actor for each department.
    for own, other, own_program, other_program in [
        (it_dept, ba_dept, it_program, ba_program),
        (ba_dept, it_dept, ba_program, it_program),
    ]:
        actor = make_user(ROLES[code], department=own)
        department = own if side == "own" else other
        program = own_program if side == "own" else other_program
        path, method, field = OPERATIONS[key]
        if path == "courses":
            obj = Course.objects.create(
                department=department, program=program, code=f"AUD-{actor.pk}", name_ar="قبل"
            )
            ident = obj.pk
        elif path == "students":
            obj = make_student(program, f"AUD-{actor.pk}", name="قبل")
            ident = obj.public_id
        elif path == "lectures":
            offering = it_offering if department == it_dept else ba_offering
            obj = Lecture.objects.create(offering=offering, title_ar="قبل", created_by=actor)
            ident = obj.public_id
        elif path == "result-imports":
            obj = ResultImportBatch.objects.create(
                file_name="audit.csv",
                scope="department",
                department=department,
                term=it_offering.term,
                uploaded_by=actor,
                status="validated",
            )
            ident = obj.public_id
        elif path == "regulations":
            obj = Regulation.objects.create(title="Audit", body="Valid text", created_by=actor)
            ident = f"{obj.public_id}/publish"
        elif path == "users":
            obj = make_user(Role.TEACHER)
            ident = obj.public_id
            if key == "users.reset_password":
                ident = f"{ident}/reset-password"
        else:
            obj = Department.objects.get(pk=department.pk)
            ident = obj.pk
        model = type(obj)
        before = model.objects.filter(pk=obj.pk).values().get()
        url = f"/api/v1/{path}/{ident}"
        response = getattr(api(actor), method)(url, {field: "بعد"}, format="json")
        expected = MATRIX[key]["values"][code]
        allowed = expected == "all" or (expected == "dept" and side == "own")
        record_property(f"{own.code}_status", response.status_code)
        if allowed:
            assert response.status_code == (204 if method == "delete" else 200), response.data
            if method == "delete":
                assert not model.objects.filter(pk=obj.pk).exists()
            else:
                obj.refresh_from_db()
                if key == "users.reset_password":
                    assert obj.password != before["password"]
                    assert obj.check_password(response.data["temporary_password"])
                else:
                    assert getattr(obj, field) == (
                        "published" if key == "regulations.publish" else "بعد"
                    )
        else:
            # Check persistence before checking the response, so a rejected request that
            # mutated the object is reported as a data-integrity failure.
            obj.refresh_from_db()
            after = model.objects.filter(pk=obj.pk).values().get()
            assert after == before
            assert response.status_code in (403, 404), response.data
