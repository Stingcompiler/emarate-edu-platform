from unittest import mock

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def test_health_is_public_and_reports_ok(client):
    response = client.get("/api/public/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["cache"] == "ok"
    assert body["version"]
    assert body["server_time"].endswith("Z") or "+" in body["server_time"]
    assert response["Cache-Control"] == "no-store"


def test_health_returns_503_when_database_is_down(client):
    with mock.patch("core.views._database_ok", return_value=False):
        response = client.get("/api/public/health")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["database"] == "error"


def test_health_rejects_writes(client):
    response = client.post("/api/public/health")

    assert response.status_code == 405
    assert response["Content-Type"] == "application/problem+json"
