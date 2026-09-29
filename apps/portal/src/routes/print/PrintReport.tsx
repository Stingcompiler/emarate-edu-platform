import type { Schemas } from "@ecst/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";

import { api, ok } from "../../lib/api";
import { TEACHER_STATUS, days, num, pct } from "../../lib/reports";
import { STATUS_LABEL } from "../../lib/visitor";
import { PrintLayout, PrintStats, PrintTable } from "./PrintLayout";
import { count, N } from "../../lib/format";

/** Print view of a frozen report snapshot (any kind). */
export function PrintReport() {
  const { id = "" } = useParams();
  const snap = useQuery({
    queryKey: ["report-snapshots", "one", id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/report-snapshots/{public_id}", {
          params: { path: { public_id: id } },
        }),
      ) ?? null,
  });
  const s = snap.data;
  if (!s)
    return (
      <p className="p-8 text-center text-sm text-text-muted">
        {snap.isLoading ? "…" : "التقرير غير متاح."}
      </p>
    );
  const meta = (
    <>
      <p>أُصدر {new Date(s.created_at).toLocaleString("ar")}</p>
      <p>بواسطة {s.created_by_name}</p>
      <p dir="ltr" className="font-mono">
        #{s.digest.slice(0, 12)}
      </p>
    </>
  );
  const notes = s.notes ? (
    <p className="rounded bg-n50 p-3 leading-6">
      <b>ملاحظات: </b>
      {s.notes}
    </p>
  ) : null;
  const footer = (
    <>
      نسخة مجمّدة من سجل التقارير — لا تُعدّل بعد الإصدار. البصمة:{" "}
      <span dir="ltr" className="font-mono">
        {s.digest}
      </span>
    </>
  );
  return (
    <PrintLayout title={s.title} meta={meta} footer={footer}>
      {notes}
      {s.kind === "department" && (
        <Department d={s.data as unknown as Schemas["DepartmentReport"]} />
      )}
      {s.kind === "teachers" && <Teachers d={s.data as unknown as Schemas["TeachersReport"]} />}
      {s.kind === "admissions" && (
        <Admissions d={s.data as unknown as Schemas["AdmissionsReport"]} />
      )}
      {s.kind === "affairs" && <Affairs d={s.data as unknown as Schemas["AffairsReport"]} />}
    </PrintLayout>
  );
}

function Department({ d }: { d: Schemas["DepartmentReport"] }) {
  const k = d.kpis;
  return (
    <>
      <p className="text-n600">
        {d.departments.join("، ")} · {d.term.name} · حتى الأسبوع {num(d.term.week)}
      </p>
      <PrintStats
        items={[
          [num(k.offerings), "مادة مفتوحة"],
          [num(k.lectures), "محاضرة مرفوعة"],
          [days(k.grading_days), "متوسط التصحيح"],
          [pct(k.submission_percent), "نسبة التسليم"],
        ]}
      />
      <PrintTable
        head={["المادة", "الأستاذ", "الطلاب", "المحاضرات", "التسليم", "غير مصحح"]}
        rows={d.rows.map((c) => [
          <>
            <bdi>{c.code}</bdi> {c.name}
          </>,
          c.teachers.join("، ") || "بلا أستاذ",
          num(c.students),
          `${num(c.lectures)}/${num(c.planned)}`,
          pct(c.submission_percent),
          num(c.ungraded),
        ])}
      />
    </>
  );
}

function Teachers({ d }: { d: Schemas["TeachersReport"] }) {
  const s = d.summary;
  const below = d.rows.filter((r) => r.status === "below");
  return (
    <>
      <p className="text-n600">
        {d.term.name}
        {d.previous ? ` مقابل ${d.previous.term}` : ""} · حتى الأسبوع {num(d.term.week)} · الحدود:
        تصحيح ≤ {count(d.thresholds.grading_days, N.day)}، رفع ≥ {num(d.thresholds.upload_percent)}٪
      </p>
      <PrintStats
        items={[
          [num(s.members), "عضوًا"],
          [days(s.grading_days), "زمن التصحيح"],
          [pct(s.upload_percent), "انتظام الرفع"],
          [num(s.counts.below), "تحت الحد"],
        ]}
      />
      <h2 className="font-bold">جدول الأقسام</h2>
      <PrintTable
        head={["القسم", "أعضاء", "زمن التصحيح", "انتظام الرفع", "جلسات بث", "تحت الحد"]}
        rows={d.departments.map((x) => [
          x.department || "—",
          num(x.members),
          days(x.grading_days),
          pct(x.upload_percent),
          `${num(x.live_held)}/${num(x.live_planned)}`,
          num(x.below),
        ])}
      />
      <h2 className="font-bold">قائمة «تحت الحد» · {num(below.length)}</h2>
      <PrintTable
        head={["الاسم", "القسم", "التصحيح", "الرفع", "غير مصحح", "الحالة"]}
        rows={below.map((r) => [
          r.name,
          r.department,
          days(r.grading_days),
          pct(r.upload_percent),
          pct(r.ungraded_percent),
          TEACHER_STATUS[r.status]?.label ?? r.status,
        ])}
      />
      <p className="text-[11px] text-n600">سري — للإدارة العليا والشؤون العلمية</p>
    </>
  );
}

function Admissions({ d }: { d: Schemas["AdmissionsReport"] }) {
  const stages = ["submitted", "under_review", "missing_documents", "accepted", "rejected"];
  return (
    <>
      <PrintStats
        items={[
          [num(d.total), "طلبًا"],
          [num(d.accepted), "مقبولًا"],
          [num(d.converted), "حُوِّلوا إلى طلاب"],
          [days(d.first_reply_days), "متوسط أول رد"],
        ]}
      />
      <PrintTable
        head={["البرنامج", "المجموع", ...stages.map((s) => STATUS_LABEL[s] ?? s)]}
        rows={d.programs.map((p) => [
          p.program,
          num(p.total),
          ...stages.map((s) => num(p.by_status[s] ?? 0)),
        ])}
      />
      <h2 className="font-bold">أداء المسجلين</h2>
      <PrintTable
        head={["المسجل", "الأقسام", "طلبات", "أول رد", "استفسارات متأخرة", "قرارات"]}
        rows={d.registrars.map((g) => [
          g.name,
          g.departments.join(" · "),
          num(g.applications),
          days(g.first_reply_days),
          num(g.late_inquiries),
          num(g.decisions),
        ])}
      />
    </>
  );
}

function Affairs({ d }: { d: Schemas["AffairsReport"] }) {
  const label: Record<string, string> = {
    exam_misconduct: "غش",
    academic: "أكاديمية",
    conduct: "سلوكية",
    welfare: "اجتماعية",
  };
  return (
    <>
      <p className="text-n600">العام {d.year.name} · مجمّع بلا أسماء</p>
      <PrintStats
        items={[
          [num(d.total), "حالة"],
          [days(d.close_days), "زمن الإقفال"],
          [num(d.misconduct_cases), "حالات غش"],
          [pct(d.acknowledged_percent), "الإقرار باللوائح"],
        ]}
      />
      <PrintTable
        head={["القسم", ...d.kinds.map((k) => label[k] ?? k), "المجموع", "لكل 100 طالب"]}
        rows={d.rows.map((r) => [
          r.department,
          ...d.kinds.map((k) => num(r.by_kind[k] ?? 0)),
          num(r.total),
          num(r.per_100, 1),
        ])}
      />
      <PrintTable
        head={["اللائحة", "أقرّ", "النسبة"]}
        rows={d.acknowledgements.map((a) => [a.regulation, num(a.acknowledged), pct(a.percent)])}
      />
    </>
  );
}
