"""Response shapes for the report endpoints (typed for the portal's generated client)."""

from rest_framework import serializers

from academic.models import OfferingInstructor
from notifications.serializers import HRNoticeSerializer

from .models import ReportSnapshot

S = serializers


class TermRefSerializer(S.Serializer):
    id = S.IntegerField()
    name = S.CharField()
    week = S.IntegerField()


class ThresholdsSerializer(S.Serializer):
    grading_days = S.IntegerField()
    upload_percent = S.IntegerField()
    lectures_per_week = S.IntegerField()


# ─── Teachers ─────────────────────────────────────────────────────────────


class TeacherRowSerializer(S.Serializer):
    public_id = S.UUIDField()
    name = S.CharField()
    department_id = S.IntegerField(allow_null=True)
    department = S.CharField()
    kind = S.ChoiceField(choices=OfferingInstructor.Kind.choices)
    admin_role = S.CharField(allow_null=True)
    offerings = S.IntegerField()
    students = S.IntegerField()
    lectures = S.IntegerField(allow_null=True)
    planned = S.IntegerField(allow_null=True)
    upload_percent = S.IntegerField(allow_null=True)
    assignments = S.IntegerField(allow_null=True)
    exams = S.IntegerField(allow_null=True)
    grading_days = S.FloatField(allow_null=True)
    ungraded = S.IntegerField()
    ungraded_percent = S.IntegerField(allow_null=True)
    live_held = S.IntegerField()
    live_planned = S.IntegerField()
    status = S.ChoiceField(choices=["below", "warn", "ok", "none"])


class StatusCountsSerializer(S.Serializer):
    below = S.IntegerField()
    warn = S.IntegerField()
    ok = S.IntegerField()
    none = S.IntegerField()


class TeacherSummarySerializer(S.Serializer):
    members = S.IntegerField()
    counts = StatusCountsSerializer()
    grading_days = S.FloatField(allow_null=True)
    upload_percent = S.FloatField(allow_null=True)


class PreviousTeacherSummarySerializer(TeacherSummarySerializer):
    term = S.CharField()


class DepartmentRollupSerializer(S.Serializer):
    department_id = S.IntegerField(allow_null=True)
    department = S.CharField()
    members = S.IntegerField()
    grading_days = S.FloatField(allow_null=True)
    upload_percent = S.FloatField(allow_null=True)
    live_held = S.IntegerField()
    live_planned = S.IntegerField()
    below = S.IntegerField()


class TeachersReportSerializer(S.Serializer):
    term = TermRefSerializer()
    thresholds = ThresholdsSerializer()
    summary = TeacherSummarySerializer()
    previous = PreviousTeacherSummarySerializer(allow_null=True)
    departments = DepartmentRollupSerializer(many=True)
    rows = TeacherRowSerializer(many=True)


class TeacherOfferingSerializer(S.Serializer):
    public_id = S.UUIDField()
    code = S.CharField()
    name = S.CharField()
    role = S.ChoiceField(choices=OfferingInstructor.Kind.choices)
    students = S.IntegerField()
    lectures = S.IntegerField()
    planned = S.IntegerField()
    ungraded = S.IntegerField()


class TeacherProfileSerializer(S.Serializer):
    term = TermRefSerializer()
    thresholds = ThresholdsSerializer()
    row = TeacherRowSerializer()
    previous = TeacherRowSerializer(allow_null=True)
    offerings = TeacherOfferingSerializer(many=True)
    notices = HRNoticeSerializer(many=True, allow_null=True)


# ─── Department ───────────────────────────────────────────────────────────


class DepartmentKpisSerializer(S.Serializer):
    offerings = S.IntegerField()
    without_teacher = S.IntegerField()
    lectures = S.IntegerField()
    lectures_30d = S.IntegerField()
    lectures_per_offering = S.FloatField(allow_null=True)
    upload_percent = S.IntegerField(allow_null=True)
    grading_days = S.FloatField(allow_null=True)
    submission_percent = S.IntegerField(allow_null=True)
    live_held = S.IntegerField()


class CurrentDepartmentKpisSerializer(DepartmentKpisSerializer):
    students = S.IntegerField()
    enrolled_percent = S.IntegerField(allow_null=True)


class PreviousDepartmentKpisSerializer(DepartmentKpisSerializer):
    term = S.CharField()


class DepartmentCourseRowSerializer(S.Serializer):
    public_id = S.UUIDField()
    code = S.CharField()
    name = S.CharField()
    section = S.CharField()
    level = S.IntegerField()
    teachers = S.ListField(child=S.CharField())
    students = S.IntegerField()
    lectures = S.IntegerField()
    planned = S.IntegerField()
    submission_percent = S.IntegerField(allow_null=True)
    ungraded = S.IntegerField()
    last_upload = S.DateTimeField(allow_null=True)


