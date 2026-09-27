"""Every /api/v1 endpoint × every role (docs/03 §7).

READS lists who may read each endpoint; the rest must get 403 (or 404 when the
object is outside their scope). Endpoints whose rules are about writes are
tested in the module named in COVERED_ELSEWHERE. A new endpoint without a row
in either table fails ``test_every_endpoint_has_a_row``.
"""

from __future__ import annotations

import importlib

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import URLResolver

from academic.models import Enrollment
from accounts.models import RegistrationRequest, User
from accounts.rbac import Role
from audit.models import AuditLog
from students.models import StudentImportBatch

R = Role
EVERYONE = frozenset(Role)
STRUCTURE = frozenset(
    {
        R.SYSTEM_ADMIN,
        R.HEAD_REGISTRAR,
        R.REGISTRAR,
        R.RESULTS_OFFICER,
        R.ACADEMIC_AFFAIRS,
        R.STUDENT_AFFAIRS,
        R.DEPARTMENT_MANAGER,
        R.DEPARTMENT_SUPERVISOR,
    }
)
COURSES = frozenset(
    {
        R.SYSTEM_ADMIN,
        R.HEAD_REGISTRAR,
        R.ACADEMIC_AFFAIRS,
        R.DEPARTMENT_MANAGER,
        R.DEPARTMENT_SUPERVISOR,
    }
)
ENROLLMENT = frozenset(
    {R.SYSTEM_ADMIN, R.HEAD_REGISTRAR, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
)
STUDENTS = frozenset(
    {
        R.SYSTEM_ADMIN,
        R.HEAD_REGISTRAR,
        R.STUDENT_AFFAIRS,
        R.DEPARTMENT_MANAGER,
        R.DEPARTMENT_SUPERVISOR,
    }
)
IMPORTS = frozenset({R.SYSTEM_ADMIN, R.HEAD_REGISTRAR})
AUDIT = frozenset({R.SYSTEM_ADMIN, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR})
# In the world below, the teacher and TA are assigned to IT101 and the student is enrolled.
LEARNING_STAFF = frozenset(
    {
        R.SYSTEM_ADMIN,
        R.ACADEMIC_AFFAIRS,
        R.DEPARTMENT_MANAGER,
        R.DEPARTMENT_SUPERVISOR,
        R.TEACHER,
        R.TA,
    }
)
LEARNING = LEARNING_STAFF | {R.STUDENT}
OUTSIDERS = EVERYONE - LEARNING  # learning objects outside your courses are 404

# url name → (path template, roles allowed to read, roles that get 404 instead of 403)
READS: dict[str, tuple[str, frozenset, frozenset]] = {
    "me": ("/api/v1/me", EVERYONE, frozenset()),
    "me-courses": ("/api/v1/me/courses", EVERYONE, frozenset()),
    "system-settings": ("/api/v1/system-settings", frozenset({R.SYSTEM_ADMIN}), frozenset()),
    "college-list": ("/api/v1/colleges", STRUCTURE, frozenset()),
    "college-detail": ("/api/v1/colleges/{college}", STRUCTURE, frozenset()),
    "department-list": ("/api/v1/departments", STRUCTURE, frozenset()),
    "department-detail": ("/api/v1/departments/{dept}", STRUCTURE, frozenset()),
    "program-list": ("/api/v1/programs", STRUCTURE, frozenset()),
    "program-detail": ("/api/v1/programs/{program}", STRUCTURE, frozenset()),
    "academic-year-list": ("/api/v1/academic-years", STRUCTURE, frozenset()),
    "academic-year-detail": ("/api/v1/academic-years/{year}", STRUCTURE, frozenset()),
    "term-list": ("/api/v1/terms", STRUCTURE, frozenset()),
    "term-detail": ("/api/v1/terms/{term}", STRUCTURE, frozenset()),
    "course-list": ("/api/v1/courses", COURSES, frozenset()),
    "course-detail": ("/api/v1/courses/{course}", COURSES, frozenset()),
    "offering-list": ("/api/v1/offerings", COURSES, frozenset()),
    "offering-detail": ("/api/v1/offerings/{offering}", COURSES, frozenset()),
    "department-members": ("/api/v1/departments/{dept}/members", COURSES, frozenset()),
    "enrollment-list": ("/api/v1/enrollments", ENROLLMENT, frozenset()),
    "enrollment-detail": ("/api/v1/enrollments/{enrollment}", ENROLLMENT, frozenset()),
    "student-list": ("/api/v1/students", STUDENTS, frozenset()),
    "student-detail": ("/api/v1/students/{student}", STUDENTS, frozenset()),
    "student-import-list": ("/api/v1/student-imports", IMPORTS, frozenset()),
    "student-import-detail": ("/api/v1/student-imports/{batch}", IMPORTS, frozenset()),
    "student-import-rows": ("/api/v1/student-imports/{batch}/rows", IMPORTS, frozenset()),
    "user-list": (
        "/api/v1/users",
        frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.HEAD_REGISTRAR}),
        frozenset(),
    ),
    # The head registrar sees registrars only, so a teacher is hidden (404).
    "user-detail": (
        "/api/v1/users/{teacher}",
        frozenset({R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS}),
        frozenset({R.HEAD_REGISTRAR}),
    ),
    "role-assignment-list": (
        "/api/v1/role-assignments",
        frozenset({R.SYSTEM_ADMIN, R.HEAD_REGISTRAR, R.ACADEMIC_AFFAIRS, R.SITE_MANAGER}),
        frozenset(),
    ),
    "registration-request-list": ("/api/v1/registration-requests", ENROLLMENT, frozenset()),
    "registration-request-detail": (
        "/api/v1/registration-requests/{registration}",
        ENROLLMENT,
        frozenset(),
    ),
    "audit-log-list": ("/api/v1/audit-logs", AUDIT, frozenset()),
    "audit-log-detail": ("/api/v1/audit-logs/{audit}", AUDIT, frozenset()),
    "lecture-list": ("/api/v1/lectures", EVERYONE, frozenset()),
    "lecture-detail": ("/api/v1/lectures/{lecture}", LEARNING, OUTSIDERS),
    "assignment-list": ("/api/v1/assignments", EVERYONE, frozenset()),
    "assignment-detail": ("/api/v1/assignments/{assignment}", LEARNING, OUTSIDERS),
    "assignment-submissions": (
        "/api/v1/assignments/{assignment}/submissions",
        LEARNING_STAFF,
        OUTSIDERS,  # the enrolled student gets 403
    ),
    "assignment-my-submission": (
        "/api/v1/assignments/{assignment}/my-submission",
        frozenset({R.STUDENT}),
        EVERYONE - {R.STUDENT},
    ),
    "submission-detail": ("/api/v1/submissions/{submission}", LEARNING, OUTSIDERS),
    "file-url": ("/api/v1/files/{file}/url", LEARNING, OUTSIDERS),
    "video-playback": ("/api/v1/videos/{video}/playback", LEARNING, OUTSIDERS),
    # Personal: every user reads their own inbox, preferences and sent list.
    "notification-list": ("/api/v1/notifications", EVERYONE, frozenset()),
    "notification-unread-count": ("/api/v1/notifications/unread-count", EVERYONE, frozenset()),
    "notification-preferences": ("/api/v1/notifications/preferences", EVERYONE, frozenset()),
    "notification-sent-list": ("/api/v1/notifications/sent", EVERYONE, frozenset()),
    "notification-sent-audiences": (
        "/api/v1/notifications/sent/audiences",
        EVERYONE,
        frozenset(),
    ),
    "push-config": ("/api/v1/push/config", EVERYONE, frozenset()),
    "hr-notice-list": ("/api/v1/hr-notices", EVERYONE, frozenset()),
    "hr-notice-detail": (
        "/api/v1/hr-notices/{hr_notice}",
        frozenset({R.SYSTEM_ADMIN, R.HR, R.TEACHER}),
        EVERYONE - {R.SYSTEM_ADMIN, R.HR, R.TEACHER},
    ),
}

