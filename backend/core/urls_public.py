from django.urls import path

from accounts import views as accounts
from files import views as files

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
    path(
        "webhooks/bunny-stream",
        files.BunnyStreamWebhookView.as_view(),
        name="bunny-stream-webhook",
    ),
]
