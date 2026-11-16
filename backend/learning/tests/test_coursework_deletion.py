"""Deleting assignments and submissions (owner, 2026-11-16): an assignment students have
submitted to goes only with their submissions, asked for in so many words; a single submission
is deleted by the course's teacher or whoever deletes coursework there. The log keeps who
submitted and their grades."""

from accounts.rbac import Role
from audit.models import AuditLog
from learning.models import Submission, SubmissionGrade, SubmissionVersion
from learning.tests.test_learning import _assignment


def _submit(api, classroom, assignment, content="حل"):
    sent = api(classroom.student).post(
        f"/api/v1/assignments/{assignment}/submit", {"content": content}, format="json"
    )
    assert sent.status_code in (200, 201), sent.data
    return Submission.objects.get(assignment__public_id=assignment)


def test_an_assignment_goes_with_its_submissions_only_when_asked(
    api, classroom, make_user, it_dept
):
    assignment = _assignment(api, classroom)
    submission = _submit(api, classroom, assignment)
    api(classroom.teacher).put(
        f"/api/v1/submissions/{submission.public_id}/grade", {"score": "8"}, format="json"
    )
    manager = api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))
    page = manager.get(f"/api/v1/assignments/{assignment}").data
    assert page["can"] == {"delete": True, "delete_submissions": True, "submissions": 1}
    refused = manager.delete(f"/api/v1/assignments/{assignment}")
    assert refused.status_code == 409 and refused.data["code"] == "has_submissions"
    assert manager.delete(f"/api/v1/assignments/{assignment}?with_submissions=1").status_code == 204
    assert not Submission.objects.filter(pk=submission.pk).exists()
    assert not SubmissionVersion.objects.filter(submission_id=submission.pk).exists()
    assert not SubmissionGrade.objects.filter(submission_id=submission.pk).exists()
    entry = AuditLog.objects.get(action="assignment.delete")
    kept = entry.old["submissions"][0]
    assert kept["student"] == classroom.record.university_number
    assert kept["grade"] == "8.00" and kept["grade_status"] == "approved"


def test_the_teacher_deletes_a_submission_and_the_student_may_submit_again(api, classroom):
    assignment = _assignment(api, classroom, allow_resubmission=False)
    submission = _submit(api, classroom, assignment)
    url = f"/api/v1/submissions/{submission.public_id}"
    # Not the student, not the teaching assistant.
    assert api(classroom.student).delete(url).status_code == 403
    assert api(classroom.ta).delete(url).status_code == 403
    assert (
        api(classroom.teacher)
        .get(f"/api/v1/assignments/{assignment}")
        .data["can"]["delete_submissions"]
    )
    assert api(classroom.teacher).delete(url).status_code == 204
    assert not Submission.objects.filter(pk=submission.pk).exists()
    assert AuditLog.objects.filter(action="submission.delete").exists()
    again = _submit(api, classroom, assignment, "حل جديد")
    assert again.pk != submission.pk
