import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from academic.models import CourseOffering, DepartmentMembership, Enrollment
from accounts.rbac import Role, Scope
from learning.models import Assignment, Lecture, Submission, SubmissionGrade
from notifications.models import HRNotice, Notification
from reports import metrics
from reports.models import ReportSnapshot

NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)  # week 4 of the fixture term


def _teaching(offering, teacher, students, *, lectures=3, graded_after_days=2, now=NOW):
    """3 lectures; one assignment due 10 days ago; first student graded, second waiting."""
    for n in range(lectures):
        Lecture.objects.create(
            offering=offering,
            title_ar=f"م{n}",
            is_published=True,
            published_at=now - timedelta(days=n + 1),
            created_by=teacher,
        )
    assignment = Assignment.objects.create(
        offering=offering,
        title="واجب",
        due_at=now - timedelta(days=10),
        status=Assignment.Status.PUBLISHED,
        created_by=teacher,
    )
    for i, record in enumerate(students):
        submission = Submission.objects.create(
            assignment=assignment,
            student_record=record,
            first_submitted_at=now - timedelta(days=11 - i * 0.5),
        )
        if i == 0:
            SubmissionGrade.objects.create(
                submission=submission,
                score=Decimal(8),
                source=SubmissionGrade.Source.MANUAL,
                status=SubmissionGrade.Status.APPROVED,
                graded_by=teacher,
                graded_at=assignment.due_at + timedelta(days=graded_after_days),
            )
    return assignment


@pytest.fixture
def staffed(classroom, make_student, it_program, it_dept):
    second = make_student(it_program, "26-IT-0101", name="سارة حسن")
    Enrollment.objects.create(offering=classroom.offering, student_record=second)
    DepartmentMembership.objects.create(department=it_dept, user=classroom.teacher, kind="teacher")
    _teaching(classroom.offering, classroom.teacher, [classroom.record, second])
    return classroom


def test_teacher_indicators(staffed, term):
    rows = metrics.teacher_rows(term, Scope(everything=True), now=NOW)
    teacher = next(r for r in rows if r["id"] == staffed.teacher.id)
    # planned = 4 weeks × 2 lectures; grading = mean(2 days graded, 10 days still waiting)
    assert (teacher["lectures"], teacher["planned"], teacher["upload_percent"]) == (3, 8, 38)
    assert teacher["grading_days"] == 6.0
    assert (teacher["ungraded"], teacher["ungraded_percent"]) == (1, 50)
    assert teacher["students"] == 2 and teacher["assignments"] == 1
    assert teacher["status"] == "below"
    ta = next(r for r in rows if r["id"] == staffed.ta.id)
    assert ta["kind"] == "ta" and ta["lectures"] is None and ta["upload_percent"] is None
    # Without ta_can_grade the TA is not held to the course's grading delays.
    assert (ta["grading_days"], ta["ungraded"]) == (None, 0)
    assert rows[0]["status"] == "below"  # worst first

    staffed.offering.ta_can_grade = True
    staffed.offering.save()
    rows = metrics.teacher_rows(term, Scope(everything=True), now=NOW)
    ta = next(r for r in rows if r["id"] == staffed.ta.id)
    assert (ta["grading_days"], ta["ungraded"]) == (6.0, 1)


def test_status_thresholds():
    limits = {"grading_days": 3, "upload_percent": 75, "lectures_per_week": 2}
    base = {"offerings": 1, "grading_days": 1.0, "upload_percent": 90, "ungraded_percent": 5}
    assert metrics.status_of(base, limits) == "ok"
    assert metrics.status_of({**base, "grading_days": 3.4}, limits) == "warn"
    assert metrics.status_of({**base, "ungraded_percent": 31}, limits) == "warn"
    assert metrics.status_of({**base, "upload_percent": 60}, limits) == "warn"
    assert metrics.status_of({**base, "grading_days": 5.1}, limits) == "below"
    assert metrics.status_of({**base, "upload_percent": 38}, limits) == "below"
    assert metrics.status_of({**base, "offerings": 0}, limits) == "none"


def test_teacher_report_has_no_n_plus_one(staffed, term, make_user, make_student, it_program):
    def queries() -> int:
        with CaptureQueriesContext(connection) as ctx:
            metrics.teachers_report(term, Scope(everything=True), now=NOW)
        return len(ctx.captured_queries)

    queries()  # the first call creates the settings row
    before = queries()
    for n in range(3):
        teacher = make_user(Role.TEACHER)
        offering = CourseOffering.objects.create(
            course=staffed.offering.course, term=term, section=f"B{n}"
        )
        offering.instructors.create(user=teacher, role="teacher")
        record = make_student(it_program, f"26-IT-02{n:02d}")
        Enrollment.objects.create(offering=offering, student_record=record)
        _teaching(offering, teacher, [record])
    assert queries() == before


