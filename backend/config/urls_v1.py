"""Authenticated portal API — /api/v1/ (docs/05 §7)."""

from django.urls import include, path
from rest_framework.routers import SimpleRouter

from academic import views as academic
from accounts import views as accounts
from audit import views as audit
from files import views as files
from learning import views as learning
from notifications import views as notifications
from organization import views as organization
from students import views as students

router = SimpleRouter(trailing_slash=False)
router.register("colleges", organization.CollegeViewSet, basename="college")
router.register("departments", organization.DepartmentViewSet, basename="department")
router.register("programs", organization.ProgramViewSet, basename="program")
router.register("academic-years", academic.AcademicYearViewSet, basename="academic-year")
router.register("terms", academic.TermViewSet, basename="term")
router.register("courses", academic.CourseViewSet, basename="course")
router.register("offerings", academic.OfferingViewSet, basename="offering")
router.register("enrollments", academic.EnrollmentViewSet, basename="enrollment")
router.register("students", students.StudentRecordViewSet, basename="student")
router.register("student-imports", students.StudentImportViewSet, basename="student-import")
router.register("users", accounts.UserViewSet, basename="user")
router.register("role-assignments", accounts.RoleAssignmentViewSet, basename="role-assignment")
router.register(
    "registration-requests", accounts.RegistrationRequestViewSet, basename="registration-request"
)
router.register("audit-logs", audit.AuditLogViewSet, basename="audit-log")
router.register("lectures", learning.LectureViewSet, basename="lecture")
router.register("assignments", learning.AssignmentViewSet, basename="assignment")
router.register("submissions", learning.SubmissionViewSet, basename="submission")
router.register("notifications/sent", notifications.SentViewSet, basename="notification-sent")
router.register("notifications", notifications.InboxViewSet, basename="notification")
router.register("hr-notices", notifications.HRNoticeViewSet, basename="hr-notice")

urlpatterns = [
    path("auth/login", accounts.LoginView.as_view(), name="auth-login"),
    path("auth/refresh", accounts.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout", accounts.LogoutView.as_view(), name="auth-logout"),
    path("me", accounts.MeView.as_view(), name="me"),
    path("me/courses", academic.MyCoursesView.as_view(), name="me-courses"),
    path("system-settings", organization.SystemSettingsView.as_view(), name="system-settings"),
    path(
        "departments/<int:department_id>/members",
        academic.DepartmentMembersView.as_view(),
        name="department-members",
    ),
    path(
        "departments/<int:department_id>/members/<int:membership_id>",
        academic.DepartmentMemberDetailView.as_view(),
        name="department-member-detail",
    ),
    path("files", files.FileUploadView.as_view(), name="file-upload"),
    path("files/<uuid:public_id>/url", files.FileUrlView.as_view(), name="file-url"),
    path("videos/upload-ticket", files.VideoTicketView.as_view(), name="video-ticket"),
    path(
        "videos/<uuid:public_id>/upload",
        files.VideoLocalUploadView.as_view(),
        name="video-local-upload",
    ),
    path(
        "videos/<uuid:public_id>/playback", files.VideoPlaybackView.as_view(), name="video-playback"
    ),
    path(
        "notifications/preferences",
        notifications.PreferencesView.as_view(),
        name="notification-preferences",
    ),
    path("push/config", notifications.PushConfigView.as_view(), name="push-config"),
    path("push/subscriptions", notifications.PushSubscriptionView.as_view(), name="push-subscribe"),
    path(
        "push/subscriptions/remove",
        notifications.PushUnsubscribeView.as_view(),
        name="push-unsubscribe",
    ),
    path("", include(router.urls)),
]
