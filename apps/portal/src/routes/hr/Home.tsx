import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, SectionLabel } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { can } from "../../lib/nav";
import { TeacherStatus, days, initials, num, pct } from "../../lib/reports";
import { useTeachersReport } from "./Teachers";

/** Board: HRHome (phone); desktop derived — distribution + lists in two columns. */
export function HRHome() {
  const me = useMe();
  const report = useTeachersReport();
  const notices = useQuery({
    queryKey: ["hr-notices"],
    queryFn: async () => (await api.GET("/api/v1/hr-notices")).data?.results ?? [],
  });
  const r = report.data;
  const below = (r?.rows ?? []).filter((t) => t.status === "below");
  const counts = r?.summary.counts;
  return (
    <PortalShell
      title="أداء الأساتذة"
      subtitle={`${me.data?.full_name_ar ?? ""} · للاطلاع والتنبيه فقط`}
    >
      {r && counts && (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text">
                التوزيع · الأساتذة والمعيدون {num(r.summary.members)} · {r.term.name}
              </p>
              <Link to="/hr/report" className="text-xs font-semibold text-primary">
                التقرير
              </Link>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-alt">
              {(["ok", "warn", "below"] as const).map((k) => (
                <span
                  key={k}
                  className={k === "ok" ? "bg-success" : k === "warn" ? "bg-warning" : "bg-danger"}
                  style={{ width: `${(100 * counts[k]) / Math.max(1, r.summary.members)}%` }}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 text-center text-xs">
              <span>
                <b className="block text-lg text-success-strong">{num(counts.ok)}</b>ضمن الحدود
              </span>
              <span>
                <b className="block text-lg text-warning-strong">{num(counts.warn)}</b>تنبيه
              </span>
              <span>
                <b className="block text-lg text-danger-strong">{num(counts.below)}</b>تحت الحد
              </span>
            </div>
          </Card>
          <div className="mt-2 lg:grid lg:grid-cols-2 lg:gap-6">
            <section>
              <SectionLabel>تحت الحد · {num(below.length)}</SectionLabel>
              <Card className="divide-y divide-border-soft">
                {below.slice(0, 5).map((t) => (
                  <Link
                    key={t.public_id}
                    to={`/hr/teachers/${t.public_id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger-soft text-xs font-semibold text-danger-strong">
                      {initials(t.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">
                        {t.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {t.department} · تصحيح {days(t.grading_days)} · رفع {pct(t.upload_percent)}
                      </span>
                    </span>
                    <TeacherStatus status="below" />
                  </Link>
                ))}
                {!below.length && (
                  <p className="px-4 py-4 text-sm text-text-muted">لا أحد تحت الحد.</p>
                )}
                <Link
                  to="/hr/teachers"
                  className="block px-4 py-2.5 text-center text-sm font-semibold text-primary"
                >
                  الجدول الكامل
                </Link>
              </Card>
              <SectionLabel>حسب القسم</SectionLabel>
              <Card className="divide-y divide-border-soft">
                {r.departments.map((d) => (
                  <div key={d.department} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-text">{d.department || "—"}</span>
                      <span className="text-xs text-text-muted">
                        {num(d.members)} · تصحيح {days(d.grading_days)} · رفع{" "}
                        {pct(d.upload_percent)}
                      </span>
                    </span>
                    <span
                      className={`text-sm font-bold ${d.below ? "text-danger-strong" : "text-text-muted"}`}
                    >
                      {num(d.below)}
                    </span>
                    <span className="text-xs text-text-muted">تحت الحد</span>
                  </div>
                ))}
              </Card>
            </section>
            <section>
              <div className="flex items-end justify-between">
                <SectionLabel>التنبيهات المرسلة</SectionLabel>
                {can(me.data, "hr.notify") && (
                  <Link to="/hr/notices/new">
                    <Button className="mb-2 min-h-9 px-3">تنبيه جديد</Button>
                  </Link>
                )}
              </div>
              <NoticeList items={notices.data ?? []} />
            </section>
          </div>
        </>
      )}
    </PortalShell>
  );
}

export function NoticeList({
  items,
}: {
  items: {
    public_id: string;
    subject: string;
    teacher_name: string;
    created_at: string;
    opened_at?: string | null;
    acknowledged_at?: string | null;
    requires_ack?: boolean;
  }[];
}) {
  return (
    <Card className="divide-y divide-border-soft">
      {items.slice(0, 8).map((n) => (
        <div key={n.public_id} className="flex items-center gap-3 px-4 py-3 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-text">
              {n.subject} — {n.teacher_name}
            </span>
            <span className="block text-xs text-text-muted">
              أُرسل {new Date(n.created_at).toLocaleDateString("ar")} ·{" "}
              {n.acknowledged_at
                ? `أقرّ ${new Date(n.acknowledged_at).toLocaleDateString("ar")}`
                : n.opened_at
                  ? "فُتح · لم يُقرّ"
                  : "لم يُفتح"}
            </span>
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${n.acknowledged_at ? "bg-success-soft text-success-strong" : n.requires_ack ? "bg-warning-soft text-warning-strong" : "bg-neutral-soft text-neutral-strong"}`}
          >
            {n.acknowledged_at ? "مُقرّ" : n.requires_ack ? "بلا إقرار" : "للاطلاع"}
          </span>
        </div>
      ))}
      {!items.length && <p className="px-4 py-4 text-sm text-text-muted">لم تُرسل تنبيهات بعد.</p>}
    </Card>
  );
}
