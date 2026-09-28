"""API contract (docs/05 §11): every documented operation, fed generated input, never errors.

Schemathesis reads the OpenAPI schema drf-spectacular serves and calls each operation through
the WSGI app as a system admin (the role that reaches the most endpoints).
"""

import pytest
import schemathesis
from django.core.cache import cache
from django.core.wsgi import get_wsgi_application
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
    return {"Cookie": f"access={access}; csrftoken={CSRF}", "X-CSRFToken": CSRF}


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
