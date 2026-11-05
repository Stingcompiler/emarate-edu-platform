"""QA probes, review 2026-11 axes 1.4 (exams) and 1.5 (notifications).

Each probe EXPECTS THE FAULTY BEHAVIOUR: it passes while the defect is there and fails once it
is fixed (then turn it round into a regression test). The enumeration test at the end is a
plain check (it passes today) that every notification link the server builds has a portal route.
"""

import re
from datetime import timedelta
from pathlib import Path

import pytest
from django.utils import timezone

from accounts.rbac import Role
from audit.services import RequestMeta
from exams import services
from exams.models import Exam, ExamAttempt
from exams.tests.test_exams import URL, exam  # noqa: F401  (fixture)
from learning.models import Assignment
from notifications.models import Notification

BACKEND = Path(__file__).resolve().parents[2]
MAIN_TSX = BACKEND.parent / "apps" / "portal" / "src" / "main.tsx"


# ─── 1.4 Editing a question of a PUBLISHED exam (no attempts yet) ──────────


def test_probe_published_exam_question_is_edited_in_place(api, classroom, exam):  # noqa: F811
    """The portal offers «تعديل» on draft exams only, but the server's _editable() locks
    questions only when the exam is not a draft AND has attempts: a published exam nobody has
    started yet accepts PATCH (and POST/DELETE/reorder) of its questions."""
    assert exam.status == Exam.Status.PUBLISHED and not exam.attempts.exists()
    question = exam.questions.get(type="single")
    edited = api(classroom.teacher).patch(
        f"{URL}/{exam.public_id}/questions/{question.pk}", {"text": "نص جديد"}, format="json"
    )
    assert edited.status_code == 200  # FAULT: expected 409 (locked once published)
    question.refresh_from_db()
    assert question.text == "نص جديد"


def test_probe_published_exam_edit_breaks_grading(api, classroom, exam):  # noqa: F811
    """problems() runs only at publish. After it, a PATCH can leave a partial-credit multiple
    question with no correct choice; the exam stays published, and grading divides by
    len(correct) == 0, so the student's submit raises instead of grading."""
    question = exam.questions.get(type="multiple")
    edited = api(classroom.teacher).patch(
        f"{URL}/{exam.public_id}/questions/{question.pk}",
        {"choices": [{"text": "أ"}, {"text": "ب"}]},  # none marked correct
        format="json",
    )
    assert edited.status_code == 200
    exam.refresh_from_db()
    assert exam.status == Exam.Status.PUBLISHED
    assert any("Question" in p for p in services.problems(exam))  # publish would have refused

    meta = RequestMeta(actor=classroom.student)
    attempt = services.start(meta, exam)
    pick = question.choices.first().pk
    services.save_answer(meta, attempt, question.pk, [pick])
    with pytest.raises(ArithmeticError):  # decimal.DivisionByZero inside Multiple.grade
        services.submit(meta, attempt)  # FAULT: the attempt can never be graded


def test_probe_one_ungradeable_attempt_stops_the_minute_beat(api, classroom, exam):  # noqa: F811
    """close_expired() has no per-attempt guard: the same attempt, once past its deadline,
    raises out of the beat task, so the exam is never auto-closed and the attempt stays open
    (and every attempt listed after it, college-wide, waits too)."""
    question = exam.questions.get(type="multiple")
    api(classroom.teacher).patch(
        f"{URL}/{exam.public_id}/questions/{question.pk}",
        {"choices": [{"text": "أ"}, {"text": "ب"}]},
        format="json",
    )
    meta = RequestMeta(actor=classroom.student)
    attempt = services.start(meta, exam)
    services.save_answer(meta, attempt, question.pk, [question.choices.first().pk])
    past = timezone.now() - timedelta(hours=1)
    ExamAttempt.objects.filter(pk=attempt.pk).update(deadline_at=past)
    Exam.objects.filter(pk=exam.pk).update(opens_at=past - timedelta(hours=1), closes_at=past)
    with pytest.raises(ArithmeticError):
        services.close_expired()  # FAULT: the beat run dies here
    attempt.refresh_from_db()
    exam.refresh_from_db()
    assert attempt.status == ExamAttempt.Status.IN_PROGRESS
    assert exam.status == Exam.Status.PUBLISHED


