"""The programme head and supervisor columns (PH, PS) of docs/roles-matrix.md: `prog` cells.

Owner, 2026-11-13: the department is a container; a programme's head and supervisor do, inside
their programme, what the department's manager and supervisor do inside their department. The
generic matrix tests know `all`, `dept` and `-`; this module checks `prog` cell by cell against
the central scope, then on the endpoints with a sibling programme of the same department — which
a programme role must not see, and a department role must.
"""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from academic.models import (
    Course,
    CourseOffering,
    DepartmentMembership,
    Enrollment,
    OfferingInstructor,
)
from accounts import rbac
from accounts.models import RoleAssignment
from accounts.rbac import Role
from learning.models import Lecture
from organization.models import Program
from results.models import AcademicResult, ResultImportBatch
from student_affairs.models import StudentCase

from .matrix import ALIASES, MATRIX, PROGRAMME, ROLES

CELLS = [(key, code) for key in MATRIX for code in sorted(PROGRAMME)]


@pytest.fixture
def sibling(it_dept):
    """Another programme of the same department."""
    return Program.objects.create(
        department=it_dept,
        code="DIT",
        name_ar="دبلوم تقنية المعلومات",
        degree="diploma",
        levels_count=2,
        duration_terms=4,
    )


@pytest.mark.parametrize("key,code", CELLS, ids=[f"{k}-{c}" for k, c in CELLS])
def test_central_scope_matches_matrix(key, code, make_user, it_dept, it_program, sibling):
    expected = MATRIX[key]["values"][code]
    assert expected in {"prog", "-"}, "a programme role holds programmes, never the college"
    user = make_user(ROLES[code], program=it_program)
    scope = rbac.scope_for(user, ALIASES.get(key, key))
    assert not scope.everything and not scope.departments
    assert ("prog" if scope.programs else "-") == expected
    if expected == "prog":
        assert scope.allows(it_dept.pk, it_program.pk)
        assert not scope.allows(it_dept.pk, sibling.pk)
        assert not scope.allows(it_dept.pk)  # never the whole department


@pytest.fixture
def place(make_user, make_student, it_dept, it_program, sibling, term):
    """The same things in the head's programme and in its sibling."""
    made = {}
    for name, program, code, number in (
        ("own", it_program, "IT900", "26-IT-0901"),
        ("other", sibling, "DIT900", "26-IT-0902"),
    ):
        course = Course.objects.create(program=program, code=code, name_ar=f"مادة {code}")
        offering = CourseOffering.objects.create(course=course, term=term)
        student = make_student(program, number)
        teacher = make_user(Role.TEACHER)
        batch = ResultImportBatch.objects.create(
            file=SimpleUploadedFile("r.csv", b"x"),
            file_name="r.csv",
            scope="department",
            department=it_dept,
            term=term,
            uploaded_by=teacher,
            status="published",
        )
        made[name] = {
            "program": program,
            "course": course,
            "offering": offering,
            "student": student,
            "enrollment": Enrollment.objects.create(offering=offering, student_record=student),
            "teacher": teacher,
            "membership": DepartmentMembership.objects.create(
                program=program, user=teacher, kind="teacher"
            ),
            "lecture": Lecture.objects.create(
                offering=offering, title_ar="م1", is_published=True, created_by=teacher
            ),
            "result": AcademicResult.objects.create(
                student_record=student,
                offering=offering,
                term=term,
                score=80,
                letter="B+",
                grade_points="3.5",
                status="pass",
                import_batch=batch,
            ),
            "case": StudentCase.objects.create(
                student_record=student, kind="conduct", title="c", opened_by=teacher
            ),
        }
    return made


def _ids(response, key="id"):
    assert response.status_code == 200, response.data
    rows = response.data["results"] if isinstance(response.data, dict) else response.data
    return {row[key] for row in rows}


