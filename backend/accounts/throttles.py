import hashlib

from rest_framework.throttling import SimpleRateThrottle


class _PerIPThrottle(SimpleRateThrottle):
    """Keyed on the client address whether or not the caller is signed in.

    DRF's ``AnonRateThrottle`` skips signed-in callers, so a student with a session
    could try passwords or codes for other accounts without any limit.
    """

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class LoginThrottle(_PerIPThrottle):
    """Per IP, regardless of the account tried (docs/05 §7: 10/minute)."""

    scope = "login"


class OTPIPThrottle(_PerIPThrottle):
    scope = "otp_ip"


class OTPTargetThrottle(SimpleRateThrottle):
    """Per email address, so one inbox can't be flooded from many IPs (5/hour)."""

    scope = "otp"

    def get_cache_key(self, request, view):
        # A body that isn't an object (e.g. a JSON list) has no email; the view answers 400.
        data = request.data if hasattr(request.data, "get") else {}
        email = data.get("email")
        if not isinstance(email, str) or not email.strip():
            return None
        # Hashed: user input never becomes a raw cache key.
        ident = hashlib.sha256(email.strip().lower().encode()).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": ident}
