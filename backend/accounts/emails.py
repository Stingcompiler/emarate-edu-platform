"""Transactional emails (Arabic). Development prints them to the console and
``backend/sent-emails/``; production sends through Anymail."""

from django.conf import settings

from notifications.mail import send_mail


def _send(to: str, subject: str, body: str) -> None:
    send_mail(subject, body, None, [to])


def registration_code(to: str, code: str, minutes: int) -> None:
    _send(
        to,
        "رمز التحقق — بوابة كلية الإمارات",
        f"رمز التحقق لتسجيل حسابك: {code}\n\n"
        f"صالح لمدة {minutes} دقائق. إن لم تطلب التسجيل فتجاهل هذه الرسالة.",
    )


def password_reset_code(to: str, code: str, minutes: int) -> None:
    _send(
        to,
        "استعادة كلمة المرور — بوابة كلية الإمارات",
        f"رمز استعادة كلمة المرور: {code}\n\n"
        f"صالح لمدة {minutes} دقائق. إن لم تطلب ذلك فتجاهل الرسالة ولن يتغير شيء.",
    )


def registration_pending(to: str) -> None:
    _send(
        to,
        "حسابك بانتظار الاعتماد — بوابة كلية الإمارات",
        "تم إنشاء حسابك، وسيعتمده مدير قسمك قريبًا. سنرسل لك رسالة عند الاعتماد.",
    )


def registration_decided(to: str, approved: bool, reason: str = "") -> None:
    if approved:
        body = f"اعتُمد حسابك. يمكنك الدخول الآن: {settings.PORTAL_BASE_URL}/login"
        subject = "اعتُمد حسابك — بوابة كلية الإمارات"
    else:
        body = "لم يُعتمد طلب التسجيل." + (f"\nالسبب: {reason}" if reason else "")
        body += "\nراجع مسجل قسمك لتصحيح بياناتك ثم أعد التسجيل."
        subject = "طلب التسجيل — بوابة كلية الإمارات"
    _send(to, subject, body)


def _mask(email: str) -> str:
    """«ah***@gmail.com»: enough for the owner to recognise, not to reuse."""
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}"


def registered_elsewhere(to: str, used: str) -> None:
    """To the college's address for a student whose record got an account with another email."""
    _send(
        to,
        "أُنشئ حساب على رقمك الجامعي — بوابة كلية الإمارات",
        f"أُنشئ حساب طالب على رقمك الجامعي بالبريد {_mask(used)}.\n\n"
        "إن كنت أنت فلا تفعل شيئًا. وإن لم تكن أنت فأبلغ عن انتحال من صفحة إنشاء الحساب: "
        f"{settings.PORTAL_BASE_URL}/register",
    )


def identity_report_decided(to: str, upheld: bool, reason: str = "") -> None:
    if upheld:
        body = (
            "راجع القسم بلاغك وأوقف الحساب الذي أُنشئ على رقمك الجامعي.\n"
            f"يمكنك الآن إنشاء حسابك: {settings.PORTAL_BASE_URL}/register"
        )
    else:
        body = "راجع القسم بلاغك ولم يوقف الحساب." + (f"\nالسبب: {reason}" if reason else "")
        body += "\nإن كان الحساب ليس لك فراجع شؤون الطلاب بإثبات هويتك."
    _send(to, "بلاغ الانتحال — بوابة كلية الإمارات", body)


def email_change_code(to: str, code: str, minutes: int) -> None:
    _send(
        to,
        "تأكيد البريد الجديد — بوابة كلية الإمارات",
        f"رمز تأكيد بريدك الجديد: {code}\n\n"
        f"صالح لمدة {minutes} دقائق. إن لم تطلب تغيير بريدك فتجاهل هذه الرسالة.",
    )


def email_changed(to: str, new_email: str) -> None:
    _send(
        to,
        "تغيّر بريد حسابك — بوابة كلية الإمارات",
        f"تغيّر بريد حسابك في بوابة الكلية إلى {new_email}.\n\n"
        "إن لم تكن أنت من غيّره فتواصل مع مسجل قسمك فورًا.",
    )


def account_invitation(to: str, full_name: str, token: str, days: int) -> None:
    link = f"{settings.PORTAL_BASE_URL}/activate/{token}"
    _send(
        to,
        "تفعيل حسابك — بوابة كلية الإمارات",
        f"مرحبًا {full_name}،\n\nأُنشئ لك حساب في بوابة الكلية. اختر كلمة المرور من الرابط:\n"
        f"{link}\n\nالرابط صالح لمدة {days} أيام ولمرة واحدة.",
    )
