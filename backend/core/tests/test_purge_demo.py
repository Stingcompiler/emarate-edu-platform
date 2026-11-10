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
    # The demo's fake contact channels go too (design review B5): the public site API shows none.
    assert (
        settings_.email,
        settings_.phone,
        settings_.address,
        settings_.whatsapp_e164,
        settings_.office_hours_ar,
    ) == ("", "", "", "", "")


def test_purge_keeps_contact_details_the_college_entered(seeded):
    """Only the values seed_demo wrote are cleared, never a real one."""
    own = SiteSettings.load()
    own.phone = "+249 91 234 5678"  # real: replaces the demo's
    own.email = "info@ecst.edu.sd"
    own.save()
    _purge("--apply")
    own.refresh_from_db()
    assert own.phone == "+249 91 234 5678" and own.email == "info@ecst.edu.sd"
    assert own.whatsapp_e164 == "" and own.address == ""  # the demo's, still cleared


def test_a_bad_date_is_refused(db):
    from django.core.management import CommandError

    with pytest.raises(CommandError, match="YYYY-MM-DD"):
        call_command("purge_demo", "--before", "tomorrow", stdout=io.StringIO())


def test_purge_keeps_the_pictures_the_site_uses(seeded):
    """Review 2026-11-10, R84: on a copy of production the college's logo, share image and
    hero image had been uploaded with a demo account, and the purge deleted them. A picture the
    site uses stays, whoever uploaded it; the samples still go."""
    from django.core.files.uploadedfile import SimpleUploadedFile

    from accounts.models import User
    from content.models import MediaAsset, SiteSettings, StaffEntry

    demo = User.objects.get(email="site@demo.ecst.test")

    def picture(alt):
        return MediaAsset.objects.create(
            file=SimpleUploadedFile(f"{alt}.png", b"x", "image/png"), alt_ar=alt, uploaded_by=demo
        )

    sample_hero = SiteSettings.load().hero_image  # seed_demo's «(مثال) …» picture
    assert sample_hero is not None and sample_hero.alt_ar.startswith("(مثال)")
    logo, hero, dean = picture("الشعار"), picture("صورة الواجهة"), picture("العميد")
    unused = picture("صورة لم تُستعمل")
    site = SiteSettings.load()
    site.logo, site.share_image, site.hero_image = logo, logo, hero
    site.save()
    StaffEntry.objects.create(name_ar="أ.د. عمر", photo=dean)
    preview = _purge()
    assert "pictures kept because the site uses them: 3" in preview
    _purge("--apply")
    site.refresh_from_db()
    assert (site.logo_id, site.share_image_id, site.hero_image_id) == (logo.pk, logo.pk, hero.pk)
    assert StaffEntry.objects.get().photo_id == dean.pk
    assert not MediaAsset.objects.filter(pk=unused.pk).exists()
    assert set(MediaAsset.objects.values_list("pk", flat=True)) == {logo.pk, hero.pk, dean.pk}
    assert not MediaAsset.objects.filter(pk=sample_hero.pk).exists()


def test_a_sample_picture_in_the_settings_still_goes(seeded):
    """The demo's own hero and share pictures («(مثال) …») are not kept for being in use."""
    from content.models import MediaAsset

    site = SiteSettings.load()
    assert site.hero_image_id and site.share_image_id
    assert "pictures kept" not in _purge()
    _purge("--apply")
    site.refresh_from_db()
    assert site.hero_image_id is None and site.share_image_id is None
    assert not MediaAsset.objects.exists()
