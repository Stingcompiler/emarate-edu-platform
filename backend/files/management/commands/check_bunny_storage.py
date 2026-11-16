"""Prove the Bunny setup works before the files depend on it: a small file goes to each zone and
back, the private one only through a signed link (an unsigned one is refused), the public one at
its address; then both are deleted. Prints what passed, never a key."""

import secrets
import urllib.error
import urllib.request

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError

from files import bunny, move


def _fetch(url: str) -> tuple[int, bytes]:
    try:
        with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310  (https only)
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, b""


class Command(BaseCommand):
    help = "Check both Bunny zones and their pull zones (writes, reads, deletes a probe)."

    def handle(self, *args, **options):
        zones = move.zones()
        body = secrets.token_hex(16).encode()
        name = f"probe/{secrets.token_hex(8)}.txt"
        problems = []
        for part, storage in zones.items():
            try:
                storage._save(name, ContentFile(body))
            except Exception as error:
                problems.append(f"{part} zone: cannot write ({type(error).__name__})")
                continue
            try:
                if storage.open(name).read() != body:
                    problems.append(f"{part} zone: reads back something else")
                if part == "private":
                    url, _ = bunny.cdn_url(name, 120)
                    status, got = _fetch(url)
                    if status != 200 or got != body:
                        problems.append(f"private pull zone: signed link gave {status}")
                    unsigned = url.split("?", 1)[0]
                    if _fetch(unsigned)[0] == 200:
                        problems.append(
                            "private pull zone: opens WITHOUT a signed link — turn on Token "
                            "Authentication"
                        )
                else:
                    status, got = _fetch(storage.url(name))
                    if status != 200 or got != body:
                        problems.append(f"public pull zone: its address gave {status}")
            finally:
                try:
                    storage.delete(name)
                except Exception:
                    problems.append(f"{part} zone: the probe could not be deleted")
        if problems:
            raise CommandError("; ".join(problems))
        self.stdout.write("bunny: both zones and both pull zones work")
