"""Review 2026-11-10, axis 8: what the server says reaches the page in Arabic. R85 (the exam
builder warned in English), R86 (the applicant read English beside the fields), R87 (a second
«اعتماد» on an import answered in English)."""

import ast
import re
from datetime import timedelta
from pathlib import Path

from django.utils import timezone

from accounts.rbac import Role
from admissions import services as admissions
from exams import services as exams
from exams.models import Exam, Question
from exams.question_types import REGISTRY

BACKEND = Path(__file__).resolve().parents[2]
SENTENCE = re.compile(r"^[A-Z][a-z]+(?: [^ ]+)*[.!?]$")
TRANSLATED = {"gettext", "_", "gettext_lazy", "ngettext", "pgettext", "gettext_noop"}
# Errors a person never reads on a page: programming errors and the operator's own tools.
FOR_DEVELOPERS = {"TypeError", "NotImplementedError", "AssertionError", "RuntimeError"}
FOR_THE_OPERATOR = {
    "accounts/models.py: Users must have an email address.",
    "core/backups.py: Set BACKUP_ENCRYPTION_KEY to create or read backups.",
    "core/backups.py: Backups need PostgreSQL (development runs on SQLite).",
    "core/checks.py: Private media uses local FileSystemStorage.",
    "core/checks.py: Set MEDIA_BACKEND=bunny and the BUNNY_* variables (see .env.example).",
}
NOT_FOR_PEOPLE = {"help_text", "verbose_name", "verbose_name_plural", "description", "summary"}


def _english_sentences() -> list[str]:
    """English sentences in the server's code that no gettext wraps: what a page would show
    as is. Docstrings, logs, schema texts and the operator's tools are left out."""
    found = []
    for path in sorted(BACKEND.rglob("*.py")):
        rel = path.relative_to(BACKEND)
        skip = ("tests", "migrations", "management", ".venv", "settings")
        if any(part in rel.parts for part in skip) or rel.name == "conftest.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        parent = {c: n for n in ast.walk(tree) for c in ast.iter_child_nodes(n)}
        for node in ast.walk(tree):
            if not (
                isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and SENTENCE.match(node.value)
            ):
                continue
            up = parent.get(node)
            if isinstance(up, ast.Expr):  # a docstring
                continue
            meant_for_people = True
            while up is not None and not isinstance(up, ast.stmt):
                if isinstance(up, ast.keyword) and up.arg in NOT_FOR_PEOPLE:
                    meant_for_people = False
                    break
                if isinstance(up, ast.Call):
                    func = up.func
                    name = getattr(func, "id", None) or getattr(func, "attr", "")
                    owner = getattr(getattr(func, "value", None), "id", "")
                    meant_for_people = not (
                        name in TRANSLATED
                        or name in FOR_DEVELOPERS
                        or name == "BackupCorrupt"
                        or owner in ("logger", "logging")
                    )
                    break
                up = parent.get(up)
            if meant_for_people and f"{rel}: {node.value}" not in FOR_THE_OPERATOR:
                found.append(f"{rel}:{node.lineno}: {node.value}")
    return found


def test_no_english_sentence_reaches_a_page():
    assert _english_sentences() == []


def test_every_message_has_its_arabic():
    """An untranslated or fuzzy entry shows its English source (a fuzzy one is not compiled)."""
    po = (BACKEND / "locale/ar/LC_MESSAGES/django.po").read_text(encoding="utf-8")
    entries = po.split("\n\n")[1:]  # the first is the header
    untranslated = [e for e in entries if e.rstrip().endswith('msgstr ""') and "#~" not in e]
    fuzzy = [e for e in entries if re.search(r"^#,.*\bfuzzy\b", e, re.M)]
    assert untranslated == [] and fuzzy == []


def test_the_exam_builder_warns_in_arabic(classroom):
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
    assert exams.problems(exam) == [
        "أضف سؤالًا واحدًا على الأقل.",
        "درجة النجاح أعلى من مجموع الدرجات.",
        "مدة المحاولة أطول من فترة الامتحان.",
    ]
    Question.objects.create(exam=exam, type="true_false", text="س", marks=1, config={})
    assert "السؤال 1: حدّد الإجابة الصحيحة." in exams.problems(exam)


def test_a_bad_answer_is_refused_in_arabic():
    question = Question(type="true_false", config={"answer": True})
    try:
        REGISTRY["true_false"].clean_answer(question, "yes")
    except ValueError as error:
        assert str(error) == "أجب بصح أو خطأ."
    else:
        raise AssertionError("the answer was taken")


def test_the_applicant_reads_arabic_beside_the_fields():
    schema = {
        "steps": [
            {
                "title": "بيانات",
                "sections": [
                    {
                        "title": "عام",
                        "fields": [
                            {"key": "score", "type": "number", "label": "النسبة", "max": 100},
                            {"key": "cert", "type": "file", "label": "الشهادة", "required": True},
                            {"key": "name", "type": "text", "label": "الاسم", "required": True},
                        ],
                    }
                ],
            }
        ]
    }
    assert admissions.validate_answers(schema, {"score": "120"}, set()) == {
        "score": "خارج النطاق المسموح.",
        "cert": "ارفع هذا المستند.",
        "name": "مطلوب.",
    }


def test_a_second_press_on_a_closed_import_answers_in_arabic(api, make_user, it_program):
    from students.tests.test_importer import URL, _csv, _upload

    head = make_user(Role.HEAD_REGISTRAR)
    batch = _upload(
        api(head),
        _csv("university_number,full_name_ar,program_code,level", "26-IT-0001,أحمد,BIT,1"),
    ).data
    assert api(head).post(f"{URL}/{batch['public_id']}/reject").status_code == 200
    again = api(head).post(f"{URL}/{batch['public_id']}/commit")
    assert again.status_code == 409
    assert again.data["detail"] == "اعتُمدت هذه الدفعة أو رُفضت من قبل."
