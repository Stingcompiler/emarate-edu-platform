"""Regulations, cases, misconduct reports and student status (Phase 4)."""

import pytest

from accounts.rbac import Role
from conftest import pdf_upload
from students.models import StudentRecord


@pytest.fixture
def affairs(make_user):
    return make_user(Role.STUDENT_AFFAIRS)


def test_regulation_lifecycle(api, affairs, classroom, django_capture_on_commit_callbacks):
    body = {
        "title": "لائحة الامتحانات 2026",
        "body": "…",
        "category": "exams",
        "requires_acknowledgement": True,
    }
    assert api(classroom.teacher).post("/api/v1/regulations", body).status_code == 403
    created = api(affairs).post("/api/v1/regulations", body)
    assert created.status_code == 201, created.data
    url = f"/api/v1/regulations/{created.data['public_id']}"
    assert api(classroom.student).get(url).status_code == 404  # draft
    with django_capture_on_commit_callbacks(execute=True):
        assert api(affairs).post(f"{url}/publish").status_code == 200
    inbox = api(classroom.student).get("/api/v1/notifications").data["results"]
    assert "مطلوب إقرارك" in inbox[0]["title"]
    seen = api(classroom.student).get(url).data
    assert seen["acknowledged"] is False
    assert api(classroom.student).post(f"{url}/acknowledge").status_code == 201
    assert api(classroom.student).post(f"{url}/acknowledge").status_code == 409
    assert api(classroom.student).get(url).data["acknowledged"] is True
    assert api(affairs).get(url).data["acknowledgements_count"] == 1
    assert api(affairs).patch(url, {"title": "تعديل"}).status_code == 409
    draft = api(affairs).post(f"{url}/new-version").data
    assert draft["version"] == "2"
    with django_capture_on_commit_callbacks(execute=True):
        api(affairs).post(f"/api/v1/regulations/{draft['public_id']}/publish")
    assert api(affairs).get(url).data["status"] == "superseded"


def test_regulation_pdf_is_readable_once_published(api, affairs, classroom):
    upload = api(affairs).post(
        "/api/v1/files", {"file": pdf_upload(), "purpose": "regulation"}, format="multipart"
    )
    assert upload.status_code == 201, upload.data
    file_id = upload.data["public_id"]
    reg = api(affairs).post("/api/v1/regulations", {"title": "اللائحة", "file": file_id}).data
    assert api(classroom.student).get(f"/api/v1/files/{file_id}/url").status_code == 404
    api(affairs).post(f"/api/v1/regulations/{reg['public_id']}/publish")
    assert api(classroom.student).get(f"/api/v1/files/{file_id}/url").status_code == 200
    assert (
        api(classroom.teacher)
        .post("/api/v1/files", {"file": pdf_upload(), "purpose": "regulation"}, format="multipart")
        .status_code
        == 403
    )


def test_public_regulations_are_opt_in(api, affairs):
    """The website lists a regulation only when published *and* marked public."""
    upload = (
        api(affairs)
        .post("/api/v1/files", {"file": pdf_upload(), "purpose": "regulation"}, format="multipart")
        .data
    )
    internal = api(affairs).post("/api/v1/regulations", {"title": "داخلية"}).data
    public = (
        api(affairs)
        .post(
            "/api/v1/regulations",
            {"title": "دليل الطالب", "file": upload["public_id"], "is_public": True},
        )
        .data
    )
    draft = api(affairs).post("/api/v1/regulations", {"title": "مسودة", "is_public": True}).data
    for reg in (internal, public):
        api(affairs).post(f"/api/v1/regulations/{reg['public_id']}/publish")

    listed = api().get("/api/public/regulations").data
    assert [r["title"] for r in listed] == ["دليل الطالب"]
    assert listed[0]["has_file"] is True and listed[0]["category_label"]
    # A static page links here; the API answers with a fresh signed link.
    file_url = f"/api/public/regulations/{public['public_id']}/file"
    response = api().get(file_url)
    assert response.status_code == 302 and "/api/public/files/" in response["Location"]
    assert response["Cache-Control"] == "no-store"
    for hidden in (internal, draft):
        assert api().get(f"/api/public/regulations/{hidden['public_id']}/file").status_code == 404
    # A new version keeps the choice.
    url = f"/api/v1/regulations/{public['public_id']}/new-version"
    assert api(affairs).post(url).data["is_public"] is True


