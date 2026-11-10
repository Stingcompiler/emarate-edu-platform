"""Review 2026-11-10, R90: a university number is one number in any letter case — in a results
file and in a transcript's address (the students import and the registration had it, R78/R79)."""

from accounts.rbac import Role
from results.tests.test_results import URL, _upload


def test_a_results_file_finds_a_number_typed_in_lower_case(api, make_user, classroom, term):
    officer = make_user(Role.RESULTS_OFFICER)
    batch = _upload(api(officer), term, "26-it-0100,IT101,91,,").data
    assert batch["summary"] == {"rows": 1, "create": 1, "error": 0}
    assert api(officer).post(f"{URL}/{batch['public_id']}/commit").status_code == 200


def test_a_transcript_opens_from_a_number_typed_in_lower_case(api, make_user, classroom):
    officer = make_user(Role.RESULTS_OFFICER)
    response = api(officer).get("/api/v1/transcripts/26-it-0100")
    assert response.status_code == 200
