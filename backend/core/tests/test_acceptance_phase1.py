"""Phase 1 acceptance (docs/02 §8): the whole student journey through the API.

Head registrar imports the college file → the student registers with an OTP
using a personal email → the department manager approves → the student signs
in and sees this term's courses.
"""

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.rbac import Role
from audit.models import AuditLog
from conftest import PASSWORD, last_code


def test_import_register_approve_and_see_courses(
    make_user,
    api,
    it_dept,
    it_program,
    term,
    it_offering,
    ba_offering,
    django_capture_on_commit_callbacks,
):
    head = make_user(Role.HEAD_REGISTRAR)
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)

    # 1. The head registrar imports the college file.
    csv = "الرقم الجامعي,الاسم,رمز البرنامج,المستوى,البريد الإلكتروني\n"
    csv += "26-IT-0042,مريم عثمان الطيب,BIT,1,mariam@college.test\n"
    upload = api(head).post(
        "/api/v1/student-imports",
        {"file": SimpleUploadedFile("list.csv", csv.encode())},
        format="multipart",
    )
    assert upload.status_code == 201, upload.data
    batch = upload.data["public_id"]
    assert api(head).post(f"/api/v1/student-imports/{batch}/commit").status_code == 200

    # 2. The manager enrolls level 1 of the program for this term.
    bulk = api(manager).post(
        "/api/v1/enrollments/bulk", {"term": term.pk, "program": it_program.pk, "level": 1}
    )
    assert bulk.data["created"] == 1

    # 3. The student registers with a personal email (→ needs approval).
    visitor = APIClient()
    with django_capture_on_commit_callbacks(execute=True):
        start = visitor.post(
            "/api/public/registration/start",
            {
                "university_number": "26-IT-0042",
                "full_name": "مريم عثمان الطيب",
                "email": "mariam@gmail.test",
            },
        )
    request_id = start.data["request_id"]
    verify = visitor.post(
        "/api/public/registration/verify", {"request_id": request_id, "code": last_code()}
    )
    assert verify.status_code == 200
    with django_capture_on_commit_callbacks(execute=True):
        complete = visitor.post(
            "/api/public/registration/complete", {"request_id": request_id, "password": PASSWORD}
        )
    assert complete.data == {"status": "pending_approval"}

    # 4. The department manager approves.
    pending = api(manager).get("/api/v1/registration-requests", {"status": "pending_approval"})
    assert pending.data["count"] == 1
    with django_capture_on_commit_callbacks(execute=True):
        decided = api(manager).post(
            f"/api/v1/registration-requests/{request_id}/decide", {"approve": True}
        )
    assert decided.data["status"] == "approved"

    # 5. The student signs in (with the university number) and sees the term's courses.
    student = APIClient()
    login = student.post("/api/v1/auth/login", {"identifier": "26-IT-0042", "password": PASSWORD})
    assert login.status_code == 200
    assert [r["role"] for r in login.data["roles"]] == ["student"]
    courses = student.get("/api/v1/me/courses").data
    assert [(c["code"], c["my_role"]) for c in courses] == [("IT101", "student")]

    # Every step left an audit trail.
    actions = set(AuditLog.objects.values_list("action", flat=True))
    assert {
        "students.import_commit",
        "enrollment.bulk",
        "registration.complete",
        "registration.approve",
    } <= actions
