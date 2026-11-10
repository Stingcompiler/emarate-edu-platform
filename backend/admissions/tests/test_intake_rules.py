"""A programme intake's rules (review 2026-11-10, axis 1.3; probes R74–R77 turned into tests)."""

# ruff: noqa: F811  (the intake fixture is imported by name)
from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.rbac import Role
from admissions.models import AdmissionCycle, Application, ProgramIntake
from admissions.tests.test_admissions import intake  # noqa: F401
from contacts.models import Contact

INTAKES = "/api/v1/intakes"


@pytest.fixture
def head(api, make_user):
    return api(make_user(Role.HEAD_REGISTRAR))


@pytest.fixture
def applied(intake):
    Application.objects.create(
        reference_no="APP-1",
        contact=Contact.objects.create(email="applicant@x.test", name="مريم"),
        intake=intake,
        full_name="مريم الطيب",
        status="submitted",
        submitted_at=timezone.now(),
    )
    return intake


def test_an_intake_with_applications_keeps_its_programme_and_cycle(head, applied, ba_program):
    """R74/R75: the applications were made to this programme in this cycle."""
    other = AdmissionCycle.objects.create(
        academic_year=applied.cycle.academic_year,
        name="دورة أخرى",
        opens_at=timezone.now(),
        closes_at=timezone.now() + timedelta(days=30),
    )
    url = f"{INTAKES}/{applied.pk}"
    for body in ({"program": ba_program.pk}, {"cycle": other.pk}):
        refused = head.patch(url, body, format="json")
        assert refused.status_code == 400, refused.data
    applied.refresh_from_db()
    assert applied.program.code == "BIT" and applied.cycle.name == "خريف 2026"
    # Everything else is still edited: dates, capacity, closing it.
    assert head.patch(url, {"capacity": 40, "is_open": False}, format="json").status_code == 200


def test_an_intake_without_applications_still_moves(head, intake, ba_program):
    moved = head.patch(f"{INTAKES}/{intake.pk}", {"program": ba_program.pk}, format="json")
    assert moved.status_code == 200, moved.data


def test_an_intake_closes_after_it_opens(head, intake):
    """R76: the cycle's window was checked, the intake's own was not."""
    now = timezone.now()
    refused = head.patch(
        f"{INTAKES}/{intake.pk}",
        {"opens_at": (now + timedelta(days=5)).isoformat(), "closes_at": now.isoformat()},
        format="json",
    )
    assert refused.status_code == 400 and "closes_at" in refused.data["errors"]


def test_a_stopped_programme_is_not_opened_for_applying(head, intake, ba_program):
    """R77: open for the registrar, invisible to visitors, and nothing said why."""
    ba_program.is_active = False
    ba_program.save(update_fields=["is_active"])
    body = {"cycle": intake.cycle_id, "program": ba_program.pk, "is_open": True}
    refused = head.post(INTAKES, body, format="json")
    assert refused.status_code == 400 and "program" in refused.data["errors"]
    # Closed, it may be kept on the cycle (a stopped programme's past intake).
    made = head.post(INTAKES, {**body, "is_open": False}, format="json")
    assert made.status_code == 201, made.data
    assert not ProgramIntake.objects.get(pk=made.data["id"]).is_open
