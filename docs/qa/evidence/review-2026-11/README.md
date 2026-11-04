# Evidence — comprehensive review 2026-11

Plan: `docs/qa/comprehensive-review-plan-2026-11.md`. Report: `docs/qa/comprehensive-review-2026-11.md`.

## Probes

`backend_probes.py` asserts the faulty behaviour (passed = reproduced). Run:

```bash
bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11 sqlite
```

| Probe | Finding | On `d4cb0c1` (before) | After the fix |
|---|---|---|---|
| `test_r26_…` | a stopped programme/department still accepts applications | passed (reproduced) | failed (gone) |
| `test_r27_…` | a new code leaves the old site link broken, no redirect | passed | failed |
| `test_r28_…` | a programme with an unused intake cannot be deleted | passed | failed |
| `test_r29_…` | reversed dates on a year/term → 500 | passed | failed |

Each finding has a lasting regression test in `backend/organization/tests/test_structure_edit.py`.

## Baseline

`baseline/` holds the `scripts/qa/run.sh` logs for axis 0 (one file per suite).
