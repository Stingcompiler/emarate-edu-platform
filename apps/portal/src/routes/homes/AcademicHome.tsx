import { ListTodo, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { ActionLinks, Avatar, Card, SectionLabel } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm } from "../../lib/department";
import { initials, useDepartments } from "../../lib/reports";
import { Inbox, inboxState } from "./Inbox";
import { count, N } from "../../lib/format";
import { ALL } from "../../components/Pager";

/** Boards: AcademicAffairsHome (phone), DesktopAcademicAffairs — the departments' leadership as
 *  cards, then the decisions waiting. */
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
      const get = async (
        role:
          "department_manager" | "department_supervisor" | "program_manager" | "program_supervisor",
      ) =>
        ok(
          await api.GET("/api/v1/role-assignments", {
            params: { query: { role, page_size: 100 } },
          }),
        )?.results ?? [];
      return [
        ...(await get("department_manager")),
        ...(await get("department_supervisor")),
        ...(await get("program_manager")),
        ...(await get("program_supervisor")),
      ];
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
  // Coordination is by programme (owner, 2026-11-13): every programme has its head, unless its
  // department has a manager, who then runs all its programmes. One with neither needs an
  // appointment.
  const programs = useQuery({
    queryKey: ["programs", "all"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/programs", { params: { query: { page_size: 100 } as never } }))
        ?.results ?? [],
  });
  const headed = (program: number) =>
    (leaders.data ?? []).some((r) => r.role === "program_manager" && r.program === program);
  const unled = (programs.data ?? []).filter(
    (p) => p.is_active !== false && !headed(p.id) && !has(p.department, "department_manager"),
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
      {/* What needs a decision first at every size (mockups 2026-10-29: a home starts with the
          pending work); the departments and their leadership after it. */}
      <div className="flex flex-col">
        <div className="order-2">
          <SectionLabel>
            الأقسام وقياداتها · {count(departments.data?.length ?? 0, N.department)}
          </SectionLabel>
          {/* One card per line on phones: two side by side cut the leaders' names. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(departments.data ?? []).map((d) => {
              const heads = (leaders.data ?? []).filter((r) => r.department === d.id);
              const own = (programs.data ?? []).filter((p) => p.department === d.id);
              const waiting = unled.filter((p) => p.department === d.id);
              return (
                <Card key={d.id} className="px-4 py-3 text-sm">
                  {/* Its own page: details, staff, and appointing its head and supervisor
                      (review 2026-11-12). */}
                  <Link
                    to={`/departments/${d.id}`}
                    className="block font-semibold text-primary hover:underline"
                  >
                    {d.name_ar}
                  </Link>
                  {heads.map((r) => (
                    <p key={r.id} className="mt-1 flex items-center gap-2 text-xs">
                      <Avatar text={initials(r.user_name)} size="sm" tone="primary" />
                      {r.role === "department_manager" ? "مدير القسم" : "مشرف القسم"}: {r.user_name}
                    </p>
                  ))}
                  <p className="mt-1 text-xs text-text-muted">{count(own.length, N.program)}</p>
                  {waiting.length > 0 && (
                    <p className="mt-1 text-xs font-semibold text-danger-strong">
                      بلا رئيس: {waiting.map((p) => p.name_ar).join("، ")}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
        {/* Large screens: the decisions beside the shortcuts (a 3xl column left half the row
          empty). */}
        <div className="order-1 mb-6 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6">
          <div>
            <Inbox
              title="يحتاج قرارك"
              icon={ListTodo}
              {...inboxState(departments, term, corrections, leaders, teachers, offerings)}
              items={[
                {
                  n: corrections.data ?? 0,
                  title: "طلبات تعديل نتائج بانتظار موافقتك",
                  meta: "من مسؤول النتائج",
                  to: "/result-corrections",
                },
                {
                  n: unled.length,
                  title: "برامج بلا رئيس",
                  meta: unled
                    .slice(0, 4)
                    .map((p) => p.name_ar)
                    .join(" · "),
                  // The first of them on its own page, where its head is appointed.
                  to: unled.length ? `/programs/${unled[0]!.id}` : "/system/users",
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
          </div>
          <div className="mt-6 lg:mt-0">
            <ActionLinks
              title="اختصارات"
              icon={Zap}
              items={[
                { to: "/hr/teachers", label: "تقارير الأداء" },
                { to: "/system/users", label: "المستخدمون والأدوار" },
              ]}
            />
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
