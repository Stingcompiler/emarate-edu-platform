"""QA probes, review 2026-11-10 axis 1.1 (a student's identity: registration, impersonation
reports, the graduate's account move). Each test EXPECTS THE FAULTY BEHAVIOUR: a pass means
the defect is reproduced. When a defect is fixed its probe fails and is turned into a regular
test asserting the right behaviour."""

from accounts.models import RegistrationRequest, User
from accounts.rbac import Role
from accounts.tests.test_registration import (  # noqa: F401  (fixtures by name)
    COMPLETE,
    DETAILS,
    NEW_PASSWORD,
    REPORT,
    REPORTS,
    START,
    VERIFY,
    _on_masters,
    _register,
    _start,
    last_code,
    masters,
    student,
)
from organization.models import Program
from students.models import StudentRecord

REQUESTS = "/api/v1/registration-requests"


def _graduate_with_a_pending_move(api, capture, student, masters):
    """The bachelor's account, graduated, asks to move to a master's record whose file has no
    official email: the move waits for the department."""
    StudentRecord.objects.filter(pk=masters.pk).update(email="")
    _register(api, capture, "ahmed@college.test")
    StudentRecord.objects.filter(pk=student.pk).update(status=StudentRecord.Status.GRADUATED)
    pending = _on_masters(api, capture, "ahmed@college.test")
    assert pending.data["status"] == "pending_approval"
    return User.objects.get(email="ahmed@college.test")


def _card(api, manager, number="27-IT-M-0001"):
    cards = api(manager).get(REQUESTS).data["results"]
    return next(c for c in cards if c["university_number"] == number and c["moves_account"])


# ─── R57: a second account lands on a record whose move is waiting ────────────────────────


def test_probe_r57_a_verified_request_completes_over_a_pending_move(
    api, django_capture_on_commit_callbacks, student, masters, make_user, it_dept
):
    """start_registration refuses a record with a pending move, but a request that was started
    and verified BEFORE the move went pending still completes: complete_registration only looks
    at record.user, which a pending move leaves empty. The record gets a second account, and
    the move card can then be neither approved nor rejected (R58)."""
    capture = django_capture_on_commit_callbacks
    StudentRecord.objects.filter(pk=masters.pk).update(email="")
    # A classmate who knows the number, the programme and the name starts first.
    early = _start(api, capture, "27-IT-M-0001", "أحمد محمد علي", "other@gmail.test", "MIT")
    assert api().post(VERIFY, {"request_id": early, "code": last_code()}).status_code == 200
    # The graduate's move goes pending.
    _register(api, capture, "ahmed@college.test")
    graduate = User.objects.get(email="ahmed@college.test")
    StudentRecord.objects.filter(pk=student.pk).update(status=StudentRecord.Status.GRADUATED)
    assert _on_masters(api, capture, "ahmed@college.test").data["status"] == "pending_approval"
    # The earlier request completes all the same.
    with capture(execute=True):
        late = api().post(COMPLETE, {"request_id": early, "password": NEW_PASSWORD})
    assert late.status_code == 201, late.data
    masters.refresh_from_db()
    assert masters.user is not None and masters.user != graduate
    assert masters.user.email == "other@gmail.test"

    # R58: the graduate's card is now stuck — approve and reject both answer 409, for good.
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    url = f"{REQUESTS}/{_card(api, manager)['public_id']}/decide"
    assert api(manager).post(url, {"approve": True}).status_code == 409
    assert api(manager).post(url, {"approve": False, "reason": "x"}).status_code == 409
    assert RegistrationRequest.objects.filter(
        moves_account=True, status=RegistrationRequest.Status.PENDING_APPROVAL
    ).exists()


# ─── R59: an upheld impersonation report leaves the account's pending move open ───────────


