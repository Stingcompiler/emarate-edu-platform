"""Question type registry: validation, answer shape, auto-grading, student view.

Adding a type = one class here + a choice in Question.Type. Types that cannot
be graded automatically mark answers ``needs_manual``.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.utils.translation import gettext


@dataclass
class Graded:
    is_correct: bool | None
    marks: Decimal | None
    needs_manual: bool = False


class QuestionType:
    uses_choices = False
    auto = True

    def validate(self, question, choices) -> list[str]:
        return []

    def clean_answer(self, question, answer):
        """Return the stored form of ``answer`` or raise ValueError."""
        return answer

    def grade(self, question, answer) -> Graded:
        raise NotImplementedError

    def correct_answer(self, question):
        return None


def _q(value) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class Single(QuestionType):
    uses_choices = True

    def validate(self, question, choices):
        errors = []
        if len(choices) < 2:
            errors.append(gettext("Add at least two choices."))
        if sum(1 for c in choices if c.is_correct) != 1:
            errors.append(gettext("Mark exactly one correct choice."))
        return errors

    def clean_answer(self, question, answer):
        ids = {c.pk for c in question.choices.all()}
        if not isinstance(answer, int) or answer not in ids:
            raise ValueError("Pick one of the choices.")
        return answer

    def grade(self, question, answer):
        correct = next((c.pk for c in question.choices.all() if c.is_correct), None)
        ok = answer == correct
        return Graded(ok, _q(question.marks if ok else 0))

    def correct_answer(self, question):
        return next((c.pk for c in question.choices.all() if c.is_correct), None)


class Multiple(QuestionType):
    uses_choices = True

    def validate(self, question, choices):
        errors = []
        if len(choices) < 2:
            errors.append(gettext("Add at least two choices."))
        if not any(c.is_correct for c in choices):
            errors.append(gettext("Mark at least one correct choice."))
        return errors

    def clean_answer(self, question, answer):
        ids = {c.pk for c in question.choices.all()}
        if not isinstance(answer, list) or not all(isinstance(a, int) and a in ids for a in answer):
            raise ValueError("Pick from the choices.")
        return sorted(set(answer))

    def grade(self, question, answer):
        correct = {c.pk for c in question.choices.all() if c.is_correct}
        picked = set(answer or [])
        if picked == correct:
            return Graded(True, _q(question.marks))
        if not question.config.get("partial"):
            return Graded(False, _q(0))
        # Partial credit: +1 per right pick, −1 per wrong pick, never below zero.
        hits = len(picked & correct) - len(picked - correct)
        share = max(Decimal(hits) / Decimal(len(correct)), Decimal(0))
        return Graded(False, _q(question.marks * share))

    def correct_answer(self, question):
        return sorted(c.pk for c in question.choices.all() if c.is_correct)


class TrueFalse(QuestionType):
    def validate(self, question, choices):
        return (
            [] if isinstance(question.config.get("answer"), bool) else ["Set the correct answer."]
        )

    def clean_answer(self, question, answer):
        if not isinstance(answer, bool):
            raise ValueError("Answer true or false.")
        return answer

    def grade(self, question, answer):
        ok = answer == question.config.get("answer")
        return Graded(ok, _q(question.marks if ok else 0))

    def correct_answer(self, question):
        return question.config.get("answer")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", str(text)).strip().lower()
    text = re.sub(r"[ً-ْـ]", "", text)  # Arabic diacritics and tatweel
    text = text.translate(str.maketrans("أإآٱىة", "اااايه"))
    return re.sub(r"\s+", " ", text)


class FillBlank(QuestionType):
    def validate(self, question, choices):
        accepted = question.config.get("accepted")
        if not accepted or not all(isinstance(a, str) and a.strip() for a in accepted):
            return ["List the accepted answers."]
        return []

    def clean_answer(self, question, answer):
        if not isinstance(answer, str) or len(answer) > 500:
            raise ValueError("Type the missing word.")
        return answer.strip()

    def grade(self, question, answer):
        accepted = {normalize(a) for a in question.config.get("accepted", [])}
        ok = normalize(answer or "") in accepted
        return Graded(ok, _q(question.marks if ok else 0))

    def correct_answer(self, question):
        return question.config.get("accepted", [None])[0]


class Written(QuestionType):
    """Short answer and essay: saved as text, graded by the teacher."""

    auto = False

    def __init__(self, limit: int):
        self.limit = limit

    def clean_answer(self, question, answer):
        if not isinstance(answer, str) or len(answer) > self.limit:
            raise ValueError(f"Write up to {self.limit} characters.")
        return answer

    def grade(self, question, answer):
        if not (answer or "").strip():
            return Graded(False, _q(0))  # nothing written: nothing to review
        return Graded(None, None, needs_manual=True)


REGISTRY: dict[str, QuestionType] = {
    "single": Single(),
    "multiple": Multiple(),
    "true_false": TrueFalse(),
    "fill_blank": FillBlank(),
    "short_answer": Written(1000),
    "essay": Written(10000),
}