@pytest.mark.parametrize("role", [Role.PROGRAM_MANAGER, Role.PROGRAM_SUPERVISOR])
def test_a_programme_role_reads_its_programme_and_not_its_sibling(
    role, api, make_user, place, it_dept, it_program
):
    own, other = place["own"], place["other"]
    client = api(make_user(role, program=it_program))
    assert _ids(client.get("/api/v1/courses")) == {own["course"].pk}
    assert _ids(client.get("/api/v1/offerings")) == {own["offering"].pk}
    assert _ids(client.get("/api/v1/enrollments")) == {own["enrollment"].pk}
    assert _ids(client.get("/api/v1/students"), "public_id") == {str(own["student"].public_id)}
    assert _ids(client.get("/api/v1/programs")) == {it_program.pk}
    assert _ids(client.get("/api/v1/departments")) == {it_dept.pk}  # the one that holds it
    assert _ids(client.get("/api/v1/lectures"), "public_id") == {str(own["lecture"].public_id)}
    assert _ids(client.get("/api/v1/results")) == {own["result"].pk}
    assert _ids(client.get("/api/v1/cases"), "public_id") == {str(own["case"].public_id)}
    members = client.get(f"/api/v1/departments/{it_dept.pk}/members")
    assert _ids(members) == {own["membership"].pk}
    for url in (
        f"/api/v1/courses/{other['course'].pk}",
        f"/api/v1/offerings/{other['offering'].pk}",
        f"/api/v1/enrollments/{other['enrollment'].pk}",
        f"/api/v1/students/{other['student'].public_id}",
        f"/api/v1/programs/{other['program'].pk}",
        f"/api/v1/lectures/{other['lecture'].public_id}",
        f"/api/v1/results/{other['result'].pk}",
        f"/api/v1/cases/{other['case'].public_id}",
        f"/api/v1/programs/{other['program'].pk}/leaders",
        f"/api/v1/transcripts/{other['student'].university_number}",
    ):
        assert client.get(url).status_code == 404, url
    assert client.get(f"/api/v1/programs/{it_program.pk}/leaders").status_code == 200
    assert client.get(f"/api/v1/transcripts/{own['student'].university_number}").status_code == 200


def test_a_department_head_runs_every_programme_of_the_department(api, make_user, place, it_dept):
    """Where one is appointed (owner, 2026-11-13): nothing changes for them."""
    client = api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))
    both = {place["own"]["course"].pk, place["other"]["course"].pk}
    assert _ids(client.get("/api/v1/courses")) == both
    assert len(_ids(client.get("/api/v1/students"), "public_id")) == 2
    assert len(_ids(client.get(f"/api/v1/departments/{it_dept.pk}/members"))) == 2


def test_a_programme_head_writes_inside_the_programme_only(
    api, make_user, place, it_dept, it_program, sibling, term
):
    own, other = place["own"], place["other"]
    head = api(make_user(Role.PROGRAM_MANAGER, program=it_program))
    # Courses: theirs, never the sibling's; nor moved there.
    body = {"code": "IT901", "name_ar": "مادة"}
    assert head.post("/api/v1/courses", {**body, "program": it_program.pk}).status_code == 201
    assert head.post("/api/v1/courses", {**body, "program": sibling.pk}).status_code == 403
    moved = head.patch(f"/api/v1/courses/{own['course'].pk}", {"program": sibling.pk})
    assert moved.status_code == 403
    assert head.patch(f"/api/v1/courses/{other['course'].pk}", {"name_ar": "x"}).status_code == 404
    # Students: theirs; the sibling programme is not a choice, and no student moves there.
    student = {"full_name_ar": "طالب جديد", "level": 1}
    assert head.post("/api/v1/students", {**student, "program": it_program.pk}).status_code == 201
    assert head.post("/api/v1/students", {**student, "program": sibling.pk}).status_code == 400
    url = f"/api/v1/students/{own['student'].public_id}"
    assert head.patch(url, {"full_name_en": "Ahmed"}, format="json").status_code == 200
    assert head.patch(url, {"program": sibling.pk}, format="json").status_code == 400
    # Staff: linked to their programme, assigned to its courses, removed from it.
    teacher = make_user(Role.TEACHER)
    members = f"/api/v1/departments/{it_dept.pk}/members"
    link = {"user": str(teacher.public_id), "kind": "teacher"}
    assert head.post(members, {**link, "program": sibling.pk}, format="json").status_code == 403
    joined = head.post(members, {**link, "program": it_program.pk}, format="json")
    assert joined.status_code == 201, joined.data
    assign = {"user": str(teacher.public_id), "role": "teacher"}
    mine = f"/api/v1/offerings/{own['offering'].pk}/instructors"
    assert head.post(mine, assign, format="json").status_code == 201
    theirs = f"/api/v1/offerings/{other['offering'].pk}/instructors"
    assert head.post(theirs, assign, format="json").status_code == 404
    assert head.delete(f"{members}/{other['membership'].pk}").status_code == 404
    assert head.delete(f"{members}/{joined.data['id']}").status_code == 204
    assert not OfferingInstructor.objects.filter(user=teacher).exists()
    # Enrollment: their students in their courses; the whole level in one step.
    new = Enrollment.objects.filter(offering=own["offering"]).count()
    bulk = {"term": term.pk, "program": it_program.pk, "level": 1}
    assert head.post("/api/v1/enrollments/bulk", bulk).status_code == 200
    assert head.post("/api/v1/enrollments/bulk", {**bulk, "program": sibling.pk}).status_code == 403
    enroll = {
        "offering": other["offering"].pk,
        "student_record": str(own["student"].public_id),
    }
    assert head.post("/api/v1/enrollments", enroll, format="json").status_code in (403, 400)
    assert Enrollment.objects.filter(offering=own["offering"]).count() >= new


