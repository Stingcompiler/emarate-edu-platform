"""QA probes, review 2026-11-10 axis 1.1 (rest): the university number's letter case, and
impersonation reports. Each test EXPECTS THE FAULTY BEHAVIOUR: a pass means the defect is
reproduced. (probe.sh runs only backend_probes.py: these are appended there for the run.)"""

from django.core import mail

from accounts.rbac import Role
from accounts.tests.test_registration import DETAILS, REPORT, START, _register
from notifications.models import Notification
from students.models import StudentRecord
from students.tests.test_importer import URL as IMPORTS
from students.tests.test_importer import _csv, _upload


def test_probe_r78_an_import_adds_the_same_number_in_lower_case(api, make_user, it_program):
    """The add form upper-cases the number; the import does not, and looks for an existing
    record by the exact text: «26-it-0001» becomes a second record beside «26-IT-0001»."""
    StudentRecord.objects.create(
        program=it_program, university_number="26-IT-0001", full_name_ar="أحمد", level=1
    )
    head = api(make_user(Role.HEAD_REGISTRAR))
    batch = _upload(
        head,
        _csv("الرقم الجامعي,الاسم,رمز البرنامج,المستوى", "26-it-0001,أحمد محمد,BIT,1"),
    ).data
    assert batch["summary"]["create"] == 1, batch["summary"]
    assert head.post(f"{IMPORTS}/{batch['public_id']}/commit").status_code == 200
    numbers = sorted(StudentRecord.objects.values_list("university_number", flat=True))
    assert numbers == ["26-IT-0001", "26-it-0001"]


def test_probe_r79_registration_does_not_find_a_number_typed_in_lower_case(
    api, django_capture_on_commit_callbacks, it_program
):
    """A student who types their number in lower case gets the «no match» answer and no code,
    though number, programme and name are theirs."""
    StudentRecord.objects.create(
        program=it_program,
        university_number="26-IT-0001",
        full_name_ar="أحمد محمد علي",
        level=1,
    )
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        sent = api().post(
            START,
            {
                "university_number": "26-it-0001",
                "full_name": "أحمد محمد علي",
                "program": "BIT",
                "email": "ahmed@me.test",
            },
        )
    assert sent.status_code == 200
    assert mail.outbox == []


def test_probe_r80_every_report_on_an_account_notifies_its_approvers(
    api, django_capture_on_commit_callbacks, make_student, it_program, make_user, it_dept
):
    """A report is kept once per (account, address); each one with another address is a new
    report and a new notification to every approver of the department — twenty an hour from
    one address (the public limit), more from several."""
    make_student(it_program, "26-IT-0001", name="أحمد محمد علي", email="ahmed@college.test")
    _register(api, django_capture_on_commit_callbacks, "classmate@gmail.test")
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    with django_capture_on_commit_callbacks(execute=True):
        for n in range(5):
            assert api().post(REPORT, {**DETAILS, "email": f"r{n}@x.test"}).status_code == 201
    titles = Notification.objects.filter(
        recipients__user=manager, title="بلاغ انتحال على حساب طالب"
    ).count()
    assert titles == 5
