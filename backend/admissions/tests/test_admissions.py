"""Admissions (Phase 7 acceptance): visitor OTP → apply → review → decide → register → activate."""

from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.rbac import Role
from admissions.models import AdmissionCycle, Application, ApplicationFormTemplate, ProgramIntake
from admissions.services import expire_closed
from conftest import PASSWORD, last_code, pdf_upload
from organization.models import SystemSettings
from students.models import StudentRecord

SCHEMA = {
    "steps": [
        {
            "title": "المؤهل",
            "sections": [
                {
                    "title": "الثانوية",
                    "fields": [
                        {"key": "school", "type": "text", "label": "المدرسة", "required": True},
                        {
                            "key": "percentage",
                            "type": "number",
                            "label": "النسبة",
                            "required": True,
                            "min": 0,
                            "max": 100,
                        },
                        {
                            "key": "track",
                            "type": "select",
                            "label": "المساق",
                            "options": ["علمي", "أدبي"],
                            "required": True,
                        },
                    ],
                }
            ],
        }
    ]
}


@pytest.fixture
def intake(db, term, it_program, make_user):
    head = make_user(Role.HEAD_REGISTRAR)
    ApplicationFormTemplate.objects.create(
        name="default", status="published", schema=SCHEMA, created_by=head
    )
    now = timezone.now()
    cycle = AdmissionCycle.objects.create(
        academic_year=term.academic_year,
        name="خريف 2026",
        opens_at=now - timedelta(days=1),
        closes_at=now + timedelta(days=14),
    )
    return ProgramIntake.objects.create(
        cycle=cycle,
        program=it_program,
        required_documents=[{"key": "certificate", "label": "الشهادة", "required": True}],
    )


def visitor(capture, email="applicant@example.test", name="مريم الطيب"):
    client = APIClient()
    with capture(execute=True):
        client.post("/api/public/visitor/otp", {"email": email})
    verified = client.post(
        "/api/public/visitor/verify", {"email": email, "code": last_code(), "name": name}
    )
    assert verified.status_code == 200, verified.data
    client.credentials(HTTP_AUTHORIZATION=f"Visitor {verified.data['token']}")
    return client


def _complete(client, application_id):
    client.patch(
        f"/api/visitor/applications/{application_id}",
        {"answers": {"school": "الخرطوم الثانوية", "percentage": 82, "track": "علمي"}},
        format="json",
    )
    upload = client.post(
        f"/api/visitor/applications/{application_id}/documents",
        {"doc_type": "certificate", "file": pdf_upload("cert.pdf")},
        format="multipart",
    )
    assert upload.status_code == 201, upload.data


def test_visitor_session(api, django_capture_on_commit_callbacks, db):
    assert APIClient().get("/api/visitor/me").status_code == 401
    client = APIClient()
    with django_capture_on_commit_callbacks(execute=True):
        client.post("/api/public/visitor/otp", {"email": "v@example.test"})
    wrong = "000000" if last_code() != "000000" else "111111"
    assert (
        client.post(
            "/api/public/visitor/verify", {"email": "v@example.test", "code": wrong}
        ).status_code
        == 400
    )
    me = visitor(django_capture_on_commit_callbacks, email="v@example.test").get("/api/visitor/me")
    assert me.status_code == 200 and me.data["applications"] == []
    from contacts.models import VisitorSession

    VisitorSession.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    expired = APIClient()
    expired.credentials(HTTP_AUTHORIZATION="Visitor nope")
    assert expired.get("/api/visitor/me").status_code == 401


