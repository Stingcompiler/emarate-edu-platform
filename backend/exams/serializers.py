from django.utils import timezone
from django.utils.translation import gettext
from rest_framework import serializers

from academic.models import CourseOffering

from .models import Exam, ExamAttempt, Question
from .question_types import REGISTRY


class ExamSerializer(serializers.ModelSerializer):
    offering = serializers.PrimaryKeyRelatedField(queryset=CourseOffering.objects.all())
    course_code = serializers.CharField(source="offering.course.code", read_only=True)
    course_name = serializers.CharField(source="offering.course.name_ar", read_only=True)
    total_marks = serializers.DecimalField(max_digits=7, decimal_places=2, read_only=True)
    questions_count = serializers.SerializerMethodField()
    my_attempts = serializers.SerializerMethodField()

    class Meta:
        model = Exam
        fields = [
            "public_id",
            "offering",
            "course_code",
            "course_name",
            "title",
            "description",
            "opens_at",
            "closes_at",
            "duration_minutes",
            "grace_seconds",
            "pass_marks",
            "max_attempts",
            "allow_backtrack",
            "shuffle_questions",
            "shuffle_choices",
            "result_visibility",
            "show_answers",
            "results_released",
            "status",
            "total_marks",
            "questions_count",
            "my_attempts",
        ]
        read_only_fields = ["public_id", "results_released", "status"]

    def validate(self, attrs):
        opens = attrs.get("opens_at", getattr(self.instance, "opens_at", None))
        closes = attrs.get("closes_at", getattr(self.instance, "closes_at", None))
        if opens and closes and closes <= opens:
            raise serializers.ValidationError(
                {"closes_at": [gettext("Must be after the opening time.")]}
            )
        return attrs

    def get_questions_count(self, obj) -> int:
        return obj.questions.count()

    def get_my_attempts(self, obj) -> list[dict] | None:
        record_ = self.context.get("student_record")
        if record_ is None:
            return None
        return [
            {"public_id": str(a.public_id), "status": a.status, "attempt_no": a.attempt_no}
            for a in obj.attempts.filter(student_record=record_).order_by("attempt_no")
        ]


class ChoiceInputSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=500)
    is_correct = serializers.BooleanField(default=False)


class QuestionSerializer(serializers.ModelSerializer):
    """Staff view: includes the correct answers."""

    choices = ChoiceInputSerializer(many=True, required=False)

    class Meta:
        model = Question
        fields = [
            "id",
            "order",
            "type",
            "text",
            "marks",
            "explanation",
            "config",
            "is_required",
            "choices",
        ]
        read_only_fields = ["id"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["choices"] = [
            {"id": c.pk, "text": c.text, "is_correct": c.is_correct} for c in instance.choices.all()
        ]
        return data

    def validate(self, attrs):
        kind = attrs.get("type", getattr(self.instance, "type", None))
        if REGISTRY[kind].uses_choices and "choices" not in attrs and self.instance is None:
            raise serializers.ValidationError({"choices": [gettext("Add the choices.")]})
        return attrs


class StudentQuestionSerializer(serializers.Serializer):
    """What a student sees: never the correct answer or the grading config."""

    id = serializers.IntegerField()
    type = serializers.CharField()
    text = serializers.CharField()
    marks = serializers.DecimalField(max_digits=6, decimal_places=2)
    is_required = serializers.BooleanField()
    choices = serializers.ListField(child=serializers.DictField())


class AttemptSerializer(serializers.ModelSerializer):
    """The student's running attempt: questions in their shuffled order + saved answers."""

    exam = serializers.SerializerMethodField()
    server_time = serializers.SerializerMethodField()
    questions = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            "public_id",
            "exam",
            "attempt_no",
            "status",
            "started_at",
            "deadline_at",
            "server_time",
            "last_saved_at",
            "questions",
            "answers",
        ]
        read_only_fields = fields

    def get_exam(self, obj) -> dict:
        exam = obj.exam
        return {
            "public_id": str(exam.public_id),
            "title": exam.title,
            "course_code": exam.offering.course.code,
            "course_name": exam.offering.course.name_ar,
            "allow_backtrack": exam.allow_backtrack,
            "grace_seconds": exam.grace_seconds,
            "max_attempts": exam.max_attempts,
        }

    def get_server_time(self, obj) -> str:
        return timezone.now().isoformat()

    def get_questions(self, obj) -> list[dict]:
        questions = {q.pk: q for q in obj.exam.questions.prefetch_related("choices")}
        out = []
        for qid in obj.question_order:
            q = questions.get(qid)
            if q is None:
                continue
            by_id = {c.pk: c for c in q.choices.all()}
            order = obj.choice_orders.get(str(qid), list(by_id))
            out.append(
                {
                    "id": q.pk,
                    "type": q.type,
                    "text": q.text,
                    "marks": str(q.marks),
                    "is_required": q.is_required,
                    "choices": [
                        {"id": cid, "text": by_id[cid].text} for cid in order if cid in by_id
                    ],
                }
            )
        return out

    def get_answers(self, obj) -> dict:
        return {str(a.question_id): a.answer for a in obj.answers.all()}


