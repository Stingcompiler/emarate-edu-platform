"""Student self-registration: record match → OTP → password → (approval)."""

import pytest
from django.core import mail

from accounts.models import RegistrationRequest, User
from accounts.rbac import Role
from conftest import PASSWORD, last_code
from organization.models import SystemSettings

START = "/api/public/registration/start"
VERIFY = "/api/public/registration/verify"
COMPLETE = "/api/public/registration/complete"
LOGIN = "/api/v1/auth/login"


@pytest.fixture
def student(make_student, it_program):
    return make_student(it_program, "26-IT-0001", name="أحمد محمد علي", email="ahmed@college.test")


def _start(api, capture, number, name, email, program="BIT"):
    with capture(execute=True):
        response = api().post(
            START,
            {"university_number": number, "full_name": name, "program": program, "email": email},
        )
    assert response.status_code == 200
    return response.data["request_id"]


def _register(api, capture, email, name="احمد محمد علي"):
    request_id = _start(api, capture, "26-IT-0001", name, email)
    assert api().post(VERIFY, {"request_id": request_id, "code": last_code()}).status_code == 200
    with capture(execute=True):
        response = api().post(COMPLETE, {"request_id": request_id, "password": PASSWORD})
    assert response.status_code == 201, response.data
    return str(request_id), response.data["status"]


def test_unknown_details_get_the_same_answer_and_no_email(
    api, django_capture_on_commit_callbacks, student
):
    def start(number, name, email, program="BIT"):
        body = {"university_number": number, "full_name": name, "program": program}
        return api().post(START, {**body, "email": email})

    with django_capture_on_commit_callbacks(execute=True):
        real = start("26-IT-0001", "أحمد محمد علي", "a@x.test")
        fake = start("99-XX-0000", "لا أحد", "b@x.test")
        wrong_name = start("26-IT-0001", "سارة عمر", "c@x.test")
        # The programme is checked too (owner, 2026-11-07).
        wrong_program = start("26-IT-0001", "أحمد محمد علي", "d@x.test", program="BBA")
    responses = [real, fake, wrong_name, wrong_program]
    assert {r.status_code for r in responses} == {200}
    assert len({r.data["detail"] for r in responses}) == 1
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["a@x.test"]


def test_the_programme_is_required(api, student):
    body = {"university_number": "26-IT-0001", "full_name": "أحمد محمد علي", "email": "a@x.test"}
    response = api().post(START, body)
    assert response.status_code == 400
    assert "program" in str(response.data)


def test_the_name_may_be_typed_as_in_the_record_in_english(
    api, django_capture_on_commit_callbacks, student
):
    student.full_name_en = "Ahmed Mohamed Ali"
    student.save()
    _start(api, django_capture_on_commit_callbacks, "26-IT-0001", "ahmed  mohamed ali", "a@x.test")
    assert mail.outbox[-1].to == ["a@x.test"]


def test_an_account_with_another_email_alerts_the_official_address(
    api, django_capture_on_commit_callbacks, student
):
    _register(api, django_capture_on_commit_callbacks, "someone@gmail.test")
    alert = next(m for m in mail.outbox if m.to == ["ahmed@college.test"])
    assert "so***@gmail.test" in alert.body and "someone@" not in alert.body
    assert "/register" in alert.body


def test_the_official_address_is_not_alerted_when_it_registers(
    api, django_capture_on_commit_callbacks, student
):
    _register(api, django_capture_on_commit_callbacks, "ahmed@college.test")
    assert all("أُنشئ حساب" not in m.subject for m in mail.outbox)


def test_fake_request_can_never_be_verified(api, django_capture_on_commit_callbacks, db):
    request_id = _start(api, django_capture_on_commit_callbacks, "99-XX-0000", "لا أحد", "b@x.test")
    response = api().post(VERIFY, {"request_id": request_id, "code": "123456"})
    assert response.status_code == 400


