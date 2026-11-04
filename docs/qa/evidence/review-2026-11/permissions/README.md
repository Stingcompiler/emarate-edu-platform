# Evidence — review 2026-11 axis 2 (permissions vs docs/03)

`backend_probes.py` (passed = reproduced): `bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11/permissions sqlite`. On `d4cb0c1`: 7 passed. After the fix: D1–D6 fail; D7 still passes (a document difference left for the owner).

| ID | Sev | Probe | Finding |
|---|---|---|---|
| R45 | 🟠 | d1 | the events manager edited/deleted any college announcement |
| R46 | 🟠 | d2 | academic affairs deleted other authors' staff announcements |
| R47 | 🟠 | d3 | aa + teacher-member deleted a department manager's announcement (R15 pattern) |
| R48 | 🟠 | d4 | the events manager relabelled/deleted any media, the site logo included |
| R49 | 🟢 | d5 | the head registrar read the audit trail of general inquiries |
| R50 | 🟢 | d6 | the head registrar did not see a student's status change and its source |
| D7 | doc | d7 | docs/03 §7 says sm 👁 cycles/intakes; the code refuses — owner decision |

Regression tests: `backend/content/tests/test_review_2026_11_permissions.py`.