class AttemptSummarySerializer(serializers.ModelSerializer):
    """Staff monitor row."""

    student = serializers.SerializerMethodField()
    remaining_seconds = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            "public_id",
            "student",
            "attempt_no",
            "status",
            "started_at",
            "deadline_at",
            "submitted_at",
            "last_saved_at",
            "remaining_seconds",
            "score",
            "passed",
            "client_meta",
            "invalidation_reason",
        ]
        read_only_fields = fields

    def get_student(self, obj) -> dict:
        s = obj.student_record
        return {
            "public_id": str(s.public_id),
            "university_number": s.university_number,
            "full_name_ar": s.full_name_ar,
        }

    def get_remaining_seconds(self, obj) -> int | None:
        if obj.status != ExamAttempt.Status.IN_PROGRESS:
            return None
        return max(int((obj.deadline_at - timezone.now()).total_seconds()), 0)


class AnswerInputSerializer(serializers.Serializer):
    answer = serializers.JSONField(allow_null=True)


class SignalSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["blur", "offline"])


class ExtendSerializer(serializers.Serializer):
    minutes = serializers.IntegerField(min_value=1, max_value=120)


class ReopenSerializer(serializers.Serializer):
    minutes = serializers.IntegerField(min_value=1, max_value=240)
    reason = serializers.CharField()


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField()


class GradeAnswerSerializer(serializers.Serializer):
    marks = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0)


class ReorderSerializer(serializers.Serializer):
    order = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class ReleaseSerializer(serializers.Serializer):
    released = serializers.BooleanField()


class ManualAnswerSerializer(serializers.Serializer):
    attempt = serializers.UUIDField()
    student = serializers.CharField()
    question = serializers.IntegerField()
    question_text = serializers.CharField()
    marks = serializers.DecimalField(max_digits=6, decimal_places=2)
    answer = serializers.CharField(allow_blank=True)


class ExamStatsSerializer(serializers.Serializer):
    attempts = serializers.IntegerField()
    students = serializers.IntegerField()
    average = serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True)
    median = serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True)
    pass_rate = serializers.FloatField(allow_null=True)
    average_seconds = serializers.IntegerField(allow_null=True)
    questions = serializers.ListField(child=serializers.DictField())
    needs_manual = serializers.IntegerField()
    pending = ManualAnswerSerializer(many=True)


class ExamResultSerializer(serializers.Serializer):
    exam_title = serializers.CharField()
    course_name = serializers.CharField()
    status = serializers.CharField()
    score = serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True)
    total = serializers.DecimalField(max_digits=7, decimal_places=2)
    passed = serializers.BooleanField(allow_null=True)
    submitted_at = serializers.DateTimeField(allow_null=True)
    seconds = serializers.IntegerField(allow_null=True)
    attempt_no = serializers.IntegerField()
    max_attempts = serializers.IntegerField()
    correct = serializers.IntegerField()
    wrong = serializers.IntegerField()
    blank = serializers.IntegerField()
    pending_review = serializers.IntegerField()
    review = serializers.ListField(child=serializers.DictField(), allow_null=True)
