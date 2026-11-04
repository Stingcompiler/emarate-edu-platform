"""QA probes, review 2026-11 axis 3 (data integrity). Each test EXPECTS THE FAULTY BEHAVIOUR:
a pass means the defect is reproduced. When a defect is fixed its probe fails and is removed
(or turned into a regular test asserting the right behaviour)."""

import threading
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.db import connection
from django.utils import timezone

from accounts import services as account_services
from accounts import staff_profile
from accounts.models import StaffLink, User
from accounts.rbac import Role
from admissions import services as admissions
from admissions.models import Application, ApplicationFormTemplate
from admissions.tests.test_admissions import intake  # noqa: F401
from admissions.tests.test_form_rules import COLLEGE
from audit.services import RequestMeta
from contacts.models import Contact
from organization.models import Program


def _meta(user) -> RequestMeta:
    return RequestMeta(actor=user)


# ─── I1: a stopped programme or department keeps taking applications ──────────────────────


def test_probe_i1_stopped_program_still_listed_and_accepts_applications(
    api,
    make_user,
    intake,  # noqa: F811
):
    """The structure page (since 2026-11-02) answers «in use → stop it instead»; stopping a
    programme (is_active=False) hides it from the site's programme list, but its open intake
    stays on /api/public/intakes and a visitor can still start an application to it, because
    ProgramIntake.accepting() and PublicIntakesView never look at program/department
    is_active."""
    admin = make_user(Role.SYSTEM_ADMIN)
    stopped = api(admin).patch(
        f"/api/v1/programs/{intake.program_id}", {"is_active": False}, format="json"
    )
    assert stopped.status_code == 200, stopped.data
    assert Program.objects.get(pk=intake.program_id).is_active is False

    listed = api().get("/api/public/intakes")
    assert listed.status_code == 200
    assert intake.id in [row["id"] for row in listed.data]  # FAULT: still offered

    intake.refresh_from_db()
    assert intake.accepting() is True  # FAULT: ignores the programme's state
    contact = Contact.objects.create(email="late@example.test", name="متقدم")
    application = admissions.start(contact, intake)  # FAULT: no refusal
    assert application.pk and application.intake.program.is_active is False

    # The same with the whole department stopped.
    department = intake.program.department
    department.is_active = False
    department.save(update_fields=["is_active"])
    intake.refresh_from_db()
    assert intake.accepting() is True


# ─── I2: purge_demo leaves «(مثال)» outcomes and careers on every programme ────────────────


def test_probe_i2_purge_demo_keeps_example_outcomes_and_careers(it_program):
    """seed_demo writes «(مثال)» lines into Program.outcomes_ar and careers_ar (seed_demo.py
    ~237-244); purge_demo clears description_ar/description_en/outcomes_en/careers_en only
    (purge_demo.py:207), so after --apply the public programme pages still list «(مثال)»
    outcomes and careers. The demo fees seeded beside them (unmarked) stay as well."""
    it_program.description_ar = "(مثال) وصف البرنامج"
    it_program.outcomes_ar = "(مثال) يطبّق أساسيات البرنامج\n(مثال) يعمل ضمن فريق"
    it_program.careers_ar = "(مثال) القطاع الحكومي\n(مثال) العمل الحر"
    it_program.annual_fee_sdg = 1_600_000
    it_program.save()
    tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()

    call_command("purge_demo", before=tomorrow, apply=True)

    it_program.refresh_from_db()
    assert it_program.description_ar == ""  # cleared, as designed
    assert "(مثال)" in it_program.outcomes_ar  # FAULT
    assert "(مثال)" in it_program.careers_ar  # FAULT
    assert it_program.annual_fee_sdg == 1_600_000  # the seeded demo fee also stays


# ─── I3: the released university number can differ from the registered one ────────────────


