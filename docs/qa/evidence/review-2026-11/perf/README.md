# Evidence — review 2026-11 axis 5 (performance)

Probes `backend_probes.py` (N, then 3N rows; passed = the count grew): `bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11/perf sqlite`. Needs the `count_queries` fixture (backend/conftest.py).

| ID | Sev | Endpoint | N → 3N before | After |
|---|---|---|---|---|
| R62 | 🟠 | `GET /api/v1/applications` as registrar / department manager | 18 → 32 | constant (SystemSettings read once per list) |
| R63 | 🟠 | `GET /api/v1/live-sessions` as student (`اليوم`) / teacher | 29 → 79 / 14 → 34 | constant (attending and teaching sets read once; can_manage once per course) |

Constant already (queries): programmes 3, departments 3, intakes 4, public programmes 2, public department with 60 staff 13, public departments 12, head registrar's applications 8, summary 4, inquiries 6, registration requests 3, admissions report 14, student lists 2–7, teacher lists 1–7, department/teachers/affairs reports 16–19.

Bundle (portal, gzip): first chunk 93.5 kB (was 104.7; D2 line 337 kB raw → 303 kB raw now); first load with the shared `ui` chunk 146 kB (+8 kB since 2026-10-08). Largest routes under 10 kB gzip each. Site page weight (phone, cold): 259–272 KB against a 500 KB budget; fonts are ~89%.

Notes, not changed: staff photos are stored 512 px and shown at 64 px (a 128–256 px variant would save bytes on long staff pages); the 30 s site-rebuild window is a throttle (≤120 hooks an hour while editing) — how the server serialises builds is in its systemd units, to be read on the server (axis 6).

Regression tests: `backend/core/tests/test_query_counts_review_2026_11.py`.
