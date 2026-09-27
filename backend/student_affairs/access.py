"""File policies for regulation documents and case attachments."""

from accounts import rbac


def _regulation_readable(user, stored) -> bool:
    from .models import Regulation

    if rbac.can(user, "regulations.manage"):
        return True
    return Regulation.objects.filter(file=stored, status=Regulation.Status.PUBLISHED).exists()


def _case_readable(user, stored) -> bool:
    if rbac.can(user, "cases.manage"):
        return True
    # A student reads attachments of their own published cases. JSON "contains"
    # differs between SQLite and PostgreSQL, so the (few) cases are checked in Python.
    return _student_case_file(user, stored)


def _student_case_file(user, stored) -> bool:
    from .models import StudentCase

    wanted = str(stored.public_id)
    return any(
        wanted in case.attachments
        for case in StudentCase.objects.filter(
            student_record__user=user, published_to_student=True
        ).only("attachments")
    )


def register_file_policies() -> None:
    from files import access

    manage_regulations = lambda user, offering: rbac.can(user, "regulations.manage")  # noqa: E731
    manage_cases = lambda user, offering: rbac.can(user, "cases.manage")  # noqa: E731
    access.register(
        "regulation",
        access.Policy(
            can_upload=manage_regulations,
            can_read=_regulation_readable,
            allowed_extensions=frozenset({"pdf"}),
            max_mb=20,
            needs_offering=False,
        ),
    )
    access.register(
        "case",
        access.Policy(
            can_upload=manage_cases,
            can_read=_case_readable,
            max_mb=20,
            needs_offering=False,
        ),
    )
