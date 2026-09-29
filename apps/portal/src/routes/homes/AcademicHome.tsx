import { useQuery } from "@tanstack/react-query";
import { BarChart3, UserPlus } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, SectionLabel } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm } from "../../lib/department";
import { initials, useDepartments } from "../../lib/reports";
import { Inbox } from "./Inbox";
import { count, N } from "../../lib/format";
import { ALL } from "../../components/Pager";

/** Board: AcademicAffairsHome (phone); desktop derived — decisions beside department leadership. */
export function AcademicHome() {
  const me = useMe();
  const term = useCurrentTerm();
  const departments = useDepartments();
  const corrections = useQuery({
    queryKey: ["result-corrections", "pending"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/result-corrections", {
          params: { query: { ...ALL, status: "pending" } },
        }),
      )?.count ?? 0,
  });
  const leaders = useQuery({
    queryKey: ["role-assignments", "leaders"],
    queryFn: async () => {
      const get = async (role: "department_manager" | "department_supervisor") =>
        ok(
          await api.GET("/api/v1/role-assignments", {
            params: { query: { role, page_size: 100 } },
          }),
        )?.results ?? [];
      return [...(await get("department_manager")), ...(await get("department_supervisor"))];
    },
  });
  const teachers = useQuery({
    queryKey: ["reports", "teachers", "college"],
    queryFn: async () => ok(await api.GET("/api/v1/reports/teachers")) ?? null,
  });
  const offerings = useQuery({
    queryKey: ["offerings", "college", term.data?.id],
    enabled: !!term.data,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/offerings", {
          params: { query: { term: term.data!.id, page_size: 100 } },
        }),
      )?.results ?? [],
  });
  const has = (id: number, role: string) =>
    (leaders.data ?? []).some((r) => r.role === role && r.department === id);
  // A department missing its manager or its supervisor needs an appointment.
  const unled = (departments.data ?? []).filter(
    (d) => !has(d.id, "department_manager") || !has(d.id, "department_supervisor"),
  );
  const slow = (teachers.data?.rows ?? []).filter(
    (t) => t.grading_days != null && t.grading_days > (teachers.data?.thresholds.grading_days ?? 3),
  );
  const noTeacher = (offerings.data ?? []).filter(
    (o) => !o.instructors.some((i) => i.role === "teacher"),
  );
  return (
    <PortalShell
      title="الشؤون العلمية"
      subtitle={`${me.data?.full_name_ar ?? ""} · ${count(departments.data?.length ?? 0, N.department)} · هيئة التدريس: ${count(teachers.data?.summary.members ?? 0, N.member)}${term.data ? ` · ${term.data.name_ar}` : ""}`}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div className="space-y-4">
          <SectionLabel>يحتاج قرارك</SectionLabel>
          <Inbox
            items={[
              {
                n: corrections.data ?? 0,
                title: "طلبات تعديل نتائج بانتظار موافقتك",
                meta: "من مسؤول النتائج",
                to: "/result-corrections",
              },
              {
                n: unled.length,
                title: "أقسام تنقصها قيادة",
                meta: unled
                  .map(
                    (d) =>
                      `${d.name_ar} (${[
                        !has(d.id, "department_manager") && "مدير",
                        !has(d.id, "department_supervisor") && "مشرف",
                      ]
                        .filter(Boolean)
                        .join(" و")})`,
                  )
                  .join(" · "),
                to: "/system/users",
                tone: "danger",
              },
              {
                n: slow.length,
                title: "أساتذة تجاوزوا حد زمن التصحيح",
                meta: slow
                  .slice(0, 3)
                  .map((t) => t.name)
                  .join(" · "),
                to: "/hr/teachers",
              },
              {
                n: noTeacher.length,
                title: "مواد بلا أستاذ في الكلية",
                meta: noTeacher
                  .slice(0, 5)
                  .map((o) => o.course_detail.code)
                  .join(" · "),
                // Filtered; the department switch on that page moves between departments.
                to: "/department/courses?filter=teacher",
                tone: "info",
              },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/hr/teachers"
              className="flex items-center gap-2 rounded-2xl bg-surface p-3 text-sm font-semibold shadow-sm hover:bg-surface-alt"
            >
              <BarChart3 size={18} className="text-primary" aria-hidden />
              تقارير الأداء
            </Link>
            <Link
              to="/system/users"
              className="flex items-center gap-2 rounded-2xl bg-surface p-3 text-sm font-semibold shadow-sm hover:bg-surface-alt"
            >
              <UserPlus size={18} className="text-primary" aria-hidden />
              حساب أستاذ / معيد
            </Link>
          </div>
        </div>
        <aside className="mt-6 lg:mt-0">
          <SectionLabel>الأقسام وقياداتها</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(departments.data ?? []).map((d) => {
              const heads = (leaders.data ?? []).filter((r) => r.department === d.id);
              return (
                <div key={d.id} className="px-4 py-3 text-sm">
                  <b className="block text-text">{d.name_ar}</b>
                  {heads.map((r) => (
                    <p key={r.id} className="mt-1 flex items-center gap-2 text-xs">
                      <span className="grid size-6 place-items-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary-700">
                        {initials(r.user_name)}
                      </span>
                      {r.role === "department_manager" ? "مدير القسم" : "مشرف القسم"}: {r.user_name}
                    </p>
                  ))}
                  {!has(d.id, "department_manager") && (
                    <p className="mt-1 text-xs font-semibold text-danger-strong">بلا مدير</p>
                  )}
                  {!has(d.id, "department_supervisor") && (
                    <p className="mt-1 text-xs font-semibold text-danger-strong">بلا مشرف</p>
                  )}
                </div>
              );
            })}
          </Card>
        </aside>
      </div>
    </PortalShell>
  );
}
