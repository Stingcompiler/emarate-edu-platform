"""Sample content for the public site in the demo (seed_demo, DEBUG only).

The college supplies its licence, figures, photos and texts; until then the demo shows what a
filled site looks like. Every text here says it is an example («(مثال)» / «(Example)»), every
image is a generated placeholder whose alt text says so, and nothing that already has a value
is overwritten — so real content entered in «محتوى الموقع» always wins.
"""

from __future__ import annotations

import io
import math
from datetime import timedelta

from django.core.files.base import ContentFile
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFont

from accounts.rbac import Role
from content.models import Event, MediaAsset, News, Page, SiteSettings
from organization.models import Department, Program

EXAMPLE_AR = "(مثال)"
EXAMPLE_EN = "(Example)"
ALT_PREFIX = "(مثال) صورة تجريبية"

# Brand colours (docs/brand): navy, primary blue and the accent red.
NAVY = (11, 36, 71)
BLUE = (44, 95, 158)
ACCENT = (163, 47, 74)
SAND = (232, 222, 205)


def _image(width: int, height: int, seed: int, *, portrait: bool = False) -> bytes:
    """A plainly generated picture: a brand gradient, soft circles and «SAMPLE IMAGE»."""
    img = Image.new("RGB", (width, height), NAVY)
    draw = ImageDraw.Draw(img)
    top, bottom = [(NAVY, BLUE), (BLUE, NAVY), (NAVY, ACCENT), (ACCENT, NAVY)][seed % 4]
    for y in range(height):
        t = y / max(1, height - 1)
        draw.line(
            [(0, y), (width, y)],
            fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom, strict=True)),
        )
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shapes = ImageDraw.Draw(overlay)
    for i in range(6):
        angle = (seed * 47 + i * 61) % 360
        r = min(width, height) * (0.18 + 0.07 * ((seed + i) % 4))
        cx = width * (0.5 + 0.38 * math.cos(math.radians(angle)))
        cy = height * (0.5 + 0.34 * math.sin(math.radians(angle)))
        shapes.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 18 + 6 * (i % 3)))
    if portrait:
        # A neutral silhouette: head and shoulders.
        w, h = width, height
        shapes.ellipse([w * 0.34, h * 0.2, w * 0.66, h * 0.46], fill=(*SAND, 235))
        shapes.ellipse([w * 0.16, h * 0.52, w * 0.84, h * 1.15], fill=(*SAND, 235))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)
    size = max(14, min(width, height) // 22)
    try:
        font = ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        font = ImageFont.load_default()
    label = "SAMPLE IMAGE"
    box = draw.textbbox((0, 0), label, font=font)
    pad = size // 2
    x, y = width - (box[2] - box[0]) - 3 * pad, height - (box[3] - box[1]) - 3 * pad
    draw.rounded_rectangle(
        [x - pad, y - pad, x + box[2] - box[0] + pad, y + box[3] - box[1] + pad * 1.4],
        radius=pad,
        fill=(0, 0, 0),
    )
    draw.text((x, y), label, font=font, fill=(255, 255, 255))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=82)
    return out.getvalue()


def _asset(user, name: str, alt_ar: str, alt_en: str, size: tuple[int, int], seed: int, **kw):
    asset = MediaAsset(
        alt_ar=f"{ALT_PREFIX} — {alt_ar}",
        alt_en=f"{EXAMPLE_EN} Sample image — {alt_en}",
        uploaded_by=user,
    )
    asset.file.save(f"sample-{name}.jpg", ContentFile(_image(*size, seed, **kw)), save=False)
    asset.save()
    return asset


