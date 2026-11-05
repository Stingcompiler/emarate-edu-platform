"""Every message the server shows through gettext has Arabic (review 2026-11 axis 8: thirteen
sentences added in two weeks reached the portal in English). Django's and DRF's own catalogues
count too: the check asks the translation machinery, not only our .po."""

import re
from pathlib import Path

from django.utils import translation

BACKEND = Path(__file__).resolve().parents[2]
CALL = re.compile(
    r"""\b(?:gettext|gettext_lazy|_)\(\s*(?:\n\s*)?"((?:[^"\\]|\\.)+)"\s*(?:\n\s*)?[,)%]"""
)


def _messages() -> dict[str, str]:
    found = {}
    for path in BACKEND.rglob("*.py"):
        rel = path.relative_to(BACKEND).as_posix()
        if rel.startswith(".venv") or "/tests/" in f"/{rel}" or "/migrations/" in f"/{rel}":
            continue
        for match in CALL.finditer(path.read_text(encoding="utf-8")):
            text = match.group(1).replace('\\"', '"')
            if re.search(r"[A-Za-z]{3}", text):  # English words, not «%(n)s» alone
                found[text] = rel
    return found


def test_every_gettext_message_has_arabic():
    messages = _messages()
    assert len(messages) > 100
    with translation.override("ar"):
        missing = {m: where for m, where in messages.items() if translation.gettext(m) == m}
    assert missing == {}, "\n".join(f"{where}: {m}" for m, where in sorted(missing.items()))
