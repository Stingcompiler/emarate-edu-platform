import { useQuery } from "@tanstack/react-query";
import { Check, Hourglass, X } from "lucide-react";
import { Link, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, EmptyState, StatusBadge } from "../../components/ui";
import { api } from "../../lib/api";
import { formatClock, textParts } from "../../lib/exam";

type Review = {
  order: number;
  text: string;
  type: string;
  choices: Record<string, string>;
  your_answer: unknown;
  correct_answer: unknown;
  is_correct: boolean;
  explanation: string;
};

function show(value: unknown, choices: Record<string, string>): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "صح" : "خطأ";
  if (Array.isArray(value)) return value.map((v) => choices[String(v)] ?? v).join("، ");
  return choices[String(value)] ?? String(value);
}

/** Board: StudentExamResult (phone). Desktop: derived — the same summary and review, wider. */
export function ExamResult() {
  const { id = "" } = useParams();
  const result = useQuery({
    queryKey: ["attempt", id, "result"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/v1/exam-attempts/{public_id}/result", {
        params: { path: { public_id: id } },
      });
      return response.status === 404 ? null : data;
    },
  });
  const r = result.data;

  return (
    <PortalShell title="نتيجة الاختبار" back={{ label: "الاختبارات", to: "/exams" }}>
      {result.isPending ? null : !r ? (
        <Card>
          <EmptyState icon={<Hourglass size={24} aria-hidden />} title="أُرسل اختبارك">
            تظهر النتيجة وفق إعداد الأستاذ — بعد إغلاق الاختبار أو عند نشرها.
          </EmptyState>
        </Card>
      ) : (
        <div className="max-w-3xl">
          <Card className="p-5 text-center">
            <p className="text-sm text-text-muted">
              {r.course_name} · {r.exam_title}
            </p>
            <p className="mt-2 text-5xl font-bold text-text">
              {r.score !== null ? Number(r.score).toLocaleString("ar") : "—"}
              <span className="text-2xl text-text-muted">
                {" "}
                / {Number(r.total).toLocaleString("ar")}
              </span>
            </p>
            <div className="mt-3 flex justify-center">
              {r.passed === null ? (
                <StatusBadge status="pending" label={`بانتظار تصحيح ${r.pending_review} سؤال`} />
              ) : (
                <StatusBadge
                  status={r.passed ? "pass" : "fail"}
                  label={r.passed ? "ناجح" : "راسب"}
                />
              )}
            </div>
            <p className="mt-3 text-xs text-text-muted">
              {r.seconds !== null && `استغرقت ${formatClock(r.seconds * 1000)} · `}محاولة{" "}
              {r.attempt_no} من {r.max_attempts}
            </p>
          </Card>
          <Card className="mt-3 grid grid-cols-3 divide-x divide-x-reverse divide-border-soft text-center">
            {[
              { n: r.correct, l: "صحيح" },
              { n: r.wrong, l: "خطأ" },
              { n: r.blank, l: "بلا إجابة" },
            ].map((s) => (
              <div key={s.l} className="py-3">
                <p className="text-xl font-bold text-text">{s.n.toLocaleString("ar")}</p>
                <p className="text-xs text-text-muted">{s.l}</p>
              </div>
            ))}
          </Card>
          {r.review && (
            <>
              <h2 className="mb-2 mt-6 px-1 text-xs font-semibold text-text-muted">
                مراجعة الإجابات
              </h2>
              <Card className="divide-y divide-border-soft">
                {(r.review as unknown as Review[]).map((q) => (
                  <div key={q.order} className="flex gap-3 px-4 py-3">
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full ${q.is_correct ? "bg-success-soft text-success-strong" : "bg-danger-soft text-danger-strong"}`}
                    >
                      {q.is_correct ? (
                        <Check size={16} aria-label="صحيح" />
                      ) : (
                        <X size={16} aria-label="خطأ" />
                      )}
                    </span>
                    <div className="min-w-0 text-sm">
                      {textParts(q.text).map((part, i) =>
                        part.code ? (
                          <pre
                            key={i}
                            dir="ltr"
                            tabIndex={0}
                            aria-label="كود"
                            className="mt-2 overflow-x-auto rounded-lg bg-navy-800 p-3 font-mono text-xs leading-relaxed text-navy-50"
                          >
                            {part.value}
                          </pre>
                        ) : (
                          part.value.trim() && (
                            <p key={i} className="whitespace-pre-line font-semibold text-text">
                              {i === 0 && `${q.order.toLocaleString("ar")}. `}
                              {part.value}
                            </p>
                          )
                        ),
                      )}
                      <p className="mt-1 text-text-muted">
                        إجابتك: <span dir="auto">{show(q.your_answer, q.choices)}</span>
                        {!q.is_correct && q.correct_answer !== null && (
                          <>
                            {" "}
                            · الصحيح: <span dir="auto">{show(q.correct_answer, q.choices)}</span>
                          </>
                        )}
                      </p>
                      {q.explanation && (
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">
                          شرح الأستاذ: {q.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            </>
          )}
          <Link to="/exams" className="mt-5 block">
            <Button variant="secondary" className="w-full">
              العودة إلى الاختبارات
            </Button>
          </Link>
        </div>
      )}
    </PortalShell>
  );
}
