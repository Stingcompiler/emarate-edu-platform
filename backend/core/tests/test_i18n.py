"""API messages: Arabic by default, English on request (docs/05 §7), and a complete catalog."""

import gettext as gnu
import re
from pathlib import Path

from django.conf import settings
from rest_framework.test import APIClient

from accounts.rbac import Role

LOGIN = "/api/v1/auth/login"
PO = Path(settings.BASE_DIR) / "locale" / "ar" / "LC_MESSAGES" / "django.po"


def _entries() -> list[tuple[str, str]]:
    """(msgid, msgstr) pairs of the Arabic catalog, header excluded."""
    text = PO.read_text(encoding="utf-8")
    pairs = re.findall(r'\nmsgid ((?:"[^\n]*"\n)+)msgstr ((?:"[^\n]*"\n)+)', text)
    join = lambda block: "".join(re.findall(r'"(.*)"', block))  # noqa: E731
    return [(join(i), join(s)) for i, s in pairs if join(i)]


def test_every_message_is_translated_with_the_same_placeholders():
    entries = _entries()
    assert len(entries) > 200
    for msgid, msgstr in entries:
        assert msgstr, f"untranslated: {msgid}"
        placeholders = lambda s: sorted(re.findall(r"%\(\w+\)s", s))  # noqa: E731
        assert placeholders(msgid) == placeholders(msgstr), msgid


def test_compiled_catalog_matches_the_po_file():
    """Fails when the .po changed but compilemessages was not run."""
    with open(PO.with_suffix(".mo"), "rb") as handle:
        compiled = gnu.GNUTranslations(handle)
    for msgid, _ in _entries():
        unescaped = msgid.encode().decode("unicode_escape").encode("latin-1").decode()
        assert compiled.gettext(unescaped) != unescaped, f"not compiled: {msgid}"


def test_messages_are_arabic_by_default_and_english_on_request(make_user):
    make_user(Role.HR, email="hr@ecst.test")
    body = {"identifier": "hr@ecst.test", "password": "wrong-password"}
    arabic = APIClient().post(LOGIN, body)
    assert arabic.status_code == 400
    assert "كلمة المرور غير صحيحة" in str(arabic.data)
    assert arabic.data["title"] == "طلب غير صالح"
    english = APIClient().post(LOGIN, body, HTTP_ACCEPT_LANGUAGE="en")
    assert "Incorrect email/university number or password." in str(english.data)
