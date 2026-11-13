import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { PortalShell } from "../components/PortalShell";
import { Avatar, Card, Notice, problemMessage, SectionLabel } from "../components/ui";
import { ROUTE_ACCESS } from "../lib/access";
import { api, ok } from "../lib/api";
import { useMe } from "../lib/auth";
import { count, DEGREE, N } from "../lib/format";
import { initials, num } from "../lib/reports";
import { siteLink, siteUrl } from "../lib/site";
import { LeadCard } from "./DepartmentPage";

const LEADS = [
  { role: "program_manager", label: "رئيس البرنامج" },
  { role: "program_supervisor", label: "مشرف البرنامج" },
] as const;

/**
 * One programme on a page of its own (owner, 2026-11-13): coordination is by programme — each
 * has its head and supervisor, appointed here from existing accounts by whoever may grant the
 * role (rbac.GRANTS); the department is only its container. With them: the programme's facts,
 * its courses this term and the staff linked to it. No board: derived from docs/06 §9, laid
 * out like the department's page — one column on phones; on large screens the details beside
 * the leadership.
 */
export function ProgramPage() {
  const id = Number(useParams().id);
  const me = useMe();
  const program = useQuery({
    queryKey: ["programs", id],
    queryFn: async () =>
      ok(await api.GET("/api/v1/programs/{id}", { params: { path: { id } } })) ?? null,
  });
  const p = program.data;
  const leaders = useQuery({
    queryKey: ["program-leaders", id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/programs/{program_id}/leaders", {
          params: { path: { program_id: id } },
        }),
      ) ?? [],
  });
  const members = useQuery({
    queryKey: ["members", p?.department],
    enabled: !!p,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/departments/{department_id}/members", {
          params: { path: { department_id: p!.department } },
        }),
      ) ?? [],
  });
  const courses = useQuery({
    queryKey: ["courses", "program", id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/courses", {
          params: { query: { program: id, page_size: 100 } as never },
        }),
      )?.results ?? [],
  });
  const staff = (members.data ?? []).filter((m) => m.program === id);
  const grantable = me.data?.grantable_roles ?? [];
  const manage = !!me.data && ROUTE_ACCESS["/department/teachers"]!(me.data);
  return (
    <PortalShell
      title={p?.name_ar ?? "البرنامج"}
      subtitle={
        p
          ? [
              p.code,
              DEGREE[p.degree] ?? p.degree,
              p.is_active === false ? "موقوف" : null,
              count(staff.length, N.member),
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      back={p ? { label: p.department_name, to: `/departments/${p.department}` } : undefined}
    >
      {program.isError && <Notice>{problemMessage(program.error)}</Notice>}
      {p && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <section aria-labelledby="prog-about">
              <SectionLabel>
                <span id="prog-about">عن البرنامج</span>
              </SectionLabel>
              <Card className="space-y-3 p-4 text-sm">
                <p className="text-text-muted">
                  المستويات: {num(p.levels_count)} · الفصول: {num(p.duration_terms)}
                  {p.total_credit_hours ? ` · الساعات: ${num(p.total_credit_hours)}` : ""}
                </p>
                <p className={p.description_ar ? "leading-7" : "text-text-muted"}>
                  {p.description_ar || "لا وصف بعد."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {p.is_active !== false && (
                    <a
                      {...siteLink(siteUrl(`/ar/programs/${p.code}/`))}
                      className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold text-primary hover:bg-surface-alt"
                    >
                      صفحته على موقع الكلية
                    </a>
                  )}
                  {manage && (
                    <Link
                      to={`/department/courses?department=${p.department}`}
                      className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold text-primary hover:bg-surface-alt"
                    >
                      المواد والتعيينات
                    </Link>
                  )}
                </div>
              </Card>
            </section>
            <section aria-labelledby="prog-courses">
              <SectionLabel>
                <span id="prog-courses">مواد البرنامج · {num(courses.data?.length ?? 0)}</span>
              </SectionLabel>
              <Card className="divide-y divide-border-soft">
                {(courses.data ?? []).map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 text-sm">
                      <bdi className="block font-mono text-xs text-text-muted">{c.code}</bdi>
                      <b className="block">{c.name_ar}</b>
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">
                      المستوى {num(c.default_level ?? 1)}
                    </span>
                  </div>
                ))}
                {!courses.data?.length && (
                  <p className="px-4 py-3 text-sm text-text-muted">لا مواد بعد.</p>
                )}
              </Card>
            </section>
            <section aria-labelledby="prog-staff">
              <SectionLabel>
                <span id="prog-staff">أساتذة البرنامج · {num(staff.length)}</span>
              </SectionLabel>
              <Card className="divide-y divide-border-soft">
                {staff.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar text={initials(m.user.full_name_ar)} size="sm" tone="primary" />
                    <span className="min-w-0 text-sm">
                      <b className="block truncate">{m.user.full_name_ar}</b>
                      <span className="text-xs text-text-muted">
                        {m.kind === "ta" ? "معيد" : "أستاذ"}
                      </span>
                    </span>
                  </div>
                ))}
                {!staff.length && (
                  <p className="px-4 py-3 text-sm text-text-muted">لا أساتذة مرتبطون به بعد.</p>
                )}
              </Card>
              {manage && (
                <Link
                  to={`/department/teachers?department=${p.department}`}
                  className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-primary"
                >
                  ربط أستاذ بالبرنامج أو فكّه
                </Link>
              )}
            </section>
          </div>
          <aside className="min-w-0 space-y-3" aria-labelledby="prog-leads">
            <SectionLabel>
              <span id="prog-leads">قيادة البرنامج</span>
            </SectionLabel>
            {LEADS.map((lead) => (
              <LeadCard
                key={lead.role}
                department={p.department}
                program={id}
                role={lead.role}
                label={lead.label}
                holders={(leaders.data ?? []).filter((r) => r.role === lead.role)}
                canAppoint={grantable.includes(lead.role)}
              />
            ))}
          </aside>
        </div>
      )}
    </PortalShell>
  );
}
