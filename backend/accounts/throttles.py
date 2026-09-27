from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


class LoginThrottle(AnonRateThrottle):
    """Per IP, regardless of the account tried (docs/05 §7: 10/minute)."""

    scope = "login"


class OTPIPThrottle(AnonRateThrottle):
    scope = "otp_ip"


class OTPTargetThrottle(SimpleRateThrottle):
    """Per email address, so one inbox can't be flooded from many IPs (5/hour)."""

    scope = "otp"

    def get_cache_key(self, request, view):
        email = str(request.data.get("email", "")).strip().lower()
        if not email:
            return None
        return self.cache_format % {"scope": self.scope, "ident": email}
