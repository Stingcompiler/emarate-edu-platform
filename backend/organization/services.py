"""Side effects of structure edits that the generic viewset does not cover."""

from content.models import Redirect

LANGS = ("ar", "en")


def redirect_old_code(section: str, old: str, new: str) -> None:
    """The site addresses departments and programmes by code (/ar/departments/IT/): after a
    code change the old links (bookmarks, search results, shared posts) lead to the new page
    through the CMS redirects the site's 404 page follows (review 2026-11 R27)."""
    if old == new:
        return
    for lang in LANGS:
        target = f"/{lang}/{section}/{new}/"
        # Coming back to a code used before: that address is a page again, not a redirect.
        Redirect.objects.filter(from_path__in=[target, target.rstrip("/")]).delete()
        # Older redirects to the old page go straight to the new one (no chains).
        Redirect.objects.filter(to_path=f"/{lang}/{section}/{old}/").update(to_path=target)
        for source in (f"/{lang}/{section}/{old}/", f"/{lang}/{section}/{old}"):
            Redirect.objects.update_or_create(
                from_path=source, defaults={"to_path": target, "permanent": True}
            )


# ─── What a department holds; merging it into another; deleting it with its programmes ────
# (owner 2026-11-05: «القسم لا يمكن حذفه إذا كان يحتوي على برامج… كيف يمكن تسهيل حذفه أو
# تعطيله مؤقتًا»). Stopping it (is_active) stays the temporary way out; these two are for a
# department that should not exist — most often one entered by mistake for a single programme.


def _program_use(program) -> dict:
    from academic.models import Course
    from admissions.models import Application
    from students.models import StudentRecord

    students = StudentRecord.objects.filter(program=program).count()
    courses = Course.objects.filter(program=program).count()
    applications = Application.objects.filter(intake__program=program).count()
    return {
        "id": program.pk,
        "code": program.code,
        "name_ar": program.name_ar,
        "students": students,
        "courses": courses,
        "applications": applications,
        "free": not (students or courses or applications),
    }


def memberships_follow(program) -> None:
    """Staff linked to a programme belong to its department: keep the two in step."""
    from academic.models import DepartmentMembership

    DepartmentMembership.objects.filter(program=program).exclude(
        department_id=program.department_id
    ).update(department_id=program.department_id)


def usage(department) -> dict:
    """What hangs on a department, and what that allows."""
    from academic.models import Course, DepartmentMembership
    from accounts.models import RoleAssignment
    from students.models import StudentRecord

    programs = [_program_use(p) for p in department.programs.order_by("name_ar")]
    courses = Course.objects.filter(department=department).count()
    students = StudentRecord.objects.filter(department=department).count()
    roles = [
        {"user": ra.user.full_name_ar, "role": ra.get_role_display()}
        for ra in RoleAssignment.objects.filter(department=department).select_related("user")
    ]
    from audit.models import AuditLog

    own = not courses and not students
    # The audit log never changes or loses a row, and its rows keep their department: one
    # with history is stopped, never deleted (docs/03 §1.5).
    history = AuditLog.objects.filter(department=department).count()
    free = own and all(p["free"] for p in programs)
    return {
        "programs": programs,
        "courses": courses,
        "students": students,
        "members": DepartmentMembership.objects.filter(department=department)
        .values("user")
        .distinct()
        .count(),
        "roles": roles,
        "history": history,
        # Deleted together with its programmes: nothing but free programmes, and no history.
        "can_delete": free and not history,
        # Its programmes move to another department; it is then deleted, or stopped when it
        # has history.
        "can_merge": free,
    }


def _refuse(found: dict):
    from django.utils.translation import gettext

    from core.errors import Conflict

    if found.get("history") and found["can_merge"]:
        raise Conflict(
            gettext(
                "The department has entries in the audit log, which keeps them for good: stop "
                "it instead, or merge it into another department."
            ),
            code="has_history",
        )
    raise Conflict(
        gettext(
            "The department still has courses, students, or programmes with students, courses "
            "or applications. Stop it instead, or move those first."
        ),
        code="in_use",
    )


def end_program_links(meta, program) -> None:
    """A programme that is deleted takes its head, its supervisor and its staff links with it:
    they are written to the log first, as a department's roles are (review 2026-11-13 — they
    went silently, by the database's cascade). Nothing is removed if the delete then fails:
    the caller's transaction rolls back."""
    from academic.models import DepartmentMembership
    from accounts.models import RoleAssignment
    from audit.services import record

    roles = RoleAssignment.objects.filter(program=program).select_related("user")
    links = DepartmentMembership.objects.filter(program=program).select_related("user")
    if not roles and not links:
        return
    record(
        meta,
        "program.links_end",
        program,
        old={
            "roles_removed": [
                {"user": r.user.full_name_ar, "role": r.get_role_display()} for r in roles
            ],
            "members_removed": [
                {"user": m.user.full_name_ar, "kind": m.get_kind_display()} for m in links
            ],
        },
        department_id=program.department_id,
    )
    roles.delete()
    links.delete()