# url name → "module::test" that pins down its (write) rules.
_L = "learning.tests.test_learning::"
_F = "files.tests.test_files::"
_N = "notifications.tests.test_notifications::"
COVERED_ELSEWHERE = {
    "notification-read": _N + "test_inbox_read_and_counts",
    "notification-read-all": _N + "test_inbox_read_and_counts",
    "notification-sent-preview": _N + "test_audience_options_and_preview",
    "push-subscribe": _N + "test_teacher_notifies_their_course_and_push_arrives",
    "push-unsubscribe": _N + "test_push_unsubscribe_and_config",
    "hr-notice-acknowledge": _N + "test_hr_notice",
    "lecture-publish": _L + "test_students_see_published_lectures_only",
    "lecture-unpublish": _L + "test_resource_removal_and_unpublish",
    "lecture-add-resource": _L + "test_lecture_file_link_is_signed_and_scoped",
    "lecture-remove-resource": _L + "test_resource_removal_and_unpublish",
    "assignment-publish": _L + "test_drafts_are_hidden_and_publish_needs_submission_types",
    "assignment-close": _L + "test_assignment_with_submissions_cannot_be_deleted",
    "assignment-submit": _L + "test_submit_resubmit_and_grade",
    "submission-grade": _L + "test_submit_resubmit_and_grade",
    "submission-approve": _L + "test_rule_grading_is_a_suggestion_until_approved",
    "file-upload": _L + "test_upload_permissions",
    "video-ticket": _F + "test_student_cannot_request_upload_tickets",
    "video-local-upload": _F + "test_local_video_flow",
    "role-assignment-detail": (
        "core.tests.test_permission_matrix::test_revoking_follows_the_same_rules"
    ),
    "auth-login": "accounts.tests.test_auth::test_login_sets_httponly_cookies",
    "auth-refresh": "accounts.tests.test_auth::test_refresh_rotates_and_old_token_dies",
    "auth-logout": "accounts.tests.test_auth::test_logout_revokes_refresh",
    "department-member-detail": "academic.tests.test_enrollment::test_members_and_instructors",
    "offering-add-instructor": "academic.tests.test_enrollment::test_members_and_instructors",
    "offering-remove-instructor": "academic.tests.test_enrollment::test_members_and_instructors",
    "enrollment-bulk": "academic.tests.test_enrollment::test_bulk_enroll_is_idempotent",
    "enrollment-drop": "academic.tests.test_enrollment::test_enroll_and_drop",
    "student-import-commit": "students.tests.test_importer::test_preview_then_commit",
    "student-import-reject": "students.tests.test_importer::test_reject_closes_the_batch",
    "registration-request-decide": (
        "accounts.tests.test_registration::test_other_email_waits_for_the_department"
    ),
}


