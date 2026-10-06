"""API contract (docs/05 §11): every documented operation, fed generated input, never errors.

Schemathesis reads the OpenAPI schema drf-spectacular serves and calls each operation through
the WSGI app as a system admin (the role that reaches the most endpoints).
"""

import pytest
import schemathesis
from django.core import signals
from django.core.cache import cache
from django.core.wsgi import get_wsgi_application
from django.db import close_old_connections
from hypothesis import HealthCheck, assume, settings
from rest_framework_simplejwt.tokens import RefreshToken
from schemathesis.checks import not_a_server_error

from accounts.rbac import Role

schema = schemathesis.openapi.from_wsgi("/api/schema/", get_wsgi_application())
CSRF = "c" * 32


@pytest.fixture
def admin_headers(make_user):
    admin = make_user(Role.SYSTEM_ADMIN)
    access = str(RefreshToken.for_user(admin).access_token)
    # Requests go through the real WSGI handler, whose request signals close the database
    # connection — and with it the test transaction on PostgreSQL. Django's test client
    # detaches the same handler for the same reason.
    signals.request_started.disconnect(close_old_connections)
    signals.request_finished.disconnect(close_old_connections)
    yield {"Cookie": f"access={access}; csrftoken={CSRF}", "X-CSRFToken": CSRF}
    signals.request_started.connect(close_old_connections)
    signals.request_finished.connect(close_old_connections)


@schema.parametrize()
@settings(
    max_examples=4,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow],
)
def test_no_operation_fails_with_a_server_error(case, admin_headers):
    # Schemathesis cannot encode a non-object body as multipart (a tool limit, not an API one);
    # every other invalid body is still sent.
    assume(not (case.media_type == "multipart/form-data" and not isinstance(case.body, dict)))
    cache.clear()  # throttle history lives in the cache; thousands of calls must get through
    response = case.call(headers=admin_headers)
    case.validate_response(response, checks=(not_a_server_error,))


def test_a_nul_byte_in_the_address_is_a_400_not_a_500(client, db):
    """Found by the contract run on Postgres: /api/public/redirects?path=…%00… was a 500."""
    response = client.get("/api/public/redirects?path=%2Fold%00page")
    assert response.status_code == 400
    assert response["Content-Type"] == "application/problem+json"
    assert response.json()["code"] == "invalid_character"
    assert client.get("/api/public/redirects?path=%2Fnothing").status_code == 404


def test_a_write_and_its_audit_entry_commit_together(api, make_user, monkeypatch):
    """Review 2026-10-04 C5: when record() failed, the 500 left the settings changed with no
    audit entry. A write request is one transaction now."""
    import pytest

    import results.views
    from accounts.rbac import Role
    from results.models import ResultDisplaySettings

    before = ResultDisplaySettings.load().show_score

    def fail(*args, **kwargs):
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(results.views, "record", fail)
    officer = make_user(Role.RESULTS_OFFICER)
    with pytest.raises(RuntimeError):
        api(officer).patch("/api/v1/results/settings", {"show_score": not before})
    assert ResultDisplaySettings.load().show_score is before
