from rest_framework import serializers

from academic.models import CourseOffering

from .models import Purpose, StoredFile, VideoAsset


class FileUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    purpose = serializers.ChoiceField(choices=Purpose.choices)
    offering = serializers.PrimaryKeyRelatedField(
        queryset=CourseOffering.objects.all(), required=False, allow_null=True
    )


class StoredFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoredFile
        fields = ["public_id", "name", "size", "mime", "purpose", "offering", "created_at"]
        read_only_fields = fields


class SignedUrlSerializer(serializers.Serializer):
    url = serializers.CharField()
    expires_at = serializers.DateTimeField()


class VideoTicketRequestSerializer(serializers.Serializer):
    offering = serializers.PrimaryKeyRelatedField(queryset=CourseOffering.objects.all())
    title = serializers.CharField(max_length=200)
    size = serializers.IntegerField(min_value=1)


class VideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = VideoAsset
        fields = ["public_id", "title", "provider", "status", "size", "offering", "created_at"]
        read_only_fields = fields


class VideoTicketSerializer(serializers.Serializer):
    video = VideoSerializer()
    ticket = serializers.DictField(help_text="mode=tus: endpoint + headers; mode=local: upload_url")


class VideoUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
