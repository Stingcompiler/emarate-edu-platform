# Evidence — review 2026-11 §1.3 (photos and «الكوادر»)

`backend_probes.py` asserts the faults (passed = reproduced): `bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11/photos sqlite`.

| Probe | ID | On `d4cb0c1` | After the fix |
|---|---|---|---|
| `…webp_signature_lets_postscript_reach_ghostscript` | R30 🔴 | passed | failed |
| `…decompression_bomb_below_pillow_hard_limit_is_decoded` | R31 🟠 | passed | failed |
| `…public_photo_still_served_after_member_leaves_teaching_staff` | R32 🟠 | passed | failed |
| `…public_staff_photo_is_cacheable_publicly_for_a_day` | R33 🟢 | passed | failed |
| `…department_manager_name_public_without_consent` | R34 🟠 | passed | **open — owner decision** |

Regression tests: `backend/accounts/tests/test_photo_hardening.py`.
