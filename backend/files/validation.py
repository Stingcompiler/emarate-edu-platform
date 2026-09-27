"""Upload checks: extension allow-list, content signature, size, archive bombs.

The stored MIME type comes from this table, never from the client.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

_OLE = (0, b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
_ZIP = (0, b"PK\x03\x04")


@dataclass(frozen=True)
class Kind:
    mime: str
    signatures: tuple[tuple[int, bytes], ...] = ()  # (offset, bytes); empty = text
    is_zip: bool = False


KINDS: dict[str, Kind] = {
    "pdf": Kind("application/pdf", ((0, b"%PDF-"),)),
    "doc": Kind("application/msword", (_OLE,)),
    "xls": Kind("application/vnd.ms-excel", (_OLE,)),
    "ppt": Kind("application/vnd.ms-powerpoint", (_OLE,)),
    "docx": Kind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", (_ZIP,), True
    ),
    "xlsx": Kind(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", (_ZIP,), True
    ),
    "pptx": Kind(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation", (_ZIP,), True
    ),
    "zip": Kind("application/zip", (_ZIP,), True),
    "png": Kind("image/png", ((0, b"\x89PNG\r\n\x1a\n"),)),
    "jpg": Kind("image/jpeg", ((0, b"\xff\xd8\xff"),)),
    "jpeg": Kind("image/jpeg", ((0, b"\xff\xd8\xff"),)),
    "gif": Kind("image/gif", ((0, b"GIF87a"), (0, b"GIF89a"))),
    "webp": Kind("image/webp", ((8, b"WEBP"),)),
    "mp3": Kind("audio/mpeg", ((0, b"ID3"), (0, b"\xff\xfb"), (0, b"\xff\xf3"))),
    "mp4": Kind("video/mp4", ((4, b"ftyp"),)),
    "txt": Kind("text/plain"),
    "csv": Kind("text/csv"),
    "py": Kind("text/plain"),
    "java": Kind("text/plain"),
    "c": Kind("text/plain"),
    "cpp": Kind("text/plain"),
    "sql": Kind("text/plain"),
}
DEFAULT_EXTENSIONS = frozenset(KINDS)
VIDEO_EXTENSIONS = frozenset({"mp4", "mov", "mkv", "webm"})
_MAX_ZIP_RATIO = 20
_MAX_ZIP_ENTRIES = 5000


class UploadError(ValueError):
    pass


def extension_of(name: str) -> str:
    return PurePosixPath(name).suffix.lower().lstrip(".")


def check(upload, *, allowed: frozenset[str] | set[str] | None, max_mb: int) -> Kind:
    """Validate an uploaded file; return its kind (with the trusted MIME type)."""
    ext = extension_of(upload.name)
    allowed = frozenset(allowed or DEFAULT_EXTENSIONS) & DEFAULT_EXTENSIONS
    if ext not in allowed:
        raise UploadError(f"File type .{ext or '?'} is not allowed here.")
    if upload.size > max_mb * 1024 * 1024:
        raise UploadError(f"The file is larger than {max_mb} MB.")
    kind = KINDS[ext]
    upload.seek(0)
    head = upload.read(4096)
    upload.seek(0)
    if kind.signatures:
        if not any(head[o : o + len(sig)] == sig for o, sig in kind.signatures):
            raise UploadError("The file content does not match its extension.")
    elif b"\x00" in head:
        raise UploadError("Text files must not contain binary data.")
    if kind.is_zip:
        _check_zip(upload, max_mb)
    return kind


def _check_zip(upload, max_mb: int) -> None:
    try:
        with zipfile.ZipFile(upload) as archive:
            entries = archive.infolist()
    except zipfile.BadZipFile:
        raise UploadError("The archive is damaged.") from None
    finally:
        upload.seek(0)
    if len(entries) > _MAX_ZIP_ENTRIES:
        raise UploadError("The archive has too many files.")
    if sum(e.file_size for e in entries) > max_mb * 1024 * 1024 * _MAX_ZIP_RATIO:
        raise UploadError("The archive expands to an unsafe size.")
