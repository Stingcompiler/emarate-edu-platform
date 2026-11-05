"""Exams, late work and notification links after review 2026-11 axes 1.4/1.5 (probes in
docs/qa/evidence/review-2026-11/exams)."""

# ruff: noqa: F811  (fixtures imported by name)

import importlib
import re
from datetime import timedelta
from pathlib import Path

from django.apps import apps as django_apps
from django.utils import timezone

from accounts.rbac import Role
from audit.services import RequestMeta
from exams import services
from exams.models import Exam, ExamAttempt
from exams.question_types import REGISTRY
from exams.tests.test_exams import URL, exam  # noqa: F401
from notifications.models import Notification

BACKEND = Path(__file__).resolve().parents[2]
MAIN_TSX = BACKEND.parent / "apps" / "portal" / "src" / "main.tsx"


def test_a_published_exams_questions_are_locked(api, classroom, exam):
    assert exam.status == Exam.Status.PUBLISHED and not exam.attempts.exists()
    question = exam.questions.get(type="single")
    edited = api(classroom.teacher).patch(
        f"{URL}/{exam.public_id}/questions/{question.pk}", {"text": "نص جديد"}, format="json"
    )
    assert edited.status_code == 409 and edited.data["code"] == "locked"


def test_a_multiple_question_without_a_right_choice_grades_zero(exam):
    question = exam.questions.get(type="multiple")
    question.config = {**(question.config or {}), "partial": True}
    question.choices.update(is_correct=False)
    graded = REGISTRY["multiple"].grade(question, [question.choices.first().pk])
    assert graded.marks == 0


def test_one_failing_attempt_does_not_stop_the_others(classroom, exam, monkeypatch):
    attempt = services.start(RequestMeta(actor=classroom.student), exam)
    past = timezone.now() - timedelta(hours=1)
    ExamAttempt.objects.filter(pk=attempt.pk).update(deadline_at=past)
    Exam.objects.filter(pk=exam.pk).update(opens_at=past - timedelta(hours=1), closes_at=past)

    def broken(*args, **kwargs):
        raise ArithmeticError("cannot grade")

    monkeypatch.setattr(services, "_finish", broken)
    services.close_expired()  # logged, not raised
    exam.refresh_from_db()
    assert exam.status == Exam.Status.CLOSED  # the ended exam still closes


def test_late_work_needs_an_end_date(api, classroom):
    body = {
        "offering": classroom.offering.pk,
        "title": "واجب",
        "due_at": (timezone.now() + timedelta(days=3)).isoformat(),
        "submission_types": ["text"],
        "max_grade": "10",
        "late_policy": "penalty",
        "late_penalty_percent": 20,
        "late_until": None,
    }
    refused = api(classroom.teacher).post("/api/v1/assignments", body, format="json")
    assert refused.status_code == 400 and "late_until" in str(refused.data)
    body["late_until"] = (timezone.now() + timedelta(days=5)).isoformat()
    assert (
        api(classroom.teacher).post("/api/v1/assignments", body, format="json").status_code == 201
    )


def test_the_assignment_notice_opens_the_course_by_its_number(api, make_user, it_dept, it_offering):
    supervisor = make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept)
    teacher = make_user(Role.TEACHER)
    api(supervisor).post(
        f"/api/v1/departments/{it_dept.pk}/members",
        {"user": str(teacher.public_id), "kind": "teacher"},
    )
    assigned = api(supervisor).post(
        f"/api/v1/offerings/{it_offering.pk}/instructors",
        {"user": str(teacher.public_id), "role": "teacher"},
    )
    assert assigned.status_code == 201, assigned.data
    link = Notification.objects.get(title__startswith="عُيّنت على مادة").action_url
    assert link == f"/courses/{it_offering.pk}"


def test_stored_course_links_are_rewritten(it_offering):
    old = Notification.objects.create(
        category="course",
        title="عُيّنت على مادة",
        action_url=f"/courses/{it_offering.public_id}",
    )
    migration = importlib.import_module("notifications.migrations.0005_course_links_by_pk")
    migration.fix(django_apps, None)
    migration.fix(django_apps, None)  # twice: nothing more changes
    old.refresh_from_db()
    assert old.action_url == f"/courses/{it_offering.pk}"


_LINK = re.compile(r"""action_url\s*=\s*f?["'](/[^"']*)["']""")


def test_every_server_notification_link_has_a_portal_route():
    links = {}
    for path in BACKEND.rglob("*.py"):
        rel = path.relative_to(BACKEND).as_posix()
        if "/tests/" in f"/{rel}" or "/migrations/" in f"/{rel}" or rel.startswith(".venv"):
            continue
        for match in _LINK.finditer(path.read_text(encoding="utf-8")):
            links[match.group(1)] = rel
    assert len(links) >= 15, links
    paths = re.findall(r"""path:\s*"([^"]+)\"""", MAIN_TSX.read_text(encoding="utf-8"))
    routes = [re.compile("^" + re.sub(r":[^/]+", "[^/]+", p) + "$") for p in paths if p != "*"]
    missing = {
        link: where
        for link, where in links.items()
        if not any(r.match(re.sub(r"\{[^}]+\}", "X", link).split("?")[0]) for r in routes)
    }
    assert missing == {}