def test_the_programme_supervisor_deletes_and_removes_nothing(api, make_user, place, it_dept):
    """As the department's supervisor in the department (docs/roles-matrix.md: PS `-` on
    courses.delete, courses.unassign, dept.members.remove, content.delete, students.delete)."""
    own = place["own"]
    supervisor = api(make_user(Role.PROGRAM_SUPERVISOR, program=own["program"]))
    head = api(make_user(Role.PROGRAM_MANAGER, program=own["program"]))
    instructor = OfferingInstructor.objects.create(
        offering=own["offering"], user=own["teacher"], role="teacher"
    )
    spare = Course.objects.create(program=own["program"], code="IT999", name_ar="بلا استخدام")
    urls = [
        f"/api/v1/courses/{spare.pk}",
        f"/api/v1/offerings/{own['offering'].pk}/instructors/{instructor.pk}",
        f"/api/v1/departments/{it_dept.pk}/members/{own['membership'].pk}",
        f"/api/v1/lectures/{own['lecture'].public_id}",
    ]
    for url in urls:
        assert supervisor.delete(url).status_code == 403, url
    for url in urls:
        assert head.delete(url).status_code == 204, url


def test_who_appoints_a_programmes_head_and_supervisor(
    api, make_user, it_dept, it_program, sibling
):
    """Whoever appoints the department's: the admin, the supervisor and academic affairs, from
    existing accounts (rbac.GRANTS)."""
    person = make_user(Role.TEACHER)
    grant = {"user": str(person.public_id), "role": "program_manager"}
    affairs = api(make_user(Role.ACADEMIC_AFFAIRS))
    assert affairs.post("/api/v1/role-assignments", grant, format="json").status_code == 400
    wrong = {**grant, "program": it_program.pk, "department": it_dept.pk}
    assert affairs.post("/api/v1/role-assignments", wrong, format="json").status_code == 400
    assert (
        affairs.post(
            "/api/v1/role-assignments",
            {**grant, "role": "teacher", "program": it_program.pk},
            format="json",
        ).status_code
        == 400
    )
    given = affairs.post(
        "/api/v1/role-assignments", {**grant, "program": it_program.pk}, format="json"
    )
    assert given.status_code == 201, given.data
    assert given.data["program"] == it_program.pk
    assert given.data["program_name"] == it_program.name_ar
    again = affairs.post(
        "/api/v1/role-assignments", {**grant, "program": it_program.pk}, format="json"
    )
    assert again.status_code == 409
    supervisor = api(make_user(Role.SYSTEM_SUPERVISOR))
    second = {**grant, "role": "program_supervisor", "program": it_program.pk}
    assert supervisor.post("/api/v1/role-assignments", second, format="json").status_code == 201
    for role in (Role.DEPARTMENT_MANAGER, Role.HEAD_REGISTRAR, Role.PROGRAM_MANAGER):
        other = make_user(role, department=it_dept, program=sibling)
        refused = api(other).post(
            "/api/v1/role-assignments",
            {**grant, "user": str(make_user(Role.TEACHER).public_id), "program": it_program.pk},
            format="json",
        )
        assert refused.status_code == 403, role
    leaders = affairs.get(f"/api/v1/programs/{it_program.pk}/leaders").data
    assert [(r["role"], r["user"]["full_name_ar"]) for r in leaders] == [
        ("program_manager", person.full_name_ar),
        ("program_supervisor", person.full_name_ar),
    ]
    me = api(person).get("/api/v1/me").data
    assert me["capabilities"]["courses.manage"] == {
        "everything": False,
        "departments": [],
        "programs": [it_program.pk],
    }
    # Relieved through the assignment's id, like a department's head.
    assert affairs.delete(f"/api/v1/role-assignments/{leaders[0]['id']}").status_code == 204
    assert not RoleAssignment.objects.filter(user=person, role=Role.PROGRAM_MANAGER).exists()


