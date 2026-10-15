#!/usr/bin/env python3
"""QA scope: what changed, what it touches, which checks to run (no AI tokens spent).

Reads git only. Prints a short, stable summary that the QA agents use instead of reading
the diff themselves (docs/qa/QA-SYSTEM.md).

    python3 scripts/qa/scope.py              # since the last QA review report
    python3 scripts/qa/scope.py --base main  # since a ref
    python3 scripts/qa/scope.py full         # whole project, no diff
    python3 scripts/qa/scope.py exams        # one backend app / portal area
"""

from __future__ import annotations

import argparse
import re
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

# Backend apps where a bug costs data, grades or access: the logic audit (Opus) runs on these.
HIGH_RISK_APPS = {
    "accounts",
    "admissions",
    "exams",
    "results",
    "students",
    "student_affairs",
    "core",
    "files",
    "audit",
}
# Patterns in changed lines that raise the risk whatever the app (lessons of R01–R11).
RISK_PATTERNS = {
    "locks/transactions": r"select_for_update|transaction\.atomic|on_commit|F\(",
    "authorization": r"rbac|capabilit|has_perm|permission_classes|Role\.",
    "sessions/tokens": r"token_version|RefreshToken|logout|session",
    "state machine": r"status\s*=|\.status\b|STATUS|transition",
    "files/storage": r"default_storage|FileField|\.delete\(\)|upload",
    "clock/deadline": r"timezone\.now|deadline|ends_at|duration|setTimeout|setInterval",
    "offline sync": r"offline|queue|sync|navigator\.onLine|indexedDB|serviceWorker",
    "migration": r"migrations\.",
}
# Which end-to-end specs cover which area (e2e/tests).
E2E_MAP = {
    "accounts": ["sign-in.spec.ts", "password-reset.spec.ts", "access.spec.ts"],
    "admissions": ["apply.spec.ts"],
    "exams": ["exam.spec.ts"],
    "landing": ["landing.spec.ts"],
    "content": ["landing.spec.ts"],
}
UI_SPECS = ["layout.spec.ts", "a11y.spec.ts", "sweep.spec.ts"]
ROLE_RE = re.compile(r"Role\.([A-Z_]+)")