def test_full_journey(api, intake, make_user, it_dept, ba_dept, django_capture_on_commit_callbacks):
    """Phase 7 acceptance, end to end."""
    head = make_user(Role.HEAD_REGISTRAR)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    other = make_user(Role.REGISTRAR, department=ba_dept)
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    client = visitor(django_capture_on_commit_callbacks)
    started = client.post("/api/visitor/applications", {"intake": intake.pk})
    assert started.status_code == 201, started.data
    app_id = started.data["public_id"]
    assert started.data["form"]["schema"] == SCHEMA

    incomplete = client.post(f"/api/visitor/applications/{app_id}/submit")
    assert incomplete.status_code == 400 and incomplete.data["code"] == "incomplete"
    assert {"school", "percentage", "certificate"} <= set(incomplete.data["errors"])
    _complete(client, app_id)
    with django_capture_on_commit_callbacks(execute=True):
        submitted = client.post(
            f"/api/visitor/applications/{app_id}/submit", HTTP_IDEMPOTENCY_KEY="k1"
        )
    assert submitted.data["status"] == "submitted"
    assert (
        client.post(f"/api/visitor/applications/{app_id}/submit", HTTP_IDEMPOTENCY_KEY="k1").data
        == submitted.data
    )
    assert (
        client.patch(
            f"/api/visitor/applications/{app_id}", {"full_name": "x"}, format="json"
        ).status_code
        == 409
    )
    assert (
        api(registrar)
        .get("/api/v1/notifications")
        .data["results"][0]["title"]
        .startswith("طلب تقديم جديد")
    )
    assert "استلمنا" in mail.outbox[-1].subject

    url = f"/api/v1/applications/{app_id}"
    assert api(other).get(url).status_code == 404
    summary_view = api(manager).get(url).data
    assert (
        summary_view["full_name"]
        and summary_view["answers"] is None
        and summary_view["documents"] is None
    )
    assert api(manager).post(f"{url}/transition", {"to": "under_review"}).status_code == 403

    review = api(registrar)
    moved = review.post(f"{url}/transition", {"to": "under_review"})
    assert (
        moved.data["status"] == "under_review"
        and moved.data["assigned_registrar_name"] == registrar.full_name_ar
    )
    assert set(moved.data["allowed_transitions"]) == {
        "missing_documents",
        "eligible",
    }  # not a decider
    assert (
        review.post(f"{url}/transition", {"to": "missing_documents"}).status_code == 400
    )  # note required
    with django_capture_on_commit_callbacks(execute=True):
        review.post(f"{url}/transition", {"to": "missing_documents", "note": "صورة الهوية"})
    assert "صورة الهوية" in mail.outbox[-1].body
    doc = moved.data["documents"][0]["public_id"]
    assert moved.data["labels"]["school"] == "المدرسة"
    assert moved.data["labels"]["certificate"] == "الشهادة"
    link = review.get(f"{url}/documents/{doc}/link")
    assert link.status_code == 200 and APIClient().get(link.data["url"]).status_code == 200
    assert api(manager).get(f"{url}/documents/{doc}/link").status_code == 403
    assert (
        review.post(f"{url}/documents/{doc}/review", {"status": "accepted"}).data["status"]
        == "accepted"
    )

    with django_capture_on_commit_callbacks(execute=True):
        assert (
            client.post(f"/api/visitor/applications/{app_id}/submit").data["status"]
            == "under_review"
        )
    assert review.post(f"{url}/transition", {"to": "eligible"}).data["status"] == "eligible"
    assert (
        review.post(f"{url}/transition", {"to": "accepted"}).status_code == 409
    )  # head registrar decides
    with django_capture_on_commit_callbacks(execute=True):
        assert (
            api(head)
            .post(f"{url}/transition", {"to": "accepted", "note": "مرحبًا بك"})
            .data["status"]
            == "accepted"
        )
    assert review.post(f"{url}/register").status_code == 403
    with django_capture_on_commit_callbacks(execute=True):
        registered = api(head).post(f"{url}/register")
    number = registered.data["university_number"]
    assert registered.data["status"] == "registered" and number.startswith(
        f"{timezone.now().year % 100:02d}-IT-"
    )
    assert number in mail.outbox[-1].body
    assert api(head).post(f"{url}/register").status_code == 409

    # The new student activates through the Phase 1 self-registration.
    public = APIClient()
    with django_capture_on_commit_callbacks(execute=True):
        start = public.post(
            "/api/public/registration/start",
            {
                "university_number": number,
                "full_name": "مريم الطيب",
                "email": "applicant@example.test",
            },
        )
    public.post(
        "/api/public/registration/verify",
        {"request_id": start.data["request_id"], "code": last_code()},
    )
    with django_capture_on_commit_callbacks(execute=True):
        done = public.post(
            "/api/public/registration/complete",
            {"request_id": start.data["request_id"], "password": PASSWORD},
        )
    assert done.data["status"] == "active"
    assert Application.objects.get(public_id=app_id).status == "activated"
    history = [
        h["to_status"] for h in client.get(f"/api/visitor/applications/{app_id}").data["history"]
    ]
    assert history == [
        "draft",
        "submitted",
        "under_review",
        "missing_documents",
        "under_review",
        "eligible",
        "accepted",
        "registered",
        "activated",
    ]
    assert StudentRecord.objects.get(university_number=number).application.public_id is not None


