"""Policy-driven registration and result decisions with persisted side effects."""

import pytest

from accounts.models import RegistrationRequest, RoleAssignment, User
from core.tests.test_permission_matrix import world as fixture_world
from results.models import AcademicResult, ResultCorrection

from .matrix import MATRIX, ROLES, UNCOVERED

world = fixture_world
KEYS = ["enrollment.approve", "results.request_change", "results.approve_change"]
CASES = [
    (key, code, side)
    for key in KEYS
    for code in ROLES
    if code not in UNCOVERED
    for side in ("own", "other")
]


@pytest.mark.parametrize("key,code,side", CASES, ids=[f"{k}-{c}-{s}" for k, c, s in CASES])
def test_decision_policy(key, code, side, api, make_user, it_dept, ba_dept, world, record_property):
    actor = make_user(ROLES[code], department=it_dept if side == "own" else ba_dept)
    result = AcademicResult.objects.get(pk=world["result"])
    correction = ResultCorrection.objects.get(public_id=world["correction"])
    correction.new = {"score": "85", "letter": "A", "grade_points": "4.0", "status": "pass"}
    correction.save()
    registration = RegistrationRequest.objects.get(public_id=world["registration"])
    if key == "enrollment.approve":
        url = f"/api/v1/registration-requests/{registration.public_id}/decide"
        payload = {"approve": True}
    elif key == "results.request_change":
        correction.delete()
        url = f"/api/v1/results/{result.pk}/corrections"
        payload = {"score": "85", "reason": "Audit correction"}
    else:
        url = f"/api/v1/result-corrections/{correction.public_id}/decide"
        payload = {"approve": True}
    models = [AcademicResult, ResultCorrection, RegistrationRequest, User, RoleAssignment]
    before = [list(model.objects.order_by("pk").values()) for model in models]
    response = api(actor).post(url, payload, format="json")
    record_property("http", response.status_code)
    expected = MATRIX[key]["values"][code]
    allowed = expected == "all" or (expected == "dept" and side == "own")
    if not allowed:
        assert before == [list(model.objects.order_by("pk").values()) for model in models]
        assert response.status_code in (403, 404), response.data
        return
    assert response.status_code == (201 if key == "results.request_change" else 200), response.data
    if key == "enrollment.approve":
        registration.refresh_from_db()
        assert registration.status == "approved"
        assert registration.decided_by_id == actor.pk
        assert registration.student_record.user.is_active
        assert RoleAssignment.objects.filter(
            user=registration.student_record.user, role="student"
        ).exists()
    elif key == "results.request_change":
        item = ResultCorrection.objects.get(result=result)
        assert item.requested_by_id == actor.pk
        assert item.status == "pending"
        result.refresh_from_db()
        assert result.score == 80
    else:
        result.refresh_from_db()
        correction.refresh_from_db()
        assert result.score == 85
        assert correction.status == "approved"
        assert correction.decided_by_id == actor.pk


@pytest.mark.parametrize(
    "code", [code for code in ROLES if MATRIX["results.view"]["values"][code] == "dept"]
)
def test_results_foreign_search_and_export(code, api, make_user, ba_dept, world):
    actor = make_user(ROLES[code], department=ba_dept)
    result = AcademicResult.objects.get(pk=world["result"])
    marker = result.student_record.university_number
    for suffix in [
        "",
        f"?search={marker}",
        f"?student_record__public_id={result.student_record.public_id}",
    ]:
        response = api(actor).get("/api/v1/results" + suffix)
        assert response.status_code == 200
        assert response.data["results"] == []
    response = api(actor).get(f"/api/v1/results/export?term={result.term_id}")
    assert response.status_code == 200
    assert marker.encode() not in response.content
    assert api(actor).get(f"/api/v1/results/{result.pk}").status_code == 404


def test_student_unpublished_result_hidden_with_positive_control(api, users, world):
    from accounts.rbac import Role

    client = api(users[Role.STUDENT])
    result = AcademicResult.objects.get(pk=world["result"])
    visible = client.get("/api/v1/me/results")
    assert visible.status_code == 200
    assert visible.data["terms"]
    result.is_published = False
    result.save(update_fields=["is_published"])
    hidden = client.get("/api/v1/me/results")
    assert hidden.status_code == 200
    assert hidden.data["terms"] == []
    assert client.get(f"/api/v1/results/{result.pk}").status_code in (403, 404)
    assert client.get("/api/v1/results").data["results"] == []
    assert client.get(f"/api/v1/results/export?term={result.term_id}").status_code == 403
