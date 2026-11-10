"""QA probes, review 2026-11-10 axis 1.3 (admission cycles and programme intakes, #249).
Each test EXPECTS THE FAULTY BEHAVIOUR: a pass means the defect is reproduced."""

from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.rbac import Role
from admissions.models import Application, ProgramIntake
from admissions.tests.test_admissions import intake  # noqa: F401  (fixture by name)
from contacts.models import Contact
from organization.models import Program

INTAKES = "/api/v1/intakes"


@pytest.fixture
def applied(intake):  # noqa: F811
    """One submitted application in the intake."""
    contact = Contact.objects.create(email="applicant@x.test", name="مريم")
    Application.objects.create(
        reference_no="APP-1",
        contact=contact,
        intake=intake,
        full_name="مريم الطيب",
        email="applicant@x.test",
        status="submitted",
        submitted_at=timezone.now(),
    )
    return intake


def _head(api, make_user):
    return api(make_user(Role.HEAD_REGISTRAR))


# ─── R74: an intake with applications changes programme ───────────────────────────────────


def test_probe_r74_an_intake_with_applications_changes_programme(
    api, make_user, applied, ba_program
):
    """Nothing stops PATCH {program} on an intake that already has applications: every
    application in it is now an application to another programme (and another department's
    registrars), though the applicants chose the first one."""
    moved = _head(api, make_user).patch(
        f"{INTAKES}/{applied.pk}", {"program": ba_program.pk}, format="json"
    )
    assert moved.status_code == 200, moved.data
    assert Application.objects.get().intake.program == ba_program


# ─── R75: an intake with applications moves to another cycle ──────────────────────────────


def test_probe_r75_an_intake_with_applications_moves_to_another_cycle(api, make_user, applied):
    """The same for the cycle: applications move to a cycle they were never made in (and the
    «applications per cycle» limit is counted in the wrong cycle)."""
    other = type(applied.cycle).objects.create(
        academic_year=applied.cycle.academic_year,
        name="دورة أخرى",
        opens_at=timezone.now(),
        closes_at=timezone.now() + timedelta(days=30),
    )
    moved = _head(api, make_user).patch(
        f"{INTAKES}/{applied.pk}", {"cycle": other.pk}, format="json"
    )
    assert moved.status_code == 200, moved.data
    assert Application.objects.get().intake.cycle == other


# ─── R76: an intake's dates are not checked ───────────────────────────────────────────────


def test_probe_r76_an_intake_closes_before_it_opens(api, make_user, intake):  # noqa: F811
    """The cycle refuses a window that closes before it opens; the intake's own window is not
    checked at all: saved, and the programme then never takes an application, silently."""
    now = timezone.now()
    saved = _head(api, make_user).patch(
        f"{INTAKES}/{intake.pk}",
        {"opens_at": (now + timedelta(days=5)).isoformat(), "closes_at": now.isoformat()},
        format="json",
    )
    assert saved.status_code == 200, saved.data
    intake.refresh_from_db()
    assert not intake.accepting()


# ─── R77: a stopped programme is opened for applying ──────────────────────────────────────


def test_probe_r77_a_stopped_programme_gets_an_open_intake(api, make_user, intake, ba_program):  # noqa: F811
    """An intake is created «open» for a stopped programme: the registrar sees it open in the
    cycle while visitors never see it (R26 hides it from applying), and nothing says why."""
    ba_program.is_active = False
    ba_program.save(update_fields=["is_active"])
    made = _head(api, make_user).post(
        INTAKES,
        {"cycle": intake.cycle_id, "program": ba_program.pk, "is_open": True},
        format="json",
    )
    assert made.status_code == 201, made.data
    assert ProgramIntake.objects.get(pk=made.data["id"]).is_open
    assert not Program.objects.get(pk=ba_program.pk).is_active
