import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, SectionLabel, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { formatClock } from "../../lib/exam";

type Rate = { question: number; order: number; text: string; correct_rate: number | null };

/** Board: TeacherExamResults (phone); desktop derived. */
export function ExamStats() {
  const { id = "" } = useParams();
  const client = useQueryClient();
  const exam = useQuery({
    queryKey: ["exams", id],
    queryFn: async () =>
      ok(await api.GET("/api/v1/exams/{public_id}", { params: { path: { public_id: id } } })) ??
      null,
  });
  const stats = useQuery({
    queryKey: ["exams", id, "stats"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/exams/{public_id}/stats", { params: { path: { public_id: id } } }),
      ) ?? null,
  });
  const release = useMutation({
    mutationFn: async (released: boolean) => {
      const { data, error } = await api.POST("/api/v1/exams/{public_id}/release", {
        params: { path: { public_id: id } },
        body: { released },
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["exams", id] }),
  });
  const s = stats.data;
  const e = exam.data;
  return (
    <PortalShell
      title={e?.title ?? "النتائج"}
      subtitle={
        s
          ? `${s.attempts.toLocaleString("ar-u-nu-latn")} من ${s.students.toLocaleString("ar-u-nu-latn")} أدّوا`
          : undefined
      }
      back={{ label: "الاختبار", to: `/exams/${id}` }}
    >
      {s && e && (
        <div>
          <Card className="grid grid-cols-2 divide-border-soft text-center sm:grid-cols-4 sm:divide-x">
            {[
              {
                v: s.average ?? "—",
                l: `المتوسط /${Number(e.total_marks).toLocaleString("ar-u-nu-latn")}`,
              },
              { v: s.median ?? "—", l: "الوسيط" },
              { v: s.pass_rate !== null ? `${Math.round(s.pass_rate * 100)}%` : "—", l: "ناجحون" },
              {
                v: s.average_seconds !== null ? formatClock(s.average_seconds * 1000) : "—",
                l: "متوسط الزمن",
              },
            ].map((x) => (
              <div key={x.l} className="py-3">
                <p className="text-xl font-bold text-text">{String(x.v)}</p>
                <p className="text-xs text-text-muted">{x.l}</p>
              </div>
            ))}
          </Card>
          <SectionLabel>الأسئلة الأصعب — نسبة الإجابات الصحيحة</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(s.questions as unknown as Rate[]).map((q) => (
              <div key={q.question} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 text-sm font-bold text-text-muted">{q.order}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-text">{q.text}</span>
                <span className="w-24 lg:w-72">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-surface-alt">
                    <span
                      className="motion-grow block h-full bg-primary"
                      style={{ width: `${(q.correct_rate ?? 0) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="w-12 text-end text-sm font-semibold text-text">
                  {q.correct_rate === null ? "—" : `${Math.round(q.correct_rate * 100)}%`}
                </span>
              </div>
            ))}
          </Card>
          {s.pending.length > 0 && (
            <>
              <SectionLabel>
                تحتاج تصحيحًا يدويًا · {s.needs_manual.toLocaleString("ar-u-nu-latn")}
              </SectionLabel>
              <Card className="divide-y divide-border-soft">
                {s.pending.map((p) => (
                  <ManualRow
                    key={`${p.attempt}-${p.question}`}
                    row={p}
                    onDone={() => client.invalidateQueries({ queryKey: ["exams", id, "stats"] })}
                  />
                ))}
              </Card>
            </>
          )}
          {e.result_visibility === "manual" && (
            <Button
              className="mt-5 w-full lg:w-auto"
              variant={e.results_released ? "secondary" : "primary"}
              onClick={() => release.mutate(!e.results_released)}
              disabled={release.isPending}
            >
              {e.results_released ? "إخفاء النتائج" : "نشر النتائج للطلاب"}
            </Button>
          )}
          {release.isError && (
            <div className="mt-3">
              <Notice>{problemMessage(release.error)}</Notice>
            </div>
          )}
        </div>
      )}
    </PortalShell>
  );
}

function ManualRow({
  row,
  onDone,
}: {
  row: {
    attempt: string;
    student: string;
    question: number;
    question_text: string;
    marks: string;
    answer: string;
  };
  onDone: () => void;
}) {
  const [marks, setMarks] = useState("");
  const grade = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST(
        "/api/v1/exam-attempts/{public_id}/answers/{question_id}/grade",
        {
          params: { path: { public_id: row.attempt, question_id: String(row.question) } },
          body: { marks },
        },
      );
      if (!data) throw error;
    },
    onSuccess: onDone,
  });
  return (
    <div className="px-4 py-3 text-sm">
      <p className="font-semibold text-text">
        {row.student} · <span className="font-normal text-text-muted">{row.question_text}</span>
      </p>
      <p className="mt-1 whitespace-pre-line leading-relaxed text-text">«{row.answer}»</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={marks}
          onChange={(e) => setMarks(e.target.value)}
          inputMode="decimal"
          placeholder={`من ${Number(row.marks).toLocaleString("ar-u-nu-latn")}`}
          aria-label="الدرجة"
          className="min-h-10 w-28 rounded-lg border border-border bg-surface px-3"
        />
        <Button onClick={() => grade.mutate()} disabled={!marks || grade.isPending}>
          صحّح
        </Button>
        {grade.isError && (
          <span className="text-xs text-danger-strong">{problemMessage(grade.error)}</span>
        )}
      </div>
    </div>
  );
}
