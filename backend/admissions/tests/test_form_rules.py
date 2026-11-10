"""Review 2026-10-25, group 4: the admission form. R19 (only a published, frozen template is
offered), R20 (answers checked by type, field rules for files), R21 (a submit key belongs to one
application)."""

from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.rbac import Role
from admissions import services
from admissions.models import Application, ApplicationFormTemplate
from admissions.tests.test_admissions import SCHEMA, _complete, intake, visitor  # noqa: F401
from audit.models import AuditLog
from conftest import pdf_upload
from students.models import StudentRecord

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
        "score": "يجب أن يكون رقمًا."
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
    assert "نمط التحقق غير صحيح" in problems and "الملفات المقبولة" in problems


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


# ─── The college's admission form (owner, 2026-11-01) ────────────────────────
COLLEGE = {
    "title": "استمارة طلب الالتحاق بالكلية",
    "steps": [
        {
            "title": "الاستمارة",
            "sections": [
                {
                    "title": "الطلب",
                    "fields": [
                        {
                            "key": "application_path",
                            "type": "select",
                            "label": "مسار التقديم",
                            "options": ["قبول جديد", "تجسير", "تحويل"],
                            "required": True,
                            "width": "half",
                        },
                        {
                            "key": "previous_university",
                            "type": "text",
                            "label": "الجامعة السابقة",
                            "required": True,
                            "show_if": {"key": "application_path", "in": ["تجسير", "تحويل"]},
                        },
                        {"key": "certificate_year", "type": "year", "label": "السنة"},
                        {
                            "key": "declaration",
                            "type": "consent",
                            "label": "أقر",
                            "required": True,
                        },
                    ],
                },
                {
                    "title": "القبول",
                    "fields": [
                        {
                            "key": "university_number",
                            "type": "text",
                            "label": "الرقم الجامعي",
                            "audience": "release",
                            "required": True,
                        },
                        {
                            "key": "tuition_fees",
                            "type": "money",
                            "label": "رسوم الدراسة",
                            "audience": "staff",
                            "required": True,
                        },
                        {
                            "key": "admitted_level",
                            "type": "select",
                            "label": "المستوى المقبول به",
                            "options": ["المستوى الأول", "المستوى الثاني"],
                            "audience": "release",
                        },
                    ],
                },
            ],
        }
    ],
}


def test_the_college_form_checks_audiences_conditions_and_new_types():
    assert services.check_schema(COLLEGE) == []
    ok = {"application_path": "قبول جديد", "certificate_year": 2024, "declaration": True}
    # Staff fields are never required of the applicant; a condition that is off asks nothing.
    assert services.validate_answers(COLLEGE, ok, set()) == {}
    errors = services.validate_answers(
        COLLEGE, {"application_path": "تجسير", "certificate_year": "2024"}, set()
    )
    assert errors == {
        "previous_university": "مطلوب.",
        "certificate_year": "يجب أن يكون سنة.",
        "declaration": "مطلوب.",
    }
    assert services.validate_answers(COLLEGE, {**ok, "declaration": False}, set()) == {
        "declaration": "مطلوب."
    }
    staff = services.validate_answers(COLLEGE, {"tuition_fees": "12.345"}, set(), who="staff")
    assert staff == {"tuition_fees": "يجب أن يكون مبلغًا.", "university_number": "مطلوب."}
    assert (
        services.validate_answers(
            COLLEGE, {"tuition_fees": "1500.50", "university_number": "26-IT-1"}, set(), who="staff"
        )
        == {}
    )
    public = services.public_schema(COLLEGE)
    assert [f["key"] for f in services.schema_fields(public)] == [
        "application_path",
        "previous_university",
        "certificate_year",
        "declaration",
    ]
    assert len(public["steps"][0]["sections"]) == 1  # a section of staff fields disappears