def test_official_email_activates_immediately(api, django_capture_on_commit_callbacks, student):
    _, status = _register(api, django_capture_on_commit_callbacks, "Ahmed@College.test")
    assert status == "active"
    user = User.objects.get(email="ahmed@college.test")
    assert user.is_active
    assert user.role_assignments.filter(role=Role.STUDENT).exists()
    student.refresh_from_db()
    assert student.user == user
    # Signs in with the university number too.
    response = api().post(LOGIN, {"identifier": "26-it-0001", "password": PASSWORD})
    assert response.status_code == 200
    assert response.data["student"]["university_number"] == "26-IT-0001"


def test_other_email_waits_for_the_department(
    api, django_capture_on_commit_callbacks, student, make_user, it_dept, ba_dept
):
    request_id, status = _register(api, django_capture_on_commit_callbacks, "me@gmail.test")
    assert status == "pending_approval"
    pending = api().post(LOGIN, {"identifier": "me@gmail.test", "password": PASSWORD})
    assert pending.status_code == 403
    assert pending.data["code"] == "pending_approval"

    other_manager = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    url = f"/api/v1/registration-requests/{request_id}"
    assert api(other_manager).get(url).status_code == 404

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    listing = api(manager).get("/api/v1/registration-requests")
    assert [r["public_id"] for r in listing.data["results"]] == [request_id]
    with django_capture_on_commit_callbacks(execute=True):
        decided = api(manager).post(f"{url}/decide", {"approve": True})
    assert decided.status_code == 200
    assert "اعتُمد" in mail.outbox[-1].body
    assert (
        api().post(LOGIN, {"identifier": "me@gmail.test", "password": PASSWORD}).status_code == 200
    )

    again = api(manager).post(f"{url}/decide", {"approve": True})
    assert again.status_code == 409


def test_rejection_frees_the_record(api, django_capture_on_commit_callbacks, student, make_user):
    request_id, _ = _register(api, django_capture_on_commit_callbacks, "me@gmail.test")
    head = make_user(Role.HEAD_REGISTRAR)
    response = api(head).post(
        f"/api/v1/registration-requests/{request_id}/decide",
        {"approve": False, "reason": "الاسم لا يطابق"},
    )
    assert response.status_code == 200
    assert not User.objects.filter(email="me@gmail.test").exists()
    student.refresh_from_db()
    assert student.user is None
    # The student can register again.
    _, status = _register(api, django_capture_on_commit_callbacks, "ahmed@college.test")
    assert status == "active"


def test_approval_switch_off_activates_everyone(api, django_capture_on_commit_callbacks, student):
    config = SystemSettings.load()
    config.student_registration_requires_approval = False
    config.save()
    _, status = _register(api, django_capture_on_commit_callbacks, "me@gmail.test")
    assert status == "active"


def test_wrong_codes_lock_the_request(api, django_capture_on_commit_callbacks, student):
    request_id = _start(
        api, django_capture_on_commit_callbacks, "26-IT-0001", "أحمد محمد علي", "a@x.test"
    )
    real = last_code()
    wrong = "000000" if real != "000000" else "111111"
    statuses = [
        api().post(VERIFY, {"request_id": request_id, "code": wrong}).status_code
        for _ in range(SystemSettings.load().otp_max_attempts)
    ]
    assert statuses[:-1] == [400] * (len(statuses) - 1)
    assert statuses[-1] == 429
    assert api().post(VERIFY, {"request_id": request_id, "code": real}).status_code == 429


def test_cannot_complete_before_verifying(api, django_capture_on_commit_callbacks, student):
    request_id = _start(
        api, django_capture_on_commit_callbacks, "26-IT-0001", "أحمد محمد علي", "a@x.test"
    )
    response = api().post(COMPLETE, {"request_id": request_id, "password": PASSWORD})
    assert response.status_code == 400
    assert RegistrationRequest.objects.get(public_id=request_id).status == "otp_pending"


def test_registered_student_cannot_register_twice(api, django_capture_on_commit_callbacks, student):
    _register(api, django_capture_on_commit_callbacks, "ahmed@college.test")
    mail.outbox.clear()
    body = {"university_number": "26-IT-0001", "full_name": "أحمد محمد علي", "program": "BIT"}
    response = api().post(START, {**body, "email": "new@x.test"})
    assert response.status_code == 409
    assert response.data["code"] == "already_registered"
    assert mail.outbox == []


