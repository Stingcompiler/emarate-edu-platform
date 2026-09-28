"""Lectures, resources, assignments, submissions and grading (Phase 2)."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.rbac import Role
from audit.models import AuditLog
from conftest import pdf_upload
from learning.models import Assignment, Lecture


def _upload(client, offering, purpose="lecture", file=None):
    return client.post(
        "/api/v1/files",
        {"file": file or pdf_upload(), "purpose": purpose, "offering": offering.pk},
        format="multipart",
    )


def _lecture(api, classroom, publish=True):
    teacher = api(classroom.teacher)
    lecture = teacher.post(
        "/api/v1/lectures",
        {"offering": classroom.offering.pk, "title_ar": "المحاضرة الأولى", "order": 1},
    ).data
    if publish:
        teacher.post(f"/api/v1/lectures/{lecture['public_id']}/publish")
    return lecture["public_id"]


def _assignment(api, classroom, **extra):
    body = {
        "offering": classroom.offering.pk,
        "title": "الواجب الأول",
        "due_at": (timezone.now() + timedelta(days=3)).isoformat(),
        "submission_types": ["text", "file"],
        "max_grade": "10",
        **extra,
    }
    response = api(classroom.teacher).post("/api/v1/assignments", body, format="json")
    assert response.status_code == 201, response.data
    public_id = response.data["public_id"]
    published = api(classroom.teacher).post(f"/api/v1/assignments/{public_id}/publish")
    assert published.status_code == 200, published.data
    return public_id


# ─── Lectures and files ───────────────────────────────────────────────────


def test_students_see_published_lectures_only(api, classroom):
    draft = _lecture(api, classroom, publish=False)
    student = api(classroom.student)
    assert student.get(f"/api/v1/lectures/{draft}").status_code == 404
    assert student.get("/api/v1/lectures").data["count"] == 0
    api(classroom.teacher).post(f"/api/v1/lectures/{draft}/publish")
    assert student.get(f"/api/v1/lectures/{draft}").status_code == 200
    assert AuditLog.objects.filter(action="lecture.publish").exists()


def test_lecture_file_link_is_signed_and_scoped(api, classroom, make_user, ba_dept, client):
    lecture = _lecture(api, classroom, publish=False)
    stored = _upload(api(classroom.teacher), classroom.offering)
    assert stored.status_code == 201, stored.data
    assert stored.data["mime"] == "application/pdf"
    file_id = stored.data["public_id"]
    added = api(classroom.teacher).post(
        f"/api/v1/lectures/{lecture}/resources",
        {"kind": "file", "title": "ملخص", "file": file_id},
    )
    assert added.status_code == 201, added.data

    url = f"/api/v1/files/{file_id}/url"
    assert api(classroom.student).get(url).status_code == 404  # lecture not published yet
    api(classroom.teacher).post(f"/api/v1/lectures/{lecture}/publish")
    link = api(classroom.student).get(url)
    assert link.status_code == 200
    expires = link.data["expires_at"]
    assert timedelta(minutes=9) < expires - timezone.now() <= timedelta(minutes=10)

    download = client.get(link.data["url"])
    assert download.status_code == 200
    assert b"".join(download.streaming_content).startswith(b"%PDF")
    assert download["Content-Disposition"].startswith("attachment")
    assert download["Cache-Control"] == "private, no-store"

    outsider = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(outsider).get(url).status_code == 404
    assert client.get(link.data["url"] + "x").status_code == 404  # tampered token


def test_expired_link_is_refused(api, classroom, client, monkeypatch):
    file_id = _upload(api(classroom.teacher), classroom.offering).data["public_id"]
    link = api(classroom.teacher).get(f"/api/v1/files/{file_id}/url").data["url"]
    from files import services

    monkeypatch.setattr(services, "LINK_TTL", -1)
    assert client.get(link).status_code == 404


@pytest.mark.parametrize(
    ("name", "content", "message"),
    [
        ("notes.pdf", b"MZ\x90\x00 not a pdf", "does not match"),
        ("virus.exe", b"MZ\x90\x00", "not allowed"),
        ("notes.txt", b"hello\x00world", "binary"),
    ],
)
def test_unsafe_uploads_are_rejected(api, classroom, name, content, message):
    response = _upload(api(classroom.teacher), classroom.offering, file=pdf_upload(name, content))
    assert response.status_code == 400
    assert message in response.data["errors"]["file"][0]


def test_upload_permissions(api, classroom, make_user, it_dept):
    assert _upload(api(classroom.student), classroom.offering).status_code == 403
    assert _upload(api(classroom.teacher), classroom.offering, "submission").status_code == 403
    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    assert _upload(api(affairs), classroom.offering).status_code == 403
    supervisor = make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept)
    assert _upload(api(supervisor), classroom.offering).status_code == 201


def test_who_edits_and_deletes_lectures(api, classroom, make_user, it_dept):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    supervisor = make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept)
    affairs = make_user(Role.ACADEMIC_AFFAIRS)
    lecture = _lecture(api, classroom)
    url = f"/api/v1/lectures/{lecture}"

    assert api(affairs).get(url).status_code == 200
    assert api(affairs).patch(url, {"title_ar": "x"}).status_code == 403
    assert api(classroom.student).patch(url, {"title_ar": "x"}).status_code == 403
    assert api(classroom.ta).patch(url, {"title_ar": "معدّل"}).status_code == 200
    for user in (classroom.ta, supervisor, affairs, classroom.student):
        assert api(user).delete(url).status_code == 403

    by_manager = (
        api(manager)
        .post("/api/v1/lectures", {"offering": classroom.offering.pk, "title_ar": "من المدير"})
        .data["public_id"]
    )
    # A teacher deletes only what they created.
    assert api(classroom.teacher).delete(f"/api/v1/lectures/{by_manager}").status_code == 403
    assert api(classroom.teacher).delete(url).status_code == 204
    assert api(manager).delete(f"/api/v1/lectures/{by_manager}").status_code == 204
    assert not Lecture.objects.exists()


def test_resource_removal_and_unpublish(api, classroom, make_user, it_dept):
    lecture = _lecture(api, classroom)
    added = api(classroom.teacher).post(
        f"/api/v1/lectures/{lecture}/resources",
        {"kind": "link", "title": "مرجع", "url": "https://example.org/book"},
    )
    assert added.status_code == 201, added.data
    url = f"/api/v1/lectures/{lecture}/resources/{added.data['id']}"
    assert api(classroom.student).delete(url).status_code == 403
    assert api(classroom.ta).delete(url).status_code == 204
    assert api(classroom.student).post(f"/api/v1/lectures/{lecture}/unpublish").status_code == 403
    assert api(classroom.teacher).post(f"/api/v1/lectures/{lecture}/unpublish").status_code == 200
    assert api(classroom.student).get(f"/api/v1/lectures/{lecture}").status_code == 404


def test_other_courses_are_invisible(
    api, classroom, make_user, make_student, ba_offering, ba_program
):
    from academic.models import Enrollment

    lecture = _lecture(api, classroom)
    other_user = make_user(Role.STUDENT)
    other = make_student(ba_program, "26-BA-0100", user=other_user)
    Enrollment.objects.create(offering=ba_offering, student_record=other)
    assert api(other_user).get(f"/api/v1/lectures/{lecture}").status_code == 404
    body = {"offering": classroom.offering.pk, "title_ar": "تسلل"}
    assert api(other_user).post("/api/v1/lectures", body).status_code == 404


# ─── Assignments and submissions ──────────────────────────────────────────


def test_submit_resubmit_and_grade(api, classroom):
    assignment = _assignment(api, classroom)
    student = api(classroom.student)
    file_id = _upload(student, classroom.offering, "submission").data["public_id"]
    first = student.post(
        f"/api/v1/assignments/{assignment}/submit",
        {"content": "إجابتي", "files": [file_id]},
        format="json",
    )
    assert first.status_code == 201, first.data
    assert first.data["is_late"] is False
    second = student.post(
        f"/api/v1/assignments/{assignment}/submit", {"content": "إجابة أفضل"}, format="json"
    )
    assert second.data["versions_count"] == 2
    submission = second.data["public_id"]

    # The teacher sees the student's file; another student does not.
    assert api(classroom.teacher).get(f"/api/v1/files/{file_id}/url").status_code == 200

    # A student can never write a grade — not even their own.
    grade_url = f"/api/v1/submissions/{submission}/grade"
    assert student.put(grade_url, {"score": "10"}).status_code == 403
    assert student.get(f"/api/v1/submissions/{submission}").data["grade"] is None

    assert api(classroom.teacher).put(grade_url, {"score": "11"}).status_code == 400
    graded = api(classroom.teacher).put(grade_url, {"score": "8.5", "feedback": "جيد"})
    assert graded.status_code == 200, graded.data
    mine = student.get(f"/api/v1/assignments/{assignment}/my-submission").data
    assert mine["grade"]["score"] == "8.50"
    # Graded work is final.
    again = student.post(
        f"/api/v1/assignments/{assignment}/submit", {"content": "تعديل"}, format="json"
    )
    assert again.status_code == 409
    assert AuditLog.objects.filter(action="submission.grade").exists()


def test_ta_grades_only_when_allowed(api, classroom):
    assignment = _assignment(api, classroom)
    submission = (
        api(classroom.student)
        .post(f"/api/v1/assignments/{assignment}/submit", {"content": "حل"}, format="json")
        .data["public_id"]
    )
    url = f"/api/v1/submissions/{submission}/grade"
    assert api(classroom.ta).put(url, {"score": "7"}).status_code == 403
    classroom.offering.ta_can_grade = True
    classroom.offering.save()
    assert api(classroom.ta).put(url, {"score": "7"}).status_code == 200


def test_deadline_policies(api, classroom):
    past = (timezone.now() - timedelta(hours=1)).isoformat()
    strict = _assignment(api, classroom)
    Assignment.objects.filter(public_id=strict).update(due_at=timezone.now() - timedelta(hours=1))
    response = api(classroom.student).post(
        f"/api/v1/assignments/{strict}/submit", {"content": "متأخر"}, format="json"
    )
    assert response.status_code == 400
    assert response.data["code"] == "deadline_passed"

    lenient = _assignment(api, classroom, late_policy="penalty", late_penalty_percent=20)
    Assignment.objects.filter(public_id=lenient).update(due_at=past)
    late = api(classroom.student).post(
        f"/api/v1/assignments/{lenient}/submit", {"content": "متأخر"}, format="json"
    )
    assert late.status_code == 201
    assert late.data["is_late"] is True
    graded = api(classroom.teacher).put(
        f"/api/v1/submissions/{late.data['public_id']}/grade", {"score": "10"}
    )
    assert Decimal(graded.data["final_score"]) == Decimal("8.00")


def test_submission_rules(api, classroom):
    assignment = _assignment(
        api,
        classroom,
        submission_types=["link"],
        allow_resubmission=False,
        link_fields=[{"label": "GitHub", "required": True, "url_pattern": r"github\.com/"}],
    )
    student = api(classroom.student)
    url = f"/api/v1/assignments/{assignment}/submit"
    assert student.post(url, {"content": "نص"}, format="json").status_code == 400
    assert (
        student.post(url, {"links": {"GitHub": "https://gitlab.com/x"}}, format="json").status_code
        == 400
    )
    ok = student.post(url, {"links": {"GitHub": "https://github.com/me/repo"}}, format="json")
    assert ok.status_code == 201, ok.data
    again = student.post(url, {"links": {"GitHub": "https://github.com/me/v2"}}, format="json")
    assert again.status_code == 409


def test_rule_grading_is_a_suggestion_until_approved(api, classroom):
    assignment = _assignment(
        api,
        classroom,
        grading_mode="rule",
        rubric={"rules": [{"type": "submitted", "points": 4}, {"type": "on_time", "points": 6}]},
    )
    submission = (
        api(classroom.student)
        .post(f"/api/v1/assignments/{assignment}/submit", {"content": "حل"}, format="json")
        .data["public_id"]
    )
    url = f"/api/v1/submissions/{submission}"
    assert api(classroom.student).get(url).data["grade"] is None
    staff_view = api(classroom.teacher).get(url).data["grade"]
    assert staff_view["status"] == "suggested"
    assert staff_view["score"] == "10.00"
    assert api(classroom.student).post(f"{url}/grade/approve").status_code == 403
    assert api(classroom.teacher).post(f"{url}/grade/approve").status_code == 200
    assert api(classroom.student).get(url).data["grade"]["status"] == "approved"


def test_submissions_are_private(api, classroom, make_user, make_student, it_program):
    from academic.models import Enrollment

    assignment = _assignment(api, classroom)
    submission = (
        api(classroom.student)
        .post(f"/api/v1/assignments/{assignment}/submit", {"content": "حل"}, format="json")
        .data["public_id"]
    )
    classmate = make_user(Role.STUDENT)
    record = make_student(it_program, "26-IT-0101", user=classmate)
    Enrollment.objects.create(offering=classroom.offering, student_record=record)
    assert api(classmate).get(f"/api/v1/submissions/{submission}").status_code == 404
    listing = f"/api/v1/assignments/{assignment}/submissions"
    assert api(classmate).get(listing).status_code == 403
    assert api(classroom.ta).get(listing).data["count"] == 1


def test_assignment_with_submissions_cannot_be_deleted(api, classroom, make_user, it_dept):
    assignment = _assignment(api, classroom)
    api(classroom.student).post(
        f"/api/v1/assignments/{assignment}/submit", {"content": "حل"}, format="json"
    )
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    response = api(manager).delete(f"/api/v1/assignments/{assignment}")
    assert response.status_code == 409
    assert api(classroom.teacher).post(f"/api/v1/assignments/{assignment}/close").status_code == 200
    closed = api(classroom.student).post(
        f"/api/v1/assignments/{assignment}/submit", {"content": "بعد الإغلاق"}, format="json"
    )
    assert closed.status_code == 400


def test_drafts_are_hidden_and_publish_needs_submission_types(api, classroom):
    body = {
        "offering": classroom.offering.pk,
        "title": "مسودة",
        "due_at": (timezone.now() + timedelta(days=1)).isoformat(),
    }
    draft = api(classroom.teacher).post("/api/v1/assignments", body, format="json").data
    assert (
        api(classroom.student).get(f"/api/v1/assignments/{draft['public_id']}").status_code == 404
    )
    publish = api(classroom.teacher).post(f"/api/v1/assignments/{draft['public_id']}/publish")
    assert publish.status_code == 400


def test_assignment_list_carries_my_submission(api, classroom):
    assignment = _assignment(api, classroom)
    student = api(classroom.student)
    listed = student.get("/api/v1/assignments").data["results"][0]
    assert listed["mine"] is None and listed["course_code"] == classroom.offering.course.code
    student.post(f"/api/v1/assignments/{assignment}/submit", {"content": "حل"}, format="json")
    mine = student.get(f"/api/v1/assignments/{assignment}").data["mine"]
    assert mine["graded"] is False and mine["score"] is None and mine["is_late"] is False
    # Staff never get a "mine" summary.
    assert api(classroom.teacher).get(f"/api/v1/assignments/{assignment}").data["mine"] is None


def test_gradebook(api, classroom, make_user):
    from accounts.rbac import Role

    assignment = _assignment(api, classroom)
    api(classroom.student).post(
        f"/api/v1/assignments/{assignment}/submit", {"content": "حل"}, format="json"
    )
    url = f"/api/v1/gradebooks/{classroom.offering.pk}"
    teacher = api(classroom.teacher)
    book = teacher.get(url).data
    row = book["students"][0]
    assert row["cells"][assignment]["status"] == "submitted" and row["total"] == "0.00"
    submission = row["cells"][assignment]["submission"]
    teacher.put(
        f"/api/v1/submissions/{submission}/grade", {"score": "8", "feedback": ""}, format="json"
    )
    book = teacher.get(url).data
    assert book["students"][0]["total"] == "8.00" and book["max_total"] == "10.00"
    assert api(classroom.student).get(url).status_code == 404
    assert api(make_user(Role.TEACHER)).get(url).status_code == 404


def test_grading_queue(api, classroom, make_user):
    from accounts.rbac import Role

    assignment = _assignment(api, classroom)
    api(classroom.student).post(
        f"/api/v1/assignments/{assignment}/submit", {"content": "حل"}, format="json"
    )
    teacher = api(classroom.teacher)
    queue = teacher.get("/api/v1/grading-queue").data
    assert (
        queue["counts"]["pending"] == 1
        and queue["groups"][0]["assignment"]["public_id"] == assignment
    )
    submission = queue["groups"][0]["submissions"][0]["public_id"]
    teacher.put(
        f"/api/v1/submissions/{submission}/grade", {"score": "9", "feedback": ""}, format="json"
    )
    after = teacher.get("/api/v1/grading-queue").data
    assert (
        after["counts"]["pending"] == 0 and after["counts"]["done"] == 1 and after["groups"] == []
    )
    assert teacher.get("/api/v1/grading-queue?status=done").data["groups"][0]["submissions"]
    assert api(make_user(Role.TEACHER)).get("/api/v1/grading-queue").data["counts"]["pending"] == 0
