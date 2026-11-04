"""QA probes — comprehensive review 2026-11, axis 1.1 (the college's admission form).

READ-AND-PROVE phase: every probe here EXPECTS THE FAULTY BEHAVIOUR. A passing probe means the
defect is reproduced on the current code; once a defect is fixed its probe fails and is turned
into a permanent regression test with the opposite assertion (plan §1 rule 1).
"""

import pytest
from django.db import DataError, connection
from django.db.models import ProtectedError

from accounts.rbac import Role
from admissions import services
from admissions.models import Application, ApplicationFormTemplate
from admissions.tests.test_admissions import intake, visitor  # noqa: F401
from audit.services import RequestMeta
from contacts.models import Contact
from students.models import StudentRecord


def _form(*fields):
    return {"steps": [{"title": "الاستمارة", "sections": [{"title": "ق", "fields": list(fields)}]}]}


PATH = {
    "key": "application_path",
    "type": "select",
    "label": "مسار التقديم",
    "options": ["قبول جديد", "تحويل"],
}
NUMBER = {
    "key": "university_number",
    "type": "text",
    "label": "الرقم الجامعي",
    "audience": "release",
}


def _default(head, schema):
    """Replace the fixture's published «default» form (nothing references it yet)."""
    ApplicationFormTemplate.objects.filter(name="default").delete()
    return ApplicationFormTemplate.objects.create(
        name="default", status="published", schema=schema, created_by=head
    )


def _application(intake, email="probe@example.test", status="submitted", answers=None):  # noqa: F811
    contact = Contact.objects.create(email=email, name="مريم الطيب")
    application = services.start(contact, intake)
    Application.objects.filter(pk=application.pk).update(status=status, answers=answers or {})
    application.refresh_from_db()
    return application


def _accept(application):
    Application.objects.filter(pk=application.pk).update(status=Application.Status.ACCEPTED)


# ─── 🟠 show_if on a college field switches off the server's type checks ─────────────────


def test_probe_conditional_staff_field_skips_type_validation(api, intake, make_user, it_dept):  # noqa: F811
    """A staff/release field may carry show_if on an applicant field (check_schema allows it and
    FormBuilder offers it). set_staff_answers evaluates the condition against the *staff*
    answers being sent, where the applicant's key never is, so the field counts as hidden and
    every type rule is skipped: a money field takes any text."""
    head = make_user(Role.HEAD_REGISTRAR)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    fees = {
        "key": "tuition_fees",
        "type": "money",
        "label": "رسوم الدراسة",
        "audience": "staff",
        "show_if": {"key": "application_path", "in": ["تحويل"]},
    }
    schema = _form(PATH, fees)
    assert services.check_schema(schema) == []
    _default(head, schema)
    application = _application(intake, answers={"application_path": "تحويل"})
    url = f"/api/v1/applications/{application.public_id}/staff-answers"

    # Same field without the condition: refused (the control).
    plain = _form(PATH, {k: v for k, v in fees.items() if k != "show_if"})
    assert services.validate_answers(plain, {"tuition_fees": "abc"}, set(), who="staff")

    saved = api(registrar).patch(url, {"answers": {"tuition_fees": "abc"}}, format="json")
    assert saved.status_code == 200  # DEFECT: should be 400 «Must be an amount.»
    application.refresh_from_db()
    assert application.staff_answers["tuition_fees"] == "abc"


# ─── 🟠 the typed university number drifts from the student record after registration ────


def test_probe_university_number_editable_after_registration_desyncs_record(
    api,
    intake,  # noqa: F811
    make_user,
    it_dept,
    django_capture_on_commit_callbacks,
):
    """After registration the record keeps the first number, but staff_answers accepts a new
    one (the uniqueness check excludes the application's own record) — the print page and,
    once released, the applicant's «متابعة طلبي» then show a number that is not theirs."""
    head = make_user(Role.HEAD_REGISTRAR)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    _default(head, _form(PATH, NUMBER))
    client = visitor(django_capture_on_commit_callbacks)
    app_id = client.post("/api/visitor/applications", {"intake": intake.id}).data["public_id"]
    Application.objects.filter(public_id=app_id).update(status="submitted")
    url = f"/api/v1/applications/{app_id}"
    first = api(registrar).patch(
        f"{url}/staff-answers",
        {"answers": {"university_number": "26-IT-7001"}, "released": ["university_number"]},
        format="json",
    )
    assert first.status_code == 200, first.data
    _accept(Application.objects.get(public_id=app_id))
    with django_capture_on_commit_callbacks(execute=True):
        assert api(head).post(f"{url}/register").status_code == 200
    record = StudentRecord.objects.get()
    assert record.university_number == "26-IT-7001"

    changed = api(registrar).patch(
        f"{url}/staff-answers", {"answers": {"university_number": "26-IT-9999"}}, format="json"
    )
    assert changed.status_code == 200  # DEFECT: should be refused once registered
    record.refresh_from_db()
    assert record.university_number == "26-IT-7001"
    seen = client.get(f"/api/visitor/applications/{app_id}").data["released"]
    assert seen == [{"key": "university_number", "label": "الرقم الجامعي", "value": "26-IT-9999"}]


