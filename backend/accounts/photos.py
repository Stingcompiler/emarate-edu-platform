"""Profile photos (owner, 2026-10-30: every user may have one, 3 MB at most).

The upload is cut to a centred square and stored as a 512 px WebP: a phone photo of a few MB
becomes a few tens of KB, so lists of faces stay light. The orientation a phone records in
EXIF is applied first, so a portrait photo is not stored on its side.
"""

from __future__ import annotations

import io

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image, ImageOps

SIZE = 512
# The formats a photo may be (the upload's extensions): Image.open would otherwise pick any
# plugin its bytes fit — EPS hands them to Ghostscript (review 2026-11).
FORMATS = ("JPEG", "PNG", "WEBP")
# A phone photo is at most ~50 Mpx; a small file that declares more is a decompression bomb
# (an 11 KB PNG of 9500 × 9500 cost 400 MB to decode). Checked from the header, before decoding.
MAX_PIXELS = 50_000_000


class TooLarge(ValueError):
    pass


def normalize(uploaded) -> SimpleUploadedFile:
    """The photo as a square 512 px WebP, ready to store in place of the upload."""
    uploaded.seek(0)
    with Image.open(uploaded, formats=FORMATS) as image:
        if image.width * image.height > MAX_PIXELS:
            raise TooLarge(f"{image.width}x{image.height}")
        image = ImageOps.exif_transpose(image)
        image = ImageOps.fit(image.convert("RGB"), (SIZE, SIZE), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, "WEBP", quality=82, method=6)
    return SimpleUploadedFile("photo.webp", out.getvalue(), content_type="image/webp")
