import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import { DataTable, type Sort, orderingOf } from "../../components/DataTable";
import { Pager, useServerPages } from "../../components/Pager";
import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  FilterBar,
  Card,
  Chip,
  EmptyState,
  Notice,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { useMe } from "../../lib/auth";
import { can } from "../../lib/nav";
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
  const me = useMe();
  const client = useQueryClient();
  const head = can(me.data, "admissions.manage");
  // Filters live in the URL, so home-page rows link straight to them (?status=, ?who=).
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const who = params.get("who") ?? ""; // "unassigned" | "mine"
  const setFilter = (key: "status" | "who", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const setStatus = (value: string) => setFilter("status", value);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
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
  const list = useServerPages(
    ["applications", status, who, search, orderingOf(sort)],
    async (page) =>
      ok(
        await api.GET("/api/v1/applications", {
          params: {
            query: {
              ...(status ? { status: status as never } : {}),
              ...(who === "unassigned" ? { assigned_registrar__isnull: true } : {}),
              ...(who === "mine" && me.data
                ? { assigned_registrar__public_id: me.data.public_id }
                : {}),
              ...(search ? { search } : {}),
              ...(sort ? { ordering: orderingOf(sort) } : {}),
              page,
            },
          },
        }),
      ),
  );
  // Distributing several at once (head registrar; board DesktopHeadRegistrar).
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
  const distribute = useMutation({
    mutationFn: async () => {
      const failed: string[] = [];
      for (const id of picked) {
        const { data } = await api.POST("/api/v1/applications/{public_id}/assign", {
          params: { path: { public_id: id } },
          body: { registrar: target },
        });
        if (!data) failed.push(id);
      }
      if (failed.length)
        throw {
          detail: `وُزّع ${picked.size - failed.length} وتعذّر ${failed.length}: المسجل ليس من قسم الطلب.`,
        };
    },
    onSettled: () => {
      setPicked(new Set());
      void client.invalidateQueries({ queryKey: ["applications"] });
    },
  });
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulkBar = (
    <Card className="mt-4 flex flex-wrap items-center gap-2 p-3 text-sm">
      <span className="font-semibold">{count(picked.size, N.application)} محددة</span>
      <select
        aria-label="المسجل"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="min-h-11 rounded-lg border border-border bg-surface px-3"
      >
        <option value="">اختر المسجل…</option>
        {(registrars.data ?? []).map((u) => (
          <option key={u.public_id} value={u.public_id}>
            {u.full_name_ar}
          </option>
        ))}
      </select>
      <Button
        className="min-h-11 px-4"
        disabled={!target || distribute.isPending}
        onClick={() => distribute.mutate()}
      >
        {distribute.isPending ? "جارٍ التوزيع…" : "توزيع"}
      </Button>
      <Button variant="ghost" className="min-h-11 px-3" onClick={() => setPicked(new Set())}>
        إلغاء التحديد
      </Button>
    </Card>
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
          {head ? (
            <Chip
              active={who === "unassigned"}
              onClick={() => setFilter("who", who === "unassigned" ? "" : "unassigned")}
            >
              غير موزعة {(s?.unassigned ?? 0).toLocaleString("ar-u-nu-latn")}
            </Chip>
          ) : (
            <Chip
              active={who === "mine"}
              onClick={() => setFilter("who", who === "mine" ? "" : "mine")}
            >
              طلباتي
            </Chip>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="الرقم المرجعي أو الاسم أو البريد"
            aria-label="الرقم المرجعي أو الاسم أو البريد"
            className="min-h-9 flex-1 rounded-full border border-border-soft bg-surface px-3 text-sm sm:max-w-xs"
          />
        </div>
      </FilterBar>
      {distribute.isError && (
        <div className="mt-2">
          <Notice>{problemMessage(distribute.error)}</Notice>
        </div>
      )}
      {!list.items.length ? (
        <Card className="mt-4">
          <EmptyState icon={<FileText size={24} aria-hidden />} title="لا طلبات هنا" />
        </Card>
      ) : (
        <>
          <div className="lg:hidden">
            {head && picked.size > 0 && <div className="mt-4">{bulkBar}</div>}
            <Card className="mt-4 divide-y divide-border-soft">
              {list.items.map((a) => (
                <div key={a.public_id} className="flex items-center">
                  {head && (
                    <label className="grid size-11 shrink-0 place-items-center ps-2">
                      <input
                        type="checkbox"
                        aria-label={`تحديد ${a.full_name}`}
                        checked={picked.has(a.public_id)}
                        onChange={() => toggle(a.public_id)}
                        className="size-4"
                      />
                    </label>
                  )}
                  <Link
                    to={`/applications/${a.public_id}`}
                    className={`grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-3 pe-4 hover:bg-surface-alt ${head ? "ps-1" : "ps-4"}`}
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
                    <span className="col-start-2 row-span-2 row-start-1">
                      <StatusBadge
                        status={STATUS_TONE[a.status] ?? "neutral"}
                        label={STATUS_LABEL[a.status] ?? a.status}
                      />
                    </span>
                  </Link>
                </div>
              ))}
            </Card>
          </div>
          {/* Large screens: a table with sortable headers and the bulk bar (design review B7). */}
          <DataTable
            caption="الطلبات"
            rows={list.items}
            rowId={(a) => a.public_id}
            sort={sort}
            onSort={setSort}
            selection={
              head
                ? { picked, onChange: setPicked, label: (a) => `تحديد ${a.full_name}` }
                : undefined
            }
            bulkBar={<div className="mt-4">{bulkBar}</div>}
            columns={[
              {
                key: "ref",
                header: "الرقم المرجعي",
                sort: "reference_no",
                cell: (a) => (
                  <Link to={`/applications/${a.public_id}`} className="font-mono text-primary">
                    <bdi dir="ltr">{a.reference_no}</bdi>
                  </Link>
                ),
              },
              {
                key: "name",
                header: "المتقدم",
                sort: "full_name",
                cell: (a) => (
                  <Link
                    to={`/applications/${a.public_id}`}
                    className="font-semibold text-text hover:underline"
                  >
                    {a.full_name}
                  </Link>
                ),
              },
              { key: "program", header: "البرنامج", cell: (a) => a.program_name },
              {
                key: "registrar",
                header: "المسجل",
                cell: (a) => a.assigned_registrar_name ?? "غير موزع",
              },
              {
                key: "date",
                header: "التقديم",
                sort: "submitted_at",
                cell: (a) => when(a.submitted_at ?? a.created_at),
              },
              {
                key: "status",
                header: "الحالة",
                sort: "status",
                cell: (a) => (
                  <StatusBadge
                    status={STATUS_TONE[a.status] ?? "neutral"}
                    label={STATUS_LABEL[a.status] ?? a.status}
                  />
                ),
              },
            ]}
          />
        </>
      )}
      <Pager page={list.page} count={list.count} onPage={list.setPage} label="صفحات الطلبات" />
    </PortalShell>
  );
}
