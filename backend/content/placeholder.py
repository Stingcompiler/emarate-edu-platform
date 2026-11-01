"""What of a page the public site will really show (owner review 2026-11-01).

The site hides the demo's sample text and the system's draft note (apps/landing/src/lib/
sample.mjs): a block that carries the mark is dropped, and a page left with only headings is
not built at all. These are the same rules on the server, so the control panel can say
«منشورة لكنها لا تظهر» and the portal never links to a page the site did not build. The
writing guidance the system puts in an official page's draft is caught too: it carries no
mark, so publishing it as-is would show the guidance to visitors.
"""

from __future__ import annotations

import re

from .official import BY_SLUG, DRAFT_NOTE

# Keep in step with MARK in apps/landing/src/lib/sample.mjs.
MARK = re.compile(
    r"\(\s*مثال\s*\)|\(\s*example\s*\)|\(\s*نص تجريبي\s*\)|نص تجريبي للعرض فقط|مسودة أنشأها النظام"
    r"|demo\.ecst\.test|\+?249[\s-]?0{3}[\s-]?0{3}[\s-]?0{3}|عنوان تجريبي",
    re.IGNORECASE,
)


def _texts(block: dict) -> list[str]:
    out = []
    for value in block.values():
        if isinstance(value, str):
            out.append(value)
        elif isinstance(value, list):
            out += [v for v in value if isinstance(v, str)]
            out += [t for v in value if isinstance(v, dict) for t in _texts(v)]
    return out


def marked(block: dict) -> bool:
    return any(MARK.search(text) for text in _texts(block))


def has_content(blocks: list) -> bool:
    """Whether the site builds the page: something besides headings once samples are gone."""
    kept = [b for b in blocks or [] if isinstance(b, dict) and not marked(b)]
    return any(b.get("type") != "heading" for b in kept)


def leftover_guidance(slug: str, blocks: list) -> list[str]:
    """The headings of an official page's sections whose writing hint is still there as-is,
    or the draft note itself: never to be published."""
    official = BY_SLUG.get(slug)
    if official is None:
        return []
    texts = {t.strip() for b in blocks or [] if isinstance(b, dict) for t in _texts(b)}
    left = [heading for heading, hint in official.sections if hint in texts]
    if DRAFT_NOTE in texts and not left:
        left.append("ملاحظة المسودة في أول الصفحة")
    return left
