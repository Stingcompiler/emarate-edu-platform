import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, SectionLabel } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { can } from "../../lib/nav";
import { TOPIC_LABEL, TeacherStatus, days, initials, num, pct } from "../../lib/reports";
import { ROLE_LINE } from "./Teachers";

/** Board: AcademicAffairsTeacher (phone); desktop derived — indicators beside courses and notices. */
export function TeacherProfile() {
  const { id = "" } = useParams();
  const me = useMe();
  const profile = useQuery({
    queryKey: ["reports", "teacher", id],
    queryFn: async () =>
      (
        await api.GET("/api/v1/reports/teachers/{public_id}", {
          params: { path: { public_id: id } },
        })
      ).data ?? null,
  });
  const p = profile.data;
  const t = p?.row;
  const limits = p?.thresholds;
  const bars =
    t && limits
      ? [
          {
            label: "انتظام رفع المحاضرات",
            value: pct(t.upload_percent),
            ratio: (t.upload_percent ?? 0) / 100,
            bad: t.upload_percent != null && t.upload_percent < limits.upload_percent,
          },
          {
            label: `زمن التصحيح (الحد ${num(limits.grading_days)} أيام)`,
            value: days(t.grading_days),
            ratio: Math.min(1, (t.grading_days ?? 0) / (limits.grading_days * 2)),
            bad: t.grading_days != null && t.grading_days > limits.grading_days,
          },
          {
            label: "جلسات البث المنفذة",
            value: `${num(t.live_held)} / ${num(t.live_planned)}`,
            ratio: t.live_planned ? t.live_held / t.live_planned : 0,
            bad: false,
          },
          {
            label: "التسليمات غير المصححة",
            value: pct(t.ungraded_percent),
            ratio: (t.ungraded_percent ?? 0) / 100,
            bad: (t.ungraded_percent ?? 0) > 25,
          },
        ]
      : [];
  return (
    <PortalShell
      title={t?.name ?? "ملف أستاذ"}
      subtitle={
        t ? `${ROLE_LINE(t)} · ${num(t.offerings)} مادة · ${num(t.students)} طالبًا` : undefined
      }
      back={{ label: "الأساتذة", to: "/hr/teachers" }}
    >
      {p && t && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
          <div className="space-y-4">
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-12 place-items-center rounded-full bg-primary-soft font-semibold text-primary-700">
                {initials(t.name)}
              </span>
              <span className="flex-1 text-sm text-text-muted">
                {p.term.name}
                {p.previous
                  ? ` · الفصل السابق: ${days(p.previous.grading_days)} تصحيح، ${pct(p.previous.upload_percent)} رفع`
                  : ""}
              </span>
              <TeacherStatus status={t.status} />
            </Card>
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
              {[
                [days(t.grading_days), "للتصحيح"],
                [
                  t.lectures == null ? "—" : `${num(t.lectures)}/${num(t.planned)}`,
                  "محاضرات مرفوعة",
                ],
                [pct(t.ungraded_percent), "غير مصحح"],
                [num(t.exams), "اختبارات"],
                [num(t.live_held), "جلسات بث"],
                [num(p.notices?.length ?? 0), "تنبيهات سابقة"],
              ].map(([v, l]) => (
                <Card key={l} className="px-3 py-2.5 text-center">
                  <p className="text-lg font-bold text-text">{v}</p>
                  <p className="text-[11px] text-text-muted">{l}</p>
                </Card>
              ))}
            </div>
            <SectionLabel>المؤشرات مقابل حدود الكلية — {p.term.name}</SectionLabel>
            <Card className="space-y-3 p-4">
              {bars.map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">{b.label}</span>
                    <b className={b.bad ? "text-danger-strong" : "text-text"}>{b.value}</b>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt">
                    <div
                      className={`h-full ${b.bad ? "bg-danger" : "bg-success"}`}
                      style={{ width: `${Math.round(b.ratio * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </Card>
            <SectionLabel>المواد هذا الفصل</SectionLabel>
            <Card className="divide-y divide-border-soft">
              {p.offerings.map((o) => (
                <div key={o.public_id} className="px-4 py-3 text-sm">
                  <p className="font-semibold text-text">
                    <bdi className="font-mono text-xs text-text-muted">{o.code}</bdi> {o.name}
                    {o.role === "ta" ? " · معيد" : ""}
                  </p>
                  <p className="text-xs text-text-muted">
                    {num(o.students)} طالبًا · {num(o.lectures)}/{num(o.planned)} محاضرات ·{" "}
                    {num(o.ungraded)} تسليمًا غير مصحح
                  </p>
                </div>
              ))}
              {!p.offerings.length && (
                <p className="px-4 py-4 text-sm text-text-muted">لا مواد هذا الفصل.</p>
              )}
            </Card>
          </div>
          <aside className="mt-6 space-y-4 lg:mt-0">
            {p.notices && (
              <>
                <SectionLabel>التنبيهات السابقة</SectionLabel>
                <Card className="divide-y divide-border-soft">
                  {p.notices.map((n) => (
                    <div key={n.public_id} className="px-4 py-3 text-sm">
                      <p className="font-semibold text-text">
                        {n.subject}
                        {n.term_name ? ` — ${n.term_name}` : ""}
                      </p>
                      <p className="text-xs text-text-muted">
                        {n.sent_by} · {new Date(n.created_at).toLocaleDateString("ar")} ·{" "}
                        {n.acknowledged_at ? "أقرّ بالاطلاع" : n.opened_at ? "فُتح" : "لم يُفتح"}
                      </p>
                    </div>
                  ))}
                  {!p.notices.length && (
                    <p className="px-4 py-4 text-sm text-text-muted">لا تنبيهات.</p>
                  )}
                </Card>
              </>
            )}
            {can(me.data, "hr.notify") && (
              <Link to={`/hr/notices/new?teacher=${id}`} className="block">
                <Button className="w-full">تنبيه موجّه</Button>
              </Link>
            )}
          </aside>
        </div>
      )}
    </PortalShell>
  );
}

export { TOPIC_LABEL };