def _url_names() -> set[str]:
    module = importlib.import_module("config.urls_v1")

    def walk(patterns):
        for pattern in patterns:
            if isinstance(pattern, URLResolver):
                yield from walk(pattern.url_patterns)
            else:
                yield pattern.name

    return set(walk(module.urlpatterns))


def test_every_endpoint_has_a_row():
    names = _url_names()
    missing = names - READS.keys() - COVERED_ELSEWHERE.keys()
    assert not missing, f"Add these endpoints to the permission matrix: {sorted(missing)}"
    assert not (READS.keys() | COVERED_ELSEWHERE.keys()) - names, "stale rows"
    for target in COVERED_ELSEWHERE.values():
        module, function = target.split("::")
        assert hasattr(importlib.import_module(module), function), target


@pytest.fixture
def world(users, college, it_dept, it_program, term, it_offering, make_student, make_user):
    student = make_student(it_program, "26-IT-0001")
    enrollment = Enrollment.objects.create(offering=it_offering, student_record=student)
    batch = StudentImportBatch.objects.create(
        file_name="s.csv",
        file=SimpleUploadedFile("s.csv", b"x"),
        uploaded_by=users[R.HEAD_REGISTRAR],
        status=StudentImportBatch.Status.VALIDATED,
    )
    applicant = make_student(it_program, "26-IT-0002")
    applicant.user = User.objects.create_user(
        email="pending@x.test", password="x", full_name_ar="م", is_active=False
    )
    applicant.save()
    registration = RegistrationRequest.objects.create(
        student_record=applicant,
        email="pending@x.test",
        status=RegistrationRequest.Status.PENDING_APPROVAL,
    )
    audit = AuditLog.objects.create(
        action="test", target_type="x", target_id="1", target_repr="x", department=it_dept
    )
    learning = _learning_world(users, it_offering, student)
    return {
        "college": college.pk,
        "dept": it_dept.pk,
        "program": it_program.pk,
        "year": term.academic_year_id,
        "term": term.pk,
        "course": it_offering.course_id,
        "offering": it_offering.pk,
        "enrollment": enrollment.pk,
        "student": student.public_id,
        "batch": batch.public_id,
        "teacher": users[R.TEACHER].public_id,
        "registration": registration.public_id,
        "audit": audit.pk,
        **learning,
    }


