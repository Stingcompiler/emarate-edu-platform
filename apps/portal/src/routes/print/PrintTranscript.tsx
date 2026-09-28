import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";

import { api } from "../../lib/api";
import { num } from "../../lib/reports";
import { PrintLayout, PrintTable } from "./PrintLayout";

/** Official transcript for results staff (board StudentTranscript's «سجل أكاديمي رسمي PDF»). */
export function PrintTranscript() {
  const { number = "" } = useParams();
  const t = useQuery({
    queryKey: ["transcript", number],
    queryFn: async () =>
      (
        await api.GET("/api/v1/transcripts/{university_number}", {
          params: { path: { university_number: number } },
        })
      ).data ?? null,
  });
  const d = t.data;
  if (!d)
    return (
      <p className="p-8 text-center text-sm text-text-muted">
        {t.isLoading ? "…" : "لا سجل بهذا الرقم."}
      </p>
    );
  return (
    <PrintLayout
      title="السجل الأكاديمي"
      meta={
        <>
          <p>أُصدر {new Date(d.issued_at).toLocaleDateString("ar")}</p>
          <p>
            الرقم الجامعي <bdi className="font-semibold">{d.university_number}</bdi>
          </p>
        </>
      }
      footer="هذا السجل يعرض النتائج المعتمدة والمنشورة فقط. أي كشط أو تعديل يلغيه."
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <p>
          <span className="text-n600">الاسم: </span>
          <b>{d.full_name_ar}</b>
          {d.full_name_en && (
            <span dir="ltr" className="ms-2 text-n600">
              {d.full_name_en}
            </span>
          )}
        </p>
        <p>
          <span className="text-n600">البرنامج: </span>
          {d.program}
        </p>
        <p>
          <span className="text-n600">القسم: </span>
          {d.department}
        </p>
        <p>
          <span className="text-n600">المستوى: </span>
          {num(d.level)} · {d.status}
        </p>
      </div>
      <div className="flex gap-6 rounded bg-n50 p-3">
        <p>
          المعدل التراكمي{" "}
          <b className="text-lg" dir="ltr">
            {d.cumulative_gpa ?? "—"}
          </b>
        </p>
        <p>
          الساعات المجتازة <b className="text-lg">{num(d.earned_hours)}</b>
        </p>
      </div>
      {d.terms.map((term) => (
        <section key={term.term} className="break-inside-avoid">
          <h2 className="mb-1 flex justify-between font-bold">
            <span>
              {term.term} · {num(term.credit_hours)} ساعة
            </span>
            <span dir="ltr">{term.gpa ?? "—"}</span>
          </h2>
          <PrintTable
            head={["الرمز", "المقرر", "الساعات", "الدرجة", "التقدير", "النقاط", "الحالة"]}
            rows={term.results.map((r) => [
              <bdi key="c">{r.course_code}</bdi>,
              r.course_name,
              num(r.credit_hours),
              r.score ?? "—",
              <bdi key="l">{r.letter || "—"}</bdi>,
              <bdi key="p">{r.grade_points}</bdi>,
              r.status,
            ])}
          />
        </section>
      ))}
      {!d.terms.length && <p className="text-n600">لا نتائج منشورة.</p>}
    </PrintLayout>
  );
}

/** The signed-in student's own record, as the results officer allows it (/me/results). */
export function PrintMyResults() {
  const r = useQuery({
    queryKey: ["me", "results"],
    queryFn: async () => (await api.GET("/api/v1/me/results")).data ?? null,
  });
  const d = r.data;
  if (!d)
    return (
      <p className="p-8 text-center text-sm text-text-muted">{r.isLoading ? "…" : "لا نتائج."}</p>
    );
  return (
    <PrintLayout
      title="كشف النتائج"
      meta={<p>طُبع {new Date().toLocaleDateString("ar")}</p>}
      footer="نسخة للاطلاع — السجل الرسمي يصدر من مسؤول النتائج."
    >
      {d.cumulative_gpa && (
        <p className="rounded bg-n50 p-3">
          المعدل التراكمي{" "}
          <b dir="ltr" className="text-lg">
            {d.cumulative_gpa}
          </b>
        </p>
      )}
      {d.terms.map((term) => (
        <section key={term.term} className="break-inside-avoid">
          <h2 className="mb-1 flex justify-between font-bold">
            <span>
              {term.term_name} · {num(term.credit_hours)} ساعة
            </span>
            <span dir="ltr">{term.gpa ?? ""}</span>
          </h2>
          <PrintTable
            head={[
              "الرمز",
              "المقرر",
              "الساعات",
              ...(d.show.score ? ["الدرجة"] : []),
              ...(d.show.letter ? ["التقدير"] : []),
              ...(d.show.points ? ["النقاط"] : []),
            ]}
            rows={term.results.map((x) => [
              <bdi key="c">{x.course_code}</bdi>,
              x.course_name,
              num(x.credit_hours),
              ...(d.show.score ? [x.score ?? "—"] : []),
              ...(d.show.letter ? [<bdi key="l">{x.letter ?? "—"}</bdi>] : []),
              ...(d.show.points ? [<bdi key="p">{x.grade_points ?? "—"}</bdi>] : []),
            ])}
          />
        </section>
      ))}
    </PrintLayout>
  );
}
