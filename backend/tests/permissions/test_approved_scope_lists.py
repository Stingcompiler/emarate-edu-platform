"""List/search/export isolation with positive controls for each seeded department."""

import pytest

from academic.models import Course

from .matrix import MATRIX, ROLES

BINDINGS = {
    "courses.view": ("courses", "course"),
    "students.view": ("students", "student"),
    "structure.view": ("programs", "program"),
}
CASES = [
    (key, code)
    for key in BINDINGS
    for code, value in MATRIX[key]["values"].items()
    if value == "dept"
]


@pytest.mark.parametrize("key,code", CASES, ids=[f"{k}-{r}" for k, r in CASES])
def test_list_search_and_explicit_filter_stay_in_department(
    key, code, api, make_user, make_student, it_dept, ba_dept, it_program, ba_program
):
    path, kind = BINDINGS[key]
    if kind == "course":
        a = Course.objects.create(
            department=it_dept, program=it_program, code="SCOPEIT", name_ar="Scope IT"
        )
        b = Course.objects.create(
            department=ba_dept, program=ba_program, code="SCOPEBA", name_ar="Scope BA"
        )
    elif kind == "student":
        a = make_student(it_program, "SCOPEIT")
        b = make_student(ba_program, "SCOPEBA")
    else:
        a, b = it_program, ba_program
    for own, local, foreign in [(it_dept, a, b), (ba_dept, b, a)]:
        actor = make_user(ROLES[code], department=own)
        client = api(actor)
        field = "public_id" if kind == "student" else "id"

        def identify(obj):
            return str(obj.public_id if kind == "student" else obj.pk)

        response = client.get(f"/api/v1/{path}")
        assert response.status_code == 200
        items = {str(row[field]) for row in response.data["results"]}
        assert identify(local) in items
        assert identify(foreign) not in items
        # Caller-controlled filter and search cannot widen the base queryset.
        for query in [
            f"?department={foreign.department_id}",
            f"?search={'SCOPEBA' if own == it_dept else 'SCOPEIT'}",
        ]:
            response = client.get(f"/api/v1/{path}{query}")
            assert response.status_code == 200
            assert identify(foreign) not in {str(row[field]) for row in response.data["results"]}