def _learning_world(users, offering, student):
    from datetime import timedelta

    from django.utils import timezone

    from conftest import pdf_upload
    from files.models import StoredFile, VideoAsset
    from learning.models import Assignment, Lecture, LectureResource, Submission

    teacher = users[R.TEACHER]
    offering.instructors.create(user=teacher, role="teacher")
    offering.instructors.create(user=users[R.TA], role="ta")
    student.user = users[R.STUDENT]
    student.save()
    lecture = Lecture.objects.create(
        offering=offering, title_ar="م1", is_published=True, created_by=teacher
    )
    stored = StoredFile.objects.create(
        purpose="lecture",
        offering=offering,
        file=pdf_upload(),
        name="notes.pdf",
        size=10,
        mime="application/pdf",
        sha256="0" * 64,
        uploaded_by=teacher,
    )
    video = VideoAsset.objects.create(
        offering=offering,
        title="v",
        provider="local",
        file=pdf_upload("v.mp4"),
        status="ready",
        uploaded_by=teacher,
    )
    LectureResource.objects.create(lecture=lecture, kind="file", title="f", file=stored)
    LectureResource.objects.create(lecture=lecture, kind="video", title="v", video=video)
    assignment = Assignment.objects.create(
        offering=offering,
        title="w1",
        due_at=timezone.now() + timedelta(days=1),
        submission_types=["text"],
        status="published",
        created_by=teacher,
    )
    submission = Submission.objects.create(
        assignment=assignment, student_record=student, first_submitted_at=timezone.now()
    )
    from notifications.models import HRNotice

    notice = HRNotice.objects.create(teacher=teacher, sent_by=users[R.HR], subject="s", body="b")
    return {
        "hr_notice": notice.public_id,
        "lecture": lecture.public_id,
        "assignment": assignment.public_id,
        "submission": submission.public_id,
        "file": stored.public_id,
        "video": video.public_id,
    }


@pytest.mark.parametrize("name", sorted(READS))
def test_read_matrix(name, api, users, world):
    template, allowed, hidden = READS[name]
    url = template.format(**world)
    wrong = []
    anonymous = api().get(url).status_code
    if anonymous != 401:
        wrong.append(f"anonymous: {anonymous} (expected 401)")
    for role in Role:
        expected = 200 if role in allowed else 404 if role in hidden else 403
        got = api(users[role]).get(url).status_code
        if got != expected:
            wrong.append(f"{role.value}: {got} (expected {expected})")
    assert not wrong, f"{name} {url}\n" + "\n".join(wrong)