# ─── 🟠 a typed university number longer than the record's column ───────────────────────


def test_probe_typed_university_number_has_no_length_limit(
    api,
    intake,  # noqa: F811
    make_user,
    it_dept,
    django_capture_on_commit_callbacks,
):
    """StudentRecord.university_number is max_length=30, but staff_answers stores any length.
    Registration then writes it straight into the record: SQLite keeps 40 characters, Postgres
    raises DataError (a 500) in register()."""
    head = make_user(Role.HEAD_REGISTRAR)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    _default(head, _form(PATH, NUMBER))
    application = _application(intake)
    url = f"/api/v1/applications/{application.public_id}"
    long_number = "26-IT-" + "9" * 34  # 40 characters
    saved = api(registrar).patch(
        f"{url}/staff-answers", {"answers": {"university_number": long_number}}, format="json"
    )
    assert saved.status_code == 200  # DEFECT: should be 400 (longer than the record allows)
    _accept(application)
    if connection.vendor == "postgresql":
        with pytest.raises(DataError):
            api(head).post(f"{url}/register")
    else:
        with django_capture_on_commit_callbacks(execute=True):
            assert api(head).post(f"{url}/register").status_code == 200
        assert len(StudentRecord.objects.get().university_number) == 40


# ─── 🟢 the same typed number on two applications ────────────────────────────────────────


def test_probe_same_typed_university_number_on_two_applications(
    api,
    intake,  # noqa: F811
    make_user,
    it_dept,
):
    """Uniqueness is checked only against StudentRecord, so two pending applications can hold
    (and release to two applicants) the same number; the clash surfaces only when the second
    one is registered."""
    head = make_user(Role.HEAD_REGISTRAR)
    registrar = make_user(Role.REGISTRAR, department=it_dept)
    _default(head, _form(PATH, NUMBER))
    one = _application(intake, email="one@example.test")
    two = _application(intake, email="two@example.test")
    for app in (one, two):
        saved = api(registrar).patch(
            f"/api/v1/applications/{app.public_id}/staff-answers",
            {"answers": {"university_number": "26-IT-5000"}, "released": ["university_number"]},
            format="json",
        )
        assert saved.status_code == 200
    assert {a.staff_answers["university_number"] for a in Application.objects.all()} == {
        "26-IT-5000"
    }
    assert all(services.released_answers(a) for a in Application.objects.all())


# ─── 🟢 deleting a template in use is a 500, not a 409 ────────────────────────────────────


def test_probe_deleting_a_used_template_is_a_server_error(
    api,
    intake,  # noqa: F811
    make_user,
):
    """Application.form_template and ProgramIntake.form_template are PROTECT with
    related_name="+", so _Audited.perform_destroy's `hasattr(instance, "applications")` guard
    never fires for a template: delete() raises ProtectedError, which the problem handler does
    not map — a 500 (AtomicWritesMiddleware rolls the audit row back, so the data is safe)."""
    head = make_user(Role.HEAD_REGISTRAR)
    template = ApplicationFormTemplate.objects.get(name="default")
    _application(intake)  # the application references the published template
    with pytest.raises(ProtectedError):  # DEFECT: should be 409 «in_use»
        api(head).delete(f"/api/v1/form-templates/{template.pk}")
    assert ApplicationFormTemplate.objects.filter(pk=template.pk).exists()


# ─── 🟢 a malformed schema crashes check_schema instead of being refused ──────────────────


@pytest.mark.parametrize(
    "schema",
    [
        {"steps": ["not a step"]},
        _form("not a field"),
        _form({"key": "b", "type": "text"}, {"key": "a", "type": "text", "show_if": "b"}),
        _form({"key": "a", "type": "text", "audience": ["staff"]}),
        _form({"key": "a", "type": ["text"]}),
        _form({"key": "a", "type": "file", "accept": [["pdf"]]}),
    ],
)
def test_probe_malformed_schema_raises_instead_of_listing_problems(schema):
    """check_schema assumes dicts and hashable values; anything else raises (a 500 from
    POST/PATCH /form-templates) instead of returning a problem (a 400)."""
    with pytest.raises((AttributeError, TypeError)):
        services.check_schema(schema)