def test_probe_i3_staff_answers_number_diverges_from_student_record_after_registration(
    make_user,
    it_dept,
    intake,  # noqa: F811
):
    """set_staff_answers has no status gate and excludes the application's own student record
    from the uniqueness check, so after registration a reviewer can change and release another
    university number: the applicant is shown a number that is not their record's."""
    head = make_user(Role.HEAD_REGISTRAR)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    template = ApplicationFormTemplate.objects.create(
        name="college", status="published", schema=COLLEGE, created_by=head
    )
    contact = Contact.objects.create(email="admitted@example.test", name="مريم")
    application = Application.objects.create(
        reference_no="APP-2026-000001",
        contact=contact,
        intake=intake,
        form_template=template,
        full_name="مريم الطيب",
        email="admitted@example.test",
        status=Application.Status.ACCEPTED,
        staff_answers={"university_number": "26-IT-7777"},
    )
    record = admissions.register_applicant(_meta(head), application)
    assert record.university_number == "26-IT-7777"

    changed = admissions.set_staff_answers(
        _meta(registrar),
        Application.objects.get(pk=application.pk),
        answers={"university_number": "26-IT-9999"},
        released=["university_number"],
    )  # FAULT: accepted on a registered application
    assert changed.status == Application.Status.REGISTERED
    shown = {r["key"]: r["value"] for r in admissions.released_answers(changed)}
    record.refresh_from_db()
    assert shown["university_number"] == "26-IT-9999"
    assert record.university_number == "26-IT-7777"  # FAULT: two numbers for one student


# ─── I4/I5: full-row saves from a stale user overwrite a newer change ──────────────────────


def test_probe_i4_own_profile_save_reverts_a_photo_hidden_meanwhile(api, make_user):
    """PATCH /me/public-profile saves request.user through a ModelSerializer: a full-row save
    of the user loaded when the request was authenticated. If academic affairs hides the
    photo while that request runs, the save writes public_photo_hidden back to False.
    (force_authenticate hands the view the stale instance, which models that interleaving.)"""
    member = make_user(Role.TEACHER, public_profile=True, public_photo=True)
    moderator = make_user(Role.ACADEMIC_AFFAIRS)
    client = api(member)  # `member` stands for the copy loaded at authentication
    staff_profile.hide_photo(
        _meta(moderator), moderator, User.objects.get(pk=member.pk), hidden=True
    )
    assert User.objects.get(pk=member.pk).public_photo_hidden is True

    saved = client.patch("/api/v1/me/public-profile", {"research_interests": "الشبكات"})
    assert saved.status_code == 200, saved.data
    assert User.objects.get(pk=member.pk).public_photo_hidden is False  # FAULT: un-hidden


def test_probe_i5_admin_profile_edit_reverts_the_members_consent(make_user):
    """accounts.services.update_profile ends in user.save() (all columns) on the target the
    view loaded; a consent the member changed in between (public_profile) is written back.
    The docstring says consent «stays the person's own»."""
    admin = make_user(Role.SYSTEM_ADMIN)
    member = make_user(Role.TEACHER)
    stale = User.objects.get(pk=member.pk)  # what UserViewSet.partial_update loaded
    User.objects.filter(pk=member.pk).update(public_profile=True)  # the member opts in

    account_services.update_profile(_meta(admin), stale, research_interests="الذكاء الاصطناعي")

    assert User.objects.get(pk=member.pk).public_profile is False  # FAULT: consent reverted


# ─── I6: the ten-link cap is counted outside a lock ────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
def test_probe_i6_concurrent_add_link_passes_the_ten_link_cap(make_user):
    """staff_profile.add_link counts the member's links and then inserts, with no lock on the
    member (staff_profile.py:87): concurrent POST /me/links each see 9 and each insert.
    Postgres only (SQLite here is one in-memory connection)."""
    if connection.vendor != "postgresql":
        pytest.skip("needs real concurrent connections (run with DATABASE_URL=postgres:///…)")
    member = make_user(Role.TEACHER)
    for i in range(StaffLink.MAX - 1):
        StaffLink.objects.create(user=member, label=f"l{i}", url=f"https://e.test/{i}")
    barrier = threading.Barrier(6)
    refused: list[Exception] = []

    def add(i):
        try:
            barrier.wait()
            staff_profile.add_link(
                _meta(member),
                User.objects.get(pk=member.pk),
                label=f"x{i}",
                url=f"https://x.test/{i}",
            )
        except Exception as error:  # a refusal is the right outcome; the count below decides
            refused.append(error)
        finally:
            connection.close()

    threads = [threading.Thread(target=add, args=(i,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert StaffLink.objects.filter(user=member).count() > StaffLink.MAX  # FAULT
