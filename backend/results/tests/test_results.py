"""Results: import → commit → publish, corrections, display rules, GPA (Phase 4)."""

from decimal import Decimal

import pytest

from academic.models import Course, CourseOffering, Enrollment
from accounts.rbac import Role
from audit.models import AuditLog
from conftest import csv_upload
from notifications.models import Notification
from results.models import AcademicResult, GradingScale, TermResultRelease

URL = "/api/v1/result-imports"
HEADER = "الرقم الجامعي,رمز المقرر,الدرجة,التقدير,الحالة"


@pytest.fixture
def officer(make_user):
    return make_user(Role.RESULTS_OFFICER)


def _upload(client, term, *lines, department=None):
    body = {"file": csv_upload("results.csv", HEADER, *lines), "term": term.pk}
    if department is not None:
        body["department"] = department.pk
    return client.post(URL, body, format="multipart")


def _publish(api, user, term, *lines, capture):
    batch = _upload(api(user), term, *lines).data["public_id"]
    assert api(user).post(f"{URL}/{batch}/commit").status_code == 200
    with capture(execute=True):
        assert api(user).post(f"{URL}/{batch}/publish").status_code == 200
    return batch


def test_import_preview_commit_publish(
    api, officer, classroom, term, make_student, it_program, django_capture_on_commit_callbacks
):
    stranger = make_student(it_program, "26-IT-0999")  # not enrolled
    response = _upload(
        api(officer),
        term,
        "26-IT-0100,it101,91,,",
        "26-IT-0100,IT101,80,,",  # duplicate
        "26-XX-0000,IT101,50,,",
        f"{stranger.university_number},IT101,70,,",
        "26-IT-0100,NOPE,70,,",
        "26-IT-0100,IT101,,,",
    )
    assert response.status_code == 201, response.data
    batch = response.data
    assert batch["summary"] == {"rows": 6, "create": 1, "error": 5}
    errors = (
        api(officer).get(f"{URL}/{batch['public_id']}/rows", {"action": "error"}).data["results"]
    )
    messages = " | ".join(" ".join(r["errors"]) for r in errors)
    for text in ("مكرر", "لا يوجد طالب", "غير مسجل", "لا توجد شعبة", "الدرجة: مطلوبة"):
        assert text in messages
    assert not AcademicResult.objects.exists()

    assert api(officer).post(f"{URL}/{batch['public_id']}/commit").status_code == 200
    result = AcademicResult.objects.get()
    assert (result.letter, result.grade_points, result.status) == ("A", Decimal("4.00"), "pass")
    student = api(classroom.student)
    assert student.get("/api/v1/me/results").data["terms"] == []

    with django_capture_on_commit_callbacks(execute=True):
        assert api(officer).post(f"{URL}/{batch['public_id']}/publish").status_code == 200
    mine = student.get("/api/v1/me/results").data
    assert mine["terms"][0]["results"][0]["letter"] == "A"
    assert mine["cumulative_gpa"] == "4.00"
    assert Notification.objects.filter(category="results").exists()
    assert api(classroom.student).get("/api/v1/notifications").data["count"] == 1

    assert api(officer).post(f"{URL}/{batch['public_id']}/unpublish").status_code == 200
    assert student.get("/api/v1/me/results").data["terms"] == []
    assert api(officer).delete(f"{URL}/{batch['public_id']}").status_code == 409
    assert {"results.commit", "results.publish", "results.unpublish"} <= set(
        AuditLog.objects.values_list("action", flat=True)
    )


def test_existing_results_need_a_correction(
    api, officer, classroom, term, django_capture_on_commit_callbacks
):
    _publish(
        api, officer, term, "26-IT-0100,IT101,91,,", capture=django_capture_on_commit_callbacks
    )
    again = _upload(api(officer), term, "26-IT-0100,IT101,60,,").data
    assert again["summary"]["error"] == 1


def test_letter_must_match_the_scale_and_statuses(api, officer, classroom, term):
    batch = _upload(api(officer), term, "26-IT-0100,IT101,91,B,").data
    assert batch["summary"]["error"] == 1
    absent = _upload(api(officer), term, "26-IT-0100,IT101,,,غائب").data
    assert absent["summary"]["create"] == 1


def test_department_uploads_stay_in_the_department(
    api, make_user, classroom, term, it_dept, ba_dept, ba_offering, make_student, ba_program
):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    body = {"file": csv_upload("r.csv", HEADER, "26-IT-0100,IT101,70,,"), "term": term.pk}
    assert (
        api(manager).post(URL, body, format="multipart").status_code == 400
    )  # department required
    assert (
        _upload(api(manager), term, "26-IT-0100,IT101,70,,", department=ba_dept).status_code == 403
    )
    ba_student = make_student(ba_program, "26-BA-0500")
    Enrollment.objects.create(offering=ba_offering, student_record=ba_student)
    batch = _upload(
        api(manager), term, "26-IT-0100,IT101,70,,", "26-BA-0500,BA101,70,,", department=it_dept
    ).data
    assert batch["summary"] == {"rows": 2, "create": 1, "error": 1}
    other = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(other).get(f"{URL}/{batch['public_id']}").status_code == 404
    assert api(other).post(f"{URL}/{batch['public_id']}/commit").status_code == 404
    assert (
        api(make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept))
        .delete(f"{URL}/{batch['public_id']}")
        .status_code
        == 204
    )


