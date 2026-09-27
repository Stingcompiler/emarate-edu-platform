"""DRF permission classes on top of accounts.rbac capabilities."""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts import rbac


def capability(read: str, write: str | None = None, delete: str | None = None):
    """Permission class: ``read`` for safe methods, ``write`` for changes, ``delete`` for DELETE.

    This is the coarse gate ("does the user hold this capability anywhere?").
    Department scope is enforced by the view's queryset (``Scope.filter``) and
    by ``check_object_scope`` for writes, so out-of-scope objects are 404/403.
    """
    write = write or read
    delete = delete or write

    class _Capability(BasePermission):
        def has_permission(self, request, view):
            if request.method in SAFE_METHODS:
                name = read
            elif request.method == "DELETE":
                name = delete
            else:
                name = write
            return rbac.can(request.user, name)

    _Capability.__name__ = f"Can_{read.replace('.', '_')}"
    return _Capability


def capability_for_method(request, read: str, write: str, delete: str | None = None) -> str:
    if request.method in SAFE_METHODS:
        return read
    if request.method == "DELETE":
        return delete or write
    return write
