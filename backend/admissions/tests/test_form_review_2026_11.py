"""The college's admission form after review 2026-11 §1.1 (probes in
docs/qa/evidence/review-2026-11/admissions): each test is the fixed side of one probe."""

# ruff: noqa: F811  (fixtures imported by name)

import pytest

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
    ApplicationFormTemplate.objects.filter(name="default").delete()
    return ApplicationFormTemplate.objects.create(
        name="default", status="published", schema=schema, created_by=head
    )


def _application(intake, email="probe@example.test", answers=None):
    application = services.start(Contact.objects.create(email=email, name="مريم"), intake)
    Application.objects.filter(pk=application.pk).update(status="submitted", answers=answers or {})
    application.refresh_from_db()
    return application


def _staff(api, user, application, answers, released=None):
    body = {"answers": answers} | ({"released": released} if released is not None else {})
    return api(user).patch(
        f"/api/v1/applications/{application.public_id}/staff-answers", body, format="json"
    )


def test_a_conditional_college_field_is_still_checked(api, intake, make_user, it_dept):
    head, registrar = make_user(Role.HEAD_REGISTRAR), make_user(Role.REGISTRAR, department=it_dept)
    fees = {
        "key": "tuition_fees",
        "type": "money",
        "label": "رسوم الدراسة",
        "audience": "staff",
        "show_if": {"key": "application_path", "in": ["تحويل"]},
    }
    _default(head, _form(PATH, fees))
    application = _application(intake, answers={"application_path": "تحويل"})
    assert _staff(api, registrar, application, {"tuition_fees": "abc"}).status_code == 400
    assert _staff(api, registrar, application, {"tuition_fees": "1500"}).status_code == 200


def test_the_university_number_is_bounded_unique_and_frozen_after_registration(
    api, intake, make_user, it_dept, django_capture_on_commit_callbacks
):
    head, registrar = make_user(Role.HEAD_REGISTRAR), make_user(Role.REGISTRAR, department=it_dept)
    _default(head, _form(PATH, NUMBER))
    one = _application(intake, email="one@example.test")
    two = _application(intake, email="two@example.test")
    too_long = "26-IT-" + "9" * 34
    assert _staff(api, registrar, one, {"university_number": too_long}).status_code == 400
    assert _staff(api, registrar, one, {"university_number": "26-IT-5000"}).status_code == 200
    assert _staff(api, registrar, two, {"university_number": "26-IT-5000"}).status_code == 400
    Application.objects.filter(pk=one.pk).update(status=Application.Status.ACCEPTED)
    with django_capture_on_commit_callbacks(execute=True):
        assert api(head).post(f"/api/v1/applications/{one.public_id}/register").status_code == 200
    one.refresh_from_db()
    changed = _staff(api, registrar, one, {"university_number": "26-IT-9999"})
    assert changed.status_code == 409 and changed.data["code"] == "registered"
    same = _staff(api, registrar, one, {"university_number": "26-IT-5000"})
    assert same.status_code == 200
    assert StudentRecord.objects.get().university_number == "26-IT-5000"


def test_a_used_template_is_not_deleted(api, intake, make_user):
    head = make_user(Role.HEAD_REGISTRAR)
    template = ApplicationFormTemplate.objects.get(name="default")
    _application(intake)
    response = api(head).delete(f"/api/v1/form-templates/{template.pk}")
    assert response.status_code == 409 and response.data["code"] == "in_use"


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
def test_a_malformed_schema_is_listed_not_raised(schema):
    assert services.check_schema(schema)


def test_a_malformed_show_if_is_a_400(api, make_user, db):
    schema = _form({"key": "b", "type": "text"}, {"key": "a", "type": "text", "show_if": "b"})
    response = api(make_user(Role.HEAD_REGISTRAR)).post(
        "/api/v1/form-templates", {"name": "hs", "schema": schema}, format="json"
    )
    assert response.status_code == 400


def test_conditions_name_an_applicant_answer_and_state_it():
    staff = {"key": "fees_paid", "type": "boolean", "label": "دُفعت", "audience": "staff"}
    release = {
        "key": "receipt_no",
        "type": "text",
        "label": "رقم الإيصال",
        "audience": "release",
        "show_if": {"key": "fees_paid", "equals": True},
    }
    assert services.check_schema(_form(staff, release))
    choice = {"key": "track", "type": "select", "label": "المساق", "options": ["علمي"]}
    open_ended = {"key": "school", "type": "text", "label": "المدرسة", "show_if": {"key": "track"}}
    assert services.check_schema(_form(choice, open_ended))
    stated = {**open_ended, "show_if": {"key": "track", "in": ["علمي"]}}
    assert services.check_schema(_form(choice, stated)) == []


def test_the_university_number_is_never_an_applicant_field():
    field = {"key": "university_number", "type": "text", "label": "الرقم الجامعي"}
    assert services.check_schema(_form(PATH, field))
    assert services.check_schema(_form(PATH, NUMBER)) == []


def test_answers_outside_the_form_are_not_kept_nor_reach_the_record(
    api, intake, make_user, django_capture_on_commit_callbacks
):
    head = make_user(Role.HEAD_REGISTRAR)
    client = visitor(django_capture_on_commit_callbacks)
    app_id = client.post("/api/visitor/applications", {"intake": intake.id}).data["public_id"]
    sent = client.patch(
        f"/api/visitor/applications/{app_id}",
        {"answers": {"full_name_en": "Injected Name", "nationality": "X", "anything": "y"}},
        format="json",
    )
    assert sent.status_code == 200
    application = Application.objects.get(public_id=app_id)
    assert "anything" not in application.answers
    Application.objects.filter(pk=application.pk).update(status=Application.Status.ACCEPTED)
    application.refresh_from_db()
    with django_capture_on_commit_callbacks(execute=True):
        record = services.register_applicant(RequestMeta(actor=head), application)
    assert record.full_name_en != "Injected Name" and record.nationality != "X"
