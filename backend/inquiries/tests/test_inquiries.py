import pytest
from django.core import mail

from accounts.rbac import Role
from inquiries.models import Inquiry

PUBLIC = "/api/public/inquiries"
URL = "/api/v1/inquiries"


def _submit(api, **extra):
    body = {
        "name": "أمل حسن",
        "email": "amal@example.test",
        "phone": "0912345678",
        "type": "general",
        "subject": "مواعيد الدوام",
        "message": "ما مواعيد عمل الكلية؟",
        **extra,
    }
    return api().post(PUBLIC, body, format="json")


@pytest.fixture
def site(make_user):
    return make_user(Role.SITE_MANAGER)


def test_general_inquiry_goes_to_the_site_manager(
    api, site, make_user, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        receipt = _submit(api)
    assert receipt.status_code == 201, receipt.data
    ref = receipt.data["reference_no"]
    assert api().get(f"{PUBLIC}/{ref}").data == {
        "reference_no": ref,
        "status": "new",
        "status_label": "جديد",
    }
    assert (
        api(site)
        .get("/api/v1/notifications")
        .data["results"][0]["title"]
        .startswith("استفسار جديد")
    )
    head = make_user(Role.HEAD_REGISTRAR)
    assert api(head).get(URL).data["count"] == 0
    inquiry = api(site).get(URL).data["results"][0]
    assert inquiry["contact"]["phone_e164"] == "+249912345678"
    url = f"{URL}/{inquiry['public_id']}"
    with django_capture_on_commit_callbacks(execute=True):
        replied = api(site).post(f"{url}/reply", {"body": "من 8 إلى 3.", "channel": "email"})
    assert replied.data["status"] == "in_progress" and replied.data["first_response_at"]
    assert mail.outbox[-1].to == ["amal@example.test"] and ref in mail.outbox[-1].body
    wa = api(site).post(f"{url}/whatsapp", {"body": "مرحبًا أمل"}).data["url"]
    assert wa.startswith("https://wa.me/249912345678?text=")
    assert api(site).post(f"{url}/transition", {"to": "resolved"}).data["status"] == "resolved"
    assert api(site).post(f"{url}/transition", {"to": "waiting_for_user"}).status_code == 409


def test_admission_inquiries_route_to_department_registrars(
    api, site, make_user, it_dept, ba_dept, django_capture_on_commit_callbacks
):
    it_registrar = make_user(Role.REGISTRAR, department=it_dept)
    ba_registrar = make_user(Role.REGISTRAR, department=ba_dept)
    head = make_user(Role.HEAD_REGISTRAR)
    with django_capture_on_commit_callbacks(execute=True):
        _submit(api, type="admission", department=it_dept.pk, subject="شروط القبول")
    assert api(it_registrar).get(URL).data["count"] == 1
    assert api(ba_registrar).get(URL).data["count"] == 0
    assert api(head).get(URL).data["count"] == 1
    inquiry = Inquiry.objects.get()
    url = f"{URL}/{inquiry.public_id}"
    assert api(ba_registrar).post(f"{url}/reply", {"body": "x"}).status_code == 404
    assert (
        api(site).post(f"{url}/reply", {"body": "x"}).status_code == 403
    )  # site manager reads, reroutes, not answers
    assert (
        api(it_registrar)
        .post(f"{url}/reply", {"body": "الشروط…", "channel": "internal"})
        .status_code
        == 200
    )
    with django_capture_on_commit_callbacks(execute=True):
        rerouted = api(site).post(f"{url}/reroute", {"type": "admission", "department": ba_dept.pk})
    assert rerouted.status_code == 200
    assert api(ba_registrar).get(URL).data["count"] == 1
    assert api(it_registrar).get(URL).data["count"] == 0


def test_contact_matching_and_validation(api, django_capture_on_commit_callbacks, db):
    with django_capture_on_commit_callbacks(execute=True):
        _submit(api)
        _submit(api, name="اسم مختلف", email="AMAL@example.test", phone="")
    assert Inquiry.objects.values("contact").distinct().count() == 1
    assert _submit(api, email="", phone="").status_code == 400
    assert _submit(api, phone="123").status_code == 400
    bot = _submit(api, website="spam")
    assert bot.status_code == 201 and Inquiry.objects.count() == 2  # nothing stored for bots
    assert api().get(f"{PUBLIC}/INQ-00-NOPE").status_code == 404


def test_assign_only_to_handlers(api, site, make_user, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        _submit(api)
    inquiry = Inquiry.objects.get()
    url = f"{URL}/{inquiry.public_id}/assign"
    teacher = make_user(Role.TEACHER)
    assert api(site).post(url, {"user": str(teacher.public_id)}).status_code == 400
    colleague = make_user(Role.SITE_MANAGER)
    assert (
        api(site).post(url, {"user": str(colleague.public_id)}).data["assigned_to_name"]
        == colleague.full_name_ar
    )