def test_probe_malformed_show_if_is_a_500_on_the_api(api, make_user, db):
    head = make_user(Role.HEAD_REGISTRAR)
    schema = _form({"key": "b", "type": "text"}, {"key": "a", "type": "text", "show_if": "b"})
    body = {"name": "hs", "schema": schema}
    with pytest.raises(AttributeError):  # DEFECT: should be 400
        api(head).post("/api/v1/form-templates", body, format="json")


# ─── 🟢 show_if rules the spec does not allow but check_schema accepts ────────────────────


def test_probe_college_field_may_depend_on_a_staff_field():
    """docs/03 §5: a condition names an applicant field above it. check_schema enforces that
    only for applicant fields; a staff or release field may depend on a staff field."""
    staff = {"key": "fees_paid", "type": "boolean", "label": "دُفعت", "audience": "staff"}
    release = {
        "key": "receipt_no",
        "type": "text",
        "label": "رقم الإيصال",
        "audience": "release",
        "show_if": {"key": "fees_paid", "equals": True},
    }
    assert services.check_schema(_form(staff, release)) == []  # DEFECT per docs/03 §5


def test_probe_show_if_without_in_or_equals_is_accepted():
    """A condition with neither `in` nor `equals` passes check_schema; _visible then compares
    with None, so the field shows (and is required) only while the target is EMPTY."""
    choice = {"key": "track", "type": "select", "label": "المساق", "options": ["علمي"]}
    dependent = {
        "key": "school",
        "type": "text",
        "label": "المدرسة",
        "required": True,
        "show_if": {"key": "track"},
    }
    schema = _form(choice, dependent)
    assert services.check_schema(schema) == []  # DEFECT: should ask for the answers
    assert services.validate_answers(schema, {}, set()) == {"school": "Required."}
    assert services.validate_answers(schema, {"track": "علمي"}, set()) == {}


# ─── 🟢 university_number left as an applicant field ──────────────────────────────────────


def test_probe_university_number_can_be_an_applicant_field(
    api,
    intake,  # noqa: F811
    make_user,
    django_capture_on_commit_callbacks,
):
    """docs/03 §5: «الرقم الجامعي يدخله موظف التسجيل». check_schema accepts a university_number
    field the applicant fills (the default audience); the applicant types a number, and
    registration silently ignores it and generates another."""
    head = make_user(Role.HEAD_REGISTRAR)
    field = {"key": "university_number", "type": "text", "label": "الرقم الجامعي"}
    schema = _form(PATH, field)
    assert services.check_schema(schema) == []  # DEFECT: should demand staff/release
    _default(head, schema)
    client = visitor(django_capture_on_commit_callbacks)
    app_id = client.post("/api/visitor/applications", {"intake": intake.id}).data["public_id"]
    typed = client.patch(
        f"/api/visitor/applications/{app_id}",
        {"answers": {"university_number": "26-IT-4242"}},
        format="json",
    )
    assert typed.status_code == 200
    application = Application.objects.get(public_id=app_id)
    _accept(application)
    with django_capture_on_commit_callbacks(execute=True):
        services.register_applicant(RequestMeta(actor=head), application)
    assert StudentRecord.objects.get().university_number != "26-IT-4242"


# ─── 🟢 the applicant may store answers for keys the form does not have ───────────────────


def test_probe_applicant_answers_for_keys_outside_the_form_reach_the_record(
    api,
    intake,  # noqa: F811
    make_user,
    django_capture_on_commit_callbacks,
):
    """update() refuses keys of staff/release fields but accepts any key the form lacks.
    _registration_details reads full_name_en / gender / nationality / national_id from the
    answers whether or not the form asks for them, so they reach the StudentRecord."""
    head = make_user(Role.HEAD_REGISTRAR)
    client = visitor(django_capture_on_commit_callbacks)
    app_id = client.post("/api/visitor/applications", {"intake": intake.id}).data["public_id"]
    sent = client.patch(
        f"/api/visitor/applications/{app_id}",
        {"answers": {"full_name_en": "Injected Name", "nationality": "X", "anything": "y"}},
        format="json",
    )
    assert sent.status_code == 200  # DEFECT: the default form has none of these keys
    application = Application.objects.get(public_id=app_id)
    assert application.answers["anything"] == "y"
    _accept(application)
    with django_capture_on_commit_callbacks(execute=True):
        record = services.register_applicant(RequestMeta(actor=head), application)
    assert record.full_name_en == "Injected Name" and record.nationality == "X"
