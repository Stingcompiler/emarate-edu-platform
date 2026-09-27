import pytest
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.views import APIView

pytestmark = pytest.mark.django_db


class _NameSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=5)


class _ValidatingView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        _NameSerializer(data=request.data).is_valid(raise_exception=True)
        return Response({"ok": True})


class _PrivateView(APIView):
    def get(self, request):
        return Response({"secret": True})


def test_validation_errors_use_problem_json_with_field_errors():
    request = APIRequestFactory().post("/x", {"name": "too-long-value"}, format="json")

    response = _ValidatingView.as_view()(request)
    response.render()

    assert response.status_code == 400
    assert response["Content-Type"] == "application/problem+json"
    assert response.data["status"] == 400
    assert response.data["code"] == "invalid"
    assert list(response.data["errors"]) == ["name"]


def test_endpoints_require_authentication_by_default():
    request = APIRequestFactory().get("/x")

    response = _PrivateView.as_view()(request)
    response.render()

    # 401 (not 403): the cookie JWT authenticator names a WWW-Authenticate scheme.
    assert response.status_code == 401
    assert response["Content-Type"] == "application/problem+json"
    assert response.data["code"] == "not_authenticated"


def test_unknown_api_path_returns_problem_json():
    response = APIClient().get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response["Content-Type"] == "application/problem+json"
    assert response.json()["code"] == "not_found"
