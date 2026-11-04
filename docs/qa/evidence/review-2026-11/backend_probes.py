"""Review 2026-11 probes (axis 1.2, structure): each asserts the observed fault.

Run with `bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11 sqlite` (passed = reproduced).
"""

# pytest discovers imported fixtures by name; this file is stored outside tests/.
# ruff: noqa: F401, F811, S101

from accounts.rbac import Role
from admissions.models import ProgramIntake
from admissions.tests.test_admissions import intake
from content.models import Redirect


def test_r26_a_stopped_programme_still_accepts_applications(intake):
    """Stopping a programme (or its department) hides it from the site, but its open
    intake still answers accepting() — POST /api/public/applications starts a draft."""
    program = intake.program
    program.is_active = False
    program.save(update_fields=["is_active"])
    assert intake.accepting() is True
    department = program.department
    program.is_active = True
    program.save(update_fields=["is_active"])
    department.is_active = False
    department.save(update_fields=["is_active"])
    assert ProgramIntake.objects.get(pk=intake.pk).accepting() is True


def test_r27_a_code_change_leaves_the_old_site_link_broken(api, make_user, it_dept, it_program):
    """The site addresses /departments/<code>/ and /programs/<code>/; a new code makes the
    old links 404 and no CMS redirect is made for them."""
    client = api(make_user(Role.SYSTEM_ADMIN))
    assert client.patch(f"/api/v1/departments/{it_dept.pk}", {"code": "ITX"}).status_code == 200
    assert client.patch(f"/api/v1/programs/{it_program.pk}", {"code": "BITX"}).status_code == 200
    assert not Redirect.objects.exists()


def test_r28_a_programme_opened_by_mistake_cannot_be_deleted(api, make_user, intake):
    """The structure page opens applying when a programme is added (#223). An intake with
    no application at all still PROTECTs the programme: delete answers 409 in_use."""
    client = api(make_user(Role.SYSTEM_ADMIN))
    assert not intake.applications.exists()
    response = client.delete(f"/api/v1/programs/{intake.program_id}")
    assert response.status_code == 409


def test_r29_reversed_dates_on_a_year_or_term_are_a_server_error(api, make_user, term):
    """The database checks ends_on > starts_on; the serializers do not, so the API answers
    500 (an IntegrityError) instead of a message — reachable once years are created in the UI."""
    client = api(make_user(Role.SYSTEM_ADMIN))
    client.raise_request_exception = False
    year = client.post(
        "/api/v1/academic-years",
        {"name": "2027/2028", "starts_on": "2028-06-30", "ends_on": "2027-09-01"},
        format="json",
    )
    assert year.status_code == 500
    bad_term = client.patch(
        f"/api/v1/terms/{term.pk}", {"ends_on": "2000-01-01"}, format="json"
    )
    assert bad_term.status_code == 500
