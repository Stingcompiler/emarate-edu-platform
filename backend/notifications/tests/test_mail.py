"""Every email carries an HTML version in the college design, built from the plain text
(owner, 2026-10-24: the verification email still arrived as bare text)."""

import pytest
from django.core import mail

from notifications import tasks
from notifications.mail import layout, render_html
from notifications.models import Outbox


def _html(message) -> str:
    [(content, kind)] = message.alternatives
    assert kind == "text/html"
    return content


@pytest.mark.django_db
def test_the_visitor_code_email_has_the_designed_html_with_the_code_as_headline(
    django_capture_on_commit_callbacks,
):
    from contacts import visitor

    with django_capture_on_commit_callbacks(execute=True):
        visitor.start("salma@example.com")
    [message] = mail.outbox
    # The text part is untouched: clients without HTML lose nothing.
    assert message.body.startswith("رمز التحقق لمتابعة طلباتك: ")
    code = message.body.split(": ")[1][:6]
    html = _html(message)
    assert 'dir="rtl"' in html
    assert 'class="code" dir="ltr"' in html and f">{code}</p>" in html
    assert "رمز التحقق لمتابعة طلباتك" in html and "صالح لمدة" in html
    assert "mso-padding-alt:18px 24px" not in html  # no button: there is nothing to open


@pytest.mark.django_db
def test_text_written_by_staff_is_escaped_and_only_https_links_become_buttons():
    Outbox.objects.create(
        to="x@example.com",
        subject="رد على استفسارك INQ-2026-000001 — كلية الإمارات",
        body='<script>alert(1)</script> "اقرأ" javascript:alert(2)\n\nhttps://ecst.test/a?b=1&c=2',
    )
    tasks.deliver_outbox()
    html = _html(mail.outbox[0])
    assert "<script>alert(1)" not in html and "&lt;script&gt;alert(1)" in html
    assert 'href="javascript' not in html
    assert 'href="https://ecst.test/a?b=1&amp;c=2"' in html
    assert ">فتح الرابط</a>" in html


@pytest.mark.django_db
def test_account_emails_get_a_button_named_for_what_it_does(settings):
    from accounts import emails

    settings.PORTAL_BASE_URL = "https://portal.ecst.test"
    emails.account_invitation("t@example.com", "سارة", "tok123", 7)
    html = _html(mail.outbox[0])
    assert 'href="https://portal.ecst.test/activate/tok123"' in html
    assert ">اختيار كلمة المرور</a>" in html
    assert "تفعيل حسابك" in html  # the subject is the headline
    # The college's colours and fonts (packages/ui, docs/06): primary-500 button, navy text,
    # IBM Plex Sans Arabic for text and Noto Kufi Arabic for the headline.
    assert 'bgcolor="#2D64A7"' in html and "color:#1F2B47" in html
    assert "family=IBM+Plex+Sans+Arabic" in html and "'Noto Kufi Arabic'" in html


def test_layout_reads_the_parts_and_drops_the_old_text_signature(settings):
    settings.PORTAL_BASE_URL = "https://portal.ecst.test"
    view = layout(
        "نتيجة جديدة — كلية الإمارات",
        "نُشرت نتيجة مقرر.\n\nhttps://portal.ecst.test/results\n\n— بوابة كلية الإمارات",
    )
    assert view.headline == "نتيجة جديدة" and view.eyebrow == "بوابة الكلية"
    assert view.paragraphs == [["نُشرت نتيجة مقرر."]]
    assert (view.action_url, view.action_label) == (
        "https://portal.ecst.test/results",
        "عرض في البوابة",
    )
    reference = layout("قُبل طلبك — APP-2026-000123", "مبروك.")
    assert reference.eyebrow == "APP-2026-000123" and reference.headline == "قُبل طلبك"
    invite = layout(
        "تفعيل حسابك — بوابة كلية الإمارات",
        "اختر كلمة المرور من الرابط:\nhttps://p.test/activate/x",
    )
    assert invite.paragraphs == [["اختر كلمة المرور من الرابط"]]
    code = layout("رمز التحقق — كلية الإمارات", "رمز التحقق لمتابعة طلباتك: 123456")
    assert (code.eyebrow, code.intro, code.code) == ("", "رمز التحقق لمتابعة طلباتك", "123456")


def test_footer_links_follow_the_public_site_setting(settings):
    settings.PUBLIC_SITE_ORIGINS = ["https://ecst.example"]
    html = render_html("رمز التحقق — كلية الإمارات", "رمز: 123456")
    assert 'href="https://ecst.example/ar/contact"' in html
    settings.PUBLIC_SITE_ORIGINS = []
    assert "تواصل معنا" not in render_html("s", "b")