class DepartmentReportSerializer(S.Serializer):
    term = TermRefSerializer()
    departments = S.ListField(child=S.CharField())
    thresholds = ThresholdsSerializer()
    kpis = CurrentDepartmentKpisSerializer()
    previous = PreviousDepartmentKpisSerializer(allow_null=True)
    weekly_uploads = S.ListField(child=S.IntegerField())
    rows = DepartmentCourseRowSerializer(many=True)


# ─── Admissions ───────────────────────────────────────────────────────────


class CycleRefSerializer(S.Serializer):
    id = S.IntegerField()
    name = S.CharField()


class ProgramStatsSerializer(S.Serializer):
    program = S.CharField()
    department = S.CharField()
    total = S.IntegerField()
    by_status = S.DictField(child=S.IntegerField())


class RegistrarStatsSerializer(S.Serializer):
    name = S.CharField()
    departments = S.ListField(child=S.CharField())
    applications = S.IntegerField()
    first_reply_days = S.FloatField(allow_null=True)
    late_inquiries = S.IntegerField()
    decisions = S.IntegerField()


class PreviousCycleSerializer(S.Serializer):
    cycle = S.CharField()
    total = S.IntegerField()


class AdmissionsReportSerializer(S.Serializer):
    cycle = CycleRefSerializer()
    total = S.IntegerField()
    accepted = S.IntegerField()
    accepted_percent = S.IntegerField(allow_null=True)
    converted = S.IntegerField()
    not_converted = S.IntegerField()
    first_reply_days = S.FloatField(allow_null=True)
    unassigned = S.IntegerField()
    by_status = S.DictField(child=S.IntegerField())
    programs = ProgramStatsSerializer(many=True)
    registrars = RegistrarStatsSerializer(many=True)
    daily = S.ListField(child=S.IntegerField())
    previous = PreviousCycleSerializer(allow_null=True)


# ─── Student affairs ──────────────────────────────────────────────────────


class AffairsRowSerializer(S.Serializer):
    department = S.CharField()
    by_kind = S.DictField(child=S.IntegerField())
    total = S.IntegerField()
    per_100 = S.FloatField(allow_null=True)


class OutcomeSerializer(S.Serializer):
    outcome = S.CharField()
    count = S.IntegerField()


class AcknowledgementStatsSerializer(S.Serializer):
    regulation = S.CharField()
    acknowledged = S.IntegerField()
    percent = S.IntegerField(allow_null=True)


class AffairsReportSerializer(S.Serializer):
    year = CycleRefSerializer()
    total = S.IntegerField()
    closed = S.IntegerField()
    close_days = S.FloatField(allow_null=True)
    misconduct_cases = S.IntegerField()
    misconduct_from_exams = S.IntegerField()
    kinds = S.ListField(child=S.CharField())
    rows = AffairsRowSerializer(many=True)
    outcomes = OutcomeSerializer(many=True)
    acknowledgements = AcknowledgementStatsSerializer(many=True)
    acknowledged_percent = S.IntegerField(allow_null=True)
    students = S.IntegerField()


# ─── Snapshots ────────────────────────────────────────────────────────────


class ReportSnapshotListSerializer(S.ModelSerializer):
    created_by_name = S.CharField(source="created_by.full_name_ar", read_only=True)

    class Meta:
        model = ReportSnapshot
        fields = ["public_id", "kind", "title", "created_by_name", "digest", "created_at"]
        read_only_fields = fields


class ReportSnapshotSerializer(ReportSnapshotListSerializer):
    class Meta(ReportSnapshotListSerializer.Meta):
        fields = [*ReportSnapshotListSerializer.Meta.fields, "params", "data", "notes"]
        read_only_fields = fields


class ReportSnapshotCreateSerializer(S.Serializer):
    kind = S.ChoiceField(choices=ReportSnapshot.Kind.choices)
    term = S.IntegerField(required=False)
    department = S.IntegerField(required=False)
    cycle = S.IntegerField(required=False)
    year = S.IntegerField(required=False)
    notes = S.CharField(max_length=2000, required=False, allow_blank=True, default="")


# ─── Transcript ───────────────────────────────────────────────────────────


class TranscriptRowSerializer(S.Serializer):
    course_code = S.CharField()
    course_name = S.CharField()
    credit_hours = S.IntegerField()
    score = S.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    letter = S.CharField()
    grade_points = S.DecimalField(max_digits=4, decimal_places=2)
    status = S.CharField()


class TranscriptTermSerializer(S.Serializer):
    term = S.CharField()
    credit_hours = S.IntegerField()
    gpa = S.DecimalField(max_digits=4, decimal_places=2, allow_null=True)
    results = TranscriptRowSerializer(many=True)


class TranscriptSerializer(S.Serializer):
    university_number = S.CharField()
    full_name_ar = S.CharField()
    full_name_en = S.CharField()
    program = S.CharField()
    department = S.CharField()
    level = S.IntegerField()
    status = S.CharField()
    cumulative_gpa = S.DecimalField(max_digits=4, decimal_places=2, allow_null=True)
    earned_hours = S.IntegerField()
    terms = TranscriptTermSerializer(many=True)
    issued_at = S.DateTimeField()