def test_a_programme_head_addresses_the_programme_never_the_department(
    api, make_user, place, it_dept, it_program, sibling
):
    from content.services import _local_grant
    from notifications.audience import is_allowed

    head = make_user(Role.PROGRAM_MANAGER, program=it_program)
    own, other = place["own"], place["other"]
    assert is_allowed(head, {"type": "program", "ids": [it_program.pk]})
    assert is_allowed(head, {"type": "offering", "ids": [own["offering"].pk]})
    assert not is_allowed(head, {"type": "program", "ids": [sibling.pk]})
    assert not is_allowed(head, {"type": "offering", "ids": [other["offering"].pk]})
    assert not is_allowed(head, {"type": "department", "ids": [it_dept.pk], "members": "students"})
    assert _local_grant(head, "program", it_program.pk, "students")
    assert _local_grant(head, "offering", own["offering"].pk, "students")
    assert not _local_grant(head, "program", sibling.pk, "students")
    assert not _local_grant(head, "department", it_dept.pk, "students")


def test_a_programme_head_reads_the_report_of_the_programme(
    api, make_user, place, it_dept, ba_dept, it_program
):
    """reports.department and reports.faculty_kpi are `prog`: the department's report, counted
    over their programme only; a saved report stays the whole department's."""
    own = place["own"]
    OfferingInstructor.objects.create(offering=own["offering"], user=own["teacher"], role="teacher")
    OfferingInstructor.objects.create(
        offering=place["other"]["offering"], user=place["other"]["teacher"], role="teacher"
    )
    head = api(make_user(Role.PROGRAM_MANAGER, program=it_program))
    report = head.get(f"/api/v1/reports/department?department={it_dept.pk}")
    assert report.status_code == 200, report.data
    assert report.data["departments"] == [it_program.name_ar]
    assert report.data["kpis"]["offerings"] == 1 and report.data["kpis"]["students"] == 1
    assert [row["code"] for row in report.data["rows"]] == [own["course"].code]
    # With no department named: the same, their programmes.
    assert head.get("/api/v1/reports/department").data["kpis"]["offerings"] == 1
    teachers = head.get(f"/api/v1/reports/teachers?department={it_dept.pk}")
    assert teachers.status_code == 200, teachers.data
    assert [row["name"] for row in teachers.data["rows"]] == [own["teacher"].full_name_ar]
    assert head.get(f"/api/v1/reports/department?department={ba_dept.pk}").status_code == 403
    assert head.get(f"/api/v1/reports/teachers?department={ba_dept.pk}").status_code == 403
    saved = head.post(
        "/api/v1/report-snapshots", {"kind": "department", "department": it_dept.pk}, format="json"
    )
    assert saved.status_code == 403
    # The department's head still reads the whole department.
    whole = api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept)).get(
        f"/api/v1/reports/department?department={it_dept.pk}"
    )
    assert whole.data["kpis"]["offerings"] == 2 and whole.data["kpis"]["students"] == 2