def _delete_program(meta, program) -> None:
    from audit.services import record, snapshot

    end_program_links(meta, program)
    program.intakes.filter(applications__isnull=True).delete()
    record(
        # department_id=None: the department goes too, and the log keeps no link to it.
        meta,
        "program.delete",
        program,
        old=snapshot(program),
        department_id=None,
    )
    program.delete()


def delete_with_programs(meta, department) -> None:
    """The department and its free programmes, in one step; its roles and memberships go with
    it (they are listed to the admin before)."""
    from django.db import transaction

    from audit.services import record, snapshot
    from content.services import request_site_rebuild

    with transaction.atomic():
        found = usage(department)
        if not found["can_delete"]:
            _refuse(found)
        for program in list(department.programs.all()):
            _delete_program(meta, program)
        record(
            meta,
            "department.delete",
            department,
            old={**snapshot(department), "roles_removed": found["roles"]},
            department_id=None,
        )
        department.delete()
        transaction.on_commit(request_site_rebuild)


def merge(meta, department, into) -> str:
    """Its programmes and teaching members move to `into`, then it is deleted; its old site
    address leads to `into`. Only while nothing else hangs on it (students and courses are
    scoped by department)."""
    from django.db import transaction
    from django.utils.translation import gettext
    from rest_framework.exceptions import ValidationError

    from academic.models import DepartmentMembership
    from audit.services import record, snapshot
    from content.services import request_site_rebuild

    if into.pk == department.pk:
        raise ValidationError({"into": [gettext("Choose another department.")]})
    if not into.is_active:
        # Its programmes would leave the site and applying with it (review 2026-11-10, R69).
        raise ValidationError(
            {"into": [gettext("That department is stopped. Choose an active one.")]}
        )
    from accounts.models import RoleAssignment
    from content.models import Announcement
    from inquiries.models import Inquiry

    with transaction.atomic():
        found = usage(department)
        if not found["can_merge"]:
            _refuse(found)
        moved = []
        for program in list(department.programs.all()):
            old = snapshot(program)
            program.department = into
            program.save(update_fields=["department", "updated_at"])
            record(
                meta,
                "program.update",
                program,
                old=old,
                new=snapshot(program),
                department_id=into.pk,
            )
            memberships_follow(program)
            moved.append(program.code)
        # Staff linked to its programmes went with them. Someone who joined the department
        # itself (before programmes) keeps a place in `into`; a member of both keeps the one
        # there (looking them up with their kind broke the merge for a teacher who assists
        # there — R67).
        there = set(
            DepartmentMembership.objects.filter(department=into).values_list("user_id", flat=True)
        )
        for membership in DepartmentMembership.objects.filter(
            department=department, program__isnull=True
        ):
            if membership.user_id not in there:
                DepartmentMembership.objects.create(
                    department=into, user_id=membership.user_id, kind=membership.kind
                )
        # What was addressed to it follows its programmes (R68): admission inquiries reach
        # the registrars of `into`, and its news shows on that department's page.
        inquiries = Inquiry.objects.filter(department=department).update(department=into)
        news = Announcement.objects.filter(
            scope=Announcement.Scope.DEPARTMENT, scope_id=department.pk
        ).update(scope_id=into.pk)
        # Its own roles end with it, deleted or stopped: the entry below says so (R70).
        RoleAssignment.objects.filter(department=department).delete()
        record(
            meta,
            "department.merge",
            department,
            old={**snapshot(department), "roles_removed": found["roles"]},
            new={"into": into.code, "programs": moved, "inquiries": inquiries, "news": news},
            department_id=into.pk,
        )
        source, target = department.code, into.code
        if found["history"]:
            # Kept, stopped: off the site, the lists and applying (its history stays readable).
            department.is_active = False
            department.save(update_fields=["is_active", "updated_at"])
            result = "stopped"
        else:
            department.delete()
            result = "deleted"
        for lang in LANGS:
            Redirect.objects.update_or_create(
                from_path=f"/{lang}/departments/{source}/",
                defaults={"to_path": f"/{lang}/departments/{target}/", "permanent": True},
            )
        transaction.on_commit(request_site_rebuild)
    return result
