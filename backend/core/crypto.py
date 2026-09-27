"""Field encryption for secrets stored at rest (e.g. live-session join links).

Fernet with a key derived from FIELD_ENCRYPTION_KEY (falls back to SECRET_KEY)
through HKDF, so rotating SECRET_KEY without setting the field key makes old
values unreadable — set FIELD_ENCRYPTION_KEY in production.
"""

import base64
from functools import cache

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings


@cache
def _fernet() -> Fernet:
    secret = (getattr(settings, "FIELD_ENCRYPTION_KEY", "") or settings.SECRET_KEY).encode()
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"ecst-field", info=b"v1").derive(secret)
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode() if value else ""


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return ""
