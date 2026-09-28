"""Authenticated portal API — /api/v1/ (docs/05 §7)."""

from django.urls import include, path
from rest_framework.routers import SimpleRouter

from academic import views as academic
from accounts import views as accounts
from admissions import views as admissions
from audit import views as audit
from content import views as content
from exams import views as exams
from files import views as files
from inquiries import views as inquiries
from learning import views as learning
from live import views as live
from notifications import views as notifications
from organization import views as organization
from reports import views as reports
from results import views as results
from student_affairs import views as student_affairs
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
router.register("result-imports", results.ResultImportViewSet, basename="result-import")
router.register("result-corrections", results.CorrectionViewSet, basename="result-correction")
router.register("results/grading-scales", results.GradingScaleViewSet, basename="grading-scale")
router.register("results/term-releases", results.TermReleaseViewSet, basename="term-release")
router.register("results", results.ResultViewSet, basename="result")
router.register("exams", exams.ExamViewSet, basename="exam")
router.register("exam-attempts", exams.AttemptViewSet, basename="exam-attempt")
router.register("live-sessions", live.LiveSessionViewSet, basename="live-session")
router.register("inquiries", inquiries.InquiryViewSet, basename="inquiry")
router.register("announcements", content.AnnouncementViewSet, basename="announcement")
router.register("admission-cycles", admissions.CycleViewSet, basename="admission-cycle")
router.register("intakes", admissions.IntakeViewSet, basename="intake")
router.register("form-templates", admissions.TemplateViewSet, basename="form-template")
router.register("applications", admissions.ApplicationViewSet, basename="application")
router.register("report-snapshots", reports.ReportSnapshotViewSet, basename="report-snapshot")
router.register("content/pages", content.PageViewSet, basename="page")
router.register("content/news", content.NewsViewSet, basename="news")
router.register("content/events", content.EventViewSet, basename="event")
router.register("content/media", content.MediaAssetViewSet, basename="media")
router.register("content/redirects", content.RedirectViewSet, basename="redirect")
router.register("regulations", student_affairs.RegulationViewSet, basename="regulation")
router.register("cases", student_affairs.CaseViewSet, basename="case")
router.register("me/cases", student_affairs.MyCasesViewSet, basename="my-case")
router.register(
    "misconduct-reports", student_affairs.MisconductReportViewSet, basename="misconduct-report"
)

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
    path("me/results", results.MyResultsView.as_view(), name="me-results"),
    path("gradebooks/<int:offering_id>", learning.GradebookView.as_view(), name="gradebook"),
    path("grading-queue", learning.GradingQueueView.as_view(), name="grading-queue"),
    path("teachers-directory", academic.TeacherDirectoryView.as_view(), name="teacher-directory"),
    path("reports/department", reports.DepartmentReportView.as_view(), name="report-department"),
    path("reports/teachers", reports.TeachersReportView.as_view(), name="report-teachers"),
    path(
        "reports/teachers/<uuid:public_id>",
        reports.TeacherProfileView.as_view(),
        name="report-teacher",
    ),
    path("reports/admissions", reports.AdmissionsReportView.as_view(), name="report-admissions"),
    path("reports/affairs", reports.AffairsReportView.as_view(), name="report-affairs"),
    path(
        "transcripts/<str:university_number>",
        reports.TranscriptView.as_view(),
        name="transcript",
    ),
    path("results/settings", results.DisplaySettingsView.as_view(), name="result-settings"),
    path(
        "students/<uuid:public_id>/status",
        student_affairs.StudentStatusView.as_view(),
        name="student-status",
    ),
    path("content/site-settings", content.SiteSettingsView.as_view(), name="site-settings"),
    path("content/menus/<slug:key>", content.MenuView.as_view(), name="menu"),
    path("", include(router.urls)),
]
