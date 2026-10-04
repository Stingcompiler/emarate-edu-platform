import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Flag,
  LayoutGrid,
  Timer,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { Button, Notice } from "../../components/ui";
import { ApiError, api, ok } from "../../lib/api";
import {
  answered,
  type AnswerValue,
  type AttemptPayload,
  clockOffset,
  type ExamQuestion,
  flagsStore,
  formatClock,
  pendingStore,
  textParts,
  TYPE_LABEL,
} from "../../lib/exam";
import { count, N } from "../../lib/format";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const clock = new Intl.DateTimeFormat("ar-u-nu-latn", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Boards: StudentExam (phone) and DesktopStudentExam (desktop, focused mode).
 * The server owns the clock; answers go to local storage first and sync when
 * the network allows, so a dropped connection never loses work.
 */
export function TakeExam() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["attempt", id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/exam-attempts/{public_id}", {
          params: { path: { public_id: id } },
        }),
      ) as unknown as AttemptPayload,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    // The exam shows its own message (the focused mode has no banner).
    meta: { silent: true },
  });
  const attempt = query.data;

  useEffect(() => {
    if (attempt && attempt.status !== "in_progress")
      navigate(`/exam-attempts/${id}/result`, { replace: true });
  }, [attempt, id, navigate]);

  if (query.isError) {
    // Never an endless «loading» (review 2026-09-29, P5): say why and offer a retry.
    const status = query.error instanceof ApiError ? query.error.status : 0;
    const text =
      status === 404 || status === 403
        ? "هذه المحاولة ليست لك أو لم تعد موجودة."
        : "تعذّر تحميل الاختبار. إجاباتك المحفوظة على هذا الجهاز لم تُفقد.";
    return (
      <div role="alert" className="grid min-h-dvh place-items-center bg-bg-subtle p-6 text-center">
        <div className="max-w-sm space-y-4">
          <p className="font-semibold text-text">{text}</p>
          <div className="flex justify-center gap-2">
            {status !== 404 && status !== 403 && (
              <Button className="min-h-11 px-5" onClick={() => void query.refetch()}>
                أعد المحاولة
              </Button>
            )}
            <Button
              variant="secondary"
              className="min-h-11 px-5"
              onClick={() => navigate("/exams")}
            >
              الاختبارات
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!attempt)
    return (
      <div className="grid min-h-dvh place-items-center bg-bg-subtle text-text-muted">
        جارٍ تحميل الاختبار…
      </div>
    );
  if (attempt.status !== "in_progress") return null;
  return <ExamRunner attempt={attempt} />;
}

