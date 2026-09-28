"""Regulations the college publishes for everyone (docs/07 §1 `/regulations`)."""

from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers as S
from rest_framework.response import Response

from content.views import PUBLIC_CACHE, _Public, _PublicRead
from files import services as files

from .models import Regulation


class PublicRegulationSerializer(S.Serializer):
    public_id = S.UUIDField()
    title = S.CharField()
    body = S.CharField()
    category = S.CharField()
    category_label = S.CharField(source="get_category_display")
    version = S.CharField()
    effective_from = S.DateField(allow_null=True)
    published_at = S.DateTimeField(allow_null=True)
    has_file = S.SerializerMethodField()

    def get_has_file(self, obj) -> bool:
        return obj.file_id is not None


def _public():
    return Regulation.objects.filter(status=Regulation.Status.PUBLISHED, is_public=True)


@PUBLIC_CACHE
@extend_schema(tags=["public"])
class PublicRegulationsView(_PublicRead):
    @extend_schema(
        operation_id="public_regulations_list", responses=PublicRegulationSerializer(many=True)
    )
    def get(self, request):
        return Response(PublicRegulationSerializer(_public(), many=True).data)


@extend_schema(tags=["public"])
class PublicRegulationFileView(_Public):
    """A static page can't hold an expiring link, so it links here for a fresh one."""

    @extend_schema(operation_id="public_regulation_file", responses={302: None})
    def get(self, request, public_id):
        regulation = get_object_or_404(_public().exclude(file=None), public_id=public_id)
        stored = regulation.file
        url, _ = files.sign(stored.file.name, "f", stored.public_id)
        response = HttpResponseRedirect(request.build_absolute_uri(url))
        response["Cache-Control"] = "no-store"
        return response
