import io
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from academic.models import Course, CourseOffering
from accounts.models import RoleAssignment, User
from accounts.rbac import Role
from audit.models import AuditLog
from content.models import SiteSettings
from learning.models import Lecture
from organization.models import Department, Program
from students.models import StudentRecord


@pytest.fixture
def seeded(db, settings, monkeypatch):
    settings.DEBUG = True
    monkeypatch.setenv("DEMO_PASSWORD", "Demo-pass-2026")
    call_command("seed_demo", stdout=io.StringIO())


def _purge(*extra):
    out = io.StringIO()
    tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
    call_command("purge_demo", "--before", tomorrow, *extra, stdout=out)
    return out.getvalue()


def test_preview_changes_nothing(seeded):
    students = StudentRecord.objects.count()
    report = _purge()
    assert "students.StudentRecord: " in report and "Nothing changed" in report
    assert StudentRecord.objects.count() == students
    assert User.objects.filter(email__endswith="demo.ecst.test", is_active=True).exists()


def test_apply_removes_the_demo_and_keeps_structure_real_content_and_the_log(seeded, make_user):
    """Review 2026-10-04 C9: before real data, the demo goes; the structure the college may
    keep, content written by real accounts and the audit log stay."""
    structure = (Department.objects.count(), Program.objects.count(), Course.objects.count())
    offerings = CourseOffering.objects.count()
    log = AuditLog.objects.count()
    teacher = make_user(Role.TEACHER, email="real.teacher@ecst.edu.sd")
    real = Lecture.objects.create(
        offering=CourseOffering.objects.first(), title_ar="محاضرة حقيقية", created_by=teacher
    )

    report = _purge("--apply")

    assert "Demo data removed" in report
    assert StudentRecord.objects.count() == 0
    assert not User.objects.filter(email__endswith="demo.ecst.test", is_active=True).exists()
    assert not RoleAssignment.objects.filter(user__email__endswith="demo.ecst.test").exists()
    assert Lecture.objects.filter(pk=real.pk).exists()
    assert not Lecture.objects.exclude(pk=real.pk).exists()  # the demo lectures went
    assert (Department.objects.count(), Program.objects.count(), Course.objects.count()) == (
        structure
    )
    assert CourseOffering.objects.count() == offerings
    assert AuditLog.objects.count() >= log  # never deleted
    settings_ = SiteSettings.load()
    assert "(مثال)" not in settings_.tagline + settings_.licence_ar
    assert not any("(مثال)" in (p.description_ar or "") for p in Program.objects.all())


def test_a_bad_date_is_refused(db):
    from django.core.management import CommandError

    with pytest.raises(CommandError, match="YYYY-MM-DD"):
        call_command("purge_demo", "--before", "tomorrow", stdout=io.StringIO())