function ExamRunner({ attempt }: { attempt: AttemptPayload }) {
  const navigate = useNavigate();
  const pending = useMemo(() => pendingStore(attempt.public_id), [attempt.public_id]);
  const flagStore = useMemo(() => flagsStore(attempt.public_id), [attempt.public_id]);
  const offset = useMemo(() => clockOffset(attempt.server_time), [attempt.server_time]);
  const deadline = new Date(attempt.deadline_at).getTime();
  const questions = attempt.questions;

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => ({
    ...attempt.answers,
    ...pending.read(),
  }));
  const [flags, setFlags] = useState<number[]>(flagStore.read);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const [savedAt, setSavedAt] = useState<string | null>(attempt.last_saved_at);
  const [unsynced, setUnsynced] = useState(Object.keys(pending.read()).length);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const furthest = useRef(0);

  const remaining = deadline - (now + offset);
  const question = questions[index]!;
  const answeredCount = questions.filter((q) => answered(answers[q.id])).length;

  // One sync at a time, always sending the latest value of each question: two
  // overlapping runs could land an older answer after a newer one.
  const syncing = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const syncOnce = useCallback(async () => {
    for (const qid of Object.keys(pending.read())) {
      const value = pending.read()[qid];
      if (value === undefined) continue; // already confirmed meanwhile
      const { response } = await api.PUT(
        "/api/v1/exam-attempts/{public_id}/answers/{question_id}",
        {
          params: { path: { public_id: attempt.public_id, question_id: qid } },
          body: { answer: value },
        },
      );
      if (response.ok) {
        pending.done(Number(qid), value);
        setSavedAt(new Date().toISOString());
      } else if (response.status === 400 || response.status === 409) {
        pending.done(Number(qid), value); // rejected for good (time up / no backtrack): stop retrying
        if (response.status === 409) break;
      } else {
        break; // network or server trouble: keep the queue and retry later
      }
    }
    setUnsynced(Object.keys(pending.read()).length);
  }, [attempt.public_id, pending]);
  const sync = useCallback(async (): Promise<void> => {
    if (syncing.current) {
      again.current = true;
      return syncing.current;
    }
    syncing.current = (async () => {
      do {
        again.current = false;
        await syncOnce();
      } while (again.current && Object.keys(pending.read()).length > 0);
    })().finally(() => {
      syncing.current = null;
    });
    return syncing.current;
  }, [pending, syncOnce]);

  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    let leaving = false;
    try {
      await sync();
      const unsent = Object.keys(pending.read()).length;
      setUnsynced(unsent);
      // While there is time, never submit over answers the server has not confirmed: the
      // student submits again once the connection is back (review 2026-10-04, C6). At the
      // deadline the server closes the attempt anyway, so it goes and the result page says
      // how many answers did not arrive.
      const timeUp = deadline - (Date.now() + offset) <= 0;
      if (unsent > 0 && !timeUp) {
        setError(
          `لم تصل ${count(unsent, N.answer)} إلى الخادم بعد. تحقّق من الاتصال ثم اضغط «تسليم» مرة أخرى؛ إجاباتك محفوظة على هذه الصفحة.`,
        );
        return;
      }
      const { response } = await api.POST("/api/v1/exam-attempts/{public_id}/submit", {
        params: { path: { public_id: attempt.public_id } },
      });
      if (response.ok || response.status === 409) {
        pending.clear();
        leaving = true;
        navigate(`/exam-attempts/${attempt.public_id}/result`, {
          replace: true,
          state: { unsent },
        });
        return;
      }
      setError("تعذّر الإرسال الآن. إجاباتك محفوظة على جهازك وسنعيد المحاولة تلقائيًا.");
    } catch {
      // fetch itself failed (no connection): the page stays usable and retries.
      setError("انقطع الاتصال أثناء الإرسال. إجاباتك محفوظة، وسنعيد المحاولة عند عودة الاتصال.");
    } finally {
      if (!leaving) submitting.current = false;
    }
  }, [attempt.public_id, deadline, navigate, offset, pending, sync]);

  // Clock, periodic sync, and auto-submit when the server's time is up.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 500);
    const save = window.setInterval(() => void sync(), 10_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(save);
    };
  }, [sync]);
  useEffect(() => {
    if (remaining <= 0) void submit();
  }, [remaining, submit]);

  // Network state and focus signals (the server records how often the student left).
  useEffect(() => {
    document.title = `${attempt.exam.title} — الاختبار`;
    // One signal per kind every 15 s at most: visibility can flicker (app switcher, OS prompts).
    const last: Record<string, number> = {};
    const signal = (kind: "blur" | "offline") => {
      if (Date.now() - (last[kind] ?? 0) < 15_000) return;
      last[kind] = Date.now();
      void api.POST("/api/v1/exam-attempts/{public_id}/signals", {
        params: { path: { public_id: attempt.public_id } },
        body: { kind },
      });
    };
    let wentOffline = false;
    const onOnline = () => {
      setOnline(true);
      if (wentOffline) signal("offline");
      wentOffline = false;
      void sync();
    };
    const onOffline = () => {
      setOnline(false);
      wentOffline = true;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") signal("blur");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [attempt.public_id, sync]);

  function setAnswer(q: ExamQuestion, value: AnswerValue) {
    setAnswers((current) => ({ ...current, [q.id]: value }));
    pending.put(q.id, value);
    setUnsynced(Object.keys(pending.read()).length);
    void sync();
  }

  function go(to: number) {
    if (to < 0 || to >= questions.length) return;
    if (!attempt.exam.allow_backtrack && to < furthest.current) return;
    furthest.current = Math.max(furthest.current, to);
    setIndex(to);
    setSheet(false);
  }

  function toggleFlag() {
    const next = flags.includes(question.id)
      ? flags.filter((f) => f !== question.id)
      : [...flags, question.id];
    setFlags(next);
    flagStore.write(next);
  }

  const lowTime = remaining < 5 * 60_000;
  // The browser refused to keep the queue on the device (private mode, full storage).
  const memoryOnly = unsynced > 0 && !pending.persisted();
  const saveLine = !online
    ? "بلا اتصال · محفوظ على الجهاز"
    : unsynced
      ? "جارٍ الحفظ…"
      : savedAt
        ? `حُفظ ${clock.format(new Date(savedAt))}`
        : "محفوظ";

  const navigator_ = (
    <Navigator
      questions={questions}
      answers={answers}
      flags={flags}
      index={index}
      canGoBack={attempt.exam.allow_backtrack}
      furthest={furthest.current}
      onPick={go}
    />
  );

  return (
    <div className="min-h-dvh bg-bg-subtle lg:flex lg:flex-col">
      {/* Header: title, save state, progress, timer, finish */}
      <header className="sticky top-0 z-20 border-b border-border-soft bg-surface/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur lg:px-8">
        <div className="flex h-14 items-center gap-3">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${lowTime ? "bg-danger-soft text-danger-strong" : "bg-warning-soft text-warning-strong"}`}
            aria-live="polite"
          >
            <Timer size={16} aria-hidden /> {formatClock(remaining)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">{attempt.exam.title}</p>
            <p className="hidden truncate text-xs text-text-muted lg:block">
              {attempt.exam.course_name} · {count(questions.length, N.question)} · محاولة{" "}
              {attempt.attempt_no} من {attempt.exam.max_attempts}
            </p>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-text-muted lg:flex">
            {online ? <Cloud size={16} aria-hidden /> : <CloudOff size={16} aria-hidden />}{" "}
            {saveLine}
          </span>
          <span className="text-sm font-semibold text-text-muted tabular-nums lg:hidden">
            {answeredCount}/{questions.length}
          </span>
          <span className="hidden lg:block">
            <Button onClick={() => setConfirm(true)}>إنهاء وتسليم</Button>
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-alt">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </header>

      <div className="lg:mx-auto lg:grid lg:w-full lg:max-w-[1200px] lg:flex-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:px-8 lg:py-6">
        <main className="px-4 pb-40 pt-4 lg:p-0">
          <div className="flex items-center justify-between gap-3 text-sm text-text-muted">
            <span>
              السؤال {(index + 1).toLocaleString("ar-u-nu-latn")} من{" "}
              {questions.length.toLocaleString("ar-u-nu-latn")} · {TYPE_LABEL[question.type]} ·{" "}
              {count(Number(question.marks), N.mark)}
            </span>
            <button
              type="button"
              onClick={toggleFlag}
              aria-pressed={flags.includes(question.id)}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs ${flags.includes(question.id) ? "bg-warning-soft font-semibold text-warning-strong" : "border border-border-soft text-text-muted"}`}
            >
              <Flag size={14} aria-hidden /> علّم للمراجعة
            </button>
          </div>
          <QuestionText text={question.text} />
          <AnswerInput
            question={question}
            value={answers[question.id] ?? null}
            onChange={(v) => setAnswer(question, v)}
          />

          <div className="mt-6 hidden items-center justify-between lg:flex">
            <Button
              variant="secondary"
              onClick={() => go(index - 1)}
              disabled={index === 0 || !attempt.exam.allow_backtrack}
            >
              <ChevronRight size={18} aria-hidden className="ltr:rotate-180" /> السابق
            </Button>
            <Button onClick={() => go(index + 1)} disabled={index === questions.length - 1}>
              التالي <ChevronLeft size={18} aria-hidden className="ltr:rotate-180" />
            </Button>
          </div>
          {memoryOnly && (
            <div className="mt-4">
              <Notice tone="warning">
                المتصفح لا يسمح بحفظ إجاباتك على الجهاز. لا تُعد تحميل الصفحة ولا تغلقها حتى يظهر
                «حُفظ».
              </Notice>
            </div>
          )}
          {error && (
            <div className="mt-4">
              <Notice>{error}</Notice>
            </div>
          )}
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border border-border-soft bg-surface p-4">
            <p className="mb-3 text-sm font-semibold text-text">الأسئلة</p>
            {navigator_}
            <p className="mt-4 text-xs leading-relaxed text-text-muted">
              يُحفظ كل تغيير فورًا؛ عند انقطاع الاتصال تستمر وتُرسل إجاباتك عند العودة. مغادرة
              الصفحة لا تنهي المحاولة لكنها تُسجَّل.
            </p>
          </div>
        </aside>
      </div>

      {/* Phone footer: save state + prev / questions / next */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border-soft bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        <p className="mb-2 flex items-center justify-center gap-1.5 text-xs text-text-muted">
          {online ? <Cloud size={14} aria-hidden /> : <CloudOff size={14} aria-hidden />} {saveLine}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => go(index - 1)}
            disabled={index === 0 || !attempt.exam.allow_backtrack}
          >
            السابق
          </Button>
          <Button variant="secondary" onClick={() => setSheet(true)} aria-label="الأسئلة">
            <LayoutGrid size={18} aria-hidden />
          </Button>
          <Button
            className="flex-1"
            onClick={() => (index === questions.length - 1 ? setSheet(true) : go(index + 1))}
          >
            {index === questions.length - 1 ? "المراجعة" : "التالي"}
          </Button>
        </div>
      </footer>

      {sheet && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="الأسئلة"
        >
          <button
            type="button"
            aria-label="إغلاق"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheet(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-text">الأسئلة</p>
              <button
                type="button"
                onClick={() => setSheet(false)}
                aria-label="إغلاق"
                className="grid size-9 place-items-center rounded-full bg-surface-alt"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            {navigator_}
            <Button
              className="mt-4 w-full bg-accent hover:bg-accent-hover"
              onClick={() => setConfirm(true)}
            >
              إرسال الاختبار
              {questions.length - answeredCount
                ? ` — ${(questions.length - answeredCount).toLocaleString("ar-u-nu-latn")} بلا إجابة`
                : ""}
            </Button>
          </div>
        </div>
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-40 grid place-items-end sm:place-items-center"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full rounded-t-3xl bg-surface p-5 sm:max-w-md sm:rounded-2xl">
            <p id="confirm-title" className="text-lg font-bold text-text">
              تسليم الاختبار؟
            </p>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              أجبت عن {answeredCount.toLocaleString("ar-u-nu-latn")} من{" "}
              {questions.length.toLocaleString("ar-u-nu-latn")}.
              {questions.length - answeredCount > 0 &&
                ` بقي ${(questions.length - answeredCount).toLocaleString("ar-u-nu-latn")} بلا إجابة.`}{" "}
              لا يمكن التعديل بعد التسليم.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>
                متابعة الحل
              </Button>
              <Button className="flex-1" onClick={() => void submit()}>
                تسليم الآن
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionText({ text }: { text: string }) {
  return (
    <div className="mt-3 space-y-3">
      {textParts(text).map((part, i) =>
        part.code ? (
          <pre
            key={i}
            dir="ltr"
            tabIndex={0}
            aria-label="كود"
            className="overflow-x-auto rounded-xl bg-navy-800 p-4 font-mono text-sm leading-relaxed text-navy-50"
          >
            {part.value}
          </pre>
        ) : (
          part.value.trim() && (
            <p key={i} className="whitespace-pre-line text-lg font-bold leading-relaxed text-text">
              {part.value}
            </p>
          )
        ),
      )}
    </div>
  );
}

function AnswerInput({
  question,
  value,
  onChange,
}: {
  question: ExamQuestion;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
}) {
  const card = (active: boolean) =>
    `flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors ${active ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:bg-surface-alt"}`;
  if (question.type === "single" || question.type === "multiple") {
    const multiple = question.type === "multiple";
    const picked = multiple ? ((value as number[] | null) ?? []) : value;
    return (
      <div className="mt-5 space-y-2.5" role={multiple ? "group" : "radiogroup"}>
        {question.choices.map((choice, i) => {
          const on = multiple ? (picked as number[]).includes(choice.id) : picked === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={on}
              className={card(on)}
              onClick={() =>
                onChange(
                  multiple
                    ? on
                      ? (picked as number[]).filter((c) => c !== choice.id)
                      : [...(picked as number[]), choice.id]
                    : choice.id,
                )
              }
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${on ? "bg-primary text-on-primary" : "bg-surface-alt text-text-muted"}`}
              >
                {LETTERS[i]}
              </span>
              <span className="text-[15px] text-text" dir="auto">
                {choice.text}
              </span>
            </button>
          );
        })}
        {multiple && <p className="text-xs text-text-muted">اختر كل ما ينطبق.</p>}
      </div>
    );
  }
  if (question.type === "true_false") {
    return (
      <div className="mt-5 grid grid-cols-2 gap-3" role="radiogroup">
        {[
          { v: true, label: "صح" },
          { v: false, label: "خطأ" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            className={`${card(value === o.v)} justify-center text-lg font-bold`}
            onClick={() => onChange(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (question.type === "fill_blank") {
    return (
      <input
        dir="auto"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="اكتب الكلمة الناقصة"
        aria-label="اكتب الكلمة الناقصة"
        className="mt-5 block min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-text"
      />
    );
  }
  return (
    <textarea
      dir="auto"
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="اكتب إجابتك"
      aria-label="اكتب إجابتك"
      maxLength={question.type === "essay" ? 10000 : 1000}
      className="mt-5 block min-h-44 w-full resize-y rounded-xl border border-border bg-surface p-4 text-base leading-relaxed text-text"
    />
  );
}

function Navigator({
  questions,
  answers,
  flags,
  index,
  canGoBack,
  furthest,
  onPick,
}: {
  questions: ExamQuestion[];
  answers: Record<string, AnswerValue>;
  flags: number[];
  index: number;
  canGoBack: boolean;
  furthest: number;
  onPick: (i: number) => void;
}) {
  const done = questions.filter((q) => answered(answers[q.id])).length;
  return (
    <>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((q, i) => {
          const isDone = answered(answers[q.id]);
          const flagged = flags.includes(q.id);
          const locked = !canGoBack && i < furthest;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onPick(i)}
              disabled={locked}
              aria-current={i === index ? "step" : undefined}
              aria-label={`السؤال ${i + 1}${isDone ? "، مُجاب" : ""}${flagged ? "، معلَّم" : ""}`}
              className={`h-11 rounded-lg text-sm font-semibold disabled:opacity-40 ${
                flagged
                  ? "bg-warning-soft text-warning-strong"
                  : isDone
                    ? "bg-header text-text-inverse"
                    : "border border-border-soft bg-surface text-text"
              } ${i === index ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""}`}
            >
              {(i + 1).toLocaleString("ar-u-nu-latn")}
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>مُجاب {done.toLocaleString("ar-u-nu-latn")}</span>
        <span>معلَّم {flags.length.toLocaleString("ar-u-nu-latn")}</span>
        <span>متبقٍ {(questions.length - done).toLocaleString("ar-u-nu-latn")}</span>
      </p>
    </>
  );
}
