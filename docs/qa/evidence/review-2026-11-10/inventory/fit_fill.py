"""Writes the results of fit_run.spec.ts (fit-run-*.jsonl) into fit.csv's empty «result» column,
and prints a count by result. A row run twice keeps its last result."""

import csv
import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
found = {}
for log in sorted(HERE.glob("fit-run-*.jsonl")):
    for line in log.read_text(encoding="utf-8").splitlines():
        r = json.loads(line)
        found[(r["surface"], r["page"], r["who"], str(r["width"]))] = r["result"]

with (HERE / "fit.csv").open(encoding="utf-8") as f:
    rows = list(csv.reader(f))
for row in rows[1:]:
    row[4] = found.get(tuple(row[:4]), row[4])
with (HERE / "fit.csv").open("w", encoding="utf-8", newline="") as f:
    csv.writer(f, lineterminator="\n").writerows(rows)

tally = Counter(r[4].split(":")[0].split(" (")[0] or "empty" for r in rows[1:])
print(dict(tally))
for row in rows[1:]:
    if row[4].startswith("fail"):
        print(",".join(row))
