"""A lecture goes with everything in it (owner, 2026-11-16: «حذف محاضرة يحذف كل ما بها»): its
resources, the assignments linked to it with their submissions and grades, and its files no
other lecture uses. The log keeps the submitters and their grades."""

from audit.models import AuditLog
from files.models import StoredFile
from learning.models import Assignment, Lecture, LectureResource, Submission
from learning.tests.test_learning import _assignment, _lecture, _upload


def _file_in(api, classroom, lecture) -> str:
    stored = _upload(api(classroom.teacher), classroom.offering)
    assert stored.status_code == 201, stored.data
    added = api(classroom.teacher).post(
        f"/api/v1/lectures/{lecture}/resources",
        {"kind": "file", "title": "ملخص", "file": stored.data["public_id"]},
    )
    assert added.status_code == 201, added.data
    return stored.data["public_id"]


def test_a_lecture_goes_with_its_assignments_submissions_and_files(api, classroom):
    teacher = api(classroom.teacher)
    lecture = _lecture(api, classroom)
    own = _file_in(api, classroom, lecture)
    # A file the next lecture also uses stays with it.
    other = _lecture(api, classroom)
    shared = _file_in(api, classroom, other)
    teacher.post(
        f"/api/v1/lectures/{lecture}/resources", {"kind": "file", "title": "مشترك", "file": shared}
    )
    linked = _assignment(api, classroom, lecture=lecture)
    unlinked = _assignment(api, classroom)
    sent = api(classroom.student).post(
        f"/api/v1/assignments/{linked}/submit", {"content": "حل"}, format="json"
    )
    assert sent.status_code in (200, 201), sent.data
    submission = Submission.objects.get(assignment__public_id=linked)
    teacher.put(f"/api/v1/submissions/{submission.public_id}/grade", {"score": "7"}, format="json")

    page = teacher.get(f"/api/v1/lectures/{lecture}").data
    assert page["can"] == {
        "delete": True,
        "assignments": 1,
        "submissions": 1,
        "files": 1,
        "videos": 0,
    }
    # Not on the list, and not for the student.
    assert teacher.get("/api/v1/lectures").data["results"][0]["can"] is None
    assert api(classroom.student).get(f"/api/v1/lectures/{lecture}").data["can"] is None

    assert teacher.delete(f"/api/v1/lectures/{lecture}").status_code == 204
    assert not Lecture.objects.filter(public_id=lecture).exists()
    assert not Assignment.objects.filter(public_id=linked).exists()
    assert not Submission.objects.filter(pk=submission.pk).exists()
    assert not StoredFile.objects.filter(public_id=own).exists()
    # What is not the lecture's stays: another assignment, the shared file, the other lecture.
    assert Assignment.objects.filter(public_id=unlinked).exists()
    assert StoredFile.objects.filter(public_id=shared).exists()
    assert LectureResource.objects.filter(lecture__public_id=other).count() == 1
    entry = AuditLog.objects.get(action="lecture.delete")
    kept = entry.old["assignments"][0]
    assert kept["submissions"][0]["student"] == classroom.record.university_number
    assert kept["submissions"][0]["grade"] == "7.00"


def test_the_student_and_the_assistant_delete_no_lecture(api, classroom):
    lecture = _lecture(api, classroom)
    assert api(classroom.student).delete(f"/api/v1/lectures/{lecture}").status_code in (403, 404)
    assert api(classroom.ta).delete(f"/api/v1/lectures/{lecture}").status_code == 403
    assert Lecture.objects.filter(public_id=lecture).exists()
