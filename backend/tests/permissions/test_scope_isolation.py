"""A department's head and supervisor act on their department only; a programme's head and
supervisor on their programme only (owner, 2026-11-15: «تأكد أنه فقط يتحكم على مستوى قسمه…
وأن منسق البرنامج ومشرفه يتحكمان فقط في البرنامج الموكل إليهما»).

Everything of the permission matrix's world lives in the IT department's BIT programme. Each
test looks at it as someone whose scope is elsewhere — the head or supervisor of another
department, of a sibling programme in the same department, or of a programme in another
department — through every endpoint, not a chosen few:

- every read of the matrix (``READS``), as it is and with each scope filter in the query
  string, must show nothing of BIT (its records, codes, names, and marked entries);
- every write of every route, with validation switched off so that only the scope answers,
  must be refused (403/404) — never reach the service;
- the writes the generic pass cannot address, and creating something inside BIT, likewise.

The same reads by BIT's own head (and the IT department's) must find those marks, so the
test can see a leak when there is one. And a second role (teacher, TA) widens nothing.
"""

import json
import uuid
from datetime import timedelta

import pytest
from django.urls import URLResolver, resolve, reverse
from django.utils import timezone

from accounts.rbac import Role
from core.tests.test_permission_matrix import READS
from core.tests.test_permission_matrix import world as fixture_world
from organization.models import Program

world = fixture_world
R = Role

# Marks on entries that belong to BIT (or to the IT department as a whole).
PROG_MARKS = {"MARKAUDITPROG", "MARKMEMBER", "MARKLEADER", "MARKLIVECOHORT", "MARKBATCH"}
DEPT_MARKS = {"MARKAUDITDEPT", "MARKANNDEPT"}
# A teacher of any programme can be linked to any programme: the directory lists them all.
NOT_A_LEAK = {"teacher-directory": {"MARKMEMBER"}}
# Who may disable whom is not a scope but a list of roles (rbac.ACTIVATABLE_ACCOUNTS), checked
# in the service once the request is read: tried with a real body below.
DECIDED_IN_THE_SERVICE = {"user-set-active"}


@pytest.fixture
def marked(world, users, it_dept, it_program, term, make_user):
    from academic.models import DepartmentMembership
    from audit.models import AuditLog
    from conftest import pdf_upload
    from content.models import Announcement
    from live.models import LiveSession
    from results.models import ResultImportBatch

    for repr_, program in (("MARKAUDITPROG", it_program), ("MARKAUDITDEPT", None)):
        AuditLog.objects.create(
            action="t",
            target_type="x",
            target_id="1",
            target_repr=repr_,
            department=it_dept,
            program=program,
        )
    for title, scope, scope_id in (
        ("MARKANNPROG", "program", it_program.pk),
        ("MARKANNDEPT", "department", it_dept.pk),
    ):
        Announcement.objects.create(
            scope=scope,
            scope_id=scope_id,
            audience="students",
            title=title,
            body="b",
            status="published",
            publish_at=timezone.now(),
            created_by=users[R.SYSTEM_ADMIN],
        )
    member = make_user(R.TEACHER, full_name_ar="MARKMEMBER")
    DepartmentMembership.objects.create(
        program=it_program, department=it_dept, user=member, kind="teacher"
    )
    make_user(R.PROGRAM_MANAGER, program=it_program, full_name_ar="MARKLEADER")
    live = LiveSession(
        scope="cohort",
        program=it_program,
        level=1,
        title="MARKLIVECOHORT",
        provider="meet",
        starts_at=timezone.now() + timedelta(hours=1),
        ends_at=timezone.now() + timedelta(hours=2),
        host=users[R.TEACHER],
    )
    live.join_url = "https://meet.google.com/xyz"
    live.save()
    ResultImportBatch.objects.create(
        file=pdf_upload("r2.csv"),
        file_name="MARKBATCH.csv",
        scope="program",
        department=it_dept,
        program=it_program,
        term=term,
        uploaded_by=users[R.RESULTS_OFFICER],
        status="validated",
    )
    return world


