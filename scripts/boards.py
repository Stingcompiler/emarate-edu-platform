#!/usr/bin/env python3
"""Find and view the prototype boards a page must match (phone + desktop).

Every page is built against two references in docs/prototype/screens/:
a phone board (390x844) and a desktop board (1280x800). This tool finds them
and serves them locally so they can be compared side by side with the real
page in a browser at the same viewport size.

    python3 scripts/boards.py list                 # every board, grouped by size
    python3 scripts/boards.py list اليوم           # boards whose title/file matches
    python3 scripts/boards.py serve                # http://127.0.0.1:8799/<Board>.dc.html
    python3 scripts/boards.py serve --ref origin/docs/mobile-experience-and-prototype

``--ref`` reads the boards from a git ref instead of the working tree (useful
while the prototype still lives on an unmerged branch).
"""

from __future__ import annotations

import argparse
import functools
import http.server
import io
import json
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCREENS = Path("docs/prototype/screens")
PORT = 8799


def _screens_dir(ref: str | None) -> Path:
    if ref is None:
        path = ROOT / SCREENS
        if not (path / "canvas.json").exists():
            sys.exit(
                f"✗ {SCREENS}/canvas.json not found. Use --ref <branch> to read the "
                "prototype from another branch."
            )
        return path
    # Fixed command; `ref` is a git ref typed by the developer running the tool.
    archive = subprocess.run(  # noqa: S603
        ["git", "-C", str(ROOT), "archive", ref, str(SCREENS)],  # noqa: S607
        check=True,
        capture_output=True,
    ).stdout
    out = Path(tempfile.mkdtemp(prefix="ecst-boards-"))
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(out, filter="data")
    return out / SCREENS


def _boards(screens: Path) -> list[dict]:
    canvas = json.loads((screens / "canvas.json").read_text(encoding="utf-8"))
    rows = []
    for name in canvas.get("order") or canvas["boards"]:
        board = canvas["boards"][name]
        rows.append(
            {
                "file": name,
                "title": board.get("title", ""),
                "kind": "desktop" if board.get("w", 0) >= 1024 else "phone",
                "size": f"{board.get('w')}x{board.get('h')}",
            }
        )
    return rows


def cmd_list(args: argparse.Namespace) -> None:
    rows = _boards(_screens_dir(args.ref))
    if args.query:
        q = args.query.casefold()
        rows = [r for r in rows if q in r["title"].casefold() or q in r["file"].casefold()]
    for kind in ("phone", "desktop"):
        group = [r for r in rows if r["kind"] == kind]
        if not group:
            continue
        print(f"\n{kind.upper()} ({len(group)})")
        for r in group:
            print(f"  {r['file']:<42} {r['size']:<9} {r['title']}")
    if args.query and {r["kind"] for r in rows} != {"phone", "desktop"}:
        missing = {"phone", "desktop"} - {r["kind"] for r in rows}
        print(
            f"\n⚠ No {' / '.join(sorted(missing))} board matches — derive it from the "
            "shell rules in docs/06 §4 and §9 and say so in the PR."
        )


def cmd_serve(args: argparse.Namespace) -> None:
    screens = _screens_dir(args.ref)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(screens))
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as httpd:
        print(f"Serving {screens} at http://127.0.0.1:{args.port}/  (Ctrl+C to stop)")
        httpd.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--ref", help="read boards from this git ref instead of the working tree")
    sub = parser.add_subparsers(dest="command", required=True)
    p_list = sub.add_parser("list", help="list boards (optionally filtered)")
    p_list.add_argument("query", nargs="?")
    p_list.set_defaults(func=cmd_list)
    p_serve = sub.add_parser("serve", help="serve boards on localhost")
    p_serve.add_argument("--port", type=int, default=PORT)
    p_serve.set_defaults(func=cmd_serve)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
