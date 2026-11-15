# Evidence — review 2026-11-15

Report: `docs/qa/comprehensive-review-2026-11-15.md`. Every probe asserts the correct behaviour,
so it fails on `main` (`1ddc672`) while its defect is there. They are kept here as text, outside
the test tree; each fix PR moves its probes into the suite as permanent tests.

| File | Findings | Run |
|---|---|---|
| `probe_programme_a.py`, `_b.py`, `_c.py` | R93, R94, R100–R102, R106–R108 (+3 sound checks) | copy into `backend/tests/probe_review/`, SQLite |
| `probe_integrity.py` | R95–R99, R104 (`test_s3` PostgreSQL only) | same, `DATABASE_URL=postgres:///<scratch>` for s3 |
| `probe_exam_offline.test.tsx.txt` | R105 | copy to `apps/portal/src/routes/exams/*.test.tsx`, vitest |
| `probe_backups.py` | R115–R119, R122, R123 (`test_p8` real `pg_dump`/`psql`, PostgreSQL) | same as above |
| `probe_m1_migration_0013.py` | R103 | `backend/accounts/tests/`, both engines |
| `backend.csv`, `portal.csv`, `site.csv`, `fit.csv` | registers regenerated with `scripts/qa/inventory.sh` (405 operations, 695 route×role rows) | diff against `../review-2026-11-10/inventory/` |
