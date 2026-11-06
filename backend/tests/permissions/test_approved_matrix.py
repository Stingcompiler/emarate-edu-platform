"""Policy-driven checks. Failures are findings; do not fix production in this audit."""

import pytest

from accounts import rbac
from core.tests.test_permission_matrix import READS
from core.tests.test_permission_matrix import world as fixture_world

from .matrix import ALIASES, CELLS, MATRIX, READ_BINDINGS, ROLES, UNCOVERED

world = fixture_world


@pytest.mark.parametrize("key,code", CELLS, ids=[f"{k}-{r}" for k, r in CELLS])
def test_central_scope_matches_matrix(key, code, users, it_dept, ba_dept):
    expected = MATRIX[key]["values"][code]
    scope = rbac.scope_for(users[ROLES[code]], ALIASES.get(key, key))
    actual = "all" if scope.everything else "-" if scope.none else "dept"
    assert actual == expected
    if expected == "dept":
        assert scope.allows(it_dept.pk)
        assert not scope.allows(ba_dept.pk)


READ_CASES = [
    (key, endpoint, code)
    for key, endpoints in READ_BINDINGS.items()
    for endpoint in endpoints
    for code in ROLES
    if code not in UNCOVERED
]


@pytest.mark.parametrize(
    "key,endpoint,code", READ_CASES, ids=[f"{k}-{e}-{r}" for k, e, r in READ_CASES]
)
def test_approved_read_api(key, endpoint, code, users, api, world, record_property):
    url = READS[endpoint][0].format(**world)
    response = api(users[ROLES[code]]).get(url)
    expected = MATRIX[key]["values"][code]
    record_property("url", url)
    record_property("expected", expected)
    record_property("http", response.status_code)
    record_property("policy_line", MATRIX[key]["line"])
    body = getattr(response, "data", None)
    if isinstance(body, dict) and "results" in body:
        record_property("returned_rows", len(body["results"]))
    assert response.status_code in ((403, 404) if expected == "-" else (200,)), (
        f"{key} {code}: expected {expected}, GET {url} returned {response.status_code}"
    )


SCOPED_DETAILS = [
    (key, endpoint, code)
    for key, endpoint, code in READ_CASES
    if MATRIX[key]["values"][code] == "dept"
    and endpoint.endswith("-detail")
    and key != "users.view"
]


@pytest.mark.parametrize(
    "key,endpoint,code", SCOPED_DETAILS, ids=[f"{k}-{e}-{r}" for k, e, r in SCOPED_DETAILS]
)
def test_approved_cross_department_detail(
    key, endpoint, code, make_user, ba_dept, api, world, record_property
):
    actor = make_user(ROLES[code], department=ba_dept)
    url = READS[endpoint][0].format(**world)
    response = api(actor).get(url)
    record_property("url", url)
    record_property("http", response.status_code)
    assert response.status_code in (403, 404)