def seed(users) -> None:
    site_user = users[Role.SITE_MANAGER]
    now = timezone.now()
    settings_ = SiteSettings.load()

    # ─── Trust signals (TrustStrip, about page) ──────────────────────────────
    changed = []
    if not settings_.tagline:
        settings_.tagline = f"{EXAMPLE_AR} تعليم تقني يُعدّ الخريج لسوق العمل من يومه الأول"
        changed.append("tagline")
    if not (settings_.licence_ar or settings_.licence_en):
        settings_.licence_ar = f"{EXAMPLE_AR} مرخّصة من وزارة التعليم العالي — قرار رقم 000/0000"
        settings_.licence_en = (
            f"{EXAMPLE_EN} Licensed by the Ministry of Higher Education — decision 000/0000"
        )
        changed += ["licence_ar", "licence_en"]
    if not settings_.figures:
        settings_.figures = [
            {
                "value": "1,200+",
                "label_ar": f"{EXAMPLE_AR} خريج",
                "label_en": "(Example) graduates",
            },
            {
                "value": "35",
                "label_ar": f"{EXAMPLE_AR} عضو هيئة تدريس",
                "label_en": "(Example) faculty",
            },
            {"value": "12", "label_ar": f"{EXAMPLE_AR} معملًا", "label_en": "(Example) labs"},
        ]
        changed.append("figures")
    if changed:
        settings_.save(update_fields=changed)

    # ─── Pictures: each part only where nothing is set yet (reruns add nothing) ──
    pictures = []
    if settings_.hero_image_id is None:
        settings_.hero_image = _asset(site_user, "hero", "واجهة الكلية", "campus", (1600, 1000), 0)
        pictures.append("hero_image")
    if settings_.share_image_id is None:
        settings_.share_image = _asset(site_user, "share", "صورة المشاركة", "share", (1200, 630), 1)
        pictures.append("share_image")
    if pictures:
        settings_.save(update_fields=pictures)

    # News with covers (the home page's «آخر الأخبار» and /news/), beside any real news.
    if not News.objects.filter(slug__startswith="sample-").exists():
        for n, (slug, title, summary) in enumerate(
            [
                (
                    "sample-graduation",
                    "حفل تخريج الدفعة الخامسة",
                    "احتفلت الكلية بتخريج طلابها بحضور أولياء الأمور.",
                ),
                (
                    "sample-network-lab",
                    "افتتاح معمل الشبكات الجديد",
                    "معمل مجهّز لتدريب طلاب تقنية المعلومات على الشبكات.",
                ),
                (
                    "sample-partnership",
                    "شراكة تدريب مع شركات تقنية",
                    "فرص تدريب صيفي لطلاب المستوى الثالث.",
                ),
            ]
        ):
            cover = _asset(site_user, slug, title, slug, (1200, 675), n + 2)
            News.objects.create(
                slug=slug,
                title=f"{EXAMPLE_AR} {title}",
                summary=f"{EXAMPLE_AR} {summary}",
                body=f"<p>{EXAMPLE_AR} خبر تجريبي للعرض فقط. {summary}</p>",
                cover=cover,
                status="published",
                publish_at=now - timedelta(days=3 + 9 * n),
                author=site_user,
            )

    # Event covers.
    for n, event in enumerate(Event.objects.filter(cover__isnull=True)[:4]):
        event.cover = _asset(site_user, f"event-{n}", event.title, "event", (1200, 675), n + 1)
        event.save(update_fields=["cover", "updated_at"])

    # The gallery page and the dean's photo: only on the demo's own (system) pages.
    gallery = Page.objects.filter(slug="gallery", author__isnull=True).first()
    if gallery and not any(b.get("type") == "image" for b in gallery.blocks):
        pictures = [
            ("القاعة الكبرى", "main hall"),
            ("معمل الحاسوب", "computer lab"),
            ("المكتبة", "library"),
            ("يوم التعريف بالكلية", "open day"),
            ("نشاط طلابي", "student activity"),
            ("حفل التخريج", "graduation"),
        ]
        gallery.blocks = [
            *gallery.blocks,
            *(
                {
                    "type": "image",
                    "url": _asset(site_user, f"gallery-{i}", ar, en, (1200, 800), i).file.url,
                    "alt": f"{ALT_PREFIX} — {ar}",
                }
                for i, (ar, en) in enumerate(pictures)
            ),
        ]
        gallery.save(update_fields=["blocks", "updated_at"])
    dean = Page.objects.filter(slug="about/dean", author__isnull=True).first()
    if dean and not any(b.get("type") == "image" for b in dean.blocks):
        photo = _asset(site_user, "dean", "صورة العميد", "the dean", (600, 750), 2, portrait=True)
        note, *rest = dean.blocks or [{}]
        dean.blocks = [
            note,
            {"type": "image", "url": photo.file.url, "alt": f"{ALT_PREFIX} — صورة العميد"},
            *rest,
        ]
        dean.save(update_fields=["blocks", "updated_at"])

    # ─── Texts the programme and department pages fall back from ─────────────
    for program in Program.objects.all():
        fields = []
        if not program.description_ar:
            program.description_ar = (
                f"{EXAMPLE_AR} برنامج {program.name_ar} يجمع بين الأساس النظري والتطبيق في "
                "المعامل، ويُعدّ الطالب للعمل أو لمواصلة الدراسة."
            )
            fields.append("description_ar")
        if not program.description_en and program.name_en:
            program.description_en = (
                f"{EXAMPLE_EN} The {program.name_en} programme combines theory with lab "
                "practice and prepares students for work or further study."
            )
            fields.append("description_en")
        if not program.outcomes_en:
            program.outcomes_en = (
                f"{EXAMPLE_EN} Solve practical problems in the field\n"
                f"{EXAMPLE_EN} Work in teams and present technical work\n"
                f"{EXAMPLE_EN} Keep learning new tools"
            )
            fields.append("outcomes_en")
        if not program.careers_en:
            program.careers_en = (
                f"{EXAMPLE_EN} Government sector\n{EXAMPLE_EN} Private companies\n"
                f"{EXAMPLE_EN} Freelance work"
            )
            fields.append("careers_en")
        if fields:
            program.save(update_fields=[*fields, "updated_at"])
    for department in Department.objects.filter(description=""):
        department.description = (
            f"{EXAMPLE_AR} قسم {department.name_ar}: برامج بكالوريوس ودبلوم، ومعامل مجهّزة، "
            "وهيئة تدريس تتابع الطالب من القبول حتى التخرج."
        )
        department.save(update_fields=["description", "updated_at"])
