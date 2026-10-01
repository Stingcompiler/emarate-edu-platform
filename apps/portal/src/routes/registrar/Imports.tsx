import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Notice,
  StatusBadge,
  problemMessage,
  ScrollRegion,
  WithSide,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when, count, N } from "../../lib/format";
import { downloadCsv, num } from "../../lib/reports";
import { asForm, formData } from "../../lib/upload";
import { Pager, useServerPages } from "../../components/Pager";

export const IMPORT_STATUS: Record<string, string> = {
  validated: "جاهز للاعتماد",
  has_errors: "به أخطاء",
  committed: "معتمد",
  rejected: "مرفوض",
};

type Summary = {
  rows?: number;
  create?: number;
  update?: number;
  skip?: number;
  error?: number;
  created?: number;
  updated?: number;
};

// The importer's columns (backend students/importer.py HEADERS): the first four are required.
const TEMPLATE = [
  "الرقم الجامعي",
  "الاسم",
  "رمز البرنامج",
  "المستوى",
  "البريد",
  "الهاتف",
  "الجنس",
  "تاريخ الميلاد",
  "الرقم الوطني",
];
const REQUIRED_COLUMNS = 4;

/** Board: DesktopStudentsImport step 1 — upload (Excel/CSV), then preview per batch; the steps,
 *  the columns and a blank template beside them on large screens. */