def test_probe_r59_an_upheld_report_leaves_the_pending_move_open(
    api, django_capture_on_commit_callbacks, student, masters, make_user, it_dept
):
    """Upholding a report closes the pending requests of the REPORTED record only. The
    account's move request sits on the master's record, so its card stays: approving it
    answers 409 (the account no longer holds a finished record), and the master's record keeps
    answering «pending approval» to its real student until someone rejects the card by hand."""
    capture = django_capture_on_commit_callbacks
    account = _graduate_with_a_pending_move(api, capture, student, masters)
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    with capture(execute=True):
        sent = api().post(REPORT, {**DETAILS, "email": "real@me.test"})
    assert sent.status_code == 201, sent.data
    report = api(manager).get(REPORTS, {"status": "open"}).data["results"][0]
    with capture(execute=True):
        upheld = api(manager).post(f"{REPORTS}/{report['public_id']}/decide", {"uphold": True})
    assert upheld.status_code == 200
    account.refresh_from_db()
    assert not account.is_active
    # The move request of the disabled account is still waiting …
    card = _card(api, manager)
    # … cannot be approved …
    approve = api(manager).post(f"{REQUESTS}/{card['public_id']}/decide", {"approve": True})
    assert approve.status_code == 409
    # … and keeps the master's record closed to registration.
    blocked = api().post(
        START,
        {
            "university_number": "27-IT-M-0001",
            "full_name": "أحمد محمد علي",
            "program": "MIT",
            "email": "real@me.test",
        },
    )
    assert blocked.status_code == 409 and blocked.data["code"] == "pending_approval"


# ─── R60: one account asks to move to two records ─────────────────────────────────────────


def test_probe_r60_one_account_waits_to_move_to_two_records(
    api, django_capture_on_commit_callbacks, student, masters, make_student, make_user, it_dept
):
    """The pending-move guard is per record. The same graduate account opens a second pending
    move to another new record; once the first is approved the second card answers 409
    «this email is already used by another account» — about the student's own account."""
    capture = django_capture_on_commit_callbacks
    _graduate_with_a_pending_move(api, capture, student, masters)
    second = Program.objects.create(
        department=it_dept,
        code="MIS",
        name_ar="ماجستير نظم المعلومات",
        degree=Program.Degree.MASTER,
        levels_count=2,
        duration_terms=4,
    )
    make_student(second, "27-IS-M-0001", name="أحمد محمد علي")
    again = _start(api, capture, "27-IS-M-0001", "أحمد محمد علي", "ahmed@college.test", "MIS")
    assert api().post(VERIFY, {"request_id": again, "code": last_code()}).status_code == 200
    with capture(execute=True):
        other = api().post(COMPLETE, {"request_id": again, "password": NEW_PASSWORD})
    assert other.status_code == 201 and other.data["status"] == "pending_approval"

    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    first = _card(api, manager, "27-IT-M-0001")["public_id"]
    with capture(execute=True):
        assert api(manager).post(f"{REQUESTS}/{first}/decide", {"approve": True}).status_code == 200
    late = _card(api, manager, "27-IS-M-0001")["public_id"]
    refused = api(manager).post(f"{REQUESTS}/{late}/decide", {"approve": True})
    assert refused.status_code == 409 and refused.data["code"] == "email_taken"


# ─── R61: a stopped programme takes a new student ─────────────────────────────────────────


def test_probe_r61_a_new_student_is_added_to_a_stopped_programme(api, make_user, it_program):
    """The add form lists stopped programmes («موقوف») because existing students stay in
    them; nothing refuses a NEW student there."""
    it_program.is_active = False
    it_program.save(update_fields=["is_active"])
    added = api(make_user(Role.HEAD_REGISTRAR)).post(
        "/api/v1/students",
        {"full_name_ar": "طالب جديد", "program": it_program.pk, "level": 1},
        format="json",
    )
    assert added.status_code == 201, added.data


# ─── R62: deleting the new record un-archives the old one ─────────────────────────────────


def test_probe_r62_deleting_the_new_record_unarchives_the_old_one(
    api, django_capture_on_commit_callbacks, student, masters
):
    """The archive mark is «account_moved_to is not null», and the key is SET_NULL: once the
    master's record is gone (added by mistake, account detached), the bachelor's record is no
    longer archived, and if its status is corrected to active it is offered an account again —
    the case the 2026-11-08 fix meant to close."""
    from django.core import mail

    capture = django_capture_on_commit_callbacks
    _register(api, capture, "ahmed@college.test")
    StudentRecord.objects.filter(pk=student.pk).update(status=StudentRecord.Status.GRADUATED)
    assert _on_masters(api, capture, "ahmed@college.test").data["status"] == "moved"
    StudentRecord.objects.filter(pk=masters.pk).update(user=None)  # e.g. an upheld report
    StudentRecord.objects.filter(pk=masters.pk).delete()
    student.refresh_from_db()
    assert student.account_moved_to_id is None  # the archive mark is gone
    StudentRecord.objects.filter(pk=student.pk).update(status=StudentRecord.Status.ACTIVE)
    mail.outbox.clear()
    _start(api, capture, "26-IT-0001", "أحمد محمد علي", "thief@gmail.test")
    assert len(mail.outbox) == 1  # a code is sent: the record can be claimed
