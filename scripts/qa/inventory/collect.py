"""Inventory, backend side (review plan 2026-11-10, «تثبيت ما يدخل في المراجعة»).

On a throwaway in-memory database: what /api/v1/me answers for one user of each role (the
portal register evaluates its route rules with it), and every OpenAPI operation with the URL
name it resolves to and where the permission matrix tests it.

Run by scripts/qa/inventory.sh from backend/ with DJANGO_SETTINGS_MODULE=config.settings.test.
"""

import json
import sys
from pathlib import Path

import django

django.setup()
from django.db import connection  # noqa: E402
from django.test.utils import setup_test_environment  # noqa: E402
from django.urls import Resolver404, resolve  # noqa: E402

setup_test_environment()
connection.creation.create_test_db(verbosity=0)

from rest_framework.test import APIClient  # noqa: E402

from accounts.models import RoleAssignment, User  # noqa: E402
from accounts.rbac import DEPARTMENT_SCOPED_ROLES, Role  # noqa: E402
from core.tests.test_permission_matrix import COVERED_ELSEWHERE, READS  # noqa: E402
from organization.models import College, Department, Program  # noqa: E402
from students.models import StudentRecord  # noqa: E402

out = Path(sys.argv[1])
schema = json.loads(Path(sys.argv[2]).read_text())

college = College.objects.create(code="ECST", name_ar="كلية")
dept = Department.objects.create(college=college, code="IT", name_ar="تقانة المعلومات")
program = Program.objects.create(
    department=dept,
    code="BIT",
    name_ar="بكالوريوس",
    degree="bachelor",
    levels_count=4,
    duration_terms=8,
)
me = {}
for n, role in enumerate(Role):
    user = User.objects.create_user(email=f"u{n}@x.test", password=None, full_name_ar=f"م {n}")
    RoleAssignment.objects.create(
        user=user, role=role, department=dept if role in DEPARTMENT_SCOPED_ROLES else None
    )
    if role == Role.STUDENT:
        StudentRecord.objects.create(
            program=program,
            university_number="26-IT-0099",
            full_name_ar="طالب",
            level=1,
            user=user,
        )
    client = APIClient()
    client.force_authenticate(user)
    response = client.get("/api/v1/me")
    if response.status_code != 200:
        raise SystemExit(f"/api/v1/me answered {response.status_code} for {role}")
    me[str(role)] = json.loads(json.dumps(response.data, default=str))
(out / "me.json").write_text(json.dumps(me, ensure_ascii=False, indent=1))

SAMPLE = {"uuid": "00000000-0000-4000-8000-000000000000", "integer": "1"}


def sample(path: str, operation: dict, shared: list, text: str) -> str:
    """The path with its parameters filled with values of the declared type; ``text`` stands
    for a plain string (a nested id is declared a string but its URL wants digits)."""
    for parameter in [*shared, *operation.get("parameters", [])]:
        if parameter.get("in") != "path":
            continue
        kind = parameter.get("schema", {})
        value = SAMPLE.get(kind.get("format") or kind.get("type"), text)
        path = path.replace("{" + parameter["name"] + "}", value)
    return path


def url_name(path: str, operation: dict, shared: list) -> str:
    for text in ("x", "1"):
        try:
            return resolve(sample(path, operation, shared, text)).url_name or ""
        except Resolver404:
            continue
    return ""


operations = []
for path, item in sorted(schema["paths"].items()):
    for method, operation in item.items():
        if method not in {"get", "post", "put", "patch", "delete"}:
            continue
        name = url_name(path, operation, item.get("parameters", []))
        readers = READS.get(name)
        operations.append(
            {
                "tag": (operation.get("tags") or ["-"])[0],
                "method": method.upper(),
                "path": path,
                "operation": operation.get("operationId", ""),
                "url_name": name or "",
                "surface": path.split("/")[2] if path.startswith("/api/") else "",
                "matrix": (
                    "READS: " + " ".join(sorted(str(r) for r in readers[1]))
                    if readers
                    else COVERED_ELSEWHERE.get(name, "")
                ),
            }
        )
(out / "backend.json").write_text(json.dumps(operations, ensure_ascii=False, indent=1))
print(len(me), "roles,", len(operations), "operations")
