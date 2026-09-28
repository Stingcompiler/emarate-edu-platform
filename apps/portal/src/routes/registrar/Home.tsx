import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, FileUp, LayoutTemplate, Users } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, SectionLabel } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { can } from "../../lib/nav";
import { initials, num } from "../../lib/reports";
import { STATUS_LABEL } from "../../lib/visitor";

/** Boards: HeadRegistrarHome and RegistrarHome (phone); desktop derived — counters, action inbox, lists. */
export function RegistrarHome() {
  const me = useMe();
  const client = useQueryClient();
  const head = can(me.data, "admissions.manage");
  const summary = useQuery({
    queryKey: ["applications", "summary"],
    queryFn: async () =>
      (await api.GET("/api/v1/applications/summary")).data as
        | {
            by_status: Record<string, number>;
            by_department: Record<string, number>;
            unassigned: number;
          }
        | undefined,
  });
  const unassigned = useQuery({
    queryKey: ["applications", "unassigned"],
    queryFn: async () =>
      (
        (
          await api.GET("/api/v1/applications", {
            params: { query: { status: "submitted" as never } },
          })
        ).data?.results ?? []
      ).filter((a) => !a.assigned_registrar_name),
  });
  const mine = useQuery({
    queryKey: ["applications", "mine", me.data?.public_id],
    enabled: !!me.data,
    queryFn: async () =>
      (
        await api.GET("/api/v1/applications", {
          params: { query: { assigned_registrar__public_id: me.data!.public_id } },
        })
      ).data ?? null,
  });
  const inquiries = useQuery({
    queryKey: ["inquiries", "open"],
    queryFn: async () =>
      (await api.GET("/api/v1/inquiries", { params: { query: { status: "new" } } })).data?.count ??
      0,
  });
  const registrations = useQuery({
    queryKey: ["registration-requests", "pending"],
    enabled: head,
    queryFn: async () =>
      (
        await api.GET("/api/v1/registration-requests", {
          params: { query: { status: "pending_approval" } },
        })
      ).data ?? null,
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
  const accepted = s.accepted ?? 0;
  const inbox = [
    {
      n: summary.data?.unassigned ?? 0,
      title: "طلبات غير موزعة",
      meta: "تولَّها أو وزّعها على مسجلي الأقسام",
      to: "/applications",
    },
    {
      n: s.eligible ?? 0,
      title: "مؤهلة بانتظار القرار النهائي",
      meta: head ? "القرار لك أو للمسجلين إن فُوّض" : "يقررها مسؤول المسجلين",
      to: "/applications",
    },
    {
      n: accepted,
      title: "مقبولون لم يُحوَّلوا إلى طلاب",
      meta: "تحويل + رقم جامعي + رابط تفعيل",
      to: "/applications",
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
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {[
          "submitted",
          "under_review",
          "missing_documents",
          "accepted",
          "rejected",
          "waitlisted",
        ].map((k) => (
          <Link
            key={k}
            to="/applications"
            className="rounded-2xl bg-surface p-3 text-center shadow-sm hover:bg-surface-alt"
          >
            <p className="text-xl font-bold text-text">{num(s[k] ?? 0)}</p>
            <p className="text-[11px] text-text-muted">{STATUS_LABEL[k] ?? k}</p>
          </Link>
        ))}
      </div>
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
          <SectionLabel>غير مُتولّى · {num(unassigned.data?.length ?? 0)}</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(unassigned.data ?? []).slice(0, 6).map((a) => (
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
                  className="min-h-8 px-3 text-xs"
                  onClick={() => claim.mutate(a.public_id)}
                >
                  تولّي
                </Button>
              </div>
            ))}
            {!unassigned.data?.length && (
              <p className="px-4 py-4 text-sm text-text-muted">كل الطلبات موزعة.</p>
            )}
          </Card>
        </div>
        <aside className="mt-6 space-y-4 lg:mt-0">
          <Card className="p-4">
            <p className="text-3xl font-bold text-primary">{num(mine.data?.count ?? 0)}</p>
            <p className="text-sm text-text-muted">طلبًا أتولاه</p>
          </Card>
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
