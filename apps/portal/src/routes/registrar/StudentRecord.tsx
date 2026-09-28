import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, SectionLabel, StatusBadge } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { can } from "../../lib/nav";
import { initials, num } from "../../lib/reports";
import { STUDENT_STATUS } from "./StudentRecords";

/** Board: HeadRegistrarStudent (phone); desktop derived — data beside enrolment. */
export function StudentRecord() {
  const { id = "" } = useParams();
  const me = useMe();
  const student = useQuery({
    queryKey: ["student", id],
    queryFn: async () =>
      (await api.GET("/api/v1/students/{public_id}", { params: { path: { public_id: id } } }))
        .data ?? null,
  });
  const enrollments = useQuery({
    queryKey: ["enrollments", "student", id],
    enabled: can(me.data, "enrollment.manage"),
    queryFn: async () =>
      (
        await api.GET("/api/v1/enrollments", {
          params: { query: { student_record__public_id: id, page_size: 100 } },
        })
      ).data?.results ?? [],
  });
  const cases = useQuery({
    queryKey: ["cases", "student", id],
    enabled: can(me.data, "cases.view"),
    queryFn: async () =>
      (await api.GET("/api/v1/cases", { params: { query: { student_record__public_id: id } } }))
        .data?.results ?? [],
  });
  const s = student.data;
  const current = (enrollments.data ?? []).filter((e) => e.status === "active");
  const hours = current.reduce(
    (n, e) => n + (e.offering_detail.course_detail.credit_hours ?? 0),
    0,
  );
  return (
    <PortalShell
      title={s?.full_name_ar ?? "ملف طالب"}
      subtitle={
        s ? `${s.university_number} · ${s.program_name} · المستوى ${num(s.level)}` : undefined
      }
      back={{ label: "سجل الطلاب", to: "/students" }}
    >
      {s && (
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className="space-y-4">
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-12 place-items-center rounded-full bg-primary-soft font-semibold text-primary-700">
                {initials(s.full_name_ar)}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-text">{s.full_name_ar}</b>
                {s.full_name_en && (
                  <span dir="ltr" className="block text-xs text-text-muted">
                    {s.full_name_en}
                  </span>
                )}
              </span>
              <StatusBadge
                status={s.status === "active" ? "approved" : "rejected"}
                label={STUDENT_STATUS[s.status] ?? s.status}
              />
            </Card>
            <SectionLabel>بيانات الاتصال</SectionLabel>
            <Card className="divide-y divide-border-soft text-sm">
              {[
                ["البريد الرسمي", s.email ? <bdi key="e">{s.email}</bdi> : "—"],
                ["الهاتف", s.phone_e164 ? <bdi key="p">{s.phone_e164}</bdi> : "—"],
                [
                  "تاريخ الميلاد",
                  s.birth_date
                    ? new Date(s.birth_date).toLocaleDateString("ar", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "—",
                ],
                ["القسم", s.department_name],
                ["الحساب", s.has_account ? "مفعّل" : "لم يسجّل بعد"],
              ].map(([k, v]) => (
                <p key={String(k)} className="flex justify-between gap-3 px-4 py-2.5">
                  <span className="text-text-muted">{k}</span>
                  <span className="font-medium">{v}</span>
                </p>
              ))}
            </Card>
          </div>
          <div className="mt-6 space-y-4 lg:mt-0">
            {enrollments.data && (
              <>
                <SectionLabel>
                  التسجيل · {num(current.length)} مواد · {num(hours)} ساعة
                </SectionLabel>
                <Card className="divide-y divide-border-soft text-sm">
                  {enrollments.data.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span>
                        <bdi className="font-mono text-xs text-text-muted">
                          {e.offering_detail.course_detail.code}
                        </bdi>{" "}
                        {e.offering_detail.course_detail.name_ar}
                      </span>
                      <StatusBadge
                        status={e.status === "active" ? "approved" : "closed"}
                        label={
                          e.status === "active"
                            ? "فعّال"
                            : e.status === "dropped"
                              ? "منسحب"
                              : "مكتمل"
                        }
                      />
                    </div>
                  ))}
                  {!enrollments.data.length && (
                    <p className="px-4 py-3 text-text-muted">غير مسجل في مواد.</p>
                  )}
                </Card>
              </>
            )}
            {cases.data && (
              <>
                <SectionLabel>الحالات · {num(cases.data.length)}</SectionLabel>
                <Card className="divide-y divide-border-soft text-sm">
                  {cases.data.map((c) => (
                    <Link
                      key={c.public_id}
                      to={`/cases/${c.public_id}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-alt"
                    >
                      <span>{c.title}</span>
                      <StatusBadge
                        status={c.status}
                        label={
                          c.status === "open"
                            ? "مفتوحة"
                            : c.status === "decided"
                              ? "صدر قرار"
                              : "مقفلة"
                        }
                      />
                    </Link>
                  ))}
                  {!cases.data.length && <p className="px-4 py-3 text-text-muted">لا حالات.</p>}
                </Card>
              </>
            )}
            {can(me.data, "results.view") && (
              <Link
                to={`/print/transcript/${encodeURIComponent(s.university_number)}`}
                className="block rounded-2xl bg-surface p-4 text-sm font-semibold text-primary shadow-sm hover:bg-surface-alt"
              >
                السجل الأكاديمي (طباعة / PDF)
              </Link>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}
