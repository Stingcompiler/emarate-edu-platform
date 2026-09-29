from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.services import RequestMeta
from learning import access
from learning.services import require
from students.models import StudentRecord

from . import services
from .models import Exam, ExamAttempt, Question, StudentAnswer
from .question_types import REGISTRY
from .serializers import (
    AnswerInputSerializer,
    AttemptSerializer,
    AttemptSummarySerializer,
    ExamResultSerializer,
    ExamSerializer,
    ExamStatsSerializer,
    ExtendSerializer,
    GradeAnswerSerializer,
    QuestionSerializer,
    ReasonSerializer,
    ReleaseSerializer,
    ReopenSerializer,
    ReorderSerializer,
    SignalSerializer,
)


def _meta(request):
    return RequestMeta.from_request(request)


# The monitor's figures (review 2026-09-29, P3): counted by the server, not from one page.
_ATTEMPT_STATES = {
    "in_progress": [ExamAttempt.Status.IN_PROGRESS],
    "done": [ExamAttempt.Status.SUBMITTED, ExamAttempt.Status.AUTO_SUBMITTED],
    "invalidated": [ExamAttempt.Status.INVALIDATED],
}


@extend_schema(tags=["exams"])
class ExamViewSet(viewsets.ModelViewSet):
    """Exams of the caller's courses. Students see published and closed exams only."""

    serializer_class = ExamSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    filterset_fields = ["offering", "status"]
    search_fields = ["title"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Exam.objects.none()
        user = self.request.user
        visible = access.staff_offerings_q(user) | (
            access.student_offerings_q(user)
            & Q(status__in=[Exam.Status.PUBLISHED, Exam.Status.CLOSED])
        )
        return (
            Exam.objects.filter(visible)
            .select_related("offering__course")
            .prefetch_related("questions")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user = getattr(self.request, "user", None)
        if user is not None and user.is_authenticated:
            context["student_record"] = StudentRecord.objects.filter(user=user).first()
        return context

    def create(self, request, *args, **kwargs):
        data = self.get_serializer(data=request.data)
        data.is_valid(raise_exception=True)
        exam = services.save_exam(_meta(request), None, **data.validated_data)
        return Response(self.get_serializer(exam).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        exam = self.get_object()
        data = self.get_serializer(exam, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = {k: v for k, v in data.validated_data.items() if k != "offering"}
        return Response(
            self.get_serializer(services.save_exam(_meta(request), exam, **values)).data
        )

    def perform_destroy(self, instance):
        services.delete_exam(_meta(self.request), instance)

    def _staff(self, exam, flag="view_all"):
        require(self.request.user, exam.offering, flag)

    @extend_schema(request=None, responses=ExamSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, public_id=None):
        return Response(
            self.get_serializer(services.publish(_meta(request), self.get_object())).data
        )

    @extend_schema(request=None, responses=ExamSerializer)
    @action(detail=True, methods=["post"])
    def close(self, request, public_id=None):
        return Response(self.get_serializer(services.close(_meta(request), self.get_object())).data)

    @extend_schema(request=ReleaseSerializer, responses=ExamSerializer)
    @action(detail=True, methods=["post"])
    def release(self, request, public_id=None):
        data = ReleaseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        exam = services.release_results(
            _meta(request), self.get_object(), data.validated_data["released"]
        )
        return Response(self.get_serializer(exam).data)

    @extend_schema(responses={200: dict})
    @action(detail=True, methods=["get"])
    def problems(self, request, public_id=None):
        exam = self.get_object()
        self._staff(exam)
        return Response({"problems": services.problems(exam)})

    @extend_schema(methods=["get"], responses=QuestionSerializer(many=True))
    @extend_schema(
        methods=["post"], request=QuestionSerializer, responses={201: QuestionSerializer}
    )
    @action(detail=True, methods=["get", "post"])
    def questions(self, request, public_id=None):
        exam = self.get_object()
        self._staff(exam)
        if request.method == "GET":
            rows = exam.questions.prefetch_related("choices")
            return Response(QuestionSerializer(rows, many=True).data)
        data = QuestionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        question = services.save_question(_meta(request), exam, None, **data.validated_data)
        return Response(QuestionSerializer(question).data, status=status.HTTP_201_CREATED)

    @extend_schema(methods=["patch"], request=QuestionSerializer, responses=QuestionSerializer)
    @extend_schema(methods=["delete"], request=None, responses={204: None})
    @action(detail=True, methods=["patch", "delete"], url_path=r"questions/(?P<question_id>\d+)")
    def question(self, request, public_id=None, question_id=None):
        exam = self.get_object()
        question = get_object_or_404(Question, pk=question_id, exam=exam)
        if request.method == "DELETE":
            services.delete_question(_meta(request), question)
            return Response(status=status.HTTP_204_NO_CONTENT)
        data = QuestionSerializer(question, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        question = services.save_question(_meta(request), exam, question, **data.validated_data)
        return Response(QuestionSerializer(question).data)

    @extend_schema(request=ReorderSerializer, responses={204: None})
    @action(detail=True, methods=["post"], url_path="questions-order")
    def reorder(self, request, public_id=None):
        data = ReorderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.reorder(_meta(request), self.get_object(), data.validated_data["order"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={201: AttemptSerializer})
    @action(detail=True, methods=["post"])
    def start(self, request, public_id=None):
        attempt = services.start(_meta(request), self.get_object())
        return Response(AttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        responses=AttemptSummarySerializer(many=True),
        parameters=[
            OpenApiParameter(
                "state",
                str,
                required=False,
                enum=["in_progress", "done", "invalidated"],
                description="Only attempts in this state (the monitor counts each).",
            )
        ],
    )
    @action(detail=True, methods=["get"])
    def attempts(self, request, public_id=None):
        exam = self.get_object()
        self._staff(exam)
        rows = exam.attempts.select_related("student_record").order_by("deadline_at", "id")
        state = request.query_params.get("state")
        if state in _ATTEMPT_STATES:
            rows = rows.filter(status__in=_ATTEMPT_STATES[state])
        page = self.paginate_queryset(rows)
        return self.get_paginated_response(AttemptSummarySerializer(page, many=True).data)

    @extend_schema(responses=ExamStatsSerializer)
    @action(detail=True, methods=["get"])
    def stats(self, request, public_id=None):
        exam = self.get_object()
        self._staff(exam)
        data = services.stats(exam)
        pending = StudentAnswer.objects.filter(
            attempt__exam=exam, needs_manual=True
        ).select_related("attempt__student_record", "question")[:50]
        data["pending"] = [
            {
                "attempt": a.attempt.public_id,
                "student": a.attempt.student_record.full_name_ar,
                "question": a.question_id,
                "question_text": a.question.text[:120],
                "marks": a.question.marks,
                "answer": a.answer or "",
            }
            for a in pending
        ]
        return Response(ExamStatsSerializer(data).data)


@extend_schema(tags=["exams"])
class AttemptViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """A student works on their own attempt; course staff act on any attempt of their courses."""

    serializer_class = AttemptSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ExamAttempt.objects.none()
        user = self.request.user
        visible = Q(student_record__user=user) | access.staff_offerings_q(user, "exam__offering")
        return ExamAttempt.objects.filter(visible).select_related(
            "exam__offering__course", "student_record"
        )

    def retrieve(self, request, *args, **kwargs):
        attempt = self.get_object()
        if attempt.student_record.user_id == request.user.pk:
            return Response(AttemptSerializer(attempt).data)
        return Response(AttemptSummarySerializer(attempt).data)

    def _own(self):
        return services.own_attempt(self.request.user, self.kwargs["public_id"])

    @extend_schema(request=AnswerInputSerializer, responses={204: None})
    @action(detail=True, methods=["put"], url_path=r"answers/(?P<question_id>\d+)")
    def answer(self, request, public_id=None, question_id=None):
        data = AnswerInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.save_answer(
            _meta(request), self._own(), int(question_id), data.validated_data["answer"]
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses=AttemptSerializer)
    @action(detail=True, methods=["post"])
    def submit(self, request, public_id=None):
        attempt = services.submit(_meta(request), self._own())
        return Response(AttemptSerializer(attempt).data)

    @extend_schema(request=SignalSerializer, responses={204: None})
    @action(detail=True, methods=["post"])
    def signals(self, request, public_id=None):
        data = SignalSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.record_signal(self._own(), data.validated_data["kind"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses=ExamResultSerializer)
    @action(detail=True, methods=["get"])
    def result(self, request, public_id=None):
        attempt = self._own()
        if not services.result_visible(attempt):
            raise NotFound(gettext("The result is not visible yet."))
        exam = attempt.exam
        answers = {a.question_id: a for a in attempt.answers.all()}
        questions = {q.pk: q for q in exam.questions.prefetch_related("choices")}
        rows = [answers.get(qid) for qid in attempt.question_order]
        review = None
        if exam.show_answers:
            review = []
            for position, qid in enumerate(attempt.question_order, start=1):
                q, a = questions.get(qid), answers.get(qid)
                if q is None:
                    continue
                review.append(
                    {
                        "order": position,
                        "text": q.text,
                        "type": q.type,
                        "choices": {str(c.pk): c.text for c in q.choices.all()},
                        "your_answer": a.answer if a else None,
                        "correct_answer": REGISTRY[q.type].correct_answer(q),
                        "is_correct": a.is_correct if a else False,
                        "marks_awarded": str(a.marks_awarded)
                        if a and a.marks_awarded is not None
                        else None,
                        "explanation": q.explanation,
                    }
                )
        seconds = (
            int((attempt.submitted_at - attempt.started_at).total_seconds())
            if attempt.submitted_at
            else None
        )
        return Response(
            ExamResultSerializer(
                {
                    "exam_title": exam.title,
                    "course_name": exam.offering.course.name_ar,
                    "status": attempt.status,
                    "score": attempt.score,
                    "total": exam.total_marks,
                    "passed": attempt.passed,
                    "submitted_at": attempt.submitted_at,
                    "seconds": seconds,
                    "attempt_no": attempt.attempt_no,
                    "max_attempts": exam.max_attempts,
                    "correct": sum(1 for r in rows if r and r.is_correct),
                    "wrong": sum(
                        1 for r in rows if r and r.answer is not None and r.is_correct is False
                    ),
                    "blank": sum(1 for r in rows if r is None or r.answer is None),
                    "pending_review": sum(1 for r in rows if r and r.needs_manual),
                    "review": review,
                }
            ).data
        )

    def _staff_attempt(self):
        attempt = self.get_object()
        if not access.for_offering(self.request.user, attempt.exam.offering).view_all:
            raise PermissionDenied()
        return attempt

    @extend_schema(request=ExtendSerializer, responses=AttemptSummarySerializer)
    @action(detail=True, methods=["post"])
    def extend(self, request, public_id=None):
        data = ExtendSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attempt = services.extend(
            _meta(request), self._staff_attempt(), data.validated_data["minutes"]
        )
        return Response(AttemptSummarySerializer(attempt).data)

    @extend_schema(request=ReopenSerializer, responses=AttemptSummarySerializer)
    @action(detail=True, methods=["post"])
    def reopen(self, request, public_id=None):
        data = ReopenSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attempt = services.reopen(_meta(request), self._staff_attempt(), **data.validated_data)
        return Response(AttemptSummarySerializer(attempt).data)

    @extend_schema(request=ReasonSerializer, responses=AttemptSummarySerializer)
    @action(detail=True, methods=["post"])
    def invalidate(self, request, public_id=None):
        data = ReasonSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attempt = services.invalidate(
            _meta(request), self._staff_attempt(), data.validated_data["reason"]
        )
        return Response(AttemptSummarySerializer(attempt).data)

    @extend_schema(request=GradeAnswerSerializer, responses=AttemptSummarySerializer)
    @action(detail=True, methods=["post"], url_path=r"answers/(?P<question_id>\d+)/grade")
    def grade(self, request, public_id=None, question_id=None):
        attempt = self._staff_attempt()
        answer = get_object_or_404(StudentAnswer, attempt=attempt, question_id=question_id)
        data = GradeAnswerSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.grade_answer(_meta(request), answer, data.validated_data["marks"])
        attempt.refresh_from_db()
        return Response(AttemptSummarySerializer(attempt).data)
