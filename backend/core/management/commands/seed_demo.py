"""Fictional demo data for local development (never production).

    DEMO_PASSWORD='...' uv run python manage.py seed_demo

Idempotent: running it again only adds what is missing. Names are invented;
the structure mirrors docs/prototype (4 departments, 11 programs).
"""

from __future__ import annotations

import os
from datetime import date

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academic import services as academic_services
from academic.models import AcademicYear, Course, CourseOffering, DepartmentMembership, Term
from accounts.models import RoleAssignment, User
from accounts.rbac import DEPARTMENT_SCOPED_ROLES, Role
from audit.services import RequestMeta
from learning.models import Lecture
from organization.models import College, Department, Program, SystemSettings
from students.models import StudentRecord

DOMAIN = "demo.ecst.test"

DEPARTMENTS = [
    # code, Arabic, English, programs: (code, Arabic, English, degree, levels, terms)
    (
        "IT",
        "تقنية المعلومات",
        "Information Technology",
        [
            ("BIT", "بكالوريوس تقنية المعلومات", "BSc Information Technology", "bachelor", 4, 8),
            ("BIS", "بكالوريوس نظم المعلومات", "BSc Information Systems", "bachelor", 4, 8),
            ("DIT", "دبلوم تقنية المعلومات", "Diploma in Information Technology", "diploma", 2, 4),
        ],
    ),
    (
        "CS",
        "علوم الحاسوب",
        "Computer Science",
        [
            ("BCS", "بكالوريوس علوم الحاسوب", "BSc Computer Science", "bachelor", 4, 8),
            ("BAI", "بكالوريوس الذكاء الاصطناعي", "BSc Artificial Intelligence", "bachelor", 4, 8),
        ],
    ),
    (
        "ENG",
        "الهندسة",
        "Engineering",
        [
            ("BCE", "بكالوريوس الهندسة المدنية", "BSc Civil Engineering", "bachelor", 5, 10),
            (
                "BEE",
                "بكالوريوس الهندسة الكهربائية",
                "BSc Electrical Engineering",
                "bachelor",
                5,
                10,
            ),
            (
                "BME",
                "بكالوريوس الهندسة الميكانيكية",
                "BSc Mechanical Engineering",
                "bachelor",
                5,
                10,
            ),
        ],
    ),
    (
        "BA",
        "إدارة الأعمال",
        "Business Administration",
        [
            ("BBA", "بكالوريوس إدارة الأعمال", "BSc Business Administration", "bachelor", 4, 8),
            ("DACC", "دبلوم المحاسبة", "Diploma in Accounting", "diploma", 2, 4),
            ("DBA", "دبلوم إدارة الأعمال", "Diploma in Business Administration", "diploma", 2, 4),
        ],
    ),
]

# (department, program or None = shared, code, Arabic, English, level, term order)
COURSES = [
    ("IT", None, "IT100", "مهارات الحاسوب", "Computer Skills", 1, 1),
    ("IT", None, "MATH101", "الرياضيات المتقطعة", "Discrete Mathematics", 1, 1),
    ("IT", None, "ENG101", "اللغة الإنجليزية 1", "English I", 1, 1),
    ("IT", "BIT", "IT101", "مقدمة في البرمجة", "Introduction to Programming", 1, 1),
    ("IT", "BIT", "IT102", "أساسيات تقنية المعلومات", "IT Fundamentals", 1, 1),
    ("IT", "BIT", "IT103", "البرمجة الكائنية", "Object-Oriented Programming", 1, 2),
    ("IT", "BIT", "IT201", "هياكل البيانات", "Data Structures", 2, 1),
    ("IT", "BIT", "IT202", "قواعد البيانات", "Databases", 2, 1),
    ("IT", "BIT", "IT203", "شبكات الحاسوب", "Computer Networks", 2, 1),
    ("IT", "BIS", "IS101", "مقدمة في نظم المعلومات", "Introduction to Information Systems", 1, 1),
    ("IT", "BIS", "IS201", "تحليل النظم", "Systems Analysis", 2, 1),
    ("IT", "DIT", "DIT101", "صيانة الحاسوب", "Computer Maintenance", 1, 1),
    ("CS", None, "CS100", "التفكير الحسابي", "Computational Thinking", 1, 1),
    ("CS", "BCS", "CS101", "الخوارزميات 1", "Algorithms I", 1, 1),
    ("CS", "BAI", "AI101", "مقدمة في الذكاء الاصطناعي", "Introduction to AI", 1, 1),
    ("ENG", None, "EN100", "الرسم الهندسي", "Engineering Drawing", 1, 1),
    ("ENG", None, "EN101", "الفيزياء الهندسية", "Engineering Physics", 1, 1),
    ("ENG", "BCE", "CE101", "مقاومة المواد", "Strength of Materials", 1, 1),
    ("ENG", "BEE", "EE101", "الدوائر الكهربائية", "Electric Circuits", 1, 1),
    ("ENG", "BME", "ME101", "الميكانيكا الهندسية", "Engineering Mechanics", 1, 1),
    ("BA", None, "BA100", "مبادئ الإدارة", "Principles of Management", 1, 1),
    ("BA", None, "BA101", "مبادئ المحاسبة", "Principles of Accounting", 1, 1),
    ("BA", "BBA", "BA201", "السلوك التنظيمي", "Organizational Behaviour", 2, 1),
]

