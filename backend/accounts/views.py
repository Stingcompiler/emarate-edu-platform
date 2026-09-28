"""Account endpoints: auth (cookies), /me, public registration, users and roles."""

import contextlib

from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from audit.services import RequestMeta
from core.permissions import capability

from . import rbac, services
from .models import RegistrationRequest, RoleAssignment, User
from .rbac import Role
from .serializers import (
    ActivateSerializer,
    DetailSerializer,
    LoginSerializer,
    MeSerializer,
    PasswordForgotSerializer,
    PasswordResetSerializer,
    RegistrationCompleteResponseSerializer,
    RegistrationCompleteSerializer,
    RegistrationDecisionSerializer,
    RegistrationRequestSerializer,
    RegistrationStartResponseSerializer,
    RegistrationStartSerializer,
    RegistrationVerifySerializer,
    RoleAssignmentDetailSerializer,
    RoleGrantSerializer,
    UserActiveSerializer,
    UserCreateSerializer,
    UserSerializer,
)
from .throttles import LoginThrottle, OTPIPThrottle, OTPTargetThrottle

REFRESH_COOKIE_PATH = "/api/v1/auth/"


def _set_auth_cookies(response: Response, refresh: RefreshToken) -> None:
    jwt = settings.SIMPLE_JWT
    common = {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
    }
    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS,
        str(refresh.access_token),
        max_age=int(jwt["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        path="/",
        **common,
    )
    response.set_cookie(
        settings.AUTH_COOKIE_REFRESH,
        str(refresh),
        max_age=int(jwt["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=REFRESH_COOKIE_PATH,  # only ever sent to the auth endpoints
        **common,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.AUTH_COOKIE_ACCESS, path="/")
    response.delete_cookie(settings.AUTH_COOKIE_REFRESH, path=REFRESH_COOKIE_PATH)


# ─── Auth ─────────────────────────────────────────────────────────────────


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    """Sets the ``csrftoken`` cookie; the portal calls it once before logging in."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses=DetailSerializer, tags=["auth"])
    def get(self, request):
        return Response({"detail": "ok"})


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    @extend_schema(request=LoginSerializer, responses={200: MeSerializer}, tags=["auth"])
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.login(data.validated_data["identifier"], data.validated_data["password"])
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        response = Response(MeSerializer(user).data)
        _set_auth_cookies(response, RefreshToken.for_user(user))
        return response


class RefreshView(APIView):
    """Rotates the refresh token (the old one is blacklisted) and renews both cookies."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=None, responses={200: DetailSerializer}, tags=["auth"])
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if not raw:
            raise NotAuthenticated("No session.")
        try:
            old = RefreshToken(raw)
            user = User.objects.get(pk=old["user_id"], is_active=True)
            old.blacklist()
        except (TokenError, User.DoesNotExist):
            response = Response({"detail": "Session expired."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_auth_cookies(response)
            return response
        response = Response({"detail": "ok"})
        _set_auth_cookies(response, RefreshToken.for_user(user))
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=None, responses={200: DetailSerializer}, tags=["auth"])
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if raw:
            with contextlib.suppress(TokenError):
                RefreshToken(raw).blacklist()
        response = Response({"detail": "ok"})
        _clear_auth_cookies(response)
        return response


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MeSerializer, tags=["me"])
    def get(self, request):
        return Response(MeSerializer(request.user).data)


# ─── Public: registration, password reset, activation ─────────────────────


class RegistrationStartView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPIPThrottle, OTPTargetThrottle]

    @extend_schema(
        request=RegistrationStartSerializer,
        responses={200: RegistrationStartResponseSerializer},
        tags=["registration"],
    )
    def post(self, request):
        data = RegistrationStartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reg = services.start_registration(**data.validated_data)
        return Response(
            {
                "request_id": reg.public_id,
                # Identical wording whether or not the details matched a record.
                "detail": "If the details match the college records, a code was sent to the email.",
            }
        )


class RegistrationVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPIPThrottle]

    @extend_schema(
        request=RegistrationVerifySerializer,
        responses={200: DetailSerializer},
        tags=["registration"],
    )
    def post(self, request):
        data = RegistrationVerifySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reg = get_object_or_404(RegistrationRequest, public_id=data.validated_data["request_id"])
        services.verify_registration(reg, data.validated_data["code"])
        return Response({"detail": "Email verified."})


class RegistrationCompleteView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPIPThrottle]

    @extend_schema(
        request=RegistrationCompleteSerializer,
        responses={201: RegistrationCompleteResponseSerializer},
        tags=["registration"],
    )
    def post(self, request):
        data = RegistrationCompleteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reg = get_object_or_404(RegistrationRequest, public_id=data.validated_data["request_id"])
        user = services.complete_registration(reg, data.validated_data["password"])
        return Response(
            {"status": "active" if user.is_active else "pending_approval"},
            status=status.HTTP_201_CREATED,
        )


class PasswordForgotView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPIPThrottle, OTPTargetThrottle]

    @extend_schema(
        request=PasswordForgotSerializer, responses={200: DetailSerializer}, tags=["auth"]
    )
    def post(self, request):
        data = PasswordForgotSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.start_password_reset(data.validated_data["email"])
        return Response({"detail": "If an account uses this email, a code was sent to it."})


