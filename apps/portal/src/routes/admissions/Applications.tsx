import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Pager, useServerPages } from "../../components/Pager";
import { PortalShell } from "../../components/PortalShell";
import { FilterBar, Card, Chip, EmptyState, StatusBadge } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when, count, N } from "../../lib/format";
import { STATUS_LABEL, STATUS_TONE } from "../../lib/visitor";

const FILTERS = [
  { key: "", label: "الكل" },
  { key: "submitted", label: "جديدة" },
  { key: "under_review", label: "قيد المراجعة" },
  { key: "missing_documents", label: "ناقصة" },
  { key: "eligible", label: "مؤهلة للقرار" },
  { key: "accepted", label: "مقبولة" },
];

/** Boards: HeadRegistrarApplications, RegistrarHome (phone), DesktopHeadRegistrar (desktop: counters + table). */
export function Applications() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const summary = useQuery({
    queryKey: ["applications", "summary"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/applications/summary")) as
        | {
            by_status: Record<string, number>;
            by_department: Record<string, number>;
            unassigned: number;
          }
        | undefined,
  });
  // 10 per page from the server; the filters go with the request.
  const list = useServerPages(["applications", status, search], async (page) =>
    ok(
      await api.GET("/api/v1/applications", {
        params: {
          query: {
            ...(status ? { status: status as never } : {}),
            ...(search ? { search } : {}),
            page,
          },
        },
      }),
    ),
  );
  const s = summary.data;
  const total = s ? Object.values(s.by_status).reduce((a, b) => a + b, 0) : 0;
  return (
    <PortalShell
      title="الطلبات"
      subtitle={
        s
          ? `${count(total, N.application)} · غير موزعة ${s.unassigned.toLocaleString("ar-u-nu-latn")}`
          : undefined
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["submitted", "جديدة"],
          ["missing_documents", "ناقصة"],
          ["eligible", "مؤهلة للقرار"],
          ["accepted", "مقبولة"],
        ].map(([k, l]) => (
          <Card key={k} className="px-4 py-3">
            <p className="text-2xl font-bold text-text">
              {(s?.by_status[k!] ?? 0).toLocaleString("ar-u-nu-latn")}
            </p>
            <p className="text-xs text-text-muted">{l}</p>
          </Card>
        ))}
      </div>
      <FilterBar>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
              {f.label}
            </Chip>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="الرقم المرجعي أو الاسم أو البريد"
            className="min-h-9 flex-1 rounded-full border border-border-soft bg-surface px-3 text-sm sm:max-w-xs"
          />
        </div>
      </FilterBar>
      {!list.items.length ? (
        <Card className="mt-4">
          <EmptyState icon={<FileText size={24} aria-hidden />} title="لا طلبات هنا" />
        </Card>
      ) : (
        <Card className="mt-4 divide-y divide-border-soft">
          <div className="hidden grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_140px_120px] gap-3 bg-surface-alt px-4 py-2 text-xs text-text-muted lg:grid">
            <span>الرقم المرجعي</span>
            <span>المتقدم</span>
            <span>البرنامج</span>
            <span>المسجل</span>
            <span>الحالة</span>
          </div>
          {list.items.map((a) => (
            <Link
              key={a.public_id}
              to={`/applications/${a.public_id}`}
              className="grid gap-x-3 gap-y-0.5 px-4 py-3 hover:bg-surface-alt lg:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_140px_120px] lg:items-center"
            >
              <span className="text-xs text-text-muted">
                <bdi className="font-mono">{a.reference_no}</bdi> ·{" "}
                {when(a.submitted_at ?? a.created_at)}
              </span>
              <span className="text-sm font-semibold text-text">{a.full_name}</span>
              <span className="text-sm text-text-muted">{a.program_name}</span>
              <span className="text-xs text-text-muted">
                {a.assigned_registrar_name ?? "غير موزع"}
              </span>
              <span>
                <StatusBadge
                  status={STATUS_TONE[a.status] ?? "neutral"}
                  label={STATUS_LABEL[a.status] ?? a.status}
                />
              </span>
            </Link>
          ))}
        </Card>
      )}
      <Pager page={list.page} count={list.count} onPage={list.setPage} label="صفحات الطلبات" />
    </PortalShell>
  );
}