def test_department_report(staffed, term, it_dept):
    report = metrics.department_report(term, [it_dept.id], now=NOW)
    kpis = report["kpis"]
    assert kpis["offerings"] == 1 and kpis["without_teacher"] == 0
    assert kpis["lectures"] == 3 and kpis["lectures_30d"] == 3
    assert kpis["submission_percent"] == 100  # 2 of 2 expected
    assert kpis["students"] == 2 and kpis["enrolled_percent"] == 100
    row = report["rows"][0]
    assert row["code"] == "IT101" and row["lectures"] == 3 and row["ungraded"] == 1
    assert sum(report["weekly_uploads"]) == 3 and report["weekly_uploads"][-1] == 3


def test_department_report_scope(api, users, staffed, it_dept, ba_dept):
    manager = users[Role.DEPARTMENT_MANAGER]
    ok = api(manager).get("/api/v1/reports/department")
    assert ok.status_code == 200 and ok.data["departments"] == [it_dept.name_ar]
    assert (
        api(manager).get(f"/api/v1/reports/department?department={ba_dept.pk}").status_code == 403
    )
    college = api(users[Role.ACADEMIC_AFFAIRS]).get("/api/v1/reports/department")
    assert set(college.data["departments"]) == {it_dept.name_ar, ba_dept.name_ar}
    assert api(users[Role.HR]).get("/api/v1/reports/department").status_code == 403


def test_teachers_report_and_profile(api, users, staffed, make_user, ba_dept, ba_offering):
    outsider = make_user(Role.TEACHER)
    ba_offering.instructors.create(user=outsider, role="teacher")
    hr = api(users[Role.HR]).get("/api/v1/reports/teachers")
    names = {r["name"] for r in hr.data["rows"]}
    assert staffed.teacher.full_name_ar in names and outsider.full_name_ar in names
    assert hr.data["summary"]["members"] == len(hr.data["rows"])
    manager = api(users[Role.DEPARTMENT_MANAGER])
    mine = manager.get("/api/v1/reports/teachers")
    assert outsider.full_name_ar not in {r["name"] for r in mine.data["rows"]}
    assert manager.get(f"/api/v1/reports/teachers/{outsider.public_id}").status_code == 404
    profile = manager.get(f"/api/v1/reports/teachers/{staffed.teacher.public_id}")
    assert profile.status_code == 200 and profile.data["notices"] is None
    assert profile.data["offerings"][0]["code"] == "IT101"
    only_tas = api(users[Role.HR]).get("/api/v1/reports/teachers?kind=ta")
    assert {r["kind"] for r in only_tas.data["rows"]} == {"ta"}


def test_hr_notice_with_evidence(
    api, users, staffed, make_user, it_dept, django_capture_on_commit_callbacks
):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    with django_capture_on_commit_callbacks(execute=True):
        sent = api(users[Role.HR]).post(
            "/api/v1/hr-notices",
            {
                "teacher": str(staffed.teacher.public_id),
                "topic": "grading",
                "body": "نرجو معالجة التسليمات المتأخرة.",
                "cc_department_manager": True,
            },
            format="json",
        )
    assert sent.status_code == 201, sent.data
    assert sent.data["subject"] == "تأخر التصحيح" and sent.data["requires_ack"] is True
    assert sent.data["evidence"]["ungraded"] == 1 and sent.data["evidence"]["term"]
    copy = Notification.objects.get(title__startswith="نسخة تنبيه")
    assert str(manager.public_id) in copy.audience["ids"]
    assert str(staffed.teacher.public_id) not in copy.audience["ids"]
    url = f"/api/v1/hr-notices/{sent.data['public_id']}"
    teacher = api(staffed.teacher)
    assert teacher.get(url).data["opened_at"] is not None
    assert teacher.post(f"{url}/acknowledge").data["acknowledged_at"] is not None
    # Academic affairs sends too and sees the file; department managers do neither.
    aa = api(users[Role.ACADEMIC_AFFAIRS])
    assert aa.get(url).status_code == 200
    body = {"teacher": str(staffed.teacher.public_id), "topic": "uploads", "body": "b"}
    assert aa.post("/api/v1/hr-notices", body, format="json").status_code == 201
    assert api(manager).post("/api/v1/hr-notices", body, format="json").status_code == 403
    not_teacher = {**body, "teacher": str(users[Role.REGISTRAR].public_id)}
    assert (
        api(users[Role.HR]).post("/api/v1/hr-notices", not_teacher, format="json").status_code
        == 400
    )
    profile = aa.get(f"/api/v1/reports/teachers/{staffed.teacher.public_id}")
    assert len(profile.data["notices"]) == 2
    assert HRNotice.objects.filter(teacher=staffed.teacher).count() == 2


