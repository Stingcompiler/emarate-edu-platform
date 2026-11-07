"""The student's semester within the level (owner, 2026-11-05: two semesters a level)."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from academic.models import Course, CourseOffering, Enrollment
from accounts.rbac import Role
from students.models import StudentRecord

URL = "/api/v1/students"


@pytest.fixture
def manager(make_user, it_dept):
    return make_user(Role.DEPARTMENT_MANAGER, department=it_dept)


@pytest.fixture
def head(make_user):
    return make_user(Role.HEAD_REGISTRAR)


def _csv(*lines: str) -> SimpleUploadedFile:
    return SimpleUploadedFile(
        "students.csv", ("\n".join(lines) + "\n").encode("utf-8-sig"), "text/csv"
    )


def test_added_with_its_semester(api, manager, it_program):
    body = {"full_name_ar": "سارة", "program": it_program.pk, "level": 2, "semester": 2}
    made = api(manager).post(URL, body, format="json")
    assert made.status_code == 201, made.data
    assert made.data["semester"] == 2
    assert StudentRecord.objects.get().semester == 2


def test_without_a_semester_takes_the_current_terms(api, manager, it_program, term):
    term.order = 2
    term.save(update_fields=["order"])
    body = {"full_name_ar": "سارة", "program": it_program.pk, "level": 1}
    assert api(manager).post(URL, body, format="json").data["semester"] == 2


def test_semester_is_one_or_two(api, manager, it_program, make_student):
    body = {"full_name_ar": "سارة", "program": it_program.pk, "level": 1, "semester": 3}
    made = api(manager).post(URL, body, format="json")
    assert made.status_code == 400 and "semester" in made.data["errors"]
    student = make_student(it_program, "26-IT-0009", level=1)
    moved = api(manager).patch(f"{URL}/{student.public_id}", {"semester": 2}, format="json")
    assert moved.status_code == 200, moved.data
    student.refresh_from_db()
    assert student.semester == 2


def test_import_reads_the_semester(api, head, it_program, make_student):
    make_student(it_program, "26-IT-0002", level=1)  # semester 1
    make_student(it_program, "26-IT-0003", level=1)
    file = _csv(
        "الرقم الجامعي,الاسم,رمز البرنامج,المستوى,الفصل الدراسي",
        "26-IT-0001,أحمد,BIT,1,الثاني",
        "26-IT-0002,منى,BIT,1,2",
        "26-IT-0003,علي,BIT,1,",
        "26-IT-0004,هند,BIT,1,ثالث",
    )
    batch = api(head).post("/api/v1/student-imports", {"file": file}, format="multipart").data
    assert batch["summary"]["error"] == 1
    api(head).post(f"/api/v1/student-imports/{batch['public_id']}/commit")
    semesters = dict(StudentRecord.objects.values_list("university_number", "semester"))
    # New → 2; updated → 2; blank keeps 1; the bad value is not imported.
    assert semesters == {"26-IT-0001": 2, "26-IT-0002": 2, "26-IT-0003": 1}


def test_bulk_enroll_takes_the_students_in_the_terms_semester(
    api, manager, term, it_program, make_student
):
    course = Course.objects.create(
        department=it_program.department, program=it_program, code="IT101", name_ar="برمجة"
    )
    CourseOffering.objects.create(course=course, term=term)  # term.order == 1
    on_time = make_student(it_program, "26-IT-0001", level=1)
    ahead = make_student(it_program, "26-IT-0002", level=1)
    ahead.semester = 2
    ahead.save(update_fields=["semester"])
    body = {"term": term.pk, "program": it_program.pk, "level": 1}
    assert api(manager).post("/api/v1/enrollments/bulk", body).data["students"] == 1
    assert list(Enrollment.objects.values_list("student_record", flat=True)) == [on_time.pk]


def test_import_reads_the_plans_semester_number(api, head, it_program):
    """Owner, 2026-11-07: semesters run 1–10 through the programme; level 2 holds 3 and 4."""
    file = _csv(
        "الرقم الجامعي,الاسم,رمز البرنامج,المستوى,الفصل الدراسي",
        "26-IT-0011,أحمد,BIT,2,3",
        "26-IT-0012,منى,BIT,2,الرابع",
        "26-IT-0013,علي,BIT,3,الفصل الخامس",
        "26-IT-0014,هند,BIT,2,5",
    )
    batch = api(head).post("/api/v1/student-imports", {"file": file}, format="multipart").data
    rows = api(head).get(f"/api/v1/student-imports/{batch['public_id']}/rows").data["results"]
    errors = {r["row_no"]: " ".join(r["errors"]) for r in rows if r["errors"]}
    assert list(errors) == [5] and "3" in errors[5] and "4" in errors[5]
    api(head).post(f"/api/v1/student-imports/{batch['public_id']}/commit")
    places = {
        number: (level, semester)
        for number, level, semester in StudentRecord.objects.values_list(
            "university_number", "level", "semester"
        )
    }
    assert places == {"26-IT-0011": (2, 1), "26-IT-0012": (2, 2), "26-IT-0013": (3, 1)}


def test_a_programmes_semesters_are_twice_its_levels(api, make_user, it_program):
    admin = make_user(Role.SYSTEM_ADMIN)
    url = f"/api/v1/programs/{it_program.pk}"
    done = api(admin).patch(url, {"levels_count": 5, "duration_terms": 3}, format="json")
    assert done.status_code == 200, done.data
    assert (done.data["levels_count"], done.data["duration_terms"]) == (5, 10)
    assert api(admin).patch(url, {"levels_count": 6}, format="json").status_code == 400
