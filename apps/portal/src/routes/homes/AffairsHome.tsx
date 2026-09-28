import { useQuery } from "@tanstack/react-query";
import { Bell, FolderPlus, ScrollText } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, SectionLabel } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { num } from "../../lib/reports";
import { Inbox } from "./Inbox";

const KIND: Record<string, string> = {
  academic: "أك",
  conduct: "سل",
  exam_misconduct: "غش",
  welfare: "اج",
};

/** Board: StudentAffairsHome (phone); desktop derived — actions and acknowledgements beside open cases. */
export function AffairsHome() {
  const me = useMe();
  const reports = useQuery({
    queryKey: ["misconduct-reports", "new"],
    queryFn: async () =>
      (await api.GET("/api/v1/misconduct-reports", { params: { query: { status: "new" } } })).data
        ?.results ?? [],
  });
  const open = useQuery({
    queryKey: ["cases", "open"],
    queryFn: async () =>
      (await api.GET("/api/v1/cases", { params: { query: { status: "open", page_size: 50 } } }))
        .data ?? null,
  });
  const drafts = useQuery({
    queryKey: ["regulations", "draft"],
    queryFn: async () =>
      (await api.GET("/api/v1/regulations", { params: { query: { status: "draft" } } })).data
        ?.results ?? [],
  });
  const required = useQuery({
    queryKey: ["regulations", "required"],
    queryFn: async () =>
      (
        await api.GET("/api/v1/regulations", {
          params: { query: { status: "published", requires_acknowledgement: true } },
        })
      ).data?.results ?? [],
  });
  const affairs = useQuery({
    queryKey: ["reports", "affairs", "home"],
    queryFn: async () => (await api.GET("/api/v1/reports/affairs")).data ?? null,
  });
  const cases = open.data?.results ?? [];
  const stale = cases.filter(
    (c) => Date.now() - new Date(c.created_at).getTime() > 14 * 86_400_000,
  );
  const students = affairs.data?.students ?? 0;
  return (
    <PortalShell
      title="شؤون الطلاب"
      subtitle={`${me.data?.full_name_ar ?? ""} · اللوائح والحالات · ${num(students)} طالبًا`}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div className="space-y-4">
          <SectionLabel>يحتاج إجراءً</SectionLabel>
          <Inbox
            items={[
              {
                n: reports.data?.length ?? 0,
                title: "بلاغات غش جديدة من الأساتذة",
                to: "/cases",
                tone: "danger",
              },
              { n: stale.length, title: "حالات مفتوحة تجاوزت 14 يومًا", to: "/cases" },
              {
                n: drafts.data?.length ?? 0,
                title: "لوائح في المسودة",
                meta: (drafts.data ?? []).map((r) => r.title).join(" · "),
                to: "/regulations",
                tone: "info",
              },
            ]}
          />
          {(required.data ?? []).map((r) => {
            const pct = students ? Math.round((100 * r.acknowledgements_count) / students) : 0;
            return (
              <Card key={r.public_id} className="p-4">
                <div className="flex items-center justify-between text-sm">
                  <b>الإقرارات — {r.title}</b>
                  <span className="font-bold">{num(pct)}٪</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-alt">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  أقرّ {num(r.acknowledgements_count)} من {num(students)} ·{" "}
                  {num(Math.max(0, students - r.acknowledgements_count))} لم يقرّوا
                </p>
              </Card>
            );
          })}
          <SectionLabel>الإجراءات</SectionLabel>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[
              { to: "/regulations/new", label: "نشر لائحة أو ضابط", icon: ScrollText },
              { to: "/notifications/new", label: "إشعار تنظيمي للطلاب", icon: Bell },
              { to: "/cases/new", label: "فتح حالة جديدة", icon: FolderPlus },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="rounded-2xl bg-surface p-3 font-semibold shadow-sm hover:bg-surface-alt"
              >
                <a.icon size={20} className="mx-auto mb-1 text-primary" aria-hidden />
                {a.label}
              </Link>
            ))}
          </div>
        </div>
        <aside className="mt-6 lg:mt-0">
          <SectionLabel>الحالات المفتوحة · {num(open.data?.count ?? 0)}</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {cases.slice(0, 8).map((c) => (
              <Link
                key={c.public_id}
                to={`/cases/${c.public_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning-soft text-xs font-semibold text-warning-strong">
                  {KIND[c.kind] ?? "؟"}
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-sm text-text">{c.title}</b>
                  <span className="text-xs text-text-muted">فُتحت {when(c.created_at)}</span>
                </span>
              </Link>
            ))}
            {!cases.length && <p className="px-4 py-4 text-sm text-text-muted">لا حالات مفتوحة.</p>}
          </Card>
        </aside>
      </div>
    </PortalShell>
  );
}