def test_corrections_need_academic_affairs(
    api, officer, classroom, term, make_user, it_dept, django_capture_on_commit_callbacks
):
    _publish(
        api, officer, term, "26-IT-0100,IT101,58,,", capture=django_capture_on_commit_callbacks
    )
    result = AcademicResult.objects.get()
    assert result.letter == "F"
    url = f"/api/v1/results/{result.pk}/corrections"
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    assert api(manager).post(url, {"score": "62", "reason": "خطأ رصد"}).status_code == 403
    assert api(officer).post(url, {"score": "62", "reason": ""}).status_code == 400
    created = api(officer).post(url, {"score": "62", "reason": "خطأ في الرصد"})
    assert created.status_code == 201, created.data
    assert created.data["new"]["letter"] == "C"
    assert api(officer).post(url, {"score": "70", "reason": "مرة أخرى"}).status_code == 409

    decide = f"/api/v1/result-corrections/{created.data['public_id']}/decide"
    assert api(officer).post(decide, {"approve": True}).status_code == 403
    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    with django_capture_on_commit_callbacks(execute=True):
        assert api(affairs).post(decide, {"approve": True, "note": "موافق"}).status_code == 200
    result.refresh_from_db()
    assert (result.score, result.letter, result.status, result.version) == (
        Decimal("62.00"),
        "C",
        "pass",
        2,
    )
    titles = [
        n["title"] for n in api(classroom.student).get("/api/v1/notifications").data["results"]
    ]
    assert titles[0].startswith("عُدّلت نتيجة")
    assert api(affairs).post(decide, {"approve": False}).status_code == 409


def test_display_rules(
    api, officer, classroom, term, make_user, django_capture_on_commit_callbacks
):
    _publish(
        api, officer, term, "26-IT-0100,IT101,77,,", capture=django_capture_on_commit_callbacks
    )
    assert (
        api(officer)
        .patch("/api/v1/results/settings", {"show_score": False, "show_gpa": False}, format="json")
        .status_code
        == 200
    )
    view = api(classroom.student).get("/api/v1/me/results").data
    row = view["terms"][0]["results"][0]
    assert row["score"] is None and row["letter"] == "B+" and view["cumulative_gpa"] is None
    assert (
        api(make_user(Role.HEAD_REGISTRAR))
        .patch("/api/v1/results/settings", {"show_score": True}, format="json")
        .status_code
        == 403
    )
    release = api(officer).post(
        "/api/v1/results/term-releases",
        {"term": term.pk, "program": None, "is_visible": False},
        format="json",
    )
    assert release.status_code == 201, release.data
    assert api(classroom.student).get("/api/v1/me/results").data["terms"] == []


def test_gpa_uses_credit_hours_and_program_scale(
    api, officer, classroom, term, it_program, it_dept, django_capture_on_commit_callbacks
):
    lab = Course.objects.create(
        department=it_dept, program=it_program, code="IT150", name_ar="مختبر", credit_hours=2
    )
    offering = CourseOffering.objects.create(course=lab, term=term)
    Enrollment.objects.create(offering=offering, student_record=classroom.record)
    GradingScale.objects.create(
        program=it_program,
        ranges=[
            {"min": 90, "letter": "A", "points": "4"},
            {"min": 60, "letter": "C", "points": "2"},
            {"min": 0, "letter": "F", "points": "0"},
        ],
    )
    _publish(
        api,
        officer,
        term,
        "26-IT-0100,IT101,95,,",
        "26-IT-0100,IT150,65,,",
        capture=django_capture_on_commit_callbacks,
    )
    view = api(classroom.student).get("/api/v1/me/results").data
    assert view["terms"][0]["gpa"] == "3.20"  # (4×3 + 2×2) / 5


def test_teachers_see_their_courses_and_export(
    api, officer, classroom, term, make_user, django_capture_on_commit_callbacks
):
    _publish(
        api, officer, term, "26-IT-0100,IT101,91,,", capture=django_capture_on_commit_callbacks
    )
    assert api(classroom.teacher).get("/api/v1/results").data["count"] == 1
    assert api(make_user(Role.TEACHER)).get("/api/v1/results").data["count"] == 0
    export = api(classroom.teacher).get("/api/v1/results/export", {"term": term.pk})
    assert export.status_code == 200
    body = export.content.decode("utf-8")
    assert body.startswith("﻿") and "26-IT-0100" in body
    assert (
        api(classroom.student).get("/api/v1/results/export", {"term": term.pk}).status_code == 403
    )


def test_delete_needs_an_uncommitted_batch_and_release_is_audited(api, officer, classroom, term):
    batch = _upload(api(officer), term, "26-IT-0100,IT101,91,,").data["public_id"]
    assert api(officer).delete(f"{URL}/{batch}").status_code == 204
    assert not TermResultRelease.objects.exists()
