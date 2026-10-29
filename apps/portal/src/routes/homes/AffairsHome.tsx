import { ListTodo, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { Panel } from "../../components/dashboard";
import { PortalShell } from "../../components/PortalShell";
import { ActionLinks, Avatar, Card, ListStatus } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when, count, N } from "../../lib/format";
import { num } from "../../lib/reports";
import { Inbox, inboxState } from "./Inbox";
import { ALL } from "../../components/Pager";

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
      ok(
        await api.GET("/api/v1/misconduct-reports", {
          params: { query: { ...ALL, status: "new" } },
        }),
      )?.results ?? [],
  });
  const open = useQuery({
    queryKey: ["cases", "open"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/cases", { params: { query: { status: "open", page_size: 50 } } }),
      ) ?? null,
  });
  const drafts = useQuery({
    queryKey: ["regulations", "draft"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/regulations", { params: { query: { ...ALL, status: "draft" } } }))
        ?.results ?? [],
  });
  const required = useQuery({
    queryKey: ["regulations", "required"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/regulations", {
          params: { query: { ...ALL, status: "published", requires_acknowledgement: true } },
        }),
      )?.results ?? [],
  });
  const affairs = useQuery({
    queryKey: ["reports", "affairs", "home"],
    queryFn: async () => ok(await api.GET("/api/v1/reports/affairs")) ?? null,
  });
  const cases = open.data?.results ?? [];
  const stale = cases.filter(
    (c) => Date.now() - new Date(c.created_at).getTime() > 14 * 86_400_000,
  );
  const students = affairs.data?.students ?? 0;
  return (
    <PortalShell
      title="شؤون الطلاب"
      subtitle={`${me.data?.full_name_ar ?? ""} · اللوائح والحالات · ${count(students, N.student)}`}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div className="space-y-4">
          <Inbox
            title="يحتاج إجراءً"
            icon={ListTodo}
            {...inboxState(reports, open, drafts)}
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
                  <div className="motion-grow h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  أقرّ {num(r.acknowledgements_count)} من {num(students)} ·{" "}
                  {num(Math.max(0, students - r.acknowledgements_count))} لم يقرّوا
                </p>
              </Card>
            );
          })}
          <ActionLinks
            title="الإجراءات"
            icon={Zap}
            items={[
              { to: "/regulations/new", label: "نشر لائحة أو ضابط" },
              { to: "/notifications/new", label: "إشعار تنظيمي للطلاب" },
              { to: "/cases/new", label: "فتح حالة جديدة" },
            ]}
          />
        </div>
        <aside className="mt-6 lg:mt-0">
          <Panel title={`الحالات المفتوحة · ${num(open.data?.count ?? 0)}`}>
            {cases.slice(0, 8).map((c) => (
              <Link
                key={c.public_id}
                to={`/cases/${c.public_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <Avatar text={KIND[c.kind] ?? "؟"} tone="warning" />
                <span className="min-w-0">
                  <b className="block truncate text-sm text-text">{c.title}</b>
                  <span className="text-xs text-text-muted">فُتحت {when(c.created_at)}</span>
                </span>
              </Link>
            ))}
            <ListStatus
              hasItems={cases.length > 0}
              loading={open.isLoading}
              failed={open.isError}
              onRetry={() => void open.refetch()}
              empty="لا حالات مفتوحة."
            />
          </Panel>
        </aside>
      </div>
    </PortalShell>
  );
}
