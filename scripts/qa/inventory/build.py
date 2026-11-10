"""Inventory registers (review plan 2026-11-10, «تثبيت ما يدخل في المراجعة»).

Reads what collect.py and register.test.ts wrote, the site's page templates, the pages
specification and the e2e specs, and writes the coverage registers as CSV plus a summary:

    site.csv      template × language
    portal.csv    route × role that may open it
    backend.csv   operation (method + path) with its URL name and its permission test
    fit.csv       page × required size, to be filled when the fit checks run
    README.md     counts and what needs a decision

Usage: build.py <work-dir> <out-dir>   (run by scripts/qa/inventory.sh)
"""

import csv
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
work, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
PAGES = ROOT / "apps/landing/src/pages"
E2E = {p.name: p.read_text() for p in sorted((ROOT / "e2e/tests").glob("*.spec.ts"))}
SIZES = ["390", "1280"]


def write(name: str, header: list[str], rows: list[list]) -> None:
    with (out / name).open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)


def specs(needle: str) -> str:
    return " ".join(name.removesuffix(".spec.ts") for name, text in E2E.items() if needle in text)


# --- The public site: template × language ---------------------------------------------------
site = []
for file in sorted(PAGES.rglob("*")):
    if not file.is_file():
        continue
    rel = file.relative_to(PAGES).as_posix()
    route = "/" + re.sub(r"(/index)?\.(astro|ts)$", "", rel).removesuffix("index")
    localized = rel.startswith("[lang]/")
    text = file.read_text()
    imports = re.search(r"import \{([^}]+)\} from \"[./]+/lib/api\"", text)
    data = (
        ", ".join(sorted(n.strip() for n in imports.group(1).split(",") if "type " not in n))
        if imports
        else ""
    )
    kind = "page" if rel.endswith(".astro") else "file"
    first = route.replace("/[lang]", "").split("[")[0].rstrip("/") or "/"
    for lang in ["ar", "en"] if localized else ["-"]:
        site.append(
            [
                rel,
                route.replace("[lang]", lang) if localized else route,
                lang,
                kind,
                "yes" if "[" in rel.replace("[lang]", "") else "no",
                data,
                specs(f"/{lang}{first}" if localized and first != "/" else first),
            ]
        )
write("site.csv", ["template", "route", "language", "kind", "dynamic", "data", "e2e"], site)

# --- The portal: route × role ----------------------------------------------------------------
portal_data = json.loads((work / "portal.json").read_text())
portal, unguarded, nobody, deep = [], [], [], []
linked = {to for links in portal_data["nav"].values() for to in links}
for route in portal_data["routes"]:
    path = route["path"]
    dynamic = "yes" if ":" in path or "*" in path else "no"
    if not route["guarded"]:
        unguarded.append(path)
        portal.append([path, "(بلا دخول)", "", dynamic, specs(f'"{path}"')])
        continue
    if not route["roles"]:
        nobody.append(path)
    if path not in linked and dynamic == "no":
        deep.append(path)
    for role in route["roles"]:
        in_nav = "yes" if path in portal_data["nav"][role] else "no"
        portal.append([path, role, in_nav, dynamic, specs(f'"{path}"')])
write("portal.csv", ["route", "role", "in_navigation", "needs_a_record", "e2e"], portal)

# --- The backend: operation ------------------------------------------------------------------
operations = json.loads((work / "backend.json").read_text())
OPERATION_COLUMNS = ("tag", "method", "path", "operation", "url_name", "matrix")
write(
    "backend.csv",
    ["tag", "method", "path", "operation", "url_name", "permission_test"],
    [
        [o[k] for k in ("tag", "method", "path", "operation", "url_name", "matrix")]
        for o in operations
    ],
)
v1 = [o for o in operations if o["surface"] == "v1"]
untested = sorted({o["path"] for o in v1 if not o["matrix"]})

# --- Fit: page × size, to be filled ----------------------------------------------------------
fit = [["site", row[1], row[2], size, ""] for row in site if row[3] == "page" for size in SIZES]
seen = set()
for path, role, *_ in portal:
    if path in seen:
        continue
    seen.add(path)
    fit += [["portal", path, role, size, ""] for size in SIZES]
write("fit.csv", ["surface", "page", "language_or_role", "width", "result"], fit)

