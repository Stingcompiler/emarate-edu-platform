"""QA probe, review 2026-11-10 §3 (the results journey). EXPECTS THE FAULTY BEHAVIOUR: a pass
means the defect is reproduced."""

from accounts.rbac import Role
from admissions.tests.test_admissions import intake  # noqa: F401
from conftest import csv_upload

URL = "/api/v1/result-imports"
HEADER = "الرقم الجامعي,رمز المقرر,الدرجة,التقدير,الحالة"


def test_probe_r90_a_results_file_in_lower_case_finds_no_student(api, make_user, classroom, term):
    """The students import reads «26-it-0100» as «26-IT-0100» since R78; the results import
    does not: the row is refused «لا يوجد طالب» though the student is enrolled."""
    officer = make_user(Role.RESULTS_OFFICER)
    body = {"file": csv_upload("r.csv", HEADER, "26-it-0100,IT101,91,,"), "term": term.pk}
    batch = api(officer).post(URL, body, format="multipart").data
    assert batch["summary"]["error"] == 1
    rows = api(officer).get(f"{URL}/{batch['public_id']}/rows", {"action": "error"}).data
    assert "لا يوجد طالب" in " ".join(rows["results"][0]["errors"])


def test_probe_r90_a_number_typed_in_lower_case_at_admission_is_a_second_number(
    api, intake, make_user, it_dept
):
    """The registration staff type «26-it-5000» on an application while another holds
    «26-IT-5000»: accepted, and registering it makes a record beside the other's."""
    from admissions.tests.test_form_review_2026_11 import (
        NUMBER,
        PATH,
        _application,
        _default,
        _form,
        _staff,
    )

    head, registrar = make_user(Role.HEAD_REGISTRAR), make_user(Role.REGISTRAR, department=it_dept)
    _default(head, _form(PATH, NUMBER))
    one = _application(intake, email="one@example.test")
    two = _application(intake, email="two@example.test")
    assert _staff(api, registrar, one, {"university_number": "26-IT-5000"}).status_code == 200
    assert _staff(api, registrar, two, {"university_number": "26-it-5000"}).status_code == 200


def test_probe_r90_the_transcript_address_in_lower_case_is_not_found(api, make_user, classroom):
    """«/print/transcript/26-it-0100» (a typed address) answers 404 for an existing student."""
    officer = make_user(Role.RESULTS_OFFICER)
    assert api(officer).get("/api/v1/transcripts/26-IT-0100").status_code == 200
    assert api(officer).get("/api/v1/transcripts/26-it-0100").status_code == 404