# One account per role; department roles belong to IT (the prototype's department).
STAFF = [
    (Role.SYSTEM_ADMIN, "admin", "م. عثمان الطيب"),
    (Role.HEAD_REGISTRAR, "head.registrar", "أ. سعاد إبراهيم"),
    (Role.REGISTRAR, "registrar", "أ. نزار عوض"),
    (Role.RESULTS_OFFICER, "results", "أ. منى الفاضل"),
    (Role.ACADEMIC_AFFAIRS, "academic", "د. عبد الله الحسن"),
    (Role.STUDENT_AFFAIRS, "student.affairs", "أ. إخلاص بابكر"),
    (Role.DEPARTMENT_MANAGER, "dept.manager", "د. مصطفى الأمين"),
    (Role.DEPARTMENT_SUPERVISOR, "dept.supervisor", "د. هالة عبد الرحمن"),
    (Role.TEACHER, "teacher", "د. سلمى الخضر"),
    (Role.TA, "ta", "م. ياسر عبد الباقي"),
    (Role.HR, "hr", "أ. رشا المكي"),
    (Role.SITE_MANAGER, "site", "أ. طارق حمدان"),
    (Role.EVENTS_MANAGER, "events", "أ. آمنة الصادق"),
]

FIRST = ["أحمد", "محمد", "سارة", "مريم", "عمر", "فاطمة", "خالد", "آمنة", "يوسف", "هبة"]
FATHER = ["عبد الله", "الطيب", "حسن", "إبراهيم", "عثمان", "بشير", "الأمين", "صالح"]
FAMILY = ["علي", "النور", "أحمد", "الفكي", "موسى"]
FIRST_EN = [
    "Ahmed",
    "Mohamed",
    "Sara",
    "Mariam",
    "Omar",
    "Fatima",
    "Khalid",
    "Amna",
    "Yousif",
    "Heba",
]
FATHER_EN = ["Abdalla", "Altayeb", "Hassan", "Ibrahim", "Osman", "Bashir", "Alamin", "Salih"]
FAMILY_EN = ["Ali", "Alnoor", "Ahmed", "Alfaki", "Musa"]
FEMALE = {"سارة", "مريم", "فاطمة", "آمنة", "هبة"}

# (program, level, how many)
COHORTS = [
    ("BIT", 1, 12),
    ("BIT", 2, 8),
    ("BIS", 1, 5),
    ("DIT", 1, 3),
    ("BCS", 1, 4),
    ("BAI", 1, 2),
    ("BCE", 1, 2),
    ("BEE", 1, 1),
    ("BBA", 1, 2),
    ("BBA", 2, 1),
]


