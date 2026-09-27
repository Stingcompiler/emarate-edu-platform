import json

import pytest
from django.core.management import call_command


@pytest.mark.django_db
def test_openapi_schema_is_valid_and_warning_free(tmp_path):
    out = tmp_path / "openapi.json"

    call_command(
        "spectacular",
        "--file",
        str(out),
        "--format",
        "openapi-json",
        "--validate",
        "--fail-on-warn",
    )

    schema = json.loads(out.read_text())
    assert "/api/public/health" in schema["paths"]
    assert schema["info"]["title"] == "ECST Platform API"
