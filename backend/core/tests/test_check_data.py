"""manage.py check_data (review 2026-11-22): the cross-table rules hold, and a broken one is
named and fails the command."""

import pytest
from django.core.management import CommandError, call_command

from core import integrity
from students.models import StudentRecord

pytestmark = pytest.mark.django_db


def test_a_sound_platform_passes_every_check(classroom, capsys):
    checks, _ = integrity.run()
    assert [name for name, rows in checks if rows] == []
    call_command("check_data")
    assert "BAD" not in capsys.readouterr().out


def test_a_student_filed_under_another_department_is_named(classroom, ba_dept):
    StudentRecord.objects.filter(pk=classroom.record.pk).update(department=ba_dept)
    with pytest.raises(CommandError, match="a student's department is their programme's"):
        call_command("check_data")