class Command(BaseCommand):
    help = "Load fictional demo data (DEBUG only; password from DEMO_PASSWORD)."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DEBUG on (development).")
        password = os.environ.get("DEMO_PASSWORD", "")
        if len(password) < 8:
            raise CommandError("Set DEMO_PASSWORD (8+ characters) for the demo accounts.")
        with transaction.atomic():
            counts = self._seed(password)
        for name, value in counts.items():
            self.stdout.write(f"{name}: {value}")
        self.stdout.write(self.style.SUCCESS(f"Demo data ready. Sign in as admin@{DOMAIN}."))

    def _seed(self, password: str) -> dict[str, int]:
        SystemSettings.load()
        college, _ = College.objects.get_or_create(
            code="ECST",
            defaults={
                "name_ar": "كلية الإمارات للعلوم والتقنية",
                "name_en": "Emirates College of Science and Technology",
            },
        )
        departments: dict[str, Department] = {}
        programs: dict[str, Program] = {}
        for code, name_ar, name_en, program_rows in DEPARTMENTS:
            department, _ = Department.objects.get_or_create(
                college=college, code=code, defaults={"name_ar": name_ar, "name_en": name_en}
            )
            departments[code] = department
            for p_code, p_ar, p_en, degree, levels, terms in program_rows:
                programs[p_code], _ = Program.objects.get_or_create(
                    code=p_code,
                    defaults={
                        "department": department,
                        "name_ar": p_ar,
                        "name_en": p_en,
                        "degree": degree,
                        "levels_count": levels,
                        "duration_terms": terms,
                    },
                )

        year, _ = AcademicYear.objects.get_or_create(
            name="2026/2027",
            defaults={"starts_on": date(2026, 9, 1), "ends_on": date(2027, 7, 31)},
        )
        if not AcademicYear.objects.filter(is_current=True).exists():
            AcademicYear.objects.filter(pk=year.pk).update(is_current=True)
        autumn, _ = Term.objects.get_or_create(
            academic_year=year,
            order=1,
            defaults={
                "name_ar": "خريف 2026",
                "name_en": "Autumn 2026",
                "starts_on": date(2026, 9, 1),
                "ends_on": date(2027, 1, 31),
                "status": Term.Status.ACTIVE,
            },
        )
        Term.objects.get_or_create(
            academic_year=year,
            order=2,
            defaults={
                "name_ar": "ربيع 2027",
                "name_en": "Spring 2027",
                "starts_on": date(2027, 2, 15),
                "ends_on": date(2027, 7, 15),
            },
        )
        if not Term.objects.filter(is_current=True).exists():
            Term.objects.filter(pk=autumn.pk).update(is_current=True)

        users: dict[Role, User] = {}
        for role, handle, name in STAFF:
            users[role] = self._user(f"{handle}@{DOMAIN}", name, password, role, departments["IT"])
        admin = users[Role.SYSTEM_ADMIN]
        meta = RequestMeta(actor=admin, user_agent="seed_demo")

        for role in (Role.TEACHER, Role.TA):
            DepartmentMembership.objects.get_or_create(
                department=departments["IT"],
                user=users[role],
                defaults={"kind": role.value, "added_by": admin},
            )

        for dept, program, code, name_ar, name_en, level, term_order in COURSES:
            course, _ = Course.objects.get_or_create(
                department=departments[dept],
                code=code,
                defaults={
                    "program": programs[program] if program else None,
                    "name_ar": name_ar,
                    "name_en": name_en,
                    "default_level": level,
                    "default_term_order": term_order,
                },
            )
            if term_order == autumn.order:
                offering, _ = CourseOffering.objects.get_or_create(course=course, term=autumn)
                if dept == "IT" and program in (None, "BIT"):
                    offering.instructors.get_or_create(
                        user=users[Role.TEACHER], defaults={"role": "teacher"}
                    )
                    if code in ("IT101", "IT201"):
                        offering.instructors.get_or_create(
                            user=users[Role.TA], defaults={"role": "ta"}
                        )

        n = 0
        for program_code, level, count in COHORTS:
            program = programs[program_code]
            for _ in range(count):
                n += 1
                first = FIRST[n % len(FIRST)]
                number = f"26-{program.department.code}-{n:04d}"
                StudentRecord.objects.get_or_create(
                    university_number=number,
                    defaults={
                        "program": program,
                        "level": level,
                        "full_name_ar": f"{first} {FATHER[n % len(FATHER)]} "
                        f"{FAMILY[n % len(FAMILY)]}",
                        "full_name_en": f"{FIRST_EN[n % len(FIRST)]} "
                        f"{FATHER_EN[n % len(FATHER)]} {FAMILY_EN[n % len(FAMILY)]}",
                        "gender": "female" if first in FEMALE else "male",
                        # Half the file carries an official email (instant activation).
                        "email": f"s{n:04d}@students.{DOMAIN}" if n % 2 else "",
                    },
                )
        for program_code, level in {(p, lv) for p, lv, _ in COHORTS}:
            academic_services.bulk_enroll(meta, autumn, programs[program_code], level)

        self._learning(users, autumn)

        # A ready-made student account on the first IT record.
        record = StudentRecord.objects.get(university_number="26-IT-0001")
        if record.user_id is None:
            record.user = self._user(
                f"student@{DOMAIN}", record.full_name_ar, password, Role.STUDENT, None
            )
            record.save(update_fields=["user", "updated_at"])

        self._phase4(users, autumn)
        self._exam(users, autumn)
        self._phase6(users, autumn)
        self._phase7(users, meta, year)
        self._phase8(users, autumn)
        return {
            "departments": Department.objects.count(),
            "programs": Program.objects.count(),
            "courses": Course.objects.count(),
            "offerings": CourseOffering.objects.filter(term=autumn).count(),
            "students": StudentRecord.objects.count(),
            "users": User.objects.count(),
            "lectures": Lecture.objects.count(),
        }

    def _learning(self, users, term) -> None:
        """Two lectures and an assignment for each course the demo teacher teaches."""
        from datetime import timedelta

        from django.utils import timezone

        from learning.models import Assignment, Lecture, LectureResource

        teacher = users[Role.TEACHER]
        for offering in CourseOffering.objects.filter(term=term, instructors__user=teacher):
            code = offering.course.code
            for order, (title, topic) in enumerate(
                [("المحاضرة الأولى: مدخل", "intro"), ("المحاضرة الثانية: المفاهيم", "concepts")],
                start=1,
            ):
                lecture, created = Lecture.objects.get_or_create(
                    offering=offering,
                    order=order,
                    defaults={
                        "title_ar": title,
                        "is_published": True,
                        "published_at": timezone.now(),
                        "created_by": teacher,
                    },
                )
                if created:
                    LectureResource.objects.create(
                        lecture=lecture,
                        kind=LectureResource.Kind.LINK,
                        title="مرجع المحاضرة",
                        url=f"https://example.org/{code.lower()}/{topic}",
                    )
            Assignment.objects.get_or_create(
                offering=offering,
                title=f"الواجب الأول — {offering.course.name_ar}",
                defaults={
                    "description": "حل التمارين في نهاية المحاضرة الأولى.",
                    "due_at": timezone.now() + timedelta(days=7),
                    "late_policy": Assignment.LatePolicy.PENALTY,
                    "late_penalty_percent": 10,
                    "late_until": timezone.now() + timedelta(days=9),
                    "submission_types": ["file", "text"],
                    "allowed_extensions": ["pdf", "docx"],
                    "status": Assignment.Status.PUBLISHED,
                    "created_by": teacher,
                },
            )

    def _phase4(self, users, term) -> None:
        """Published results for the IT level-1 cohort, regulations, a case and a report."""
        from decimal import Decimal

        from django.core.files.base import ContentFile
        from django.utils import timezone

        from academic.models import Enrollment
        from results.models import AcademicResult, GradingScale, ResultImportBatch
        from student_affairs.models import (
            MisconductReport,
            Regulation,
            StudentCase,
            StudentCaseEvent,
        )

        officer = users[Role.RESULTS_OFFICER]
        if not ResultImportBatch.objects.exists():
            batch = ResultImportBatch.objects.create(
                file=ContentFile(b"demo", name="demo-results.csv"),
                file_name="نتائج تقنية المعلومات — المستوى الأول.csv",
                scope=ResultImportBatch.Scope.DEPARTMENT,
                department=Department.objects.get(code="IT"),
                term=term,
                uploaded_by=officer,
                status=ResultImportBatch.Status.PUBLISHED,
                summary={"rows": 0, "create": 0, "error": 0},
                detected_columns=["university_number", "course_code", "score"],
                committed_at=timezone.now(),
                published_at=timezone.now(),
            )
            scores = [91, 84, 78, 88, 67, 73, 95, 58]
            enrollments = Enrollment.objects.filter(
                offering__term=term, student_record__program__code="BIT", student_record__level=1
            ).select_related("student_record", "offering__course")
            rows = []
            for n, enrollment in enumerate(enrollments):
                score = Decimal(scores[n % len(scores)])
                ranges = GradingScale.for_program(enrollment.student_record.program_id)
                letter, points = GradingScale.grade(ranges, score)
                rows.append(
                    AcademicResult(
                        student_record=enrollment.student_record,
                        offering=enrollment.offering,
                        term=term,
                        score=score,
                        letter=letter,
                        grade_points=points,
                        status="fail" if letter == "F" else "pass",
                        is_published=True,
                        published_at=timezone.now(),
                        published_by=officer,
                        import_batch=batch,
                    )
                )
            AcademicResult.objects.bulk_create(rows)
            batch.summary = {
                "rows": len(rows),
                "create": len(rows),
                "error": 0,
                "committed": len(rows),
            }
            batch.save(update_fields=["summary"])

        affairs = users[Role.STUDENT_AFFAIRS]
        Regulation.objects.get_or_create(
            title="لائحة الامتحانات 2026",
            defaults={
                "body": "1. الحضور: يدخل الطالب الاختبار خلال النافذة المحددة.\n"
                "2. النزاهة: الخروج المتكرر من شاشة الاختبار مخالفة تُحال إلى شؤون الطلاب.\n"
                "3. الأعطال: انقطاع الإنترنت لا يُبطل المحاولة.",
                "category": "exams",
                "version": "2026",
                "requires_acknowledgement": True,
                "is_public": True,
                "status": "published",
                "published_at": timezone.now(),
                "created_by": affairs,
            },
        )
        Regulation.objects.get_or_create(
            title="دليل الطالب الأكاديمي",
            defaults={
                "body": "الخطط الدراسية، الحضور، الانسحاب والإضافة.",
                "category": "academic",
                "version": "1.1",
                "is_public": True,
                "status": "published",
                "published_at": timezone.now(),
                "created_by": affairs,
            },
        )
        other = (
            StudentRecord.objects.filter(program__code="BIT", level=1)
            .exclude(university_number="26-IT-0001")
            .first()
        )
        if other and not StudentCase.objects.exists():
            case = StudentCase.objects.create(
                student_record=other,
                kind=StudentCase.Kind.ACADEMIC,
                title="إنذار أكاديمي — غياب متكرر",
                description="تجاوز الغياب 25% في مادتين.",
                opened_by=affairs,
            )
            StudentCaseEvent.objects.create(case=case, kind="opened", by=affairs)
            offering = CourseOffering.objects.filter(term=term, course__code="IT101").first()
            if offering:
                MisconductReport.objects.create(
                    offering=offering,
                    student_record=other,
                    reported_by=users[Role.TEACHER],
                    evidence="تطابق إجابات 9 أسئلة مع محاولة طالب آخر خلال دقيقة واحدة.",
                )

    def _exam(self, users, term) -> None:
        """An open week-long quiz in IT101 with one question of each type."""
        from datetime import timedelta

        from django.utils import timezone

        from exams.models import Choice, Exam, Question

        offering = CourseOffering.objects.filter(term=term, course__code="IT101").first()
        if offering is None or Exam.objects.filter(offering=offering).exists():
            return
        now = timezone.now()
        exam = Exam.objects.create(
            offering=offering,
            title="اختبار قصير 1 — أساسيات البرمجة",
            opens_at=now - timedelta(hours=1),
            closes_at=now + timedelta(days=7),
            duration_minutes=20,
            pass_marks=5,
            show_answers=True,
            status=Exam.Status.PUBLISHED,
            created_by=users[Role.TEACHER],
        )
        specs = [
            (
                "single",
                "ما ناتج تنفيذ الكود التالي؟\n```\nx = [3, 1, 4]\nprint(len(x))\n```",
                2,
                [("3", True), ("4", False), ("1", False), ("خطأ", False)],
                {},
            ),
            (
                "multiple",
                "اختر أنواع البيانات الأساسية في بايثون:",
                2,
                [("int", True), ("str", True), ("array", False), ("float", True)],
                {"partial": True},
            ),
            (
                "true_false",
                "المتغير في بايثون يحتاج تعريف نوعه قبل الاستخدام.",
                1,
                [],
                {"answer": False},
            ),
            (
                "fill_blank",
                "الدالة التي تطبع على الشاشة في بايثون هي ____",
                1,
                [],
                {"accepted": ["print"]},
            ),
            ("short_answer", "اشرح الفرق بين القائمة والصف (tuple) باختصار.", 4, [], {}),
        ]
        for order, (kind, text, marks, choices, config) in enumerate(specs, start=1):
            q = Question.objects.create(
                exam=exam, order=order, type=kind, text=text, marks=marks, config=config
            )
            Choice.objects.bulk_create(
                [
                    Choice(question=q, order=i, text=t, is_correct=c)
                    for i, (t, c) in enumerate(choices, start=1)
                ]
            )

    def _phase6(self, users, term) -> None:
        """A live session, announcements, a public page, an event and two inquiries."""
        from datetime import timedelta

        from django.utils import timezone

        from contacts.models import Contact
        from content.models import Announcement, Event, Page
        from inquiries.models import Inquiry, InquiryStatusHistory
        from live.models import LiveSession

        now = timezone.now()
        offering = CourseOffering.objects.filter(term=term, course__code="IT101").first()
        if offering and not LiveSession.objects.exists():
            session = LiveSession(
                scope="offering",
                offering=offering,
                title="مراجعة المحاضرة الثانية",
                provider="teams",
                starts_at=now + timedelta(minutes=5),
                ends_at=now + timedelta(hours=1),
                host=users[Role.TEACHER],
            )
            session.join_url = "https://teams.microsoft.com/l/meetup-join/demo"
            session.save()
        site = users[Role.SITE_MANAGER]
        if not Announcement.objects.exists():
            Announcement.objects.create(
                scope="college",
                audience="public",
                title="فتح باب القبول لخريف 2026",
                body=(
                    "<p>يبدأ استقبال طلبات الالتحاق بـ 11 برنامجًا في 4 أقسام"
                    " — التقديم إلكتروني بالكامل.</p>"
                ),
                status="published",
                publish_at=now,
                is_pinned=True,
                created_by=site,
            )
            if offering:
                Announcement.objects.create(
                    scope="offering",
                    scope_id=offering.pk,
                    audience="students",
                    title="تمديد موعد الواجب الأول",
                    body="<p>مُدِّد التسليم 48 ساعة. لا حاجة لطلب تمديد فردي.</p>",
                    status="published",
                    publish_at=now,
                    created_by=users[Role.TEACHER],
                )
        Page.objects.get_or_create(
            slug="about",
            defaults={
                "title_ar": "عن الكلية",
                "status": "published",
                "author": site,
                "blocks": [
                    {"type": "heading", "text": "رسالتنا"},
                    {"type": "paragraph", "text": "تعليم تقني تطبيقي يخدم سوق العمل."},
                ],
            },
        )
        # The footer links to it; the real text is the college's to write (demo only).
        Page.objects.get_or_create(
            slug="privacy",
            defaults={
                "title_ar": "سياسة الخصوصية",
                "title_en": "Privacy policy",
                "status": "published",
                "author": site,
                "blocks": [
                    {"type": "paragraph", "text": "نص تجريبي — تستبدله الكلية بسياستها المعتمدة."},
                    {"type": "heading", "text": "ما نجمعه"},
                    {
                        "type": "paragraph",
                        "text": "بيانات التقديم والتواصل التي تدخلها ومستنداتك، "
                        "لغرض القبول والتواصل معك فقط.",
                    },
                    {"type": "heading", "text": "من يطّلع عليها"},
                    {
                        "type": "paragraph",
                        "text": "مسجلو الأقسام المعنيون وحدهم، ولا تُشارك مع أي جهة خارج الكلية.",
                    },
                ],
            },
        )
        Event.objects.get_or_create(
            slug="orientation-2026",
            defaults={
                "title": "الأسبوع التعريفي للطلاب الجدد",
                "description": "<p>تعريف الطلاب الجدد بالأقسام والبوابة والخدمات.</p>",
                "starts_at": now - timedelta(days=20),
                "ends_at": now - timedelta(days=20) + timedelta(hours=4),
                "location": "القاعة الكبرى",
                "status": "published",
                "created_by": users[Role.EVENTS_MANAGER],
            },
        )
        Event.objects.get_or_create(
            slug="open-day",
            defaults={
                "title": "يوم التعريف بالكلية",
                "description": "<p>جولة في الأقسام والمعامل.</p>",
                "starts_at": now + timedelta(days=10),
                "ends_at": now + timedelta(days=10, hours=5),
                "location": "القاعة الكبرى",
                "status": "published",
                "created_by": users[Role.EVENTS_MANAGER],
            },
        )
        if not Inquiry.objects.exists():
            for n, (name, kind, dept, subject, message) in enumerate(
                [
                    (
                        "فاطمة محمد الأمين",
                        "admission",
                        Department.objects.get(code="IT"),
                        "معادلة شهادة",
                        "هل يمكن قبول شهادة الثانوية السعودية؟ وما المعادلة المطلوبة؟",
                    ),
                    (
                        "عبد الرحمن الطاهر",
                        "general",
                        None,
                        "مواعيد الدوام",
                        "ما مواعيد عمل الكلية في رمضان؟",
                    ),
                ],
                start=1,
            ):
                contact = Contact.objects.create(
                    name=name, email=f"visitor{n}@example.test", phone_e164=f"+24991234567{n}"
                )
                inquiry = Inquiry.objects.create(
                    reference_no=f"INQ-26-DEMO0{n}",
                    contact=contact,
                    type=kind,
                    department=dept,
                    subject=subject,
                    message=message,
                )
                InquiryStatusHistory.objects.create(inquiry=inquiry, to_status="new")

    def _phase7(self, users, meta, year) -> None:
        """An open admission cycle, a published form, one intake per program, three applications."""
        from datetime import timedelta

        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.utils import timezone

        from admissions import services as admissions
        from admissions.models import AdmissionCycle, ApplicationFormTemplate, ProgramIntake
        from contacts.models import Contact

        if AdmissionCycle.objects.exists():
            return
        now = timezone.now()
        cycle = AdmissionCycle.objects.create(
            academic_year=year,
            name="قبول 2026/2027",
            opens_at=now - timedelta(days=20),
            closes_at=now + timedelta(days=60),
        )
        template = ApplicationFormTemplate.objects.create(
            name="default",
            created_by=users[Role.HEAD_REGISTRAR],
            schema={
                "steps": [
                    {
                        "title": "البيانات",
                        "sections": [
                            {
                                "title": "المؤهل",
                                "fields": [
                                    {
                                        "key": "birth_date",
                                        "type": "date",
                                        "label": "تاريخ الميلاد",
                                        "required": True,
                                    },
                                    {
                                        "key": "certificate_type",
                                        "type": "select",
                                        "label": "نوع الشهادة",
                                        "required": True,
                                        "options": ["سودانية", "عربية", "أجنبية"],
                                    },
                                    {
                                        "key": "percentage",
                                        "type": "number",
                                        "label": "النسبة المئوية",
                                        "required": True,
                                        "min": 50,
                                        "max": 100,
                                    },
                                    {"key": "school", "type": "text", "label": "المدرسة"},
                                ],
                            }
                        ],
                    }
                ]
            },
        )
        admissions.publish_template(meta, template)
        documents = [
            {"key": "certificate", "label": "الشهادة الثانوية", "required": True},
            {"key": "id", "label": "الرقم الوطني أو الجواز", "required": True},
            {"key": "photo", "label": "صورة شخصية", "required": False},
        ]
        intakes = {
            program.code: ProgramIntake.objects.create(
                cycle=cycle,
                program=program,
                capacity=120,
                required_documents=documents,
                requirements_ar="الشهادة الثانوية بنسبة لا تقل عن 60٪.",
            )
            for program in Program.objects.all()
        }
        pdf = b"%PDF-1.4\n%demo\n"
        for n, (name, code, pct) in enumerate(
            [
                ("ريم عبد الله الطيب", "BIT", 87),
                ("مهند صلاح الدين", "BIT", 74),
                ("نسرين أحمد موسى", "BBA", 91),
            ],
            start=1,
        ):
            intake = intakes.get(code) or next(iter(intakes.values()))
            contact, _ = Contact.objects.get_or_create(
                email=f"applicant{n}@example.test", defaults={"name": name}
            )
            application = admissions.start(contact, intake)
            admissions.update(
                contact,
                application,
                phone_e164=f"+24991200000{n}",
                answers={
                    "birth_date": "2008-03-0" + str(n),
                    "certificate_type": "سودانية",
                    "percentage": pct,
                },
            )
            for key in ("certificate", "id"):
                admissions.add_document(
                    contact,
                    application,
                    key,
                    SimpleUploadedFile(f"{key}.pdf", pdf, "application/pdf"),
                )
            admissions.submit(contact, application)
            if n == 1:
                reviewer = RequestMeta(actor=users[Role.REGISTRAR], user_agent="seed_demo")
                admissions.claim(reviewer, application)
                admissions.transition(reviewer, application, to="under_review")

    def _phase8(self, users, term) -> None:
        """Graded and waiting submissions (so the reports have numbers) and one HR notice."""
        from datetime import timedelta
        from decimal import Decimal

        from django.utils import timezone

        from learning.models import Assignment, Submission, SubmissionGrade, SubmissionVersion
        from notifications.models import HRNotice
        from notifications.services import create_hr_notice

        if HRNotice.objects.exists():
            return
        now = timezone.now()
        teacher = users[Role.TEACHER]
        for n, offering in enumerate(
            CourseOffering.objects.filter(term=term, instructors__user=teacher).distinct()
        ):
            due = now - timedelta(days=12 - n)
            assignment, _ = Assignment.objects.get_or_create(
                offering=offering,
                title="تمرين قصير",
                defaults={
                    "due_at": due,
                    "status": Assignment.Status.PUBLISHED,
                    "created_by": teacher,
                },
            )
            records = [
                e.student_record for e in offering.enrollments.select_related("student_record")[:10]
            ]
            for i, record_ in enumerate(records):
                at = due - timedelta(hours=6 + i)
                submission, created = Submission.objects.get_or_create(
                    assignment=assignment,
                    student_record=record_,
                    defaults={"first_submitted_at": at},
                )
                if created:
                    version = SubmissionVersion.objects.create(
                        submission=submission, version_no=1, content="حل التمرين.", submitted_at=at
                    )
                    submission.current_version = version
                    submission.save(update_fields=["current_version", "updated_at"])
                if created and i % 3 != 2:  # a third still waits for grading
                    SubmissionGrade.objects.create(
                        submission=submission,
                        score=Decimal(6 + i % 5),
                        source=SubmissionGrade.Source.MANUAL,
                        status=SubmissionGrade.Status.APPROVED,
                        graded_by=teacher,
                        graded_at=due + timedelta(days=2 + i % 4),
                    )
        create_hr_notice(
            RequestMeta(actor=users[Role.HR], user_agent="seed_demo"),
            teacher=teacher,
            topic="grading",
            body="نودّ لفت انتباهكم إلى أن متوسط زمن تصحيح التسليمات تجاوز الحد المعتمد (3 أيام). "
            "نرجو معالجة المتأخر منها خلال أسبوع.",
            requires_ack=True,
        )

    def _user(self, email, name, password, role, department) -> User:
        user = User.objects.filter(email=email).first()
        if user is None:
            user = User.objects.create_user(email=email, password=password, full_name_ar=name)
        RoleAssignment.objects.get_or_create(
            user=user,
            role=role,
            department=department if role in DEPARTMENT_SCOPED_ROLES else None,
        )
        return user
