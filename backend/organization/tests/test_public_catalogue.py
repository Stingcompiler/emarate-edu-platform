from datetime import timedelta

from django.utils import timezone

from academic.models import Course, DepartmentMembership
from accounts.rbac import Role
from content.models import Page


def test_departments_programs_and_plan(
    api, it_dept, it_program, ba_dept, make_user, make_student, term
):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept, full_name_ar="د. مدير")
    teacher = make_user(Role.TEACHER)
    DepartmentMembership.objects.create(department=it_dept, user=teacher, kind="teacher")
    make_student(it_program, "26-IT-0500")
    Course.objects.create(
        department=it_dept, program=it_program, code="IT301", name_ar="نظم", default_level=3
    )
    it_program.description_ar = "برنامج تطبيقي"
    it_program.save()
    anonymous = api()
    departments = anonymous.get("/api/public/departments")
    assert departments.status_code == 200
    it = next(d for d in departments.data if d["code"] == it_dept.code)
    assert it["manager"] == manager.full_name_ar
    assert (it["teachers"], it["students"]) == (1, 1)
    assert [p["code"] for p in it["programs"]] == [it_program.code]
    one = anonymous.get(f"/api/public/departments/{it_dept.code}")
    assert one.status_code == 200 and one.data["name_ar"] == it_dept.name_ar
    assert anonymous.get("/api/public/departments/NOPE").status_code == 404
    program = anonymous.get(f"/api/public/programs/{it_program.code}")
    assert program.status_code == 200
    assert program.data["description_ar"] == "برنامج تطبيقي"
    level3 = next(level for level in program.data["plan"] if level["level"] == 3)
    assert level3["courses"][0]["code"] == "IT301"
    assert program.data["credit_hours"] >= 3 and program.data["intake"] is None
    # No personal data: names of students never appear.
    assert "26-IT-0500" not in str(departments.data)
    stats = anonymous.get("/api/public/stats").data
    assert stats["students"] == 1 and stats["teachers"] == 1 and stats["departments"] >= 2


def test_program_intake_state_and_seats(api, it_program, term):
    from admissions.models import AdmissionCycle, Application, ProgramIntake
    from contacts.models import Contact

    now = timezone.now()
    cycle = AdmissionCycle.objects.create(
        academic_year=term.academic_year,
        name="قبول",
        opens_at=now - timedelta(days=1),
        closes_at=now + timedelta(days=9),
    )
    intake = ProgramIntake.objects.create(
        cycle=cycle,
        program=it_program,
        capacity=10,
        requirements_ar="الشهادة الثانوية",
        required_documents=[{"key": "certificate", "label": "الشهادة", "required": True}],
    )
    for n, status in enumerate(["submitted", "draft", "rejected", "accepted"]):
        Application.objects.create(
            reference_no=f"APP-2026-10000{n}",
            contact=Contact.objects.create(name="م", email=f"s{n}@x.test"),
            intake=intake,
            status=status,
        )
    data = api().get(f"/api/public/programs/{it_program.code}").data
    assert data["intake"]["accepting"] is True and data["intake"]["seats_left"] == 8
    # The admissions page shows the window: when the cycle opened and when it closes.
    assert data["intake"]["opens_at"].startswith(cycle.opens_at.date().isoformat())
    assert data["requirements_ar"] == "الشهادة الثانوية"
    assert data["required_documents"][0]["label"] == "الشهادة"
    listed = api().get("/api/public/programs").data
    assert next(p for p in listed if p["code"] == it_program.code)["intake"]["id"] == intake.id


def test_pages_list_only_published(api, make_user):
    author = make_user(Role.SITE_MANAGER)
    Page.objects.create(slug="about", title_ar="عن الكلية", status="published", author=author)
    Page.objects.create(slug="draft", title_ar="مسودة", author=author)
    Page.objects.create(
        author=author,
        slug="later",
        title_ar="لاحقًا",
        status="published",
        publish_at=timezone.now() + timedelta(days=1),
    )
    assert [p["slug"] for p in api().get("/api/public/pages").data] == ["about"]


def test_calendar_lists_this_years_terms_and_the_admission_window(api, term):
    from admissions.models import AdmissionCycle

    now = timezone.now()
    AdmissionCycle.objects.create(
        academic_year=term.academic_year,
        name="قبول الخريف",
        opens_at=now - timedelta(days=3),
        closes_at=now + timedelta(days=30),
    )
    data = api().get("/api/public/calendar").data
    assert term.name_ar in [t["name_ar"] for t in data["terms"]]
    assert data["admission"]["name"] == "قبول الخريف"