# ─── 1.4 Late window without an end date: server open, portal closed ──────


def test_probe_penalty_without_late_until_is_accepted_by_the_server(api, classroom):
    """The editor lets a teacher pick «يُقبل بخصم» and leave «آخر موعد للمتأخر» empty
    (late_until = null). The server then accepts late work with no end; the portal's
    Assignment page computes hardEnd = due when late_until is null and shows «أُغلق التسليم»
    (see apps/portal/src/routes/learning/Assignment.probe.test.tsx)."""
    body = {
        "offering": classroom.offering.pk,
        "title": "واجب متأخر",
        "due_at": (timezone.now() + timedelta(days=3)).isoformat(),
        "submission_types": ["text"],
        "max_grade": "10",
        "late_policy": "penalty",
        "late_penalty_percent": 20,
        "late_until": None,
    }
    created = api(classroom.teacher).post("/api/v1/assignments", body, format="json")
    assert created.status_code == 201, created.data
    public_id = created.data["public_id"]
    published = api(classroom.teacher).post(f"/api/v1/assignments/{public_id}/publish")
    assert published.status_code == 200
    Assignment.objects.filter(public_id=public_id).update(
        due_at=timezone.now() - timedelta(days=30)
    )
    late = api(classroom.student).post(
        f"/api/v1/assignments/{public_id}/submit", {"content": "متأخر شهرًا"}, format="json"
    )
    assert late.status_code == 201 and late.data["is_late"] is True  # server: still open


# ─── 1.5 «عُيّنت على مادة» links to /courses/<uuid>; the page reads a number ─


def test_probe_instructor_assigned_links_to_the_offering_uuid(api, make_user, it_dept, it_offering):
    """events.instructor_assigned sends /courses/<offering.public_id>. The portal's
    /courses/:id page does Number(id) and queries ?offering=<pk>; a UUID gives NaN, so the
    page the notification opens shows an empty course."""
    supervisor = make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept)
    teacher = make_user(Role.TEACHER)
    members = f"/api/v1/departments/{it_dept.pk}/members"
    added = api(supervisor).post(members, {"user": str(teacher.public_id), "kind": "teacher"})
    assert added.status_code == 201, added.data
    assigned = api(supervisor).post(
        f"/api/v1/offerings/{it_offering.pk}/instructors",
        {"user": str(teacher.public_id), "role": "teacher"},
    )
    assert assigned.status_code == 201, assigned.data
    link = Notification.objects.get(title__startswith="عُيّنت على مادة").action_url
    assert link == f"/courses/{it_offering.public_id}"  # FAULT: expected /courses/{pk}
    assert not link.rsplit("/", 1)[1].isdigit()

    course_page = (MAIN_TSX.parent / "routes" / "learning" / "Course.tsx").read_text()
    assert "const offering = Number(id);" in course_page  # the page wants the numeric pk


# ─── 1.5 Every action_url the server builds has a portal route (plain check) ─


_LINK = re.compile(r"""action_url\s*=\s*f?["'](/[^"']*)["']""")


def _server_links() -> dict[str, str]:
    """{link shape: file} for every literal action_url in the backend (tests excluded)."""
    found = {}
    for path in BACKEND.rglob("*.py"):
        rel = path.relative_to(BACKEND).as_posix()
        if "/tests/" in f"/{rel}" or "/migrations/" in f"/{rel}" or rel.startswith(".venv"):
            continue
        for match in _LINK.finditer(path.read_text(encoding="utf-8")):
            found[match.group(1)] = rel
    return found


def _portal_routes() -> list[re.Pattern]:
    paths = re.findall(r"""path:\s*"([^"]+)\"""", MAIN_TSX.read_text(encoding="utf-8"))
    paths = [p for p in paths if p != "*"]
    return [re.compile("^" + re.sub(r":[^/]+", "[^/]+", p) + "$") for p in paths]


def test_every_server_notification_link_has_a_portal_route():
    links = _server_links()
    assert len(links) >= 15, links  # lectures, assignments, courses, exams, hr, cases, …
    routes = _portal_routes()
    missing = {}
    for link, where in links.items():
        shape = re.sub(r"\{[^}]+\}", "X", link).split("?")[0]
        if not any(r.match(shape) for r in routes):
            missing[link] = where
    assert missing == {}