def test_a_condition_must_name_an_earlier_applicant_field():
    def schema(fields):
        return {"steps": [{"sections": [{"fields": fields}]}]}

    later = schema(
        [
            {"key": "a", "type": "text", "label": "أ", "show_if": {"key": "b", "equals": "x"}},
            {"key": "b", "type": "text", "label": "ب"},
        ]
    )
    assert any("حقل قبله" in p for p in services.check_schema(later))
    hidden = schema(
        [
            {"key": "s", "type": "text", "label": "س", "audience": "staff"},
            {"key": "a", "type": "text", "label": "أ", "show_if": {"key": "s", "equals": "x"}},
        ]
    )
    assert any("يعبئه المتقدم" in p for p in services.check_schema(hidden))
    odd = schema([{"key": "a", "type": "text", "label": "أ", "audience": "x", "width": "wide"}])
    assert len(services.check_schema(odd)) == 2


def test_the_applicant_never_sees_or_writes_staff_fields(
    api,
    intake,  # noqa: F811
    make_user,
    django_capture_on_commit_callbacks,
):
    head = make_user(Role.HEAD_REGISTRAR)
    ApplicationFormTemplate.objects.filter(name="default").delete()
    ApplicationFormTemplate.objects.create(
        name="default", status="published", schema=COLLEGE, created_by=head
    )
    client = visitor(django_capture_on_commit_callbacks)
    offered = client.get("/api/public/intakes?with_form=1")
    started = client.post("/api/visitor/applications", {"intake": intake.id}, format="json")
    assert started.status_code == 201, started.data
    url = f"/api/visitor/applications/{started.data['public_id']}"
    mine = client.get(url).data
    keys = [f["key"] for f in services.schema_fields(mine["form"]["schema"])]
    assert "university_number" not in keys and "tuition_fees" not in keys
    assert mine["academic_year"] == intake.cycle.academic_year.name
    assert offered.status_code == 200
    # Sent by hand, a staff field is refused and nothing is saved.
    sneaky = client.patch(
        url, {"answers": {"application_path": "تحويل", "tuition_fees": "0"}}, format="json"
    )
    assert sneaky.status_code == 400
    assert Application.objects.get().answers == {}
    fine = client.patch(
        url,
        {
            "answers": {
                "application_path": "قبول جديد",
                "certificate_year": 2020,
                "declaration": True,
            }
        },
        format="json",
    )
    assert fine.status_code == 200, fine.data