# ─── Department scope: the same roles, but on another department's objects ──


@pytest.fixture
def other(ba_dept, ba_program, ba_offering, make_student):
    student = make_student(ba_program, "26-BA-0001")
    return {
        "dept": ba_dept,
        "course": ba_offering.course,
        "offering": ba_offering,
        "student": student,
        "enrollment": Enrollment.objects.create(offering=ba_offering, student_record=student),
    }


@pytest.mark.parametrize(
    "role", sorted(r.value for r in (R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR))
)
def test_department_roles_cannot_reach_other_departments(role, api, users, other):
    client = api(users[Role(role)])
    for url in (
        f"/api/v1/courses/{other['course'].pk}",
        f"/api/v1/offerings/{other['offering'].pk}",
        f"/api/v1/students/{other['student'].public_id}",
        f"/api/v1/enrollments/{other['enrollment'].pk}",
    ):
        assert client.get(url).status_code == 404, url
    assert (
        client.patch(f"/api/v1/courses/{other['course'].pk}", {"name_ar": "x"}).status_code == 404
    )
    assert client.get(f"/api/v1/departments/{other['dept'].pk}/members").status_code == 404
    for url in ("/api/v1/courses", "/api/v1/students", "/api/v1/enrollments"):
        codes = str(client.get(url).data["results"])
        assert "BA101" not in codes and "26-BA-0001" not in codes, url


def test_department_roles_cannot_create_in_other_departments(api, users, ba_dept):
    body = {"department": ba_dept.pk, "code": "BA900", "name_ar": "مقرر"}
    for role in (R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR):
        assert api(users[role]).post("/api/v1/courses", body).status_code == 403, role


def test_course_moves_into_another_department_are_refused(api, users, it_course, ba_dept):
    response = api(users[R.DEPARTMENT_MANAGER]).patch(
        f"/api/v1/courses/{it_course.pk}", {"department": ba_dept.pk, "program": None}
    )
    assert response.status_code == 403


# ─── Writes ───────────────────────────────────────────────────────────────


def test_course_write_matrix(api, users, it_dept):
    writers = {R.SYSTEM_ADMIN, R.ACADEMIC_AFFAIRS, R.DEPARTMENT_MANAGER, R.DEPARTMENT_SUPERVISOR}
    wrong = []
    for n, role in enumerate(Role):
        body = {"department": it_dept.pk, "code": f"IT9{n:02d}", "name_ar": "مقرر"}
        got = api(users[role]).post("/api/v1/courses", body).status_code
        expected = 201 if role in writers else 403
        if got != expected:
            wrong.append(f"{role.value}: {got} (expected {expected})")
    assert not wrong, "\n".join(wrong)


def test_only_managers_delete_courses(api, users, it_course):
    url = f"/api/v1/courses/{it_course.pk}"
    assert api(users[R.DEPARTMENT_SUPERVISOR]).delete(url).status_code == 403
    assert api(users[R.DEPARTMENT_MANAGER]).delete(url).status_code == 204
    assert AuditLog.objects.filter(action="course.delete").exists()


def test_courses_in_use_cannot_be_deleted(api, users, it_offering):
    url = f"/api/v1/courses/{it_offering.course_id}"
    response = api(users[R.DEPARTMENT_MANAGER]).delete(url)
    assert response.status_code == 409
    assert response.data["code"] == "in_use"


@pytest.mark.parametrize("path", ["colleges", "academic-years"])
def test_structure_is_written_by_the_system_admin_only(path, api, users, college):
    body = (
        {"code": "NEW", "name_ar": "كلية"}
        if path == "colleges"
        else {"name": "2027/2028", "starts_on": "2027-09-01", "ends_on": "2028-07-31"}
    )
    for role in Role:
        if role == R.SYSTEM_ADMIN:
            continue
        assert api(users[role]).post(f"/api/v1/{path}", body).status_code == 403, role
    assert api(users[R.SYSTEM_ADMIN]).post(f"/api/v1/{path}", body).status_code == 201


