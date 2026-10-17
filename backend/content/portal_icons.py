"""The installed portal app's icons, cut from the logo chosen in the site settings.

The portal's web app manifest, its home-screen icon and its tab icon used to be fixed files, so
an installed app kept the old logo after the college changed it (owner, 2026-10-17). They now
point at `/api/public/portal-icon/<kind>.png`, which renders the current logo to each size; with
no logo set the built-in icons under /icons/ are used (the view redirects to them).
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from django.core.cache import cache
from PIL import Image, ImageOps


@dataclass(frozen=True)
class IconSpec:
    size: int
    # The share of the square the logo may fill. A maskable icon keeps to the inner safe zone:
    # launchers crop its edges into a circle or a squircle.
    fill: float
    # iOS and maskable icons cannot be transparent.
    opaque: bool
    # The portal's own file used while no logo is set.
    fallback: str


ICONS: dict[str, IconSpec] = {
    "192": IconSpec(192, 0.92, False, "/icons/icon-192.png"),
    "512": IconSpec(512, 0.92, False, "/icons/icon-512.png"),
    "maskable-512": IconSpec(512, 0.64, True, "/icons/maskable-512.png"),
    "apple-touch": IconSpec(180, 0.84, True, "/icons/apple-touch-icon.png"),
}

CACHE_SECONDS = 24 * 60 * 60


def render(source: Image.Image, spec: IconSpec) -> bytes:
    """The logo, contained in the icon's square (white behind it when it must be opaque)."""
    logo = ImageOps.exif_transpose(source).convert("RGBA")
    box = round(spec.size * spec.fill)
    logo = ImageOps.contain(logo, (box, box), Image.Resampling.LANCZOS)
    background = (255, 255, 255, 255) if spec.opaque else (0, 0, 0, 0)
    canvas = Image.new("RGBA", (spec.size, spec.size), background)
    canvas.alpha_composite(logo, ((spec.size - logo.width) // 2, (spec.size - logo.height) // 2))
    out = BytesIO()
    (canvas.convert("RGB") if spec.opaque else canvas).save(out, "PNG", optimize=True)
    return out.getvalue()


def icon_png(logo, kind: str) -> bytes:
    """The PNG for `kind` from a MediaAsset logo; rendered once, then served from the cache.

    The cache key carries the asset's id and file name, so choosing another logo (or uploading a
    new file) is a new key at once, with nothing to invalidate.
    """
    spec = ICONS[kind]
    key = f"portal-icon:{logo.pk}:{logo.file.name}:{kind}"
    png = cache.get(key)
    if png is None:
        with logo.file.open("rb") as handle, Image.open(handle) as image:
            png = render(image, spec)
        cache.set(key, png, CACHE_SECONDS)
    return png