@pytest.fixture
def outsiders(make_user, it_dept, ba_dept, ba_program):
    sibling = Program.objects.create(
        department=it_dept,
        code="BIS",
        name_ar="بكالوريوس نظم المعلومات",
        degree=Program.Degree.BACHELOR,
        levels_count=4,
        duration_terms=8,
    )
    return {
        "head of another department": make_user(R.DEPARTMENT_MANAGER, department=ba_dept),
        "supervisor of another department": make_user(R.DEPARTMENT_SUPERVISOR, department=ba_dept),
        "head of a sibling programme": make_user(R.PROGRAM_MANAGER, program=sibling),
        "supervisor of a sibling programme": make_user(R.PROGRAM_SUPERVISOR, program=sibling),
        "head of a programme elsewhere": make_user(R.PROGRAM_MANAGER, program=ba_program),
        "supervisor of a programme elsewhere": make_user(R.PROGRAM_SUPERVISOR, program=ba_program),
    }


def _marks(w, who: str) -> set[str]:
    """What must not show to ``who``. The department itself is a sibling programme's own."""
    found = {
        str(value)
        for key, value in w.items()
        # The teacher, a college-wide regulation and a registry import are not BIT's.
        if isinstance(value, uuid.UUID) and key not in {"teacher", "regulation", "batch"}
    }
    found |= {"IT101", "مقدمة في البرمجة", "بكالوريوس تقانة المعلومات"}
    found |= {"26-IT-0001", "26-IT-0002", "APP-2026-000001", "MARKANNPROG"}
    found |= PROG_MARKS | {"MARKAUDITDEPT"}
    if "sibling" not in who:
        found |= DEPT_MARKS | {"تقانة المعلومات"}
    return found


def _body(response) -> str:
    if hasattr(response, "streaming_content"):
        return ""
    try:
        return json.dumps(response.json(), ensure_ascii=False)
    except ValueError:
        return response.content.decode(errors="replace")


def _filters(w, it_dept, it_program, it_offering, it_course) -> dict:
    return {
        "department": it_dept.pk,
        "program": it_program.pk,
        "offering": it_offering.pk,
        "course": it_course.pk,
        "student": w["student"],
        "student_record": w["student"],
        "exam": w["exam"],
        "assignment": w["assignment"],
        "lecture": w["lecture"],
        "term": w["term"],
        "scope_id": it_dept.pk,
    }


def _leaks_in_reads(w, people, api, filters) -> list[str]:
    leaks = []
    for name, (template, *_rest) in sorted(READS.items()):
        base = template.format(**w)
        joiner = "&" if "?" in base else "?"
        urls = [base] + [f"{base}{joiner}{key}={value}" for key, value in filters.items()]
        for who, user in people.items():
            client = api(user)
            for url in urls:
                response = client.get(url)
                if response.status_code != 200:
                    continue
                body = _body(response)
                hits = sorted(m for m in _marks(w, who) - NOT_A_LEAK.get(name, set()) if m in body)
                if hits:
                    leaks.append(f"{who}: GET {url} shows {hits[:3]}")
    return leaks


def test_reads_show_nothing_outside_the_scope(
    marked, outsiders, api, it_dept, it_program, it_offering, it_course
):
    filters = _filters(marked, it_dept, it_program, it_offering, it_course)
    leaks = _leaks_in_reads(marked, outsiders, api, filters)
    assert not leaks, "\n".join(leaks)


def test_a_second_role_widens_nothing(
    marked, outsiders, api, it_dept, it_program, it_offering, it_course
):
    from accounts.models import RoleAssignment

    for user in outsiders.values():
        RoleAssignment.objects.create(user=user, role=R.TEACHER)
        RoleAssignment.objects.create(user=user, role=R.TA)
    filters = _filters(marked, it_dept, it_program, it_offering, it_course)
    leaks = _leaks_in_reads(marked, outsiders, api, filters)
    assert not leaks, "\n".join(leaks)


def test_the_programmes_own_head_sees_the_marks(marked, api, users):
    """The test is not blind: inside the scope, the same reads find what is outside's."""
    for role, expected in (
        (R.DEPARTMENT_MANAGER, PROG_MARKS | {"MARKAUDITDEPT"}),
        (R.PROGRAM_MANAGER, PROG_MARKS),
    ):
        client = api(users[role])
        seen = set()
        for template, *_rest in READS.values():
            response = client.get(template.format(**marked))
            if response.status_code == 200:
                body = _body(response)
                seen |= {m for m in expected if m in body}
        assert seen == expected, (role, expected - seen)


