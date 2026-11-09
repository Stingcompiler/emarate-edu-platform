"""Medicine has five levels, like engineering (owner, 2026-11-09)."""

import importlib

from django.apps import apps

from organization.models import Program

migration = importlib.import_module("organization.migrations.0007_medicine_five_levels")


def test_medicine_gets_level_five_and_others_keep_theirs(it_dept, it_program):
    medicine = Program.objects.create(
        department=it_dept,
        code="MBBS",
        name_ar="بكالوريوس الطب والجراحة",
        degree=Program.Degree.BACHELOR,
        levels_count=4,
        duration_terms=8,
    )
    before = (it_program.levels_count, it_program.duration_terms)
    migration.five_levels(apps, None)
    medicine.refresh_from_db()
    it_program.refresh_from_db()
    assert (medicine.levels_count, medicine.duration_terms) == (5, 10)
    assert (it_program.levels_count, it_program.duration_terms) == before
