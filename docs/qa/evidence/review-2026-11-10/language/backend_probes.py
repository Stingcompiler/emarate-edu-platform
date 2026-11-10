"""QA probes, review 2026-11-10 axis 8 (server messages in Arabic). Each test EXPECTS THE FAULTY
BEHAVIOUR: a pass means an English sentence reaches the page."""

from datetime import timedelta

from django.utils import timezone

from accounts.rbac import Role
from admissions import services as admissions
from exams import services as exams
from exams.models import Exam, Question
from exams.question_types import REGISTRY

# ─── R85: the exam builder warns the teacher in English ──────────────────────────────────


def test_probe_r85_a_new_exam_warns_in_english(classroom):
    """Every new exam opens with «Add at least one question.» above «نشر» (ExamEditor shows
    /problems as is); a true/false or fill-in question without its answer adds «Question 1: Set
    the correct answer.»."""
    now = timezone.now()
    exam = Exam.objects.create(
        offering=classroom.offering,
        title="اختبار",
        opens_at=now,
        closes_at=now + timedelta(hours=1),
        duration_minutes=90,
        pass_marks=5,
        created_by=classroom.teacher,
    )
    assert "Add at least one question." in exams.problems(exam)
    Question.objects.create(exam=exam, type="true_false", text="س", marks=1, config={})
    found = exams.problems(exam)
    assert "Question 1: Set the correct answer." in found
    assert "The pass mark is above the total marks." in found
    assert "The attempt is longer than the window." in found


def test_probe_r85_a_bad_answer_is_refused_in_english():
    """An answer of the wrong shape (an old tab, a changed question) comes back as «Pick one of
    the choices.» under the question."""
    q = Question(type="true_false", config={"answer": True})
    try:
        REGISTRY["true_false"].clean_answer(q, "yes")
    except ValueError as error:
        assert str(error) == "Answer true or false."


# ─── R86: the applicant is told what is missing in English ───────────────────────────────

SCHEMA = {
    "steps": [
        {
            "title": "بيانات",
            "sections": [
                {
                    "title": "عام",
                    "fields": [
                        {"key": "score", "type": "number", "label": "النسبة", "max": 100},
                        {"key": "cert", "type": "file", "label": "الشهادة", "required": True},
                        {"key": "mobile", "type": "phone", "label": "الهاتف"},
                    ],
                }
            ],
        }
    ]
}


def test_probe_r86_the_applicant_reads_english_beside_the_fields():
    """«تقديم» on /apply puts the server's message beside each field (Apply.tsx, spec §6): the
    visitor reads «Upload this document.», «Out of range.», «Invalid phone number.»."""
    errors = admissions.validate_answers(SCHEMA, {"score": "120", "mobile": "x"}, set())
    assert errors == {
        "score": "Out of range.",
        "cert": "Upload this document.",
        "mobile": "Invalid phone number.",
    }


# ─── R87: a second press on «اعتماد» or «نشر» answers in English ──────────────────────────


def test_probe_r87_a_closed_batch_answers_in_english(api, make_user, it_dept, it_program):
    """Two people (or two tabs) press «اعتماد» on the same import: the second sees «This batch
    was already committed or rejected.»; unpublishing a result batch that is not published
    answers «Not published.»."""
    from students.tests.test_importer import URL, _csv, _upload

    head = make_user(Role.HEAD_REGISTRAR)
    batch = _upload(
        api(head),
        _csv("university_number,full_name_ar,program_code,level", "26-IT-0001,أحمد,BIT,1"),
    ).data
    assert api(head).post(f"{URL}/{batch['public_id']}/reject").status_code == 200
    again = api(head).post(f"{URL}/{batch['public_id']}/commit")
    assert again.status_code == 409
    assert again.data["detail"] == "This batch was already committed or rejected."
