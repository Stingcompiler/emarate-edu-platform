"""Student-file import: validate → preview → commit (docs/02 D3)."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook

from accounts.rbac import Role
from audit.models import AuditLog
from students.models import StudentImportBatch, StudentRecord

URL = "/api/v1/student-imports"


def _csv(*lines: str, name="students.csv") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, ("\n".join(lines) + "\n").encode("utf-8-sig"), "text/csv")


def _upload(client, file):
    return client.post(URL, {"file": file}, format="multipart")


@pytest.fixture
def head(make_user):
    return make_user(Role.HEAD_REGISTRAR)


def test_preview_then_commit(api, head, it_program):
    file = _csv(
        "الرقم الجامعي,الاسم,رمز البرنامج,المستوى,البريد الإلكتروني,الهاتف,الجنس,الرقم الوطني",
        "26-IT-0001,أحمد  محمد علي,bit,1,Ahmed@X.test,0912345678,ذكر,1234",
        "26-IT-0002,سارة عمر,BIT,9,,,,",
        "26-IT-0003,,BIT,1,,,,",
        "26-IT-0004,منى حسن,NOPE,1,bad-email,,,",
        "26-IT-0001,مكرر,BIT,1,,,,",
    )
    response = _upload(api(head), file)
    assert response.status_code == 201, response.data
    batch = response.data
    assert batch["status"] == "has_errors"
    assert batch["summary"] == {"rows": 5, "create": 1, "update": 0, "skip": 0, "error": 4}
    assert StudentRecord.objects.count() == 0  # nothing written before commit

    rows = api(head).get(f"{URL}/{batch['public_id']}/rows", {"action": "error"}).data["results"]
    errors = {row["row_no"]: " ".join(row["errors"]) for row in rows}
    assert "level" in errors[3]
    assert "full_name_ar" in errors[4]
    assert "program_code" in errors[5] and "email" in errors[5]
    assert "duplicated" in errors[6]

    committed = api(head).post(f"{URL}/{batch['public_id']}/commit")
    assert committed.status_code == 200
    assert committed.data["summary"]["created"] == 1
    record = StudentRecord.objects.get()
    assert record.full_name_ar == "أحمد محمد علي"  # whitespace normalized
    assert record.email == "ahmed@x.test"
    assert record.phone_e164 == "+249912345678"
    assert record.gender == "male"
    assert record.department == it_program.department
    assert record.national_id_hash and "1234" not in record.national_id_hash
    assert AuditLog.objects.filter(action="students.import_commit").exists()

    again = api(head).post(f"{URL}/{batch['public_id']}/commit")
    assert again.status_code == 409


def test_update_shows_changes_and_blank_keeps(api, head, it_program, make_student):
    existing = make_student(
        it_program, "26-IT-0001", name="أحمد محمد", email="old@x.test", status="suspended"
    )
    file = _csv(
        "university_number,full_name_ar,program_code,level,email",
        "26-IT-0001,أحمد محمد,BIT,2,",
        "26-IT-0002,سارة عمر,BIT,1,sara@x.test",
    )
    batch = _upload(api(head), file).data
    assert batch["summary"]["update"] == 1
    rows = api(head).get(f"{URL}/{batch['public_id']}/rows", {"action": "update"}).data["results"]
    assert rows[0]["changes"] == {"level": [1, 2]}
    api(head).post(f"{URL}/{batch['public_id']}/commit")
    existing.refresh_from_db()
    assert existing.level == 2
    assert existing.email == "old@x.test"  # blank cell kept the value
    assert existing.status == "suspended"  # status is never imported


def test_unchanged_rows_are_skipped(api, head, it_program, make_student):
    make_student(it_program, "26-IT-0001", name="أحمد محمد")
    batch = _upload(
        api(head),
        _csv("university_number,full_name_ar,program_code,level", "26-IT-0001,أحمد محمد,BIT,1"),
    ).data
    assert batch["status"] == "validated"
    assert batch["summary"]["skip"] == 1


def test_xlsx_upload(api, head, it_program):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["university_number", "full_name_ar", "program_code", "level", "birth_date"])
    sheet.append(["26-IT-0009", "خالد يوسف", "BIT", 3, "2004-05-01"])
    buffer = io.BytesIO()
    workbook.save(buffer)
    file = SimpleUploadedFile("list.xlsx", buffer.getvalue())
    batch = _upload(api(head), file).data
    assert batch["summary"]["create"] == 1
    api(head).post(f"{URL}/{batch['public_id']}/commit")
    assert StudentRecord.objects.get().birth_date.isoformat() == "2004-05-01"


@pytest.mark.parametrize(
    ("file", "message"),
    [
        (SimpleUploadedFile("x.pdf", b"%PDF"), "Excel"),
        (SimpleUploadedFile("x.csv", b"name,level\nx,1\n"), "Missing required columns"),
        (SimpleUploadedFile("x.csv", "university_number\n".encode("utf-16")), "UTF-8"),
    ],
)
def test_unusable_files_are_rejected(api, head, db, file, message):
    response = _upload(api(head), file)
    assert response.status_code == 400
    assert message in response.data["errors"]["file"][0]
    assert not StudentImportBatch.objects.exists()


def test_reject_closes_the_batch(api, head, it_program):
    batch = _upload(
        api(head),
        _csv("university_number,full_name_ar,program_code,level", "26-IT-0001,أحمد,BIT,1"),
    ).data
    assert api(head).post(f"{URL}/{batch['public_id']}/reject").status_code == 200
    assert api(head).post(f"{URL}/{batch['public_id']}/commit").status_code == 409
    assert not StudentRecord.objects.exists()


@pytest.mark.parametrize(
    "role", [Role.DEPARTMENT_MANAGER, Role.REGISTRAR, Role.STUDENT_AFFAIRS, Role.RESULTS_OFFICER]
)
def test_only_head_registrar_and_admin_import(api, make_user, it_dept, it_program, role):
    user = make_user(role, department=it_dept)
    file = _csv("university_number,full_name_ar,program_code,level", "26-IT-0001,أحمد,BIT,1")
    assert _upload(api(user), file).status_code == 403
