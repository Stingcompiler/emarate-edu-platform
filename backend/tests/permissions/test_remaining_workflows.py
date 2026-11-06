"""Additional approved workflow adapters; expected roles come from Markdown."""

import pytest

from organization.models import SystemSettings
from results.models import ResultDisplaySettings
from student_affairs.models import StudentCase
from students.models import StudentRecord

from .matrix import MATRIX, ROLES, UNCOVERED

KEYS = ["system.settings", "results.settings.manage", "students.change_status", "cases.manage"]
CASES = [(key, code) for key in KEYS for code in ROLES if code not in UNCOVERED]


@pytest.mark.parametrize("key,code", CASES, ids=[f"{k}-{c}" for k, c in CASES])
def test_workflow_effect(key, code, api, users, make_student, it_program):
    student = make_student(it_program, "AUDIT-WORKFLOW")
    if key == "system.settings":
        obj = SystemSettings.load()
        url, method = "/api/v1/system-settings", "patch"
        field, value = "otp_ttl_minutes", 17
    elif key == "results.settings.manage":
        obj = ResultDisplaySettings.load()
        url, method = "/api/v1/results/settings", "patch"
        field, value = "notice_text", "Audit notice"
    else:
        obj = student
        url, method = f"/api/v1/students/{student.public_id}/status", "post"
        field, value = "status", "suspended"
    data = {field: value, "reason": "Audit reason"}
    if key == "cases.manage":
        url = "/api/v1/cases"
        data = {
            "student_record": str(student.public_id),
            "kind": "conduct",
            "title": "Audit case",
            "description": "Internal",
        }
    models = [SystemSettings, ResultDisplaySettings, StudentRecord, StudentCase]
    before = [list(m.objects.order_by("pk").values()) for m in models]
    response = getattr(api(users[ROLES[code]]), method)(url, data, format="json")
    if MATRIX[key]["values"][code] == "-":
        assert before == [list(m.objects.order_by("pk").values()) for m in models]
        assert response.status_code in (403, 404), response.data
    else:
        assert response.status_code == (201 if key == "cases.manage" else 200), response.data
        if key == "cases.manage":
            assert StudentCase.objects.filter(student_record=student, title="Audit case").exists()
        else:
            obj.refresh_from_db()
            assert getattr(obj, field) == value
