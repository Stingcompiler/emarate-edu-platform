import pytest
from django.db import IntegrityError

from accounts import rbac
from accounts.models import RoleAssignment
from accounts.rbac import CAPABILITIES, DEPARTMENT_SCOPED_ROLES, Role


def test_every_capability_names_known_roles():
    for name, roles in CAPABILITIES.items():
        assert roles, name
        assert roles <= set(Role), name


def test_system_admin_holds_every_capability(make_user):
    admin = make_user(Role.SYSTEM_ADMIN)
    for name in CAPABILITIES:
        assert rbac.scope_for(admin, name).everything, name


def test_department_role_is_limited_to_its_department(make_user, it_dept, ba_dept):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    scope = rbac.scope_for(manager, "courses.manage")
    assert not scope.everything
    assert scope.allows(it_dept.pk)
    assert not scope.allows(ba_dept.pk)
    assert not scope.allows(None)
    assert rbac.can(manager, "courses.manage", it_dept.pk)
    assert not rbac.can(manager, "courses.manage", ba_dept.pk)


def test_roles_in_two_departments_union(make_user, it_dept, ba_dept):
    manager = make_user(Role.DEPARTMENT_MANAGER, department=it_dept)
    RoleAssignment.objects.create(user=manager, role=Role.DEPARTMENT_MANAGER, department=ba_dept)
    rbac.clear_cache(manager)
    assert rbac.scope_for(manager, "courses.view").departments == {it_dept.pk, ba_dept.pk}


def test_supervisor_is_manager_without_delete(make_user, it_dept):
    supervisor = make_user(Role.DEPARTMENT_SUPERVISOR, department=it_dept)
    assert rbac.can(supervisor, "courses.manage", it_dept.pk)
    assert rbac.can(supervisor, "membership.manage", it_dept.pk)
    assert not rbac.can(supervisor, "courses.delete", it_dept.pk)
    assert not rbac.can(supervisor, "membership.remove", it_dept.pk)


def test_roles_without_staff_capabilities(make_user):
    for role in (Role.STUDENT, Role.TEACHER, Role.TA, Role.EVENTS_MANAGER):
        assert rbac.capabilities_of(make_user(role)) == {}, role


def test_inactive_user_has_no_capabilities(make_user):
    admin = make_user(Role.SYSTEM_ADMIN, is_active=False)
    assert rbac.capabilities_of(admin) == {}


def test_appointment_rules(make_user, it_dept):
    assert rbac.grantable_roles(make_user(Role.HEAD_REGISTRAR)) == {Role.REGISTRAR}
    assert rbac.grantable_roles(make_user(Role.ACADEMIC_AFFAIRS)) == {
        Role.DEPARTMENT_MANAGER,
        Role.DEPARTMENT_SUPERVISOR,
        Role.TEACHER,
        Role.TA,
    }
    assert rbac.grantable_roles(make_user(Role.SITE_MANAGER)) == {Role.EVENTS_MANAGER}
    assert (
        rbac.grantable_roles(make_user(Role.DEPARTMENT_MANAGER, department=it_dept)) == frozenset()
    )
    assert Role.STUDENT not in rbac.creatable_accounts(make_user(Role.SYSTEM_ADMIN))


@pytest.mark.parametrize("role", sorted(DEPARTMENT_SCOPED_ROLES))
def test_scoped_role_requires_department(make_user, role):
    user = make_user()
    with pytest.raises(IntegrityError):
        RoleAssignment.objects.create(user=user, role=role)


def test_college_wide_role_rejects_department(make_user, it_dept):
    user = make_user()
    with pytest.raises(IntegrityError):
        RoleAssignment.objects.create(user=user, role=Role.HR, department=it_dept)


def test_same_role_twice_is_rejected(make_user):
    user = make_user(Role.HR)
    with pytest.raises(IntegrityError):
        RoleAssignment.objects.create(user=user, role=Role.HR)
