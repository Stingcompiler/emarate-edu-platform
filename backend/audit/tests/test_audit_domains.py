"""docs/03 §7 «سجل التدقيق»: besides the system admin (all) and the department manager and
supervisor (their department), the head registrar, registrar, results officer, academic affairs
and site manager read the log of their own field of work (review 2026-10-25 decisions, item 8)."""

from accounts.rbac import Role
from audit.models import AuditLog

URL = "/api/v1/audit-logs"


def _log(action, department=None):
    return AuditLog.objects.create(
        action=action, target_type="x", target_id="1", target_repr=action, department=department
    )


def test_each_role_reads_its_own_field_of_work(api, make_user, it_dept, ba_dept):
    _log("admissions.submit", it_dept)
    _log("admissions.submit", ba_dept)
    _log("inquiry.reply", None)
    _log("results.commit", it_dept)
    _log("results.correction_approve", it_dept)
    _log("course.update", it_dept)
    _log("page.update")
    _log("announcement.publish")
    _log("announcement.publish", it_dept)
    _log("account.password_admin_reset")
    _log("role.grant")

    def seen(user):
        rows = api(user).get(URL, {"page_size": 100}).data["results"]
        return {(r["action"], r["department"]) for r in rows}

    it, ba = it_dept.pk, ba_dept.pk
    assert seen(make_user(Role.HEAD_REGISTRAR)) == {
        ("admissions.submit", it),
        ("admissions.submit", ba),
        ("inquiry.reply", None),
    }
    assert seen(make_user(Role.REGISTRAR, department=it_dept)) == {("admissions.submit", it)}
    assert seen(make_user(Role.RESULTS_OFFICER)) == {
        ("results.commit", it),
        ("results.correction_approve", it),
    }
    assert seen(make_user(Role.ACADEMIC_AFFAIRS)) == {
        ("course.update", it),
        ("results.correction_approve", it),
    }
    assert seen(make_user(Role.SITE_MANAGER)) == {
        ("announcement.publish", None),
        ("inquiry.reply", None),
        ("page.update", None),
    }
    # Unchanged: the system admin sees all of it, the department manager its department.
    assert len(seen(make_user(Role.SYSTEM_ADMIN))) == 11
    assert {d for _, d in seen(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))} == {it}
    for role in (Role.TEACHER, Role.HR, Role.EVENTS_MANAGER, Role.STUDENT):
        assert api(make_user(role)).get(URL).status_code == 403, role
