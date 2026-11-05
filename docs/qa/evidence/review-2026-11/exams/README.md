# Evidence — review 2026-11 axes 1.4/1.5 (exams, late work, notification links)

Backend probes `backend_probes.py` (`bash scripts/qa/probe.sh docs/qa/evidence/review-2026-11/exams sqlite`); frontend probes `*.probe.test.tsx` (copy next to the component to run). Passed = reproduced. On `main` before this PR all reproduced; after it they fail (the last backend test, the link enumeration, is a plain check and passes).

| ID | Sev | Finding |
|---|---|---|
| R57 | 🟠 | a published exam's questions could be edited (PATCH/POST/DELETE) until someone started it |
| R58 | 🟠 | such an edit (multiple, partial credit, no right choice) made grading divide by zero; `close_expired` then died every minute and held every later attempt |
| R59 | 🟠 | Escape on the submit dialog kept the offline auto-submit armed |
| R60 | 🟠 | a late policy without `late_until`: the server took work forever, the page said «أُغلق التسليم» |
| R61 | 🟠 | «عُيّنت على مادة» linked `/courses/<uuid>`; the page reads the offering's number |

Verified OK: partial credit within 0..marks; resume position vs shuffled/no-backtrack; sync before submit; late-penalty text; every other notification link has a route and a fitting role; academic affairs' audience is teachers and TAs.

Regression tests: `backend/exams/tests/test_review_2026_11.py`, `apps/portal/src/routes/exams/TakeExam.review.test.tsx`, `apps/portal/src/routes/learning/Assignment.review.test.tsx`.
