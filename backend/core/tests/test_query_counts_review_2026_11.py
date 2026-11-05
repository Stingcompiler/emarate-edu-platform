"""Review 2026-11, axis 5 (performance): query counts that must not grow with the rows (the
probes are in docs/qa/evidence/review-2026-11/perf).

Each probe EXPECTS THE FAULT: it creates N rows, counts the queries of one request, adds 2N
more and counts again, and passes when the count grew (N+1 reproduced). When the fault is
fixed the probe fails; turn it into a constant-count test then (assert at_3n == at_n).

Endpoints found constant in the same survey are listed in the review report, not here.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.rbac import Role

N = 5


# ─── /api/v1/applications — allowed_transitions → can_decide → SystemSettings.load() ───


@pytest.fixture
def admissions_setup(make_user, it_dept, term, it_program):
    from admissions.models import AdmissionCycle, ApplicationFormTemplate, ProgramIntake

    head = make_user(Role.HEAD_REGISTRAR)
    template = ApplicationFormTemplate.objects.create(
        name="default",
        status="published",
        created_by=head,
        schema={
            "steps": [
                {
                    "sections": [
                        {
                            "fields": [
                                {"key": "school", "type": "text", "label": "المدرسة"},
                                {
                                    "key": "fees",
                                    "type": "text",
                                    "label": "الرسوم",
                                    "audience": "staff",
                                },
                            ]
                        }
                    ]
                }
            ]
        },
    )
    now = timezone.now()
    cycle = AdmissionCycle.objects.create(
        academic_year=term.academic_year,
        name="خريف 2026",
        opens_at=now - timedelta(days=5),
        closes_at=now + timedelta(days=5),
    )
    intake = ProgramIntake.objects.create(
        cycle=cycle,
        program=it_program,
        required_documents=[{"key": "certificate", "label": "الشهادة"}],
    )
    return type("Admissions", (), {"head": head, "template": template, "intake": intake})


@pytest.fixture
def grow_applications(admissions_setup, make_user, it_dept):
    """Applications in review states, each with staff_answers, a history row, a message and a
    document (what the registrar's list shows)."""
    from admissions.models import (
        Application,
        ApplicationDocument,
        ApplicationMessage,
        ApplicationStatusHistory,
    )
    from contacts.models import Contact

    statuses = ["submitted", "under_review", "eligible", "waitlisted"]
    reviewer = make_user(Role.REGISTRAR, department=it_dept)
    made = {"n": 0}

    def grow(k):
        for _ in range(k):
            made["n"] += 1
            i = made["n"]
            application = Application.objects.create(
                reference_no=f"P{i:07d}",
                contact=Contact.objects.create(email=f"p{i}@example.test", name="مريم"),
                intake=admissions_setup.intake,
                form_template=admissions_setup.template,
                full_name="مريم",
                email=f"p{i}@example.test",
                status=statuses[i % len(statuses)],
                assigned_registrar=reviewer,
                submitted_at=timezone.now(),
                answers={"school": "الخرطوم"},
                staff_answers={"fees": "1500"},
            )
            ApplicationStatusHistory.objects.create(
                application=application,
                from_status="draft",
                to_status="submitted",
                changed_by=reviewer,
            )
            ApplicationMessage.objects.create(application=application, author=reviewer, body="—")
            ApplicationDocument.objects.create(
                application=application,
                doc_type="certificate",
                file="probe.pdf",
                name="probe.pdf",
                size=10,
                mime="application/pdf",
            )

    return grow


@pytest.mark.parametrize("role", [Role.REGISTRAR, Role.DEPARTMENT_MANAGER])
def test_applications_list_is_constant_for_department_roles(
    count_queries, grow_applications, make_user, it_dept, role
):
    """The registrar dashboard («غير موزعة» / «طلباتي») and the applications list. The head
    registrar's list is constant (8 queries): rbac 'admissions.manage' short-circuits
    can_decide. For a role without it, every decider transition of every row loads
    SystemSettings again (admissions/services.py can_decide)."""
    user = make_user(role, department=it_dept)
    url = "/api/v1/applications?page_size=100"
    grow_applications(N)
    at_n = count_queries(user, url)
    grow_applications(2 * N)
    at_3n = count_queries(user, url)
    assert at_3n <= at_n, f"{at_n} → {at_3n} queries"


# ─── /api/v1/live-sessions — get_can_join → may_join per row ───


@pytest.fixture
def grow_live_sessions(classroom):
    from live.models import LiveSession

    now = timezone.now()
    made = {"n": 0}

    def grow(k):
        for _ in range(k):
            made["n"] += 1
            i = made["n"]
            LiveSession.objects.create(
                scope="offering",
                offering=classroom.offering,
                title=f"جلسة {i}",
                provider="meet",
                join_url_encrypted="x",
                starts_at=now + timedelta(hours=i),
                ends_at=now + timedelta(hours=i + 1),
                host=classroom.teacher,
            )

    return grow


@pytest.mark.parametrize("who", ["student", "teacher"])
def test_live_sessions_list_is_constant(count_queries, classroom, grow_live_sessions, who):
    """The student «اليوم» and the teacher's today both list live sessions. The serializer's
    can_join runs may_join for every row: for_offering (2 queries), _hosting (1) and, for a
    student, _attending_q + exists (2) — ~5 queries a row for a student, ~2 for a teacher."""
    user = classroom.student if who == "student" else classroom.teacher
    url = "/api/v1/live-sessions?page_size=100"
    grow_live_sessions(N)
    at_n = count_queries(user, url)
    grow_live_sessions(2 * N)
    at_3n = count_queries(user, url)
    assert at_3n <= at_n, f"{at_n} → {at_3n} queries"