REPORT = "/api/public/registration/report"
REPORTS = "/api/v1/identity-reports"
DETAILS = {"university_number": "26-IT-0001", "full_name": "أحمد محمد علي", "program": "BIT"}


def test_a_stolen_record_is_reported_and_freed(
    api, django_capture_on_commit_callbacks, student, make_user, it_dept, ba_dept
):
    """Owner, 2026-11-07: a classmate registers on someone else's record; its student reports
    it and the department disables that account, so the student can register."""
    config = SystemSettings.load()
    config.student_registration_requires_approval = False
    config.save()
    _register(api, django_capture_on_commit_callbacks, "classmate@gmail.test")
    impostor = User.objects.get(email="classmate@gmail.test")
    assert impostor.is_active
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)

    with django_capture_on_commit_callbacks(execute=True):
        sent = api().post(REPORT, {**DETAILS, "email": "ahmed@me.test", "note": "ليس حسابي"})
        api().post(REPORT, {**DETAILS, "email": "ahmed@me.test"})  # sent twice
    assert sent.status_code == 201
    listing = api(manager).get(REPORTS, {"status": "open"})
    assert listing.data["count"] == 1
    row = listing.data["results"][0]
    assert row["account_email"] == "classmate@gmail.test"
    assert row["contact_email"] == "ahmed@me.test" and row["note"] == "ليس حسابي"
    notified = api(manager).get("/api/v1/notifications").data["results"]
    assert notified[0]["title"] == "بلاغ انتحال على حساب طالب"

    url = f"{REPORTS}/{row['public_id']}"
    other_manager = make_user(Role.DEPARTMENT_MANAGER, department=ba_dept)
    assert api(other_manager).get(url).status_code == 404
    assert api(other_manager).post(f"{url}/decide", {"uphold": True}).status_code == 404

    with django_capture_on_commit_callbacks(execute=True):
        decided = api(manager).post(f"{url}/decide", {"uphold": True})
    assert decided.status_code == 200 and decided.data["status"] == "upheld"
    assert mail.outbox[-1].to == ["ahmed@me.test"] and "/register" in mail.outbox[-1].body
    impostor.refresh_from_db()
    student.refresh_from_db()
    assert not impostor.is_active and student.user is None
    assert not impostor.role_assignments.filter(role=Role.STUDENT).exists()
    assert (
        api().post(LOGIN, {"identifier": "classmate@gmail.test", "password": PASSWORD}).status_code
        != 200
    )
    assert api(manager).post(f"{url}/decide", {"uphold": True}).status_code == 409

    _, status = _register(api, django_capture_on_commit_callbacks, "ahmed@college.test")
    assert status == "active"


def test_a_report_is_dismissed_with_a_reason(
    api, django_capture_on_commit_callbacks, student, make_user
):
    _register(api, django_capture_on_commit_callbacks, "me@gmail.test")
    head = make_user(Role.HEAD_REGISTRAR)
    api().post(REPORT, {**DETAILS, "email": "other@x.test"})
    url = f"{REPORTS}/{api(head).get(REPORTS).data['results'][0]['public_id']}"
    assert api(head).post(f"{url}/decide", {"uphold": False}).status_code == 400
    with django_capture_on_commit_callbacks(execute=True):
        decided = api(head).post(f"{url}/decide", {"uphold": False, "reason": "تحققنا منه حضوريًا"})
    assert decided.data["status"] == "dismissed"
    assert "تحققنا منه حضوريًا" in mail.outbox[-1].body
    student.refresh_from_db()
    assert student.user.email == "me@gmail.test"


def test_a_report_needs_details_of_an_existing_account(api, student):
    response = api().post(REPORT, {**DETAILS, "email": "a@x.test"})
    assert response.status_code == 400
    wrong = api().post(REPORT, {**DETAILS, "program": "BBA", "email": "a@x.test"})
    assert wrong.status_code == 400


def test_students_and_teachers_cannot_read_reports(api, make_user):
    for role in (Role.STUDENT, Role.TEACHER):
        assert api(make_user(role)).get(REPORTS).status_code == 403