def test_limits_duplicates_and_windows(
    api, intake, it_dept, ba_program, django_capture_on_commit_callbacks
):
    client = visitor(django_capture_on_commit_callbacks)
    assert client.post("/api/visitor/applications", {"intake": intake.pk}).status_code == 201
    assert client.post("/api/visitor/applications", {"intake": intake.pk}).status_code == 409
    other = ProgramIntake.objects.create(cycle=intake.cycle, program=ba_program)
    config = SystemSettings.load()
    config.max_applications_per_cycle = 1
    config.save()
    assert client.post("/api/visitor/applications", {"intake": other.pk}).data["code"] == "limit"
    ProgramIntake.objects.filter(pk=other.pk).update(is_open=False)
    config.max_applications_per_cycle = 3
    config.save()
    assert client.post("/api/visitor/applications", {"intake": other.pk}).status_code == 400
    public = api().get("/api/public/intakes").data
    assert [i["program_code"] for i in public] == ["BIT"]


def test_withdraw_delegation_and_expiry(
    api, intake, make_user, it_dept, django_capture_on_commit_callbacks
):
    client = visitor(django_capture_on_commit_callbacks)
    app_id = client.post("/api/visitor/applications", {"intake": intake.pk}).data["public_id"]
    _complete(client, app_id)
    with django_capture_on_commit_callbacks(execute=True):
        client.post(f"/api/visitor/applications/{app_id}/submit")
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    url = f"/api/v1/applications/{app_id}"
    api(registrar).post(f"{url}/transition", {"to": "under_review"})
    api(registrar).post(f"{url}/transition", {"to": "eligible"})
    config = SystemSettings.load()
    config.delegate_decisions_to_registrars = True
    config.save()
    with django_capture_on_commit_callbacks(execute=True):
        assert (
            api(registrar).post(f"{url}/transition", {"to": "waitlisted"}).data["status"]
            == "waitlisted"
        )
    assert client.post(f"/api/visitor/applications/{app_id}/withdraw").data["status"] == "withdrawn"
    assert client.post(f"/api/visitor/applications/{app_id}/withdraw").status_code == 409
    # Expiry: a submitted application of a long-closed cycle expires.
    second = visitor(django_capture_on_commit_callbacks, email="late@example.test")
    late = second.post("/api/visitor/applications", {"intake": intake.pk}).data["public_id"]
    _complete(second, late)
    with django_capture_on_commit_callbacks(execute=True):
        second.post(f"/api/visitor/applications/{late}/submit")
    AdmissionCycle.objects.update(
        closes_at=timezone.now() - timedelta(days=31), opens_at=timezone.now() - timedelta(days=60)
    )
    assert expire_closed() == 1
    assert (
        api()
        .get(f"/api/public/applications/{Application.objects.get(public_id=late).reference_no}")
        .data["status"]
        == "expired"
    )


