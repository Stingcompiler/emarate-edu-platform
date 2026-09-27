from django.urls import path

from accounts import views as accounts
from content import views as content
from files import views as files
from inquiries import views as inquiries

from . import views

urlpatterns = [
    path("health", views.health, name="health"),
    path("csrf", accounts.CsrfView.as_view(), name="csrf"),
    path("registration/start", accounts.RegistrationStartView.as_view(), name="registration-start"),
    path(
        "registration/verify", accounts.RegistrationVerifyView.as_view(), name="registration-verify"
    ),
    path(
        "registration/complete",
        accounts.RegistrationCompleteView.as_view(),
        name="registration-complete",
    ),
    path("password/forgot", accounts.PasswordForgotView.as_view(), name="password-forgot"),
    path("password/reset", accounts.PasswordResetView.as_view(), name="password-reset"),
    path("activate", accounts.ActivateView.as_view(), name="activate"),
    path("files/<str:token>", files.FileDownloadView.as_view(), name="file-download"),
    path("inquiries", inquiries.PublicInquiryView.as_view(), name="public-inquiry"),
    path("site", content.PublicSiteSettingsView.as_view(), name="public-site"),
    path("pages/<str:slug>", content.PublicPageView.as_view(), name="public-page"),
    path("news", content.PublicNewsList.as_view(), name="public-news"),
    path("news/<str:slug>", content.PublicNewsDetail.as_view(), name="public-news-detail"),
    path("events", content.PublicEventList.as_view(), name="public-events"),
    path("events/<str:slug>", content.PublicEventDetail.as_view(), name="public-event-detail"),
    path("announcements", content.PublicAnnouncementList.as_view(), name="public-announcements"),
    path("menus/<slug:key>", content.PublicMenuView.as_view(), name="public-menu"),
    path("redirects", content.PublicRedirectView.as_view(), name="public-redirect"),
    path(
        "inquiries/<str:reference_no>",
        inquiries.PublicInquiryStatusView.as_view(),
        name="public-inquiry-status",
    ),
    path(
        "webhooks/bunny-stream",
        files.BunnyStreamWebhookView.as_view(),
        name="bunny-stream-webhook",
    ),
]
