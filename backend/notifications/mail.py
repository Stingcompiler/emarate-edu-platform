"""Every email the platform sends: the plain text as written, plus an HTML version in the
college's email design (owner, 2026-10-24: «still the old template»).

Senders keep writing plain Arabic text (subject + body); this module reads that text and lays
it out: a 6-digit code becomes the headline, the first link becomes the button. The text part
stays exactly what the sender wrote, so a client that shows no HTML loses nothing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

BRAND = "كلية الإمارات"
COLLEGE = "كلية الإمارات للعلوم والتكنولوجيا"
CODE = re.compile(r"(?<!\d)(\d{6})(?!\d)")
# Only http(s) links become buttons; anything else stays as plain (escaped) text.
URL = re.compile(r"https?://[^\s<>\"«»]+")
SIGNATURE = re.compile(r"^—\s*بوابة كلية الإمارات$")


@dataclass
class Layout:
    eyebrow: str
    headline: str = ""
    code: str = ""
    intro: str = ""
    paragraphs: list[list[str]] = field(default_factory=list)
    action_label: str = ""
    action_url: str = ""
    preheader: str = ""


def _action_label(url: str) -> str:
    if "/activate/" in url:
        return "اختيار كلمة المرور"
    if url.rstrip("/").endswith("/login"):
        return "الدخول إلى البوابة"
    if "/notifications" in url:
        return "فتح الإشعارات"
    if url.startswith(settings.PORTAL_BASE_URL.rstrip("/")):
        return "عرض في البوابة"
    return "فتح الرابط"


def layout(subject: str, body: str) -> Layout:
    """Read a plain-text email into the parts the HTML design shows."""
    head, _, tail = subject.partition(" — ")
    view = Layout(eyebrow=head.strip())
    for chunk in re.split(r"\n\s*\n", body.strip()):
        lines = []
        for raw in chunk.splitlines():
            line = raw.strip()
            if not line or SIGNATURE.match(line):
                continue
            found = CODE.search(line)
            if not view.code and found and "رمز" in line:
                view.code = found.group(1)
                view.intro = CODE.sub("", line).strip().rstrip(":").strip()
                continue
            link = URL.search(line)
            if not view.action_url and link:
                view.action_url = link.group(0).rstrip(".,؛،)")
                view.action_label = _action_label(view.action_url)
                line = line.replace(link.group(0), "").strip().rstrip(":").strip()
                if not line:
                    # «… من الرابط:» then the link: the button follows, the colon goes.
                    if lines and lines[-1].endswith(":"):
                        lines[-1] = lines[-1].rstrip(":").strip()
                    continue
            lines.append(line)
        if lines:
            view.paragraphs.append(lines)
    if view.code and view.intro.startswith(view.eyebrow):
        view.eyebrow = ""  # «رمز التحقق» is already the first words of the line above the code
    if not view.code:
        # No code: the subject is the headline and what follows the dash (a reference) the label.
        view.headline = head.strip()
        view.eyebrow = tail.strip() if tail.strip() and tail.strip() != BRAND else "بوابة الكلية"
    first = view.intro or (" ".join(view.paragraphs[0]) if view.paragraphs else "")
    view.preheader = first[:120]
    return view


def _site_url() -> str:
    origins = getattr(settings, "PUBLIC_SITE_ORIGINS", None) or []
    return origins[0].rstrip("/") if origins else ""


def render_html(subject: str, body: str) -> str:
    site = _site_url()
    return render_to_string(
        "emails/message.html",
        {
            "subject": subject,
            "view": layout(subject, body),
            "brand": BRAND,
            "college": COLLEGE,
            "site_url": site,
            "contact_url": f"{site}/ar/contact" if site else "",
        },
    )


def send_mail(
    subject: str,
    body: str,
    from_email: str | None,
    recipient_list: list[str],
    fail_silently: bool = False,
) -> int:
    """Same call as django.core.mail.send_mail; adds the HTML version."""
    message = EmailMultiAlternatives(subject, body, from_email, recipient_list)
    message.attach_alternative(render_html(subject, body), "text/html")
    return message.send(fail_silently=fail_silently)
