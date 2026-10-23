#!/usr/bin/env python3
"""A button disabled by what the person has not filled in must say why (design review B2).

A `disabled={…}` that tests the form's own content (`!title.trim()`, `!email.includes("@")`,
`!changed` …) leaves a dead button with no explanation. Give the `Button` a `why="…"` (shown under
it while it is disabled), keep it enabled and show errors when it is pressed, or mark a
considered exception with a `ui-allow: <reason>` comment within six lines.

Disabling only while a request runs (`save.isPending`, `busy`, `sent` …) is fine. Existing
buttons are counted per file in scripts/lint-ui-disabled-baseline.txt: a file may not gain a new
one, and fixing one lowers its number there. Run through `pnpm lint:ui`; exits 1 on a new hit.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / "scripts" / "lint-ui-disabled-baseline.txt"
PENDING = re.compile(
    r"isPending|isLoading|isFetching|busy|pending|saving|loading|progress|uploading|sent|submitting",
    re.I,
)
CONTENT = re.compile(r"\.trim\(\)|\.includes\(|\.length|===|!==|\.startsWith\(")


def expression(lines: list[str], at: int) -> str:
    """The `{…}` after `disabled=` on lines[at] (it may continue onto the next lines)."""
    text = "\n".join(lines[at : at + 6])
    start = text.index("disabled={") + len("disabled=")
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i]
    return text[start + 1 :]


def gated_by_content(expr: str) -> bool:
    for clause in re.split(r"\|\||&&|\?|:", expr):
        clause = clause.strip()
        if not clause or PENDING.search(clause):
            continue
        if (clause.startswith("!") and not clause.startswith("!!")) or CONTENT.search(clause):
            return True
    return False


def hits() -> dict[str, list[tuple[int, str]]]:
    found: dict[str, list[tuple[int, str]]] = {}
    for path in sorted((ROOT / "apps" / "portal" / "src").rglob("*.tsx")):
        if ".test." in path.name:
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            if "disabled={" not in line:
                continue
            if not gated_by_content(expression(lines, i)):
                continue
            window = "\n".join(lines[max(0, i - 6) : i + 7])
            if "why=" in window or "ui-allow:" in window:
                continue
            found.setdefault(str(path.relative_to(ROOT)), []).append((i + 1, line.strip()))
    return found


def baseline() -> dict[str, int]:
    out: dict[str, int] = {}
    if BASELINE.exists():
        for line in BASELINE.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#"):
                path, count = line.rsplit(" ", 1)
                out[path] = int(count)
    return out


def main() -> int:
    found = hits()
    if "--write-baseline" in sys.argv:
        BASELINE.write_text(
            "# Buttons disabled by form content without a reason: per file, may only go down\n"
            "# (scripts/lint_ui_disabled.py). Fix one, then lower its number.\n"
            + "".join(f"{p} {len(v)}\n" for p, v in sorted(found.items())),
            encoding="utf-8",
        )
        print(f"baseline written: {sum(len(v) for v in found.values())} in {len(found)} files")
        return 0
    allowed = baseline()
    failed = False
    for path, items in found.items():
        if len(items) > allowed.get(path, 0):
            if not failed:
                print("✘ a button disabled by what is not filled in, without a reason (give it why=\"…\")")
            failed = True
            for number, text in items:
                print(f"    {path}:{number}:{text[:150]}")
    for path, count in allowed.items():
        if len(found.get(path, [])) < count:
            print(f"note: {path} is below its baseline ({len(found.get(path, []))} < {count}): lower it")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
