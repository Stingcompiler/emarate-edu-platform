import hmac

from django.conf import settings
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import RequestMeta

from . import services
from .models import StoredFile, VideoAsset
from .serializers import (
    FileUploadSerializer,
    SignedUrlSerializer,
    StoredFileSerializer,
    VideoSerializer,
    VideoTicketRequestSerializer,
    VideoTicketSerializer,
    VideoUploadSerializer,
)


@extend_schema(tags=["files"])
class FileUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    @extend_schema(
        request={"multipart/form-data": FileUploadSerializer},
        responses={201: StoredFileSerializer},
    )
    def post(self, request):
        data = FileUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        stored = services.upload(
            RequestMeta.from_request(request),
            purpose=data.validated_data["purpose"],
            offering=data.validated_data.get("offering"),
            uploaded=data.validated_data["file"],
        )
        return Response(StoredFileSerializer(stored).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["files"])
class FileUrlView(APIView):
    """A download link valid for 10 minutes, after checking the caller may read the file."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=SignedUrlSerializer)
    def get(self, request, public_id):
        stored = get_object_or_404(StoredFile, public_id=public_id)
        url, expires_at = services.signed_url(request.user, stored)
        return Response({"url": url, "expires_at": expires_at})


@extend_schema(exclude=True)
class FileDownloadView(APIView):
    """Development only: serves a file for a valid signed token (Bunny serves it in production)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token):
        if settings.MEDIA_BACKEND != "local":
            raise Http404
        field, name, mime, inline = services.resolve_download(token)
        response = FileResponse(
            field.open("rb"), as_attachment=not inline, filename=name, content_type=mime
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


@extend_schema(tags=["videos"])
class VideoTicketView(APIView):
    """Start a video upload. Production returns Bunny TUS headers: the bytes go
    straight from the browser to Bunny Stream and never through this server."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=VideoTicketRequestSerializer, responses={201: VideoTicketSerializer})
    def post(self, request):
        data = VideoTicketRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        video, ticket = services.video_ticket(
            RequestMeta.from_request(request), **data.validated_data
        )
        return Response(
            {"video": VideoSerializer(video).data, "ticket": ticket},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["videos"])
class VideoLocalUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    @extend_schema(
        request={"multipart/form-data": VideoUploadSerializer}, responses={200: VideoSerializer}
    )
    def post(self, request, public_id):
        video = get_object_or_404(VideoAsset, public_id=public_id)
        data = VideoUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        video = services.local_video_upload(
            RequestMeta.from_request(request), video, data.validated_data["file"]
        )
        return Response(VideoSerializer(video).data)


@extend_schema(tags=["videos"])
class VideoPlaybackView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=SignedUrlSerializer)
    def get(self, request, public_id):
        video = get_object_or_404(VideoAsset, public_id=public_id)
        url, expires_at = services.video_playback(request.user, video)
        return Response({"url": url, "expires_at": expires_at})


@extend_schema(exclude=True)
class BunnyStreamWebhookView(APIView):
    """Bunny Stream calls this when encoding finishes (URL carries a shared secret)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = settings.BUNNY_WEBHOOK_SECRET
        if not secret or not hmac.compare_digest(request.query_params.get("secret", ""), secret):
            raise Http404
        services.bunny_webhook(request.data)
        return Response({"detail": gettext("ok")})
