"""Approved admission workflows and HR notice boundaries."""

import pytest

from accounts.rbac import Role
from admissions.models import AdmissionCycle, Application
from core.tests.test_permission_matrix import world as fixture_world
from notifications.models import HRNotice

from .matrix import MATRIX, ROLES, UNCOVERED

world = fixture_world
KEYS = ["admissions.manage", "admissions.review", "hr.notify_faculty", "hr.manage"]
CASES = [
    (key, code, side)
    for key in KEYS
    for code in ROLES
    if code not in UNCOVERED
    for side in ["own", "other"]
]


@pytest.mark.parametrize("key,code,side", CASES, ids=[f"{k}-{c}-{s}" for k, c, s in CASES])
def test_admissions_and_hr(
    key, code, side, api, make_user, users, it_dept, ba_dept, world, record_property
):
    actor = make_user(ROLES[code], department=it_dept if side == "own" else ba_dept)
    application = Application.objects.get(public_id=world["application"])
    cycle = application.intake.cycle
    models = [Application, AdmissionCycle, HRNotice]
    before = [list(m.objects.order_by("pk").values()) for m in models]
    client = api(actor)
    if key == "admissions.manage":
        response = client.patch(
            f"/api/v1/admission-cycles/{cycle.pk}", {"name": "Audit cycle"}, format="json"
        )
    elif key == "admissions.review":
        response = client.post(
            f"/api/v1/applications/{application.public_id}/transition",
            {"to": "under_review", "note": "Audit review"},
            format="json",
        )
    elif key == "hr.notify_faculty":
        response = client.post(
            "/api/v1/hr-notices",
            {
                "teacher": str(users[Role.TEACHER].public_id),
                "topic": "grading",
                "body": "Audit notice",
            },
            format="json",
        )
    else:
        response = client.get("/api/v1/hr-notices")
    record_property("http", response.status_code)
    if isinstance(response.data, dict) and "results" in response.data:
        record_property("returned_rows", len(response.data["results"]))
    expected = MATRIX[key]["values"][code]
    allowed = expected == "all" or (expected == "dept" and side == "own")
    if not allowed:
        assert before == [list(m.objects.order_by("pk").values()) for m in models]
        assert response.status_code in (403, 404), response.data
    else:
        assert response.status_code == (201 if key == "hr.notify_faculty" else 200), response.data
        if key == "admissions.manage":
            cycle.refresh_from_db()
            assert cycle.name == "Audit cycle"
        elif key == "admissions.review":
            application.refresh_from_db()
            assert application.status == "under_review"
        elif key == "hr.notify_faculty":
            assert HRNotice.objects.filter(sent_by=actor, body="Audit notice").exists()
        else:
            assert any(
                row["public_id"] == str(world["hr_notice"]) for row in response.data["results"]
            )
