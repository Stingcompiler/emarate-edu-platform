"""Who may upload or read a file, decided by the feature that owns it.

Apps register a policy per purpose (``learning`` registers "lecture" and
"submission" in its ``AppConfig.ready``). Unknown purposes are denied.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class Policy:
    can_upload: Callable  # (user, offering) -> bool
    can_read: Callable  # (user, stored_file) -> bool
    allowed_extensions: frozenset[str] | None = None
    max_mb: int = 50


_POLICIES: dict[str, Policy] = {}


def register(purpose: str, policy: Policy) -> None:
    _POLICIES[purpose] = policy


def policy(purpose: str) -> Policy | None:
    return _POLICIES.get(purpose)


def can_read(user, stored_file) -> bool:
    if stored_file.uploaded_by_id == getattr(user, "pk", None):
        return True
    found = policy(stored_file.purpose)
    return bool(found and found.can_read(user, stored_file))


# Videos belong to lecture content; the learning app registers these.
video_can_upload: Callable | None = None
video_can_read: Callable | None = None


def register_video(*, can_upload: Callable, can_read: Callable) -> None:
    global video_can_upload, video_can_read
    video_can_upload, video_can_read = can_upload, can_read