def git(*args: str) -> str:
    return subprocess.run(  # noqa: S603
        ["git", "-C", str(ROOT), *args],  # noqa: S607
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def default_base() -> str:
    """The commit of the last QA review report, else 20 commits back."""
    last = git("log", "-1", "--format=%H", "--", "docs/qa/*review*.md").strip()
    if last:
        return last
    count = int(git("rev-list", "--count", "HEAD").strip() or 1)
    return f"HEAD~{min(20, count - 1)}"


def area_of(path: str) -> tuple[str, str]:
    parts = path.split("/")
    if parts[0] == "backend" and len(parts) > 2:
        return "backend", parts[1]
    if path.startswith("apps/portal/src/routes/") and len(parts) > 5:
        return "portal", parts[4]
    if path.startswith("apps/portal/"):
        return "portal", "shell"
    if parts[0] == "apps" and len(parts) > 1:
        return "app", parts[1]
    if parts[0] in {"packages", "e2e", "scripts", "docs"}:
        return parts[0], parts[1] if len(parts) > 1 else ""
    return "other", parts[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("target", nargs="?", default="diff", help="diff | full | <area>")
    parser.add_argument("--base", help="git ref to diff from (default: last QA report)")
    args = parser.parse_args()

    head = git("rev-parse", "--short", "HEAD").strip()
    branch = git("branch", "--show-current").strip() or "(detached)"

    if args.target == "full":
        files = git("ls-files", "backend", "apps", "packages").split()
        files = [f for f in files if "/migrations/" not in f and not f.endswith(".lock")]
        diff_text, base = "", "(none — full scope)"
    else:
        base = args.base or default_base()
        files = git("diff", "--name-only", f"{base}...HEAD").split()
        files += git("diff", "--name-only", "HEAD").split()  # uncommitted work too
        if args.target != "diff":
            files = [f for f in files if area_of(f)[1] == args.target]
        files = sorted(set(files))
        # Only the lines of the files in scope (all of them for a plain diff).
        diff_text = (
            git("diff", "-U0", f"{base}...HEAD", "--", *files)
            + git("diff", "-U0", "HEAD", "--", *files)
            if files
            else ""
        )
    files = sorted(set(files))

    areas: dict[tuple[str, str], list[str]] = defaultdict(list)
    for path in files:
        areas[area_of(path)].append(path)

    added = [line[1:] for line in diff_text.splitlines() if line.startswith("+")]
    added = [line for line in added if not line.startswith("++")]
    hits = {
        name: sum(1 for line in added if re.search(pattern, line))
        for name, pattern in RISK_PATTERNS.items()
    }
    flags = sorted(name for name, count in hits.items() if count)
    roles = sorted({m for line in added for m in ROLE_RE.findall(line)})
    endpoints = sorted(
        {
            line.strip()[:100]
            for line in added
            if re.search(r"\bpath\(|@action\(|@extend_schema\(", line)
        }
    )

    backend_apps = sorted(name for (kind, name) in areas if kind == "backend")
    portal_areas = sorted(name for (kind, name) in areas if kind == "portal")
    risky = sorted(set(backend_apps) & HIGH_RISK_APPS)
    if args.target == "full":
        risky = sorted(HIGH_RISK_APPS)

    pytest_paths = [
        f"{app}/tests" for app in backend_apps if (ROOT / "backend" / app / "tests").is_dir()
    ]
    if any("rbac" in f or "views" in f or "urls" in f for f in files):
        pytest_paths.append("core/tests/test_permission_matrix.py")
    e2e = sorted({spec for app in backend_apps + portal_areas for spec in E2E_MAP.get(app, [])})
    if portal_areas or any(kind == "app" for (kind, _) in areas):
        e2e = sorted(set(e2e) | set(UI_SPECS))

    print(f"# QA scope — {branch} @ {head}")
    print(f"base: {base}")
    print(f"changed files: {len(files)}   added lines: {len(added)}")
    print()
    print("## Areas")
    for (kind, name), paths in sorted(areas.items()):
        shown = ", ".join(p.split("/", 2)[-1] for p in paths[:6])
        more = f" (+{len(paths) - 6})" if len(paths) > 6 else ""
        print(f"- {kind}/{name}: {shown}{more}")
    print()
    print("## Risk")
    print(f"- high-risk backend apps: {', '.join(risky) or 'none'}")
    signals = ", ".join(f"{name} ×{hits[name]}" for name in flags)
    print(f"- risk signals in added lines: {signals or 'none'}")
    print(f"- roles named in added lines: {', '.join(roles) or 'none'}")
    if endpoints:
        print("- endpoints added/changed:")
        for line in endpoints[:15]:
            print(f"    {line}")
    if any(f.endswith(".py") and "/migrations/" in f for f in files):
        print("- MIGRATIONS changed: check SQLite and PostgreSQL both")
    print()
    print("## Suggested checks (scripts/qa/run.sh suites)")
    print("- lint migrations openapi typecheck")
    if pytest_paths:
        print(f"- backend-sqlite backend-pg  → {' '.join(pytest_paths)}")
    if portal_areas:
        print("- frontend  (vitest)")
    if e2e:
        print(f"- e2e  → {' '.join(e2e)}")
    print()
    print("## Routing")
    if risky or {"locks/transactions", "authorization", "sessions/tokens", "offline sync"} & set(
        flags
    ):
        print("- logic audit: YES (qa-logic-auditor, Opus) — high-risk area or signal")
    else:
        print("- logic audit: light pass by qa-lead (Sonnet); no Opus needed")
    print(f"- UI audit: {'YES (qa-ui-auditor)' if portal_areas or e2e else 'no UI change'}")
    if args.target == "full":
        print("- size: full — one qa-logic-auditor call per group of high-risk apps (max 3)")
    elif len(added) > 1500:
        print("- size: large — split the logic audit and probes by area")
    else:
        print("- size: normal")


if __name__ == "__main__":
    main()