def test_snapshots_are_frozen_and_scoped(api, users, staffed, make_user, ba_dept):
    manager = api(users[Role.DEPARTMENT_MANAGER])
    made = manager.post(
        "/api/v1/report-snapshots", {"kind": "department", "notes": "ملاحظة"}, format="json"
    )
    assert made.status_code == 201, made.data
    assert made.data["data"]["kpis"]["offerings"] == 1 and len(made.data["digest"]) == 64
    snapshot = ReportSnapshot.objects.get(public_id=made.data["public_id"])
    assert snapshot.department_id == staffed.offering.course.department_id
    detail = f"/api/v1/report-snapshots/{snapshot.public_id}"
    other = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(other).get(detail).status_code == 404
    assert api(users[Role.ACADEMIC_AFFAIRS]).get(detail).status_code == 200
    assert api(users[Role.HR]).get(detail).status_code == 404  # department reports aren't HR's
    assert api(users[Role.REGISTRAR]).get("/api/v1/report-snapshots").status_code == 403
    assert manager.patch(detail, {"notes": "x"}, format="json").status_code == 405
    assert manager.delete(detail).status_code == 405
    hr = api(users[Role.HR]).post("/api/v1/report-snapshots", {"kind": "teachers"}, format="json")
    assert hr.status_code == 201 and hr.data["data"]["summary"]["members"] >= 1
    assert (
        manager.post("/api/v1/report-snapshots", {"kind": "admissions"}, format="json").status_code
        == 403
    )


def test_admissions_report(api, users, it_program, term, make_user, it_dept):
    from django.utils import timezone

    from admissions.models import (
        AdmissionCycle,
        Application,
        ApplicationStatusHistory,
        ProgramIntake,
    )
    from contacts.models import Contact

    registrar = make_user(Role.REGISTRAR, department=it_dept)
    now = timezone.now()
    cycle = AdmissionCycle.objects.create(
        academic_year=term.academic_year,
        name="قبول",
        opens_at=now - timedelta(days=5),
        closes_at=now + timedelta(days=5),
    )
    intake = ProgramIntake.objects.create(cycle=cycle, program=it_program)
    for n, status in enumerate(["submitted", "accepted", "registered", "rejected"]):
        app = Application.objects.create(
            reference_no=f"APP-2026-00000{n}",
            contact=Contact.objects.create(name=f"م{n}", email=f"a{n}@x.test"),
            intake=intake,
            full_name=f"م{n}",
            status=status,
            submitted_at=now - timedelta(days=2),
            assigned_registrar=registrar if n else None,
        )
        if n:
            ApplicationStatusHistory.objects.create(
                application=app,
                from_status="submitted",
                to_status="under_review",
                changed_by=registrar,
            )
    report = api(users[Role.HEAD_REGISTRAR]).get("/api/v1/reports/admissions")
    assert report.status_code == 200
    data = report.data
    assert (data["total"], data["accepted"], data["converted"], data["unassigned"]) == (4, 2, 1, 1)
    assert data["programs"][0]["total"] == 4 and data["daily"][-3] == 4
    row = next(r for r in data["registrars"] if r["name"] == registrar.full_name_ar)
    assert row["applications"] == 3 and row["departments"] == ["IT"]
    assert api(users[Role.REGISTRAR]).get("/api/v1/reports/admissions").status_code == 403


def test_affairs_report_has_no_names(api, users, make_student, it_program, term):
    from student_affairs.models import StudentCase

    record = make_student(it_program, "26-IT-0300", name="اسم لا يظهر")
    StudentCase.objects.create(
        student_record=record, kind="conduct", title="مخالفة", opened_by=users[Role.STUDENT_AFFAIRS]
    )
    response = api(users[Role.STUDENT_AFFAIRS]).get("/api/v1/reports/affairs")
    assert response.status_code == 200
    assert response.data["total"] == 1 and response.data["rows"][0]["by_kind"]["conduct"] == 1
    dumped = json.dumps(response.data, ensure_ascii=False, default=str)
    assert "اسم لا يظهر" not in dumped and "26-IT-0300" not in dumped


def test_transcript(
    api, users, make_student, it_program, it_offering, term, ba_program, make_user, ba_dept
):
    from conftest import pdf_upload
    from results.models import AcademicResult, ResultImportBatch

    record = make_student(it_program, "26-IT-0400")
    batch = ResultImportBatch.objects.create(
        file=pdf_upload("r.csv"),
        file_name="r.csv",
        scope="department",
        department=it_offering.course.department,
        term=term,
        uploaded_by=users[Role.RESULTS_OFFICER],
        status="published",
    )
    AcademicResult.objects.create(
        import_batch=batch,
        student_record=record,
        offering=it_offering,
        term=term,
        score=Decimal(91),
        letter="A",
        grade_points=Decimal("4.00"),
        status=AcademicResult.Status.PASS,
        is_published=True,
    )
    url = "/api/v1/transcripts/26-IT-0400"
    got = api(users[Role.RESULTS_OFFICER]).get(url)
    assert got.status_code == 200
    assert got.data["cumulative_gpa"] == "4.00" and got.data["earned_hours"] == 3
    assert got.data["terms"][0]["results"][0]["letter"] == "A"
    outsider = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(outsider).get(url).status_code == 404
    assert api(users[Role.DEPARTMENT_MANAGER]).get(url).status_code == 200
