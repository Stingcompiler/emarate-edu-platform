"""Text normalisation for matching people's names typed in different ways."""

import re
import unicodedata

_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭ]")
_TATWEEL = "ـ"
_FOLD = str.maketrans(
    {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ى": "ي",
        "ئ": "ي",
        "ؤ": "و",
        "ة": "ه",
    }
)


def normalize_name(value: str) -> str:
    """Fold spelling variants so «أحمد  محمّد» matches «احمد محمد».

    Removes diacritics and tatweel, unifies alef/ya/ta-marbuta forms, lower-cases
    Latin letters and collapses whitespace. Used only for comparison — the
    official spelling stored on the record is never changed.
    """
    text = unicodedata.normalize("NFKC", value or "")
    text = _DIACRITICS.sub("", text).replace(_TATWEEL, "")
    text = text.translate(_FOLD).casefold()
    return " ".join(text.split())


def names_match(typed: str, official: str) -> bool:
    return normalize_name(typed) == normalize_name(official)
