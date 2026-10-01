import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, FileUp, LayoutTemplate, Users } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, SectionLabel } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { can } from "../../lib/nav";
import { initials, num } from "../../lib/reports";
import { STATUS_LABEL } from "../../lib/visitor";
import { ALL } from "../../components/Pager";

/** Boards: HeadRegistrarHome and RegistrarHome (phone), DesktopHeadRegistrar — the applications'
 *  path as one bar, the action inbox, and (for the head) each registrar's load. */
export function RegistrarHome() {
  const me = useMe();
  const client = useQueryClient();
  const head = can(me.data, "admissions.manage");
  const summary = useQuery({
    queryKey: ["applications", "summary"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/applications/summary")) as
        | {
            by_status: Record<string, number>;
            by_department: Record<string, number>;
            unassigned: number;
            by_registrar?: Record<string, number>;
          }
        | undefined,
  });
  // Unassigned and «mine», filtered and counted by the server; a few shown here.
  const unassigned = useQuery({
    queryKey: ["applications", "unassigned"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/applications", {
          params: {
            query: { status: "submitted" as never, assigned_registrar__isnull: true, page_size: 6 },
          },
        }),
      ) ?? null,
  });
  const mine = useQuery({
    queryKey: ["applications", "mine", me.data?.public_id],
    enabled: !!me.data,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/applications", {
          params: { query: { assigned_registrar__public_id: me.data!.public_id, page_size: 5 } },
        }),
      ) ?? null,
  });
  const inquiries = useQuery({
    queryKey: ["inquiries", "open"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/inquiries", { params: { query: { ...ALL, status: "new" } } }))
        ?.count ?? 0,
  });
  const registrations = useQuery({
    queryKey: ["registration-requests", "pending"],
    enabled: head,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/registration-requests", {
          params: { query: { ...ALL, status: "pending_approval" } },
        }),
      ) ?? null,
  });
  // Registrars and their current load (board DesktopHeadRegistrar): the head's view only.
  const registrars = useQuery({
    queryKey: ["users", "registrars"],
    enabled: head,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/users", {
          params: { query: { is_active: true, role: "registrar", page_size: 100 } },
        }),
      )?.results ?? [],
  });
  const claim = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST("/api/v1/applications/{public_id}/claim", {
        params: { path: { public_id: id } },
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["applications"] }),
  });
  const s = summary.data?.by_status ?? {};
  // The applications' path as one bar (board DesktopHeadRegistrar), each stage linking to its list.
  const PIPELINE = [
    { key: "submitted", bar: "bg-primary-300" },
    { key: "under_review", bar: "bg-primary" },
    { key: "missing_documents", bar: "bg-warning" },
    { key: "eligible", bar: "bg-primary-800" },
    { key: "accepted", bar: "bg-success" },
    { key: "rejected", bar: "bg-danger" },
    { key: "waitlisted", bar: "bg-n300" },
  ].map((p) => ({ ...p, n: s[p.key] ?? 0 }));
  const pipelineTotal = PIPELINE.reduce((n, p) => n + p.n, 0);
  const load = summary.data?.by_registrar ?? {};
  const busiest = Math.max(1, ...Object.values(load));
  const accepted = s.accepted ?? 0;
  const inbox = [
    {
      n: summary.data?.unassigned ?? 0,
      title: "طلبات غير موزعة",
      meta: head ? "تولَّها أو وزّعها على مسجلي الأقسام" : "تولَّ ما يخص أقسامك لتراجعه",
      to: "/applications?who=unassigned",
    },
    {
      n: s.eligible ?? 0,
      title: "مؤهلة بانتظار القرار النهائي",
      meta: head ? "القرار لك أو للمسجلين إن فُوّض" : "يقررها مسؤول المسجلين",
      to: "/applications?status=eligible",
    },
    {
      n: accepted,
      title: "مقبولون لم يُحوَّلوا إلى طلاب",
      meta: "تحويل + رقم جامعي + رابط تفعيل",
      to: "/applications?status=accepted",
    },
    ...(head
      ? [
          {
            n: registrations.data?.count ?? 0,
            title: "طلبات تسجيل طلاب حاليين",
            meta: "يعتمدها مديرو الأقسام؛ أنت بديل",
            to: "/department/approvals",
          },
        ]
      : []),
    {
      n: inquiries.data ?? 0,
      title: "استفسارات بلا رد",
      meta: "قبول وبرامج أقسامك · رد بريدي أو WhatsApp",
      to: "/inquiries",
    },
  ].filter((x) => x.n);
  return (
    <PortalShell
      title={head ? "لوحة القبول" : "القبول — أقسامي"}
      subtitle={`${me.data?.full_name_ar ?? ""} · ${head ? "مسؤول المسجلين" : "مسجل"}`}
    >
      <Card className="p-4">
        <p className="text-sm font-semibold text-text">مسار الطلبات · {num(pipelineTotal)}</p>
        {pipelineTotal > 0 && (
          <div
            className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-alt"
            aria-hidden="true"
          >
            {PIPELINE.filter((p) => p.n).map((p) => (
              <span
                key={p.key}
                className={p.bar}
                style={{ width: `${(100 * p.n) / pipelineTotal}%` }}
              />
            ))}
          </div>
        )}
        <div className="mt-3 grid grid-cols-4 gap-1 sm:gap-2 lg:grid-cols-7">
          {PIPELINE.map((p) => (
            <Link
              key={p.key}
              to={`/applications?status=${p.key}`}
              className="rounded-xl px-2 py-1.5 hover:bg-surface-alt"
            >
              <b className="block text-lg text-text">{num(p.n)}</b>
              <span className="flex items-center gap-1 text-[11px] text-text-muted">
                <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${p.bar}`} />
                {STATUS_LABEL[p.key] ?? p.key}
              </span>
            </Link>
          ))}
        </div>
      </Card>
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <div className="space-y-4">
          <SectionLabel>يحتاج إجراءك</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {inbox.map((i) => (
              <Link
                key={i.title}
                to={i.to}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft font-bold text-warning-strong">
                  {num(i.n)}
                </span>
                <span className="min-w-0">
                  <b className="block text-sm text-text">{i.title}</b>
                  <span className="text-xs text-text-muted">{i.meta}</span>
                </span>
              </Link>
            ))}
            {!inbox.length && <p className="px-4 py-4 text-sm text-text-muted">لا شيء بانتظارك.</p>}
          </Card>
          <SectionLabel>غير مُتولّى · {num(unassigned.data?.count ?? 0)}</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(unassigned.data?.results ?? []).map((a) => (
              <div key={a.public_id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                  {initials(a.full_name)}
                </span>
                <Link to={`/applications/${a.public_id}`} className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{a.full_name}</b>
                  <span className="text-xs text-text-muted">
                    <bdi>{a.reference_no}</bdi> · {a.program_name} ·{" "}
                    {when(a.submitted_at ?? a.created_at)}
                  </span>
                </Link>
                <Button
                  variant="secondary"
                  className="min-h-9 px-3 text-xs"
                  onClick={() => claim.mutate(a.public_id)}
                  disabled={claim.isPending}
                >
                  تولّي
                </Button>
              </div>
            ))}
            {!unassigned.data?.count && (
              <p className="px-4 py-4 text-sm text-text-muted">كل الطلبات موزعة.</p>
            )}
          </Card>
        </div>
        <aside className="mt-6 space-y-4 lg:mt-0">
          {/* «طلباتي — تحتاج إجراء» (board RegistrarHome). */}
          <Card className="divide-y divide-border-soft">
            <Link
              to="/applications?who=mine"
              className="flex items-baseline gap-2 p-4 hover:bg-surface-alt"
            >
              <span className="text-3xl font-bold text-primary">{num(mine.data?.count ?? 0)}</span>
              <span className="text-sm text-text-muted">طلبات أتولاها</span>
            </Link>
            {(mine.data?.results ?? []).map((a) => (
              <Link
                key={a.public_id}
                to={`/applications/${a.public_id}`}
                className="block px-4 py-3 text-sm hover:bg-surface-alt"
              >
                <b className="block truncate text-text">{a.full_name}</b>
                <span className="text-xs text-text-muted">
                  <bdi>{a.reference_no}</bdi> · {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </Link>
            ))}
          </Card>
          {head && (registrars.data ?? []).length > 0 && (
            <>
              <div className="flex items-end justify-between">
                <SectionLabel>المسجلون · الحمل الحالي</SectionLabel>
                <Link to="/registrars" className="mb-2 text-sm font-semibold text-primary">
                  إدارة
                </Link>
              </div>
              <Card className="divide-y divide-border-soft text-sm">
                {(registrars.data ?? []).map((u) => {
                  const n = load[u.public_id] ?? 0;
                  const depts = u.roles
                    .filter((r) => r.role === "registrar" && r.department)
                    .map((r) => r.department_name);
                  return (
                    <div key={u.public_id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                        {initials(u.full_name_ar)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-text">{u.full_name_ar}</b>
                        <span
                          className={`text-xs ${depts.length ? "text-text-muted" : "text-warning-strong"}`}
                        >
                          {depts.join(" · ") || "بلا قسم"}
                        </span>
                      </span>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-alt">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(100 * n) / busiest}%` }}
                        />
                      </span>
                      <b className="w-8 text-end">{num(n)}</b>
                    </div>
                  );
                })}
              </Card>
            </>
          )}
          {head && (
            <>
              <SectionLabel>الإدارة</SectionLabel>
              <Card className="divide-y divide-border-soft text-sm">
                {[
                  {
                    to: "/admissions/cycles",
                    label: "دورات القبول والبرامج المفتوحة",
                    icon: CalendarRange,
                  },
                  { to: "/admissions/forms", label: "قوالب نماذج التقديم", icon: LayoutTemplate },
                  { to: "/registrars", label: "المسجلون وأقسامهم", icon: Users },
                  { to: "/student-imports", label: "استيراد سجل الطلاب", icon: FileUp },
                ].map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                  >
                    <l.icon size={18} className="text-primary" aria-hidden />
                    {l.label}
                  </Link>
                ))}
              </Card>
            </>
          )}
          {head && summary.data && (
            <>
              <SectionLabel>حسب القسم</SectionLabel>
              <Card className="divide-y divide-border-soft text-sm">
                {Object.entries(summary.data.by_department).map(([d, n]) => (
                  <div key={d} className="flex justify-between px-4 py-2.5">
                    <span>{d}</span>
                    <b>{num(n)}</b>
                  </div>
                ))}
              </Card>
            </>
          )}
        </aside>
      </div>
    </PortalShell>
  );
}
