"""Review 2026-10-25, group 4: the admission form. R19 (only a published, frozen template is
offered), R20 (answers checked by type, field rules for files), R21 (a submit key belongs to one
application)."""

from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.rbac import Role
from admissions import services
from admissions.models import Application, ApplicationFormTemplate
from admissions.tests.test_admissions import SCHEMA, _complete, intake, visitor  # noqa: F401

FIELDS = {
    "steps": [
        {
            "title": "بيانات",
            "sections": [
                {
                    "title": "عام",
                    "fields": [
                        {"key": "code", "type": "text", "label": "الرمز", "pattern": "[A-Z]{3}"},
                        {"key": "born", "type": "date", "label": "تاريخ الميلاد"},
                        {"key": "agree", "type": "boolean", "label": "أوافق"},
                        {"key": "score", "type": "number", "label": "النسبة", "max": 100},
                        {"key": "mobile", "type": "phone", "label": "الهاتف"},
                        {"key": "track", "type": "select", "label": "المساق", "options": ["أ"]},
                    ],
                }
            ],
        }
    ]
}


def test_answers_are_checked_by_type_before_any_rule():
    bad = {
        "code": {"$ne": "x"},  # an object slipped past the pattern before
        "born": "2026-13-45",
        "agree": "yes",
        "score": "inf",
        "mobile": "not a phone",
        "track": ["أ"],
    }
    errors = services.validate_answers(FIELDS, bad, set())
    assert set(errors) == set(bad), errors
    assert services.validate_answers(FIELDS, {"score": True}, set()) == {
        "score": "Must be a number."
    }
    good = {
        "code": "ABC",
        "born": "2008-02-29",
        "agree": False,
        "score": "88.5",
        "mobile": "0912345678",
        "track": "أ",
    }
    assert services.validate_answers(FIELDS, good, set()) == {}


def test_a_schema_with_a_broken_pattern_or_file_rule_is_refused():
    broken = {
        "steps": [
            {
                "sections": [
                    {
                        "fields": [
                            {"key": "a", "type": "text", "pattern": "([a-z"},
                            {"key": "b", "type": "file", "accept": ["exe"]},
                        ]
                    }
                ]
            }
        ]
    }
    problems = " ".join(services.check_schema(broken))
    assert "regular expression" in problems and "accept" in problems


def test_an_intake_only_offers_a_published_template(api, intake, make_user):  # noqa: F811
    head = make_user(Role.HEAD_REGISTRAR)
    draft = ApplicationFormTemplate.objects.create(name="هندسة", schema=SCHEMA, created_by=head)
    url = f"/api/v1/intakes/{intake.pk}"
    refused = api(head).patch(url, {"form_template": draft.pk}, format="json")
    assert refused.status_code == 400 and "form_template" in str(refused.data)
    services.publish_template(services.RequestMeta(actor=head), draft)
    assert api(head).patch(url, {"form_template": draft.pk}, format="json").status_code == 200
    intake.refresh_from_db()
    assert services.template_for(intake) == draft
    # A newer published version replaces it for new applications; the draft that follows
    # it is never used.
    newer = services.new_template_version(services.RequestMeta(actor=head), draft)
    assert services.template_for(intake) == draft
    services.publish_template(services.RequestMeta(actor=head), newer)
    assert services.template_for(intake) == newer


def test_a_file_field_can_narrow_but_never_widen_the_upload_rules(
    intake,  # noqa: F811
    make_user,
    django_capture_on_commit_callbacks,
):
    head = make_user(Role.HEAD_REGISTRAR)
    schema = {
        "steps": [
            {
                "sections": [
                    {
                        "fields": [
                            {"key": "photo", "type": "file", "accept": ["png"], "max_mb": 50},
                        ]
                    }
                ]
            }
        ]
    }
    template = ApplicationFormTemplate.objects.create(name="صور", schema=schema, created_by=head)
    services.publish_template(services.RequestMeta(actor=head), template)
    intake.form_template = template
    intake.save(update_fields=["form_template"])
    client = visitor(django_capture_on_commit_callbacks)
    app_id = client.post("/api/visitor/applications", {"intake": intake.pk}).data["public_id"]
    pdf = SimpleUploadedFile("photo.pdf", b"%PDF-1.4\n%\n", content_type="application/pdf")
    refused = client.post(
        f"/api/visitor/applications/{app_id}/documents",
        {"doc_type": "photo", "file": pdf},
        format="multipart",
    )
    assert refused.status_code == 400
    rules = services._upload_rules(Application.objects.get(public_id=app_id), "photo")
    assert rules == {"allowed": {"png"}, "max_mb": 10}


def test_a_submit_key_belongs_to_one_application(
    intake,  # noqa: F811
    ba_program,
    django_capture_on_commit_callbacks,
):
    """R21: the same Idempotency-Key on a second application of the same visitor returned the
    first application's response."""
    from admissions.models import ProgramIntake

    other_intake = ProgramIntake.objects.create(
        cycle=intake.cycle, program=ba_program, required_documents=intake.required_documents
    )
    client = visitor(django_capture_on_commit_callbacks)
    first, second = (
        client.post("/api/visitor/applications", {"intake": i.pk}).data["public_id"]
        for i in (intake, other_intake)
    )
    answers = {"school": "مدرسة", "percentage": 80, "track": "علمي"}
    for app in (first, second):
        client.patch(f"/api/visitor/applications/{app}", {"answers": answers}, format="json")
    _complete(client, first)
    _complete(client, second)
    with django_capture_on_commit_callbacks(execute=True):
        one = client.post(f"/api/visitor/applications/{first}/submit", HTTP_IDEMPOTENCY_KEY="k1")
        again = client.post(f"/api/visitor/applications/{first}/submit", HTTP_IDEMPOTENCY_KEY="k1")
        other = client.post(f"/api/visitor/applications/{second}/submit", HTTP_IDEMPOTENCY_KEY="k1")
    assert one.data == again.data
    assert other.status_code == 200 and other.data["public_id"] == second
    assert Application.objects.get(public_id=second).status == "submitted"
