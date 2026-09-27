"""Create N students enrolled in one course with an open 20-question exam.

    DJANGO_SETTINGS_MODULE=config.settings.loadtest LOADTEST_PASSWORD=… \\
        uv run python manage.py seed_loadtest --students 500

Refuses to run unless the settings module is the load-test one.
"""

import os
from datetime import date, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from academic.models import AcademicYear, Course, CourseOffering, Enrollment, Term
from accounts.models import RoleAssignment, User
from accounts.rbac import Role
from exams.models import Choice, Exam, Question
from organization.models import College, Department, Program
from students.models import StudentRecord


class Command(BaseCommand):
    help = "Seed a load-test exam with N students (config.settings.loadtest only)."

    def add_arguments(self, parser):
        parser.add_argument("--students", type=int, default=500)

    def handle(self, *args, **options):
        if settings.SETTINGS_MODULE != "config.settings.loadtest":
            raise CommandError("Run with DJANGO_SETTINGS_MODULE=config.settings.loadtest.")
        password = os.environ.get("LOADTEST_PASSWORD", "")
        if len(password) < 8:
            raise CommandError("Set LOADTEST_PASSWORD (8+ characters).")
        n = options["students"]
        with transaction.atomic():
            college, _ = College.objects.get_or_create(
                code="LT", defaults={"name_ar": "كلية الاختبار"}
            )
            dept, _ = Department.objects.get_or_create(
                college=college, code="LT", defaults={"name_ar": "قسم الحمل"}
            )
            program, _ = Program.objects.get_or_create(
                code="LTP",
                defaults={
                    "department": dept,
                    "name_ar": "برنامج الحمل",
                    "degree": "bachelor",
                    "levels_count": 4,
                    "duration_terms": 8,
                },
            )
            year, _ = AcademicYear.objects.get_or_create(
                name="LT", defaults={"starts_on": date(2026, 1, 1), "ends_on": date(2027, 12, 31)}
            )
            term, _ = Term.objects.get_or_create(
                academic_year=year,
                order=9,
                defaults={
                    "name_ar": "فصل الحمل",
                    "starts_on": date(2026, 1, 1),
                    "ends_on": date(2027, 12, 31),
                },
            )
            course, _ = Course.objects.get_or_create(
                department=dept, code="LT100", defaults={"name_ar": "مقرر الحمل"}
            )
            offering, _ = CourseOffering.objects.get_or_create(course=course, term=term)
            teacher, _ = User.objects.get_or_create(
                email="lt-teacher@loadtest.ecst.test", defaults={"full_name_ar": "أستاذ الحمل"}
            )
            RoleAssignment.objects.get_or_create(user=teacher, role=Role.TEACHER)
            Exam.objects.filter(offering=offering).delete()
            now = timezone.now()
            exam = Exam.objects.create(
                offering=offering,
                title="اختبار الحمل",
                opens_at=now - timedelta(minutes=1),
                closes_at=now + timedelta(hours=3),
                duration_minutes=60,
                status="published",
                shuffle_questions=True,
                shuffle_choices=True,
                created_by=teacher,
            )
            for i in range(1, 21):
                q = Question.objects.create(
                    exam=exam, order=i, type="single", text=f"سؤال {i}", marks=2
                )
                Choice.objects.bulk_create(
                    [
                        Choice(question=q, order=k, text=f"خيار {k}", is_correct=k == 1)
                        for k in range(1, 5)
                    ]
                )
            existing = set(
                User.objects.filter(email__startswith="lt").values_list("email", flat=True)
            )
            users = [
                User(email=f"lt{i:04d}@loadtest.ecst.test", full_name_ar=f"طالب {i}")
                for i in range(1, n + 1)
                if f"lt{i:04d}@loadtest.ecst.test" not in existing
            ]
            for user in users:
                user.set_password(password)
            User.objects.bulk_create(users)
            all_users = {
                u.email: u for u in User.objects.filter(email__endswith="@loadtest.ecst.test")
            }
            for i in range(1, n + 1):
                user = all_users[f"lt{i:04d}@loadtest.ecst.test"]
                record, _ = StudentRecord.objects.get_or_create(
                    university_number=f"LT-{i:04d}",
                    defaults={
                        "full_name_ar": user.full_name_ar,
                        "program": program,
                        "level": 1,
                        "user": user,
                    },
                )
                RoleAssignment.objects.get_or_create(user=user, role=Role.STUDENT)
                Enrollment.objects.get_or_create(offering=offering, student_record=record)
        self.stdout.write(f"exam={exam.public_id} students={n}")
