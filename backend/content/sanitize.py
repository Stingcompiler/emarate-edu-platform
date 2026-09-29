"""Server-side HTML sanitizing for rich text (docs/05 §9 «XSS»): allow-list via nh3."""

import nh3

TAGS = {
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "ul",
    "ol",
    "li",
    "blockquote",
    "h2",
    "h3",
    "h4",
    "a",
    "img",
    "figure",
    "figcaption",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
    "code",
    "pre",
    "span",
}
ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt", "width", "height"},
    "th": {"colspan", "rowspan"},
    "td": {"colspan", "rowspan"},
    "*": {"dir", "lang"},
}


def clean_html(value: str) -> str:
    return nh3.clean(
        value or "",
        tags=TAGS,
        attributes=ATTRIBUTES,
        url_schemes={"https", "mailto", "tel"},
        link_rel="noopener noreferrer",
    )


BLOCK_TYPES = {"heading", "paragraph", "note", "html", "image", "cta", "list"}


def _safe_url(url) -> bool:
    """https links, or paths on the site itself — not ``//host`` or ``/\\host``, which
    browsers read as another site."""
    if not isinstance(url, str):
        return False
    if url.startswith("https://"):
        return True
    return url.startswith("/") and not url.startswith(("//", "/\\"))


def clean_blocks(blocks: list) -> list:
    """Page blocks: known types only; any HTML inside is sanitized."""
    clean = []
    for block in blocks or []:
        if not isinstance(block, dict) or block.get("type") not in BLOCK_TYPES:
            continue
        item = {k: v for k, v in block.items() if isinstance(v, (str, int, bool, list))}
        for key in ("html", "text"):
            if isinstance(item.get(key), str):
                item[key] = clean_html(item[key]) if key == "html" else item[key][:5000]
        if "url" in item and not _safe_url(item["url"]):
            item.pop("url")
        clean.append(item)
    return clean