export function StudentImports() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  // 10 per page from the server (docs: owner 2026-09-29).
  const list = useServerPages(["student-imports"], async (page) =>
    ok(await api.GET("/api/v1/student-imports", { params: { query: { page } } })),
  );
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { data, error } = await api.POST("/api/v1/student-imports", {
        body: formData({ file }) as never,
        ...asForm,
      });
      if (!data) throw error;
      return data.public_id;
    },
    onSuccess: (id) => navigate(`/student-imports/${id}`),
  });
  return (
    <PortalShell
      title="استيراد سجل الطلاب"
      subtitle="رفع الملف ← الأعمدة المكتشفة ← المعاينة ← الاعتماد"
      back={{ label: "سجل الطلاب", to: "/students" }}
    >
      <WithSide
        side={
          <>
            <Card className="p-4 text-sm">
              <h2 className="font-semibold text-text">الخطوات</h2>
              <ol className="mt-2 space-y-1.5 text-text-muted">
                {["رفع الملف", "الأعمدة المكتشفة", "المعاينة: إنشاء وتحديث وأخطاء", "الاعتماد"].map(
                  (step, i) => (
                    <li key={step} className="flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-700">
                        {num(i + 1)}
                      </span>
                      {step}
                    </li>
                  ),
                )}
              </ol>
              <p className="mt-3 text-xs leading-relaxed text-text-muted">
                لا يتغير شيء قبل الاعتماد. الخلية الفارغة لا تمحو قيمة موجودة، والصفوف الخاطئة
                تُصدَّر لتصحيحها وإعادة رفعها.
              </p>
            </Card>
            <Card className="p-4 text-sm">
              <h2 className="font-semibold text-text">الأعمدة</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {TEMPLATE.map((c, i) => (
                  <li
                    key={c}
                    className={`rounded-full px-2.5 py-1 text-xs ${i < REQUIRED_COLUMNS ? "bg-primary-soft font-semibold text-primary-700" : "bg-surface-alt text-text-muted"}`}
                  >
                    {c}
                    {i < REQUIRED_COLUMNS ? " *" : ""}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => downloadCsv("students-template", TEMPLATE, [])}
                className="mt-3 text-sm font-semibold text-primary hover:underline"
              >
                تنزيل القالب الفارغ (CSV)
              </button>
            </Card>
          </>
        }
      >
        <Card className="p-5">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border p-8 text-sm text-text-muted hover:bg-surface-alt"
            disabled={upload.isPending}
          >
            <FileUp size={28} aria-hidden />
            {upload.isPending ? "يُتحقق من الملف…" : "اختر ملف .xlsx أو .csv"}
            <span className="text-xs">
              الأعمدة: الرقم الجامعي، الاسم، البرنامج، المستوى، البريد… يُتحقق منها قبل أي تغيير.
            </span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv"
            hidden
            onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
          />
          {upload.isError && (
            <div className="mt-3">
              <Notice>{problemMessage(upload.error)}</Notice>
            </div>
          )}
        </Card>
        <Card className="mt-4 divide-y divide-border-soft">
          {list.items.map((b) => {
            const s = (b.summary ?? {}) as Summary;
            return (
              <Link
                key={b.public_id}
                to={`/student-imports/${b.public_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{b.file_name}</b>
                  <span className="text-xs text-text-muted">
                    {b.uploaded_by} · {when(b.created_at)} · {count(s.rows ?? 0, N.row)} · إنشاء{" "}
                    {num(s.create ?? 0)} · تحديث {num(s.update ?? 0)} · أخطاء {num(s.error ?? 0)}
                  </span>
                </span>
                <StatusBadge status={b.status} label={IMPORT_STATUS[b.status] ?? b.status} />
              </Link>
            );
          })}
          {!list.items.length && <p className="px-4 py-4 text-sm text-text-muted">لا دفعات بعد.</p>}
        </Card>
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </WithSide>
    </PortalShell>
  );
}

const ACTION: Record<string, [string, string]> = {
  create: ["إنشاء", "text-success-strong"],
  update: ["تحديث", "text-info-strong"],
  skip: ["بلا تغيير", "text-text-muted"],
  error: ["خطأ", "text-danger-strong"],
};

/** Board: DesktopStudentsImport steps 3–4 — preview rows, then commit or reject. */
export function StudentImportDetail() {
  const { id = "" } = useParams();
  return <ImportDetailBody id={id} />;
}

function ImportDetailBody({ id }: { id: string }) {
  const client = useQueryClient();
  const path = { params: { path: { public_id: id } } };
  const batch = useQuery({
    queryKey: ["student-imports", id],
    queryFn: async () => ok(await api.GET("/api/v1/student-imports/{public_id}", path)) ?? null,
  });
  const rows = useQuery({
    queryKey: ["student-imports", id, "rows"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/student-imports/{public_id}/rows", {
          ...path,
          params: { ...path.params, query: { page_size: 100 } },
        }),
      )?.results ?? [],
  });
  const [filter, setFilter] = useState<string>("");
  const programs = useQuery({
    queryKey: ["programs", "all"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/programs", { params: { query: { page_size: 100 } as never } }))
        ?.results ?? [],
  });
  const programName = (id: unknown) =>
    programs.data?.find((p) => p.id === Number(id))?.name_ar ?? "";
  const act = useMutation({
    mutationFn: async (kind: "commit" | "reject") => {
      const res =
        kind === "commit"
          ? await api.POST("/api/v1/student-imports/{public_id}/commit", path)
          : await api.POST("/api/v1/student-imports/{public_id}/reject", path);
      if (!res.response.ok) throw (res as { error?: unknown }).error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["student-imports"] }),
  });
  const b = batch.data;
  const s = (b?.summary ?? {}) as Summary;
  const shown = (rows.data ?? []).filter((r) => !filter || r.action === filter);
  return (
    <PortalShell
      title={b ? b.file_name : "دفعة استيراد"}
      subtitle={
        b ? `${IMPORT_STATUS[b.status] ?? b.status} · ${count(s.rows ?? 0, N.row)}` : undefined
      }
      back={{ label: "الاستيراد", to: "/student-imports" }}
    >
      {b && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["", `الكل ${num(s.rows ?? 0)}`],
              ["create", `إنشاء ${num(s.create ?? 0)}`],
              ["update", `تحديث ${num(s.update ?? 0)}`],
              ["error", `أخطاء ${num(s.error ?? 0)}`],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k!)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filter === k ? "bg-text text-bg" : "border border-border-soft bg-surface"}`}
              >
                {l}
              </button>
            ))}
            {b.status === "validated" && (
              <div className="ms-auto flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => act.mutate("reject")}
                  disabled={act.isPending}
                >
                  إلغاء
                </Button>
                <Button onClick={() => act.mutate("commit")} disabled={act.isPending}>
                  اعتماد: {num(s.create ?? 0)} إنشاء · {num(s.update ?? 0)} تحديث
                </Button>
              </div>
            )}
          </div>
          {b.status === "has_errors" && (
            <div className="mt-3">
              <Notice>في الملف أخطاء — صحّحها وارفع الملف من جديد؛ لا يُعتمد ملف به أخطاء.</Notice>
            </div>
          )}
          {b.status === "committed" && (
            <div className="mt-3">
              <Notice tone="success">
                اعتُمد: {num(s.created ?? 0)} إنشاء · {num(s.updated ?? 0)} تحديث.
              </Notice>
            </div>
          )}
          {act.isError && (
            <div className="mt-3">
              <Notice>{problemMessage(act.error)}</Notice>
            </div>
          )}
          <Card className="mt-4">
            <ScrollRegion label="صفوف الملف">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-surface-alt text-xs text-text-muted">
                  <tr>
                    {[
                      "#",
                      "الرقم الجامعي",
                      "الاسم",
                      "البرنامج",
                      "المستوى",
                      "البريد",
                      "الإجراء",
                    ].map((h) => (
                      <th key={h} className="px-3 py-2 text-start font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {shown.map((r) => {
                    const n = (r.normalized ?? {}) as Record<string, string | number>;
                    const errors = (r.errors ?? []) as string[];
                    const changes = (r.changes ?? {}) as Record<string, [unknown, unknown]>;
                    return (
                      <tr
                        key={r.row_no}
                        className={r.action === "error" ? "bg-danger-soft/30" : ""}
                      >
                        <td className="px-3 py-2 text-text-muted">{num(r.row_no)}</td>
                        <td className="px-3 py-2">
                          <bdi className="font-mono text-xs">
                            {String(n.university_number ?? "")}
                          </bdi>
                          {errors.length > 0 && (
                            <span className="block text-xs text-danger-strong">
                              {errors.join(" · ")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{String(n.full_name_ar ?? "")}</td>
                        <td className="px-3 py-2">
                          {programName(n.program_id) || String(n.program_code ?? "")}
                        </td>
                        <td className="px-3 py-2">
                          {String(n.level ?? "")}
                          {changes.level ? (
                            <span className="block text-xs text-text-muted">
                              كان: {String(changes.level[0])}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <bdi className="text-xs">{String(n.email ?? "")}</bdi>
                        </td>
                        <td className={`px-3 py-2 font-semibold ${ACTION[r.action]?.[1] ?? ""}`}>
                          {ACTION[r.action]?.[0] ?? r.action}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollRegion>
          </Card>
        </>
      )}
    </PortalShell>
  );
}
