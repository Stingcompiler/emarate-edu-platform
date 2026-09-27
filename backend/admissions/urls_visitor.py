"""/api/visitor/* — a verified contact's own applications and inquiries."""

from django.urls import path

from . import views

urlpatterns = [
    path("me", views.VisitorMeView.as_view(), name="visitor-me"),
    path("applications", views.VisitorApplicationsView.as_view(), name="visitor-applications"),
    path(
        "applications/<uuid:public_id>",
        views.VisitorApplicationView.as_view(),
        name="visitor-application",
    ),
    path(
        "applications/<uuid:public_id>/documents",
        views.VisitorDocumentsView.as_view(),
        name="visitor-documents",
    ),
    path(
        "applications/<uuid:public_id>/submit",
        views.VisitorSubmitView.as_view(),
        name="visitor-submit",
    ),
    path(
        "applications/<uuid:public_id>/withdraw",
        views.VisitorWithdrawView.as_view(),
        name="visitor-withdraw",
    ),
    path(
        "applications/<uuid:public_id>/messages",
        views.VisitorMessageView.as_view(),
        name="visitor-message",
    ),
    path(
        "inquiries/<uuid:public_id>/messages",
        views.VisitorInquiryReplyView.as_view(),
        name="visitor-inquiry-reply",
    ),
]