def test_staff_fill_the_college_fields_and_release_some(
    api,
    intake,  # noqa: F811
    make_user,
    it_dept,
    django_capture_on_commit_callbacks,
):
    """Owner, 2026-11-01: reviewers fill the college's fields; a release field reaches the
    applicant only when released and filled; registration takes the typed university number."""
    head = make_user(Role.HEAD_REGISTRAR)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    ApplicationFormTemplate.objects.filter(name="default").delete()
    ApplicationFormTemplate.objects.create(
        name="default", status="published", schema=COLLEGE, created_by=head
    )
    client = visitor(django_capture_on_commit_callbacks)
    app_id = client.post("/api/visitor/applications", {"intake": intake.id}).data["public_id"]
    mine = f"/api/visitor/applications/{app_id}"
    client.patch(
        mine,
        {
            "answers": {
                "application_path": "قبول جديد",
                "certificate_year": 2024,
                "declaration": True,
            }
        },
        format="json",
    )
    client.post(
        f"{mine}/documents",
        {"doc_type": "certificate", "file": pdf_upload("cert.pdf")},
        format="multipart",
    )
    with django_capture_on_commit_callbacks(execute=True):
        assert client.post(f"{mine}/submit").data["status"] == "submitted"

    url = f"/api/v1/applications/{app_id}"
    review = api(registrar)
    staff_url = f"{url}/staff-answers"
    assert [f["key"] for f in review.get(url).data["staff_fields"]] == [
        "university_number",
        "tuition_fees",
        "admitted_level",
    ]
    # Applicants cannot reach it; unknown keys, bad amounts and staff-only releases are refused.
    assert client.patch(staff_url, {"answers": {}}, format="json").status_code in (401, 403)
    assert review.patch(staff_url, {"answers": {"school": "x"}}, format="json").status_code == 400
    assert (
        review.patch(staff_url, {"answers": {"tuition_fees": "-5"}}, format="json").status_code
        == 400
    )
    assert (
        review.patch(
            staff_url, {"answers": {}, "released": ["tuition_fees"]}, format="json"
        ).status_code
        == 400
    )
    saved = review.patch(
        staff_url,
        {
            "answers": {
                "university_number": " 26-IT-7777 ",
                "tuition_fees": "1500.50",
                "admitted_level": "المستوى الثاني",
            },
            "released": ["admitted_level"],
        },
        format="json",
    )
    assert saved.status_code == 200, saved.data
    assert saved.data["staff_answers"]["university_number"] == "26-IT-7777"
    log = AuditLog.objects.get(action="admissions.staff_answers")
    assert "1500" not in str(log.new) and log.new["released"] == ["admitted_level"]

    # Released and filled: the level; never the number (not released) or the fees (staff).
    seen = client.get(mine).data["released"]
    assert seen == [
        {"key": "admitted_level", "label": "المستوى المقبول به", "value": "المستوى الثاني"}
    ]
    review.patch(staff_url, {"answers": {"admitted_level": ""}}, format="json")
    assert client.get(mine).data["released"] == []  # released but empty: never alone
    review.patch(staff_url, {"answers": {"admitted_level": "المستوى الثاني"}}, format="json")

    # Registration takes the typed number and the admitted level.
    for to in ("under_review", "eligible"):
        review.post(f"{url}/transition", {"to": to})
    api(head).post(f"{url}/transition", {"to": "accepted"})
    with django_capture_on_commit_callbacks(execute=True):
        registered = api(head).post(f"{url}/register")
    assert registered.status_code == 200, registered.data
    record = StudentRecord.objects.get(university_number="26-IT-7777")
    assert record.level == 2
    # Its own record keeps the number; on another application it is refused.
    assert (
        review.patch(
            staff_url, {"answers": {"university_number": "26-IT-7777"}}, format="json"
        ).status_code
        == 200
    )
    second = visitor(django_capture_on_commit_callbacks, email="other@example.test")
    other_id = second.post("/api/visitor/applications", {"intake": intake.id}).data["public_id"]
    Application.objects.filter(public_id=other_id).update(status="submitted")
    taken = review.patch(
        f"/api/v1/applications/{other_id}/staff-answers",
        {"answers": {"university_number": "26-IT-7777"}},
        format="json",
    )
    assert taken.status_code == 400 and "university_number" in taken.data["errors"]


def test_a_condition_needs_answers_and_an_unpublished_copy_falls_back(
    api,
    intake,  # noqa: F811
    make_user,
):
    empty = {
        "steps": [
            {
                "sections": [
                    {
                        "fields": [
                            {"key": "p", "type": "select", "label": "م", "options": ["أ"]},
                            {
                                "key": "q",
                                "type": "text",
                                "label": "ق",
                                "show_if": {"key": "p", "in": []},
                            },
                        ]
                    }
                ]
            }
        ]
    }
    assert any("اختر الإجابات التي تُظهر" in p for p in services.check_schema(empty))
    head = make_user(Role.HEAD_REGISTRAR)
    copy = ApplicationFormTemplate.objects.create(
        name="استمارة التجسير", schema=COLLEGE, created_by=head
    )
    url = f"/api/v1/intakes/{intake.id}"
    # Only a published form can be linked (review R19): a draft copy is refused.
    assert api(head).patch(url, {"form_template": copy.id}, format="json").status_code == 400
    copy.status = "published"
    copy.save()
    linked = api(head).patch(url, {"form_template": copy.id}, format="json")
    assert linked.status_code == 200, linked.data
    intake.refresh_from_db()
    assert services.template_for(intake).pk == copy.pk
    # Its newer published version replaces it for new applications.
    v2 = ApplicationFormTemplate.objects.create(
        name=copy.name, version=2, status="published", schema=COLLEGE, created_by=head
    )
    assert services.template_for(intake).pk == v2.pk