# --- The pages specification against the code ------------------------------------------------
spec_text = (ROOT / "docs/07-pages-spec.md").read_text()
portal_spec = spec_text.split("## 2. البوابة", 1)[1]
spec_paths = set(re.findall(r"`(/[a-z][^`\s]*)`", portal_spec))
norm = lambda p: re.sub(r"\[[^\]]+\]|:[a-zA-Z_]+", ":x", p).rstrip("/") or "/"  # noqa: E731
code_paths = {norm(r["path"]) for r in portal_data["routes"]}
spec_norm = {norm(p) for p in spec_paths}
code_only = sorted(code_paths - spec_norm)
spec_only = sorted(spec_norm - code_paths)

commit = subprocess.run(
    ["git", "rev-parse", "--short", "HEAD"],  # noqa: S607
    cwd=ROOT,
    capture_output=True,
    text=True,
    check=True,
).stdout.strip()
pages = [row for row in site if row[3] == "page"]
by_tag = Counter(o["tag"] for o in operations)
with_record = sum(1 for r in portal_data["routes"] if ":" in r["path"])


def listed(paths: list[str]) -> str:
    return "، ".join(f"`{p}`" for p in paths) or "لا شيء"


roles_per_route = Counter(row[0] for row in portal if row[1] != "(بلا دخول)")
lines = [
    "# جرد النسخة قيد المراجعة",
    "",
    f"النسخة `{commit}`. يُعاد توليده بـ `bash scripts/qa/inventory.sh <مجلد>`؛ لا يُحرَّر باليد.",
    "المصدر: قوالب `apps/landing/src/pages`، مسارات `apps/portal/src/main.tsx` وقواعد",
    "`ROUTE_ACCESS` مقيَّمة على رد `/api/v1/me` لمستخدم من كل دور، ومخطط OpenAPI مع صفوف",
    "`core/tests/test_permission_matrix.py`.",
    "",
    "| السجل | الملف | وحدة العد | العدد |",
    "|---|---|---|---|",
    f"| الموقع العام | `site.csv` | قالب × لغة | {len(site)} ({len(pages)} صفحة، "
    f"{len(site) - len(pages)} ملفًا مولَّدًا) |",
    f"| البوابة | `portal.csv` | مسار × دور ينطبق عليه | {len(portal)} "
    f"({len(portal_data['routes'])} مسارًا، منها {len(unguarded)} بلا دخول) |",
    f"| الخادم | `backend.csv` | عملية (طريقة + مسار) | {len(operations)} في {len(by_tag)} وحدة |",
    f"| فحص العرض | `fit.csv` | صفحة × حجم (390 و1280) | {len(fit)} — عمود النتيجة فارغ حتى يُنفَّذ |",
    "",
    "## ما يحتاج نظرًا",
    "",
    f"- **مسارات محمية لا يفتحها أي دور ({len(nobody)}):** "
    + ("، ".join(f"`{p}`" for p in nobody) or "لا شيء")
    + ".",
    f"- **مسارات بلا رابط في تنقّل أي دور ({len(deep)})** — تُفتح من صفحة أخرى، فلا يمر بها "
    f"`sweep.spec.ts`: {listed(deep)}.",
    f"- **مسارات تحتاج سجلًا (`:id`): {with_record}** — تُفحص ببيانات العرض من الصفحة التي تفتحها.",
    f"- **عمليات `/api/v1` بلا صف في اختبار المصفوفة ({len(untested)}):** {listed(untested)}.",
    "",
    "## المواصفة (docs/07 §2) مقابل الكود",
    "",
    "docs/07 §2.17 ينبّه أن مسارات البوابة الفعلية تبدأ بـ `/system/…` و`/admissions/…`؛ القائمتان "
    "أدناه مطابقة نصية بعد توحيد المعرّفات، وليست حكمًا: يُراجَع كل سطر.",
    "",
    f"**في الكود وليست في المواصفة ({len(code_only)}):** {listed(code_only)}",
    "",
    f"**في المواصفة وليست في الكود ({len(spec_only)}):** {listed(spec_only)}",
    "",
    "## أدوار كل مسار (عدد الأدوار التي تفتحه)",
    "",
    "| المسار | الأدوار |",
    "|---|---|",
    *[f"| `{path}` | {count} |" for path, count in sorted(roles_per_route.items())],
    "",
]
(out / "README.md").write_text("\n".join(lines))
print(f"site {len(site)} · portal {len(portal)} · backend {len(operations)} · fit {len(fit)}")
