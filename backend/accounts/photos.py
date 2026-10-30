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


def normalize(uploaded) -> SimpleUploadedFile:
    """The photo as a square 512 px WebP, ready to store in place of the upload."""
    uploaded.seek(0)
    with Image.open(uploaded) as image:
        image = ImageOps.exif_transpose(image)
        image = ImageOps.fit(image.convert("RGB"), (SIZE, SIZE), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, "WEBP", quality=82, method=6)
    return SimpleUploadedFile("photo.webp", out.getvalue(), content_type="image/webp")