class PasswordResetView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPIPThrottle]

    @extend_schema(
        request=PasswordResetSerializer, responses={200: DetailSerializer}, tags=["auth"]
    )
    def post(self, request):
        data = PasswordResetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.reset_password(**data.validated_data)
        return Response({"detail": "Password changed. Sign in with the new password."})


class ActivateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [OTPIPThrottle]

    @extend_schema(request=ActivateSerializer, responses={200: DetailSerializer}, tags=["auth"])
    def post(self, request):
        data = ActivateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.activate(data.validated_data["token"], data.validated_data["password"])
        return Response({"detail": "Account activated. You can sign in now."})


# ─── Staff: users and roles ───────────────────────────────────────────────


class UserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Staff accounts. System admin sees everyone; academic affairs sees teachers
    and TAs; the head registrar sees registrars (docs/03 §7 «المستخدمون»)."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, capability("users.view")]
    lookup_field = "public_id"
    search_fields = ["email", "full_name_ar", "full_name_en"]
    filterset_fields = ["is_active"]

    def get_queryset(self):
        user = self.request.user
        queryset = User.objects.prefetch_related("role_assignments__department")
        if rbac.has_role(user, Role.SYSTEM_ADMIN):
            return queryset
        visible: set[str] = set()
        if rbac.has_role(user, Role.ACADEMIC_AFFAIRS):
            visible |= {Role.TEACHER, Role.TA, Role.DEPARTMENT_MANAGER, Role.DEPARTMENT_SUPERVISOR}
        if rbac.has_role(user, Role.HEAD_REGISTRAR):
            visible |= {Role.REGISTRAR}
        return queryset.filter(role_assignments__role__in=visible).distinct()

    @extend_schema(request=UserCreateSerializer, responses={201: UserSerializer})
    def create(self, request):
        data = UserCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        department = values.pop("department", None)
        user = services.create_staff_account(
            RequestMeta.from_request(request),
            role=Role(values.pop("role")),
            department_id=department.pk if department else None,
            **values,
        )
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    def get_permissions(self):
        if self.action in ("create", "set_active"):
            # Governed by rbac.CREATABLE_ACCOUNTS (checked in the service).
            return [IsAuthenticated()]
        return super().get_permissions()

    @extend_schema(request=UserActiveSerializer, responses=UserSerializer)
    @action(detail=True, methods=["post"], url_path="set-active")
    def set_active(self, request, public_id=None):
        target = get_object_or_404(User, public_id=public_id)
        data = UserActiveSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = services.set_active(
            RequestMeta.from_request(request), target, data.validated_data["is_active"]
        )
        return Response(UserSerializer(user).data)


class RoleAssignmentViewSet(
    mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    """Grant and revoke roles, following who-appoints-whom (docs/03 §6)."""

    serializer_class = RoleAssignmentDetailSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["role", "department"]

    def get_queryset(self):
        grantable = rbac.grantable_roles(self.request.user)
        return RoleAssignment.objects.select_related("user", "department").filter(
            role__in=[r.value for r in grantable]
        )

    def list(self, request, *args, **kwargs):
        if not rbac.grantable_roles(request.user):
            raise PermissionDenied()
        return super().list(request, *args, **kwargs)

    @extend_schema(request=RoleGrantSerializer, responses={201: RoleAssignmentDetailSerializer})
    def create(self, request):
        data = RoleGrantSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        department = data.validated_data.get("department")
        assignment = services.grant_role(
            RequestMeta.from_request(request),
            data.validated_data["user"],
            Role(data.validated_data["role"]),
            department.pk if department else None,
        )
        return Response(
            RoleAssignmentDetailSerializer(assignment).data, status=status.HTTP_201_CREATED
        )

    def perform_destroy(self, instance):
        services.revoke_role(RequestMeta.from_request(self.request), instance)


class RegistrationRequestViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Student accounts waiting for approval (docs/02 D12)."""

    serializer_class = RegistrationRequestSerializer
    permission_classes = [IsAuthenticated, capability("registration.approve")]
    lookup_field = "public_id"
    filterset_fields = ["status"]
    search_fields = ["student_record__university_number", "student_record__full_name_ar", "email"]

    def get_queryset(self):
        queryset = RegistrationRequest.objects.filter(
            ~Q(status=RegistrationRequest.Status.OTP_PENDING),
            ~Q(status=RegistrationRequest.Status.VERIFIED),
            student_record__isnull=False,
        ).select_related("student_record__program")
        scope = rbac.scope_for(self.request.user, "registration.approve")
        return scope.filter(queryset, "student_record__department")

    @extend_schema(
        request=RegistrationDecisionSerializer, responses={200: RegistrationRequestSerializer}
    )
    @action(detail=True, methods=["post"])
    def decide(self, request, public_id=None):
        data = RegistrationDecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reg = services.decide_registration(
            RequestMeta.from_request(request),
            self.get_object(),
            data.validated_data["approve"],
            data.validated_data.get("reason", ""),
        )
        return Response(RegistrationRequestSerializer(reg).data)