def test_templates_freeze_on_publish(api, make_user, it_dept, db):
    head = make_user(Role.HEAD_REGISTRAR)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    bad = {
        "name": "hs",
        "schema": {"steps": [{"sections": [{"fields": [{"key": "Bad Key", "type": "nope"}]}]}]},
    }
    assert api(head).post("/api/v1/form-templates", bad, format="json").status_code == 400
    assert (
        api(registrar)
        .post("/api/v1/form-templates", {"name": "hs", "schema": SCHEMA}, format="json")
        .status_code
        == 403
    )
    assert api(registrar).get("/api/v1/form-templates").status_code == 200  # registrars read
    created = (
        api(head)
        .post("/api/v1/form-templates", {"name": "hs", "schema": SCHEMA}, format="json")
        .data
    )
    url = f"/api/v1/form-templates/{created['id']}"
    assert api(head).post(f"{url}/publish").data["status"] == "published"
    assert api(head).patch(url, {"schema": SCHEMA}, format="json").status_code == 409
    draft = api(head).post(f"{url}/new-version").data
    assert draft["version"] == 2 and draft["status"] == "draft"


def test_visitor_sees_inquiry_replies_and_answers(
    api, make_user, django_capture_on_commit_callbacks, db
):
    from inquiries import services as inquiry_services
    from inquiries.models import InquiryMessage

    with django_capture_on_commit_callbacks(execute=True):
        inquiry = inquiry_services.submit(
            name="مريم",
            email="applicant@example.test",
            phone="",
            type="general",
            department=None,
            subject="سؤال",
            message="متى؟",
        )
    InquiryMessage.objects.create(
        inquiry=inquiry, author=make_user(Role.SITE_MANAGER), channel="internal", body="سر"
    )
    client = visitor(django_capture_on_commit_callbacks)
    mine = client.get("/api/visitor/me").data["inquiries"]
    assert mine[0]["reference_no"] == inquiry.reference_no and mine[0]["messages"] == []
    assert (
        client.post(
            f"/api/visitor/inquiries/{inquiry.public_id}/messages", {"body": "شكرًا"}
        ).status_code
        == 201
    )


def test_claim_and_assign(
    api, intake, make_user, it_dept, ba_dept, django_capture_on_commit_callbacks
):
    client = visitor(django_capture_on_commit_callbacks)
    app_id = client.post("/api/visitor/applications", {"intake": intake.pk}).data["public_id"]
    _complete(client, app_id)
    with django_capture_on_commit_callbacks(execute=True):
        client.post(f"/api/visitor/applications/{app_id}/submit")
    head = make_user(Role.HEAD_REGISTRAR)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    ba_registrar = make_user(Role.REGISTRAR, department=ba_dept)
    url = f"/api/v1/applications/{app_id}"
    assert (
        api(registrar).post(f"{url}/assign", {"registrar": str(registrar.public_id)}).status_code
        == 403
    )
    assert (
        api(head).post(f"{url}/assign", {"registrar": str(ba_registrar.public_id)}).status_code
        == 400
    )
    assert (
        api(registrar).post(f"{url}/claim").data["assigned_registrar_name"]
        == registrar.full_name_ar
    )
    with django_capture_on_commit_callbacks(execute=True):
        api(registrar).post(f"{url}/messages", {"body": "أرسل صورة أوضح", "channel": "email"})
        api(registrar).post(f"{url}/messages", {"body": "ملاحظة", "channel": "internal"})
    seen = client.get(f"/api/visitor/applications/{app_id}").data["messages"]
    assert [m["body"] for m in seen] == ["أرسل صورة أوضح"]
    assert (
        client.post(f"/api/visitor/applications/{app_id}/messages", {"body": "حسنًا"}).status_code
        == 201
    )
    summary = api(head).get("/api/v1/applications/summary").data
    assert summary["by_status"] == {"submitted": 1}
