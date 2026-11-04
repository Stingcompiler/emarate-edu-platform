# Evidence — review 2026-11 axis 3 (data integrity)

`backend_probes.py` (passed = reproduced): `bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11/integrity sqlite` (and `pg` with `QA_PG_URL` for I6). On `d4cb0c1`: 5 passed + I6 on Postgres.

| ID | Sev | Probe | Finding | Fixed in |
|---|---|---|---|---|
| I1 = R26 | 🟠 | i1 | stopped programme still takes applications | #226 |
| R52 | 🟠 | i2 | `purge_demo` kept «(مثال)» outcomes/careers and the seeded fees | this PR |
| I3 = R36 | 🟢 | i3 | number changed after registration | #228 |
| R53 | 🟢 | i4 | saving one's public profile undid a photo hide made meanwhile | this PR |
| R54 | 🟢 | i5 | an admin profile edit undid the member's consent | this PR |
| R55 | 🟢 | i6 | the ten-link cap passed under concurrent adds (Postgres) | this PR |

Verified OK: every user write in the changed code is audited; locks on staff answers, qualifications, links; double registration (one succeeds, one 409); no JSON lookups or raw SQL added; `purge_demo` keeps the owner's structure and real staff photos. Migrations from zero: SQLite 12.1 s, Postgres 8.5 s; `notifications/0004` on 10,000 rows: 0.56 s / 1.14 s, a second run changes nothing. Not done: the migrations on a copy of the production database (needs the owner's go-ahead for a local restore).

Notes, not changed: Arabic ordering of «الكوادر» follows the database collation (may differ dev ↔ server); expired Idempotency-Key rows are never purged globally.

Regression tests: `backend/core/tests/test_integrity_review_2026_11.py`.
