# Evidence — review 2026-11 §1.1 (the college's admission form)

`backend_probes.py` asserts the faults (passed = reproduced): `bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11/admissions sqlite`. On `d4cb0c1`: 16 passed (SQLite and Postgres). After the fix: 16 failed.

| ID | Sev | Probe | Finding |
|---|---|---|---|
| R35 | 🟠 | `…conditional_staff_field_skips_type_validation` | a college field with a condition skipped every type check |
| R36 | 🟠 | `…university_number_editable_after_registration_desyncs_record` | number changed after registration, record kept the old one |
| R37 | 🟠 | `…typed_university_number_has_no_length_limit` | 40 characters accepted; Postgres 500 at registration |
| R38 | 🟢 | `…same_typed_university_number_on_two_applications` | two applications held the same number |
| R39 | 🟢 | `…deleting_a_used_template_is_a_server_error` | ProtectedError → 500 |
| R40 | 🟢 | `…malformed_schema_raises…`, `…malformed_show_if_is_a_500…` | malformed schema → 500 |
| R41 | 🟢 | `…college_field_may_depend_on_a_staff_field`, `…show_if_without_in_or_equals…` | conditions outside docs/03 §5 |
| R42 | 🟢 | `…university_number_can_be_an_applicant_field` | applicant could fill the number, ignored at registration |
| R43 | 🟢 | `…applicant_answers_for_keys_outside_the_form_reach_the_record` | extra keys stored and copied to the record |

Regression tests: `backend/admissions/tests/test_form_review_2026_11.py`.