def test_cases(
    api, affairs, classroom, make_user, it_dept, ba_dept, django_capture_on_commit_callbacks
):
    body = {
        "student_record": str(classroom.record.public_id),
        "kind": "conduct",
        "title": "مخالفة سلوكية",
        "description": "تفاصيل داخلية",
    }
    assert api(classroom.teacher).post("/api/v1/cases", body).status_code == 403
    case = api(affairs).post("/api/v1/cases", body)
    assert case.status_code == 201, case.data
    url = f"/api/v1/cases/{case.data['public_id']}"
    api(affairs).post(f"{url}/notes", {"note": "اتصلنا بولي الأمر"})
    decided = api(affairs).post(
        f"{url}/decide",
        {"decision": "إنذار أول", "sanction": "إنذار", "effective_from": "2026-10-01"},
    )
    assert decided.data["status"] == "decided"
    assert [e["kind"] for e in decided.data["events"]] == ["opened", "note", "decided"]
    from audit.models import AuditLog

    note = AuditLog.objects.get(action="case.note")
    assert (
        "اتصلنا" not in str(note.new)
        and note.department_id == classroom.offering.course.department_id
    )

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    assert api(manager).get(url).status_code == 200
    assert api(manager).post(f"{url}/decide", {"decision": "x"}).status_code == 403
    outsider = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(outsider).get(url).status_code == 404
    assert api(classroom.teacher).get("/api/v1/cases").status_code == 403

    assert api(classroom.student).get("/api/v1/me/cases").data["count"] == 0
    with django_capture_on_commit_callbacks(execute=True):
        assert api(affairs).post(f"{url}/publish").status_code == 200
    mine = api(classroom.student).get("/api/v1/me/cases").data["results"]
    assert (
        mine[0]["decision"] == "إنذار أول"
        and "events" not in mine[0]
        and "description" not in mine[0]
    )
    assert (
        api(classroom.student).get("/api/v1/notifications").data["results"][0]["title"]
        == "قرار من شؤون الطلاب"
    )
    assert api(affairs).post(f"{url}/close").data["status"] == "closed"
    assert api(affairs).post(f"{url}/decide", {"decision": "y"}).status_code == 409
    assert api(affairs).post(f"{url}/reopen").data["status"] == "decided"


def test_misconduct_reports(
    api, affairs, classroom, make_user, ba_offering, django_capture_on_commit_callbacks
):
    body = {
        "offering": classroom.offering.pk,
        "student_record": str(classroom.record.public_id),
        "evidence": "ورقة غش",
    }
    other_teacher = make_user(Role.TEACHER)
    assert api(other_teacher).post("/api/v1/misconduct-reports", body).status_code == 403
    wrong_course = {**body, "offering": ba_offering.pk}
    assert (
        api(classroom.teacher).post("/api/v1/misconduct-reports", wrong_course).status_code == 403
    )
    with django_capture_on_commit_callbacks(execute=True):
        report = api(classroom.teacher).post("/api/v1/misconduct-reports", body)
    assert report.status_code == 201, report.data
    assert (
        api(affairs).get("/api/v1/notifications").data["results"][0]["title"].startswith("بلاغ غش")
    )
    url = f"/api/v1/misconduct-reports/{report.data['public_id']}"
    assert api(classroom.teacher).post(f"{url}/resolve", {"convert": True}).status_code == 403
    converted = api(affairs).post(f"{url}/resolve", {"convert": True})
    assert converted.data["status"] == "converted" and converted.data["case"]
    assert api(affairs).post(f"{url}/resolve", {"convert": False}).status_code == 409
    assert api(other_teacher).get(url).status_code == 404


def test_student_status(api, affairs, classroom, make_user, it_dept):
    url = f"/api/v1/students/{classroom.record.public_id}/status"
    assert (
        api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))
        .post(url, {"status": "suspended", "reason": "x"})
        .status_code
        == 403
    )
    assert api(affairs).post(url, {"status": "suspended", "reason": ""}).status_code == 400
    assert api(affairs).post(url, {"status": "graduated", "reason": "x"}).status_code == 400
    assert api(affairs).post(url, {"status": "suspended", "reason": "قرار لجنة"}).status_code == 200
    assert StudentRecord.objects.get(pk=classroom.record.pk).status == "suspended"
    assert api(affairs).post(url, {"status": "suspended", "reason": "مرة أخرى"}).status_code == 409
