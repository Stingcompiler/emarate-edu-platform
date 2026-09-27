import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Pencil, Radio } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, SectionLabel, problemMessage } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { examPhase } from "./Exams";

const at = new Intl.DateTimeFormat("ar", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});
const VISIBILITY: Record<string, string> = {
  immediate: "فور الإرسال",
  after_close: "بعد الإغلاق",
  manual: "عند نشرها",
};

/** Board: StudentExamStart (phone) for students; staff get the exam overview with tools. Desktop: derived. */
export function ExamDetail() {
  const { id = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const exam = useQuery({
    queryKey: ["exams", id],
    queryFn: async () =>
      (await api.GET("/api/v1/exams/{public_id}", { params: { path: { public_id: id } } })).data ??
      null,
  });
  const start = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/exams/{public_id}/start", {
        params: { path: { public_id: id } },
      });
      if (!data) throw error;
      return data;
    },
    onSuccess: (attempt) => navigate(`/exam-attempts/${attempt.public_id}`),
  });
  const e = exam.data;
  const student = !!me.data?.student;
  const mine = (e?.my_attempts ?? []) as {
    public_id: string;
    status: string;
    attempt_no: number;
  }[];
  const running = mine.find((a) => a.status === "in_progress");
  const done = mine.filter((a) => a.status !== "in_progress");
  const phase = e ? examPhase(e) : null;

  return (
    <PortalShell
      title={e?.title ?? "اختبار"}
      subtitle={e ? `${e.course_code} · ${e.course_name}` : undefined}
      back={{ label: "الاختبارات", to: "/exams" }}
    >
      {e && (
        <div className="max-w-3xl space-y-4">
          <Card className="grid grid-cols-4 divide-x divide-x-reverse divide-border-soft text-center">
            {[
              { n: e.duration_minutes, l: "دقيقة" },
              { n: e.questions_count, l: "سؤالًا" },
              { n: Number(e.total_marks), l: "درجة" },
              { n: e.max_attempts ?? 1, l: "محاولة" },
            ].map((s) => (
              <div key={s.l} className="py-3">
                <p className="text-xl font-bold text-text">{(s.n ?? 0).toLocaleString("ar")}</p>
                <p className="text-xs text-text-muted">{s.l}</p>
              </div>
            ))}
          </Card>
          <SectionLabel>النافذة والقواعد</SectionLabel>
          <Card className="divide-y divide-border-soft text-sm">
            {[
              ["يفتح", at.format(new Date(e.opens_at))],
              ["يُغلق", at.format(new Date(e.closes_at))],
              [
                "درجة النجاح",
                `${Number(e.pass_marks ?? 0).toLocaleString("ar")} من ${Number(e.total_marks).toLocaleString("ar")}`,
              ],
              ["الرجوع للسؤال السابق", e.allow_backtrack ? "مسموح" : "غير مسموح"],
              ["ظهور النتيجة", VISIBILITY[e.result_visibility ?? "immediate"] ?? ""],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-3">
                <span className="text-text-muted">{k}</span>
                <span className="font-medium text-text">{v}</span>
              </div>
            ))}
          </Card>

          {student ? (
            <>
              <Card className="p-4 text-sm leading-relaxed text-text-muted">
                <ul className="list-inside list-disc space-y-1">
                  <li>الوقت يُحسب من ساعة الخادم لا من هاتفك.</li>
                  <li>إجاباتك تُحفظ فورًا على جهازك وتُرسل تلقائيًا؛ الانقطاع لا يوقفك.</li>
                  <li>إذا أُغلق التطبيق افتحه وتُستأنف المحاولة من حيث توقفت.</li>
                  <li>عند انتهاء الوقت تُرسل الإجابات المحفوظة تلقائيًا.</li>
                </ul>
              </Card>
              {done.map((a) => (
                <Link
                  key={a.public_id}
                  to={`/exam-attempts/${a.public_id}/result`}
                  className="block text-sm font-semibold text-primary"
                >
                  نتيجة المحاولة {a.attempt_no.toLocaleString("ar")} ←
                </Link>
              ))}
              {start.isError && <Notice>{problemMessage(start.error)}</Notice>}
              {running ? (
                <Button
                  className="w-full"
                  onClick={() => navigate(`/exam-attempts/${running.public_id}`)}
                >
                  متابعة المحاولة
                </Button>
              ) : phase?.key === "published" && done.length < (e.max_attempts ?? 1) ? (
                <Button
                  className="w-full"
                  onClick={() => start.mutate()}
                  disabled={start.isPending}
                >
                  ابدأ الاختبار
                </Button>
              ) : null}
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              <Link to={`/exams/${e.public_id}/edit`}>
                <Button variant="secondary" className="w-full">
                  <Pencil size={16} aria-hidden />
                  الأسئلة والإعدادات
                </Button>
              </Link>
              <Link to={`/exams/${e.public_id}/monitor`}>
                <Button variant="secondary" className="w-full">
                  <Radio size={16} aria-hidden />
                  المراقبة
                </Button>
              </Link>
              <Link to={`/exams/${e.public_id}/stats`}>
                <Button variant="secondary" className="w-full">
                  <BarChart3 size={16} aria-hidden />
                  النتائج والإحصاءات
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </PortalShell>
  );
}
