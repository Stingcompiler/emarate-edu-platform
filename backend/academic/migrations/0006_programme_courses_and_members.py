"""Courses and teaching staff belong to programmes (owner, 2026-11-13).

The department is only a container: a course belongs to one programme, and a teacher is linked
to the programmes they teach in, in any department. What existed is carried over without
guessing:

* a course with no programme takes its department's programme when there is only one, or the
  one programme all its enrolled students study; otherwise it stays as it was (shared), until
  someone gives it a programme;
* a department membership becomes a membership of the programmes the person teaches in there,
  or of every programme of the department when they teach none yet, so nobody loses a course.
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def forwards(apps, schema_editor):
    Course = apps.get_model("academic", "Course")
    Membership = apps.get_model("academic", "DepartmentMembership")
    Instructor = apps.get_model("academic", "OfferingInstructor")
    Enrollment = apps.get_model("academic", "Enrollment")
    Program = apps.get_model("organization", "Program")

    programs: dict[int, list[int]] = {}
    for pk, department_id in Program.objects.order_by("id").values_list("id", "department_id"):
        programs.setdefault(department_id, []).append(pk)

    for course in Course.objects.filter(program__isnull=True):
        own = programs.get(course.department_id, [])
        if len(own) == 1:
            target = own[0]
        else:
            studied = set(
                Enrollment.objects.filter(offering__course=course)
                .values_list("student_record__program_id", flat=True)
                .distinct()
            )
            target = studied.pop() if len(studied) == 1 else None
        if target is not None and target in own:
            Course.objects.filter(pk=course.pk).update(program_id=target)

    for membership in Membership.objects.filter(program__isnull=True):
        own = programs.get(membership.department_id, [])
        taught = set(
            Instructor.objects.filter(
                user_id=membership.user_id,
                offering__course__department_id=membership.department_id,
                offering__course__program__isnull=False,
            ).values_list("offering__course__program_id", flat=True)
        )
        targets = [pk for pk in own if pk in taught] or own
        if not targets:
            continue  # a department with no programme yet: the membership stays its own
        Membership.objects.filter(pk=membership.pk).update(program_id=targets[0])
        for program_id in targets[1:]:
            Membership.objects.create(
                department_id=membership.department_id,
                program_id=program_id,
                user_id=membership.user_id,
                kind=membership.kind,
                added_by_id=membership.added_by_id,
            )


def backwards(apps, schema_editor):
    """One membership a department again: the first of each person's stays."""
    Membership = apps.get_model("academic", "DepartmentMembership")
    seen: set[tuple[int, int]] = set()
    for membership in Membership.objects.order_by("id"):
        key = (membership.department_id, membership.user_id)
        if key in seen:
            membership.delete()
        else:
            seen.add(key)
    Membership.objects.update(program=None)


class Migration(migrations.Migration):
    dependencies = [
        ("academic", "0005_course_semester_range"),
        ("organization", "0007_medicine_five_levels"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="departmentmembership",
            name="program",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="memberships",
                to="organization.program",
            ),
        ),
        migrations.RemoveConstraint(model_name="departmentmembership", name="uniq_department_member"),
        migrations.RemoveConstraint(model_name="course", name="uniq_course_code"),
        migrations.RunPython(forwards, backwards),
        migrations.AddConstraint(
            model_name="departmentmembership",
            constraint=models.UniqueConstraint(
                condition=models.Q(("program__isnull", False)),
                fields=("program", "user"),
                name="uniq_program_member",
            ),
        ),
        migrations.AddConstraint(
            model_name="departmentmembership",
            constraint=models.UniqueConstraint(
                condition=models.Q(("program__isnull", True)),
                fields=("department", "user"),
                name="uniq_department_member",
            ),
        ),
        migrations.AddConstraint(
            model_name="course",
            constraint=models.UniqueConstraint(
                condition=models.Q(("program__isnull", False)),
                fields=("program", "code"),
                name="uniq_program_course_code",
            ),
        ),
        migrations.AddConstraint(
            model_name="course",
            constraint=models.UniqueConstraint(
                condition=models.Q(("program__isnull", True)),
                fields=("department", "code"),
                name="uniq_department_course_code",
            ),
        ),
        migrations.AlterField(
            model_name="course",
            name="program",
            field=models.ForeignKey(
                blank=True,
                help_text="Empty only on courses entered before 2026-11-13 (then shared by the "
                "department's programmes).",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="courses",
                to="organization.program",
            ),
        ),
    ]