def _routes():
    import importlib

    def walk(patterns):
        for pattern in patterns:
            if isinstance(pattern, URLResolver):
                yield from walk(pattern.url_patterns)
            else:
                yield pattern

    return [p for p in walk(importlib.import_module("config.urls_v1").urlpatterns) if p.name]


def test_every_write_on_the_programme_is_refused(marked, outsiders, api, monkeypatch):
    """Validation is switched off, so a refusal can only come from the scope (a view that
    validates first would otherwise answer 400 and hide whether it would have gone ahead).
    Past the scope, the empty data fails inside the service: that is a leak too."""
    from rest_framework import serializers

    def accept(self, *, raise_exception=False):
        self._validated_data, self._errors, self._data = {}, {}, {}
        return True

    monkeypatch.setattr(serializers.BaseSerializer, "is_valid", accept)
    kwargs_of = {}
    for name, (template, *_rest) in READS.items():
        kwargs_of[name] = resolve(template.format(**marked).split("?")[0]).kwargs
    leaks, tried = [], 0
    for route in _routes():
        parts = route.name.split("-")
        url = None
        for cut in range(len(parts), 0, -1):
            for candidate in ("-".join(parts[:cut]), "-".join(parts[:cut]) + "-detail"):
                if kwargs_of.get(candidate):
                    try:
                        url = reverse(route.name, kwargs=kwargs_of[candidate])
                    except Exception:  # noqa: S112 (another route's parameters)
                        continue
                    break
            if url:
                break
        if not url or route.name in DECIDED_IN_THE_SERVICE:
            continue
        actions = getattr(resolve(url).func, "actions", None) or {}
        for method in [m for m in list(actions) if m not in ("get", "head", "options")]:
            for who, user in outsiders.items():
                tried += 1
                try:
                    status = getattr(api(user), method)(url, {}, format="json").status_code
                except Exception as error:  # past the scope, into the service
                    status = type(error).__name__
                if status not in (403, 404, 405):
                    leaks.append(f"{who}: {method.upper()} {url} [{route.name}] → {status}")
    assert tried > 300, tried  # the routes were found
    assert not leaks, "\n".join(leaks)


def test_the_writes_the_generic_pass_misses_are_refused(
    marked, outsiders, api, users, it_dept, it_offering
):
    from academic.models import DepartmentMembership
    from accounts.models import RoleAssignment
    from content.models import Announcement
    from exams.models import Exam, Question
    from learning.models import Lecture

    lecture = Lecture.objects.get(public_id=marked["lecture"])
    exam = Exam.objects.get(public_id=marked["exam"])
    question = Question.objects.create(exam=exam, order=1, type="single", text="q", marks=1)
    member = DepartmentMembership.objects.get(user__full_name_ar="MARKMEMBER")
    leader = RoleAssignment.objects.get(user__full_name_ar="MARKLEADER")
    calls = []
    for title in ("MARKANNDEPT", "MARKANNPROG"):
        url = f"/api/v1/announcements/{Announcement.objects.get(title=title).public_id}"
        calls += [("get", url), ("patch", url), ("delete", url)]
        calls += [("post", f"{url}/publish"), ("post", f"{url}/archive")]
    calls += [
        ("delete", f"/api/v1/departments/{it_dept.pk}/members/{member.pk}"),
        ("delete", f"/api/v1/role-assignments/{leader.pk}"),
        (
            "delete",
            f"/api/v1/offerings/{it_offering.pk}/instructors/{it_offering.instructors.first().pk}",
        ),
        (
            "delete",
            f"/api/v1/lectures/{lecture.public_id}/resources/{lecture.resources.first().pk}",
        ),
        ("patch", f"/api/v1/exams/{exam.public_id}/questions/{question.pk}"),
        ("delete", f"/api/v1/exams/{exam.public_id}/questions/{question.pk}"),
        ("post", f"/api/v1/exam-attempts/{marked['attempt']}/answers/{question.pk}/grade"),
    ]
    teacher = users[R.TEACHER]  # teaches IT101, in BIT
    calls.append(("post", f"/api/v1/users/{teacher.public_id}/set-active"))
    leaks = []
    for method, url in calls:
        for who, user in outsiders.items():
            body = {"title": "x", "marks": 1, "is_active": False}
            status = getattr(api(user), method)(url, body, format="json").status_code
            if status not in (403, 404, 405):
                leaks.append(f"{who}: {method.upper()} {url} → {status}")
    teacher.refresh_from_db()
    assert teacher.is_active
    assert not leaks, "\n".join(leaks)


