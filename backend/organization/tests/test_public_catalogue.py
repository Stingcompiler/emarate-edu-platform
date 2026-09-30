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
    # Never a sum of the courses entered so far: only the total the college states.
    assert program.data["credit_hours"] is None and program.data["intake"] is None
    it_program.total_credit_hours = 132
    it_program.save()
    assert anonymous.get(f"/api/public/programs/{it_program.code}").data["credit_hours"] == 132
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
    # The official "about" page already exists as a system draft (content/official.py).
    Page.objects.filter(slug="about").update(status="published")
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


def test_the_system_admin_sets_a_programmes_total_hours(api, it_program, make_user):
    """Owner decision 2026-09-28: the total is a field the college fills in (1–300 or blank)."""
    admin = api(make_user(Role.SYSTEM_ADMIN))
    url = f"/api/v1/programs/{it_program.pk}"
    assert (
        admin.patch(url, {"total_credit_hours": 132}, format="json").data["total_credit_hours"]
        == 132
    )
    assert admin.patch(url, {"total_credit_hours": 0}, format="json").status_code == 400
    assert admin.patch(url, {"total_credit_hours": 301}, format="json").status_code == 400
    assert admin.patch(url, {"total_credit_hours": None}, format="json").status_code == 200
    assert api().get(f"/api/public/programs/{it_program.code}").data["credit_hours"] is None


def test_programme_fees_outcomes_and_careers(api, it_program, it_dept, make_user):
    """Landing review 2026-10 (PR 6b): the facts an applicant weighs, set by the system admin."""
    admin = api(make_user(Role.SYSTEM_ADMIN))
    url = f"/api/v1/programs/{it_program.pk}"
    public = f"/api/public/programs/{it_program.code}"
    blank = api().get(public).data
    assert blank["fee_sdg"] is None and blank["fee_usd"] is None
    assert blank["outcomes_ar"] == [] and blank["careers_ar"] == []

    saved = admin.patch(
        url,
        {
            "annual_fee_sdg": 1_500_000,
            "annual_fee_usd": 1200,
            "outcomes_ar": "- يصمم الشبكات\n\n2. يدير قواعد البيانات\n• 3.5 مثال رقمي يبقى",
            "careers_ar": "مهندس شبكات\nمحلل نظم\n",
        },
        format="json",
    )
    assert saved.status_code == 200, saved.data
    data = api().get(public).data
    assert (data["fee_sdg"], data["fee_usd"]) == (1_500_000, 1200)
    assert data["outcomes_ar"] == ["يصمم الشبكات", "يدير قواعد البيانات", "3.5 مثال رقمي يبقى"]
    assert data["careers_ar"] == ["مهندس شبكات", "محلل نظم"]
    listed = next(p for p in api().get("/api/public/programs").data if p["code"] == it_program.code)
    assert listed["fee_sdg"] == 1_500_000

    assert admin.patch(url, {"annual_fee_sdg": 0}, format="json").status_code == 400
    assert admin.patch(url, {"annual_fee_usd": -5}, format="json").status_code == 400
    # Structure stays the system admin's: a department manager can't set fees.
    manager = api(make_user(Role.DEPARTMENT_MANAGER, department=it_dept))
    assert manager.patch(url, {"annual_fee_sdg": 1}, format="json").status_code == 403
