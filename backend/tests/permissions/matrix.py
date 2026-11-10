"""Approved policy parser and explicit aliases; no expectations imported from RBAC."""

from pathlib import Path

from accounts.rbac import Role

SOURCE = Path(__file__).resolve().parents[3] / "docs" / "roles-matrix.md"
ROLES = dict(
    zip(
        [
            "SA",
            "SS",
            "REG",
            "DREG",
            "RES",
            "ACA",
            "STU",
            "DH",
            "DS",
            "PROF",
            "TA",
            "STD",
            "HR",
            "WEB",
            "EVT",
        ],
        [
            Role.SYSTEM_ADMIN,
            Role.SYSTEM_SUPERVISOR,
            Role.HEAD_REGISTRAR,
            Role.REGISTRAR,
            Role.RESULTS_OFFICER,
            Role.ACADEMIC_AFFAIRS,
            Role.STUDENT_AFFAIRS,
            Role.DEPARTMENT_MANAGER,
            Role.DEPARTMENT_SUPERVISOR,
            Role.TEACHER,
            Role.TA,
            Role.STUDENT,
            Role.HR,
            Role.SITE_MANAGER,
            Role.EVENTS_MANAGER,
        ],
        strict=True,
    )
)
UNCOVERED = {"PROF", "TA", "STD"}
ALIASES = {
    "system.settings": "settings.manage",
    "structure.edit": "structure.manage",
    "users.edit_username": "users.rename",
    "activity.view": "audit.domain",
    "dept.members.add": "membership.manage",
    "dept.members.remove": "membership.remove",
    "content.view": "learning.view",
    "content.manage": "learning.manage",
    "content.delete": "learning.delete",
    "enrollment.approve": "registration.approve",
    "students.change_status": "students.status",
    "results.upload_publish": "results.manage",
    "results.delete_batch": "results.delete",
    "results.request_change": "results.correct",
    "results.approve_change": "results.approve",
    "results.settings.manage": "results.settings",
    "results.settings.view": "results.settings_view",
    "regulations.publish": "regulations.manage",
    "reports.faculty_kpi": "reports.teachers",
    "reports.student_affairs": "reports.affairs",
    "hr.manage": "hr.view",
    "hr.notify_faculty": "hr.notify",
    "site.content": "content.manage",
    "site.events": "events.manage",
    "site.staff": "site_staff.manage",
    "site.news": "news.manage",
}


def read_matrix():
    rows = {}
    for line, text in enumerate(SOURCE.read_text().splitlines(), 1):
        if not text.startswith("|"):
            continue
        cells = [x.strip() for x in text.strip("|").split("|")]
        if len(cells) != 17 or cells[2] not in {"all", "dept", "-"}:
            continue
        key, label, *values = cells
        assert key not in rows, f"duplicate policy key {key}"
        assert set(values) <= {"all", "dept", "-"}
        rows[key] = {"label": label, "line": line, "values": dict(zip(ROLES, values, strict=True))}
    assert rows, "Approved matrix has no operation rows"
    assert not ALIASES.keys() - rows.keys(), "Stale aliases"
    return rows


MATRIX = read_matrix()
CELLS = [(key, code) for key in MATRIX for code in ROLES if code not in UNCOVERED]

# Explicit operation-to-endpoint mapping. Only URL templates / fixtures are reused from
# existing tests; expected roles always come from the approved Markdown above.
READ_BINDINGS = {
    "system.settings": ["system-settings"],
    "structure.view": [
        "college-list",
        "department-list",
        "department-detail",
        "program-list",
        "program-detail",
        "academic-year-list",
        "term-list",
    ],
    "users.view": ["user-list", "user-detail"],
    "courses.view": ["course-list", "course-detail", "offering-list", "offering-detail"],
    "students.view": ["student-list", "student-detail"],
    "students.import": ["student-import-list", "student-import-detail", "student-import-rows"],
    "enrollment.approve": ["registration-request-list", "registration-request-detail"],
    "enrollment.manage": ["enrollment-list", "enrollment-detail"],
    "content.view": [
        "lecture-list",
        "lecture-detail",
        "assignment-list",
        "assignment-detail",
        "exam-list",
        "exam-detail",
    ],
    "results.view": [
        "result-list",
        "result-detail",
        "result-export",
        "result-import-list",
        "result-import-detail",
        "result-import-rows",
    ],
    "results.settings.view": ["result-settings", "grading-scale-list", "term-release-list"],
    "cases.view": ["case-list", "case-detail"],
    "admissions.view": ["application-list", "application-detail", "application-summary"],
    "reports.department": ["report-department"],
    "reports.faculty_kpi": ["report-teachers", "report-teacher"],
    "reports.admissions": ["report-admissions"],
    "reports.student_affairs": ["report-affairs"],
    "site.content": ["page-list", "redirect-list", "site-settings", "menu"],
    "site.events": ["event-list"],
    "site.staff": ["site-staff", "site-staff-people", "site-staff-group-list"],
}