def test_nothing_is_created_inside_the_programme(
    marked, outsiders, api, it_dept, it_program, it_offering, it_course, term, make_user
):
    soon = timezone.now() + timedelta(days=1)
    later = soon + timedelta(hours=1)
    teacher = make_user(R.TEACHER)
    live = {"title": "LEAK", "provider": "meet", "join_url": "https://meet.google.com/a"}
    live |= {"starts_at": soon.isoformat(), "ends_at": later.isoformat()}
    notice = {"title": "LEAK", "category": "college"}
    bodies = [
        ("/api/v1/courses", {"program": it_program.pk, "code": "LEAK1", "name_ar": "LEAK"}),
        ("/api/v1/offerings", {"course": it_course.pk, "term": term.pk, "section": "Z"}),
        ("/api/v1/lectures", {"offering": it_offering.pk, "title_ar": "LEAK"}),
        (
            "/api/v1/assignments",
            {
                "offering": it_offering.pk,
                "title": "LEAK",
                "due_at": later.isoformat(),
                "submission_types": ["text"],
            },
        ),
        (
            "/api/v1/exams",
            {
                "offering": it_offering.pk,
                "title": "LEAK",
                "opens_at": soon.isoformat(),
                "closes_at": later.isoformat(),
                "duration_minutes": 30,
            },
        ),
        ("/api/v1/live-sessions", {"scope": "offering", "offering": it_offering.pk, **live}),
        (
            "/api/v1/live-sessions",
            {"scope": "cohort", "program": it_program.pk, "level": 1, **live},
        ),
        *(
            (
                "/api/v1/announcements",
                {"scope": scope, "scope_id": pk, "audience": "students", "title": "L", "body": "b"},
            )
            for scope, pk in (
                ("department", it_dept.pk),
                ("program", it_program.pk),
                ("offering", it_offering.pk),
            )
        ),
        ("/api/v1/enrollments", {"offering": it_offering.pk, "student_record": marked["student"]}),
        (
            "/api/v1/enrollments/bulk",
            {"term": term.pk, "program": it_program.pk, "level": 1},
        ),
        (
            "/api/v1/students",
            {"program": it_program.pk, "university_number": "26-IT-9999", "full_name_ar": "L"},
        ),
        *(
            (url, {**notice, "audience": {"type": kind, "ids": [pk]}})
            for url in ("/api/v1/notifications/sent", "/api/v1/notifications/sent/preview")
            for kind, pk in (
                ("department", it_dept.pk),
                ("program", it_program.pk),
                ("offering", it_offering.pk),
            )
        ),
        (
            f"/api/v1/departments/{it_dept.pk}/members",
            {"user": str(teacher.public_id), "kind": "teacher", "program": it_program.pk},
        ),
        (
            f"/api/v1/offerings/{it_offering.pk}/instructors",
            {"user": str(teacher.public_id), "role": "teacher"},
        ),
        ("/api/v1/report-snapshots", {"kind": "department", "department": it_dept.pk}),
        (
            "/api/v1/misconduct-reports",
            {"offering": it_offering.pk, "student_record": marked["student"], "evidence": "e"},
        ),
        (
            "/api/v1/role-assignments",
            {
                "user": str(teacher.public_id),
                "role": "program_supervisor",
                "program": it_program.pk,
            },
        ),
    ]
    leaks = []
    for url, body in bodies:
        for who, user in outsiders.items():
            response = api(user).post(url, body, format="json")
            # 400 only where the scoped choice list does not offer BIT at all.
            refused = response.status_code in (403, 404) or (
                response.status_code == 400 and "program" in (response.data.get("errors") or {})
            )
            if not refused:
                leaks.append(f"{who}: POST {url} → {response.status_code} {_body(response)[:120]}")
    assert not leaks, "\n".join(leaks)