def test_system_settings_are_admin_only(api, users):
    body = {"student_registration_requires_approval": False}
    assert api(users[R.HEAD_REGISTRAR]).patch("/api/v1/system-settings", body).status_code == 403
    response = api(users[R.SYSTEM_ADMIN]).patch("/api/v1/system-settings", body)
    assert response.status_code == 200
    assert response.data["student_registration_requires_approval"] is False


@pytest.mark.parametrize(
    ("granter", "role", "department", "expected"),
    [
        (R.HEAD_REGISTRAR, R.REGISTRAR, True, 201),
        (R.HEAD_REGISTRAR, R.DEPARTMENT_MANAGER, True, 403),
        (R.ACADEMIC_AFFAIRS, R.DEPARTMENT_MANAGER, True, 201),
        (R.ACADEMIC_AFFAIRS, R.TEACHER, False, 201),
        (R.ACADEMIC_AFFAIRS, R.SYSTEM_ADMIN, False, 403),
        (R.SITE_MANAGER, R.EVENTS_MANAGER, False, 201),
        (R.DEPARTMENT_MANAGER, R.TEACHER, False, 403),
        (R.SYSTEM_ADMIN, R.HR, False, 201),
        (R.SYSTEM_ADMIN, R.STUDENT, False, 400),
        (R.SYSTEM_ADMIN, R.REGISTRAR, False, 400),  # needs a department
        (R.SYSTEM_ADMIN, R.HR, True, 400),  # college-wide role
    ],
)
def test_who_appoints_whom(api, users, make_user, it_dept, granter, role, department, expected):
    target = make_user()
    body = {"user": str(target.public_id), "role": role.value}
    if department:
        body["department"] = it_dept.pk
    response = api(users[granter]).post("/api/v1/role-assignments", body)
    assert response.status_code == expected, response.data


def test_revoking_follows_the_same_rules(api, users, make_user, it_dept):
    registrar = make_user(R.REGISTRAR, department=it_dept)
    assignment = registrar.role_assignments.get()
    url = f"/api/v1/role-assignments/{assignment.pk}"
    assert api(users[R.ACADEMIC_AFFAIRS]).delete(url).status_code == 404
    assert api(users[R.HEAD_REGISTRAR]).delete(url).status_code == 204
    assert AuditLog.objects.filter(action="role.revoke").exists()


def test_admin_cannot_remove_own_admin_role(api, users):
    admin = users[R.SYSTEM_ADMIN]
    assignment = admin.role_assignments.get()
    response = api(admin).delete(f"/api/v1/role-assignments/{assignment.pk}")
    assert response.status_code == 400


def test_audit_log_is_scoped_and_read_only(api, users, it_dept, ba_dept):
    AuditLog.objects.create(
        action="a", target_type="x", target_id="1", target_repr="it", department=it_dept
    )
    AuditLog.objects.create(
        action="b", target_type="x", target_id="2", target_repr="ba", department=ba_dept
    )
    AuditLog.objects.create(action="c", target_type="x", target_id="3", target_repr="college")
    manager_sees = {
        row["target_repr"]
        for row in api(users[R.DEPARTMENT_MANAGER]).get("/api/v1/audit-logs").data["results"]
    }
    assert "it" in manager_sees and not {"ba", "college"} & manager_sees
    admin_sees = {
        row["target_repr"]
        for row in api(users[R.SYSTEM_ADMIN]).get("/api/v1/audit-logs").data["results"]
    }
    assert {"it", "ba", "college"} <= admin_sees
    entry = AuditLog.objects.get(action="a")
    for method in ("put", "patch", "delete"):
        response = getattr(api(users[R.SYSTEM_ADMIN]), method)(f"/api/v1/audit-logs/{entry.pk}")
        assert response.status_code == 405, method
