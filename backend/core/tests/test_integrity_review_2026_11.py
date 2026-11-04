"""Data integrity after review 2026-11 axis 3 (probes in
docs/qa/evidence/review-2026-11/integrity): launch-day purge, and saves that write only what
they change."""

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
from audit.services import RequestMeta


def _purge():
    tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
    call_command("purge_demo", before=tomorrow, apply=True)


def test_purge_clears_example_outcomes_careers_and_the_seeded_fees(it_program, ba_program):
    it_program.outcomes_ar = "(مثال) يطبّق أساسيات البرنامج"
    it_program.careers_ar = "(مثال) القطاع الحكومي"
    it_program.annual_fee_sdg, it_program.annual_fee_usd = 1_600_000, 1_200
    it_program.save()
    # The college's own copy and fees stay, even next to an example line elsewhere.
    ba_program.outcomes_ar = "(مثال) سطر"
    ba_program.annual_fee_sdg, ba_program.annual_fee_usd = 1_750_000, 1_250
    ba_program.careers_ar = "المصارف"
    ba_program.save()
    _purge()
    it_program.refresh_from_db()
    ba_program.refresh_from_db()
    assert (it_program.outcomes_ar, it_program.careers_ar) == ("", "")
    assert (it_program.annual_fee_sdg, it_program.annual_fee_usd) == (None, None)
    assert (ba_program.annual_fee_sdg, ba_program.careers_ar) == (1_750_000, "المصارف")


def test_saving_ones_public_profile_keeps_a_photo_hidden_meanwhile(api, make_user):
    member = make_user(Role.TEACHER, public_profile=True, public_photo=True)
    moderator = make_user(Role.ACADEMIC_AFFAIRS)
    client = api(member)  # holds the copy loaded before the photo is hidden
    staff_profile.hide_photo(
        RequestMeta(actor=moderator), moderator, User.objects.get(pk=member.pk), hidden=True
    )
    saved = client.patch("/api/v1/me/public-profile", {"research_interests": "الشبكات"})
    assert saved.status_code == 200, saved.data
    member = User.objects.get(pk=member.pk)
    assert member.public_photo_hidden is True and member.research_interests == "الشبكات"


def test_an_admin_profile_edit_keeps_the_members_consent(make_user):
    admin = make_user(Role.SYSTEM_ADMIN)
    member = make_user(Role.TEACHER)
    stale = User.objects.get(pk=member.pk)
    User.objects.filter(pk=member.pk).update(public_profile=True)
    account_services.update_profile(
        RequestMeta(actor=admin), stale, research_interests="الذكاء الاصطناعي"
    )
    member = User.objects.get(pk=member.pk)
    assert member.public_profile is True and member.research_interests == "الذكاء الاصطناعي"


@pytest.mark.django_db(transaction=True)
def test_quick_link_adds_keep_to_ten(make_user):
    if connection.vendor != "postgresql":
        pytest.skip("needs concurrent connections (PostgreSQL)")
    member = make_user(Role.TEACHER)
    for i in range(StaffLink.MAX - 1):
        StaffLink.objects.create(user=member, label=f"l{i}", url=f"https://e.test/{i}")
    barrier = threading.Barrier(6)

    def add(i):
        try:
            barrier.wait()
            staff_profile.add_link(
                RequestMeta(actor=member),
                User.objects.get(pk=member.pk),
                label=f"x{i}",
                url=f"https://x.test/{i}",
            )
        except Exception:  # noqa: S110  (a refusal is the right answer; the count decides)
            pass
        finally:
            connection.close()

    threads = [threading.Thread(target=add, args=(i,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert StaffLink.objects.filter(user=member).count() == StaffLink.MAX