def test_a_stale_rejection_cannot_delete_an_approved_account(make_user, make_student, it_program):
    """Review 2026-10-08 R02: a rejection decided on a page read before the approval gets 409;
    the approved account stays."""
    from accounts import services
    from audit.services import RequestMeta
    from core.errors import Conflict

    manager = make_user(Role.HEAD_REGISTRAR)
    pending = make_user(is_active=False)
    record_ = make_student(it_program, "R02-0001", user=pending)
    request = RegistrationRequest.objects.create(
        student_record=record_, email=pending.email, status="pending_approval"
    )
    stale = RegistrationRequest.objects.select_related("student_record__user").get(pk=request.pk)
    services.decide_registration(RequestMeta(actor=manager), request, True)
    with pytest.raises(Conflict):
        services.decide_registration(RequestMeta(actor=manager), stale, False, "رفض متأخر")
    pending.refresh_from_db()
    record_.refresh_from_db()
    assert pending.is_active and record_.user_id == pending.pk
    assert RegistrationRequest.objects.get(pk=request.pk).status == "approved"


# ─── Review 2026-11-08 ────────────────────────────────────────────────────


def test_a_paused_programmes_students_still_register(
    api, django_capture_on_commit_callbacks, student, it_program, make_user, it_dept
):
    from organization.models import Program

    it_program.is_active = False
    it_program.save()
    empty = Program.objects.create(
        department=it_dept,
        code="OLD",
        name_ar="برنامج متوقف بلا طلاب",
        degree=Program.Degree.DIPLOMA,
        levels_count=2,
        duration_terms=4,
        is_active=False,
    )
    codes = [p["code"] for p in api().get("/api/public/registration/programs").data]
    assert "BIT" in codes and empty.code not in codes
    _, status = _register(api, django_capture_on_commit_callbacks, "ahmed@college.test")
    assert status == "active"


def test_an_own_pending_account_is_named_as_waiting(
    api, django_capture_on_commit_callbacks, student
):
    _register(api, django_capture_on_commit_callbacks, "me@gmail.test")
    response = api().post(START, {**DETAILS, "email": "me@gmail.test"})
    assert response.status_code == 409 and response.data["code"] == "pending_approval"


def test_upholding_closes_the_impostors_pending_registration(
    api, django_capture_on_commit_callbacks, student, make_user, it_dept
):
    impostor_request, status = _register(
        api, django_capture_on_commit_callbacks, "classmate@gmail.test"
    )
    assert status == "pending_approval"
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    api().post(REPORT, {**DETAILS, "email": "real@me.test"})
    report = api(manager).get(REPORTS).data["results"][0]["public_id"]
    assert api(manager).post(f"{REPORTS}/{report}/decide", {"uphold": True}).status_code == 200

    stale = RegistrationRequest.objects.get(public_id=impostor_request)
    assert stale.status == "rejected"
    pending = api(manager).get("/api/v1/registration-requests", {"status": "pending_approval"})
    assert pending.data["count"] == 0

    # The real student registers; an old card approved now would not activate their account.
    _register(api, django_capture_on_commit_callbacks, "real@me.test")
    stale.status = "pending_approval"
    stale.save()
    url = f"/api/v1/registration-requests/{impostor_request}/decide"
    assert api(manager).post(url, {"approve": True}).status_code == 409
    assert not User.objects.get(email="real@me.test").is_active


def test_every_reporter_hears_the_decision(
    api, django_capture_on_commit_callbacks, student, make_user
):
    from audit.models import AuditLog

    _register(api, django_capture_on_commit_callbacks, "classmate@gmail.test")
    head = make_user(Role.HEAD_REGISTRAR)
    api().post(REPORT, {**DETAILS, "email": "one@x.test"})
    api().post(REPORT, {**DETAILS, "email": "two@x.test"})
    first = api(head).get(REPORTS, {"status": "open"}).data["results"][0]["public_id"]
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        api(head).post(f"{REPORTS}/{first}/decide", {"uphold": True})
    assert sorted(m.to[0] for m in mail.outbox) == ["one@x.test", "two@x.test"]
    assert api(head).get(REPORTS, {"status": "open"}).data["count"] == 0
    assert AuditLog.objects.filter(action="registration.identity_upheld").count() == 2
