import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Notice,
  StatusBadge,
  STATUS_LABELS,
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";

type Summary = { rows?: number; create?: number; error?: number; committed?: number };

/** Board: DesktopResultsImport (steps 3–4). Phone: derived — the same steps as stacked cards. */
export function ResultImportDetail() {
  const { id = "" } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [only, setOnly] = useState<"error" | "all">("all");
  const path = { params: { path: { public_id: id } } };

  const batch = useQuery({
    queryKey: ["result-imports", id],
    queryFn: async () => (await api.GET("/api/v1/result-imports/{public_id}", path)).data ?? null,
  });
  const rows = useQuery({
    queryKey: ["result-imports", id, "rows", only],
    queryFn: async () =>
      (
        await api.GET("/api/v1/result-imports/{public_id}/rows", {
          params: { path: { public_id: id }, query: only === "error" ? { action: "error" } : {} },
        })
      ).data?.results ?? [],
  });

  const act = useMutation({
    mutationFn: async (kind: "commit" | "publish" | "unpublish" | "delete") => {
      const call =
        kind === "delete"
          ? api.DELETE("/api/v1/result-imports/{public_id}", path)
          : api.POST(`/api/v1/result-imports/{public_id}/${kind}`, path);
      const { error, response } = await call;
      if (!response.ok) throw error;
      return kind;
    },
    onSuccess: (kind) => {
      void client.invalidateQueries({ queryKey: ["result-imports"] });
      if (kind === "delete") navigate("/result-imports");
    },
  });

  const b = batch.data;
  const summary = (b?.summary ?? {}) as Summary;
  const committed = b && ["committed", "published", "unpublished"].includes(b.status);
  const steps = [
    { label: "اختيار الملف", done: true },
    { label: "مطابقة الأعمدة", done: true },
    { label: "التحقق والمعاينة", done: !!committed },
    { label: "الاعتماد والنشر", done: b?.status === "published" },
  ];

  return (
    <PortalShell
      title={b?.file_name ?? "دفعة نتائج"}
      subtitle={b ? `${b.term_name} · ${b.department_name ?? "الكلية"}` : undefined}
      back={{ label: "رفع النتائج", to: "/result-imports" }}
    >
      {b && (
        <>
          <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2">
                <span
                  className={`grid size-6 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-success text-white" : "bg-surface-alt text-text-muted"}`}
                >
                  {s.done ? <Check size={14} aria-hidden /> : (i + 1).toLocaleString("ar")}
                </span>
                <span className={s.done ? "text-text" : "text-text-muted"}>{s.label}</span>
              </li>
            ))}
          </ol>

          <Card className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
            <StatusBadge status={b.status} label={STATUS_LABELS[b.status] ?? b.status} />
            <span>
              الصفوف: <b>{summary.rows ?? 0}</b>
            </span>
            <span className="text-success-strong">
              صالحة: <b>{summary.create ?? 0}</b>
            </span>
            <span className="text-danger-strong">
              أخطاء: <b>{summary.error ?? 0}</b>
            </span>
            <span className="text-text-muted">
              الأعمدة: {(b.detected_columns as string[]).join("، ")}
            </span>
          </Card>

          <div className="mt-4 flex flex-wrap gap-2">
            {(b.status === "validated" || b.status === "has_errors") && (
              <>
                <Button
                  onClick={() => act.mutate("commit")}
                  disabled={act.isPending || !summary.create}
                >
                  اعتماد {summary.create ?? 0} نتيجة{summary.error ? " (تُتخطّى الأخطاء)" : ""}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => act.mutate("delete")}
                  disabled={act.isPending}
                >
                  إلغاء الدفعة
                </Button>
              </>
            )}
            {(b.status === "committed" || b.status === "unpublished") && (
              <Button onClick={() => act.mutate("publish")} disabled={act.isPending}>
                نشر للطلاب
              </Button>
            )}
            {b.status === "published" && (
              <Button
                variant="secondary"
                onClick={() => act.mutate("unpublish")}
                disabled={act.isPending}
              >
                إلغاء النشر
              </Button>
            )}
          </div>
          {act.isError && (
            <div className="mt-3">
              <Notice>{problemMessage(act.error)}</Notice>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            <h2 className="text-xs font-semibold text-text-muted">معاينة الصفوف</h2>
            <Chip active={only === "all"} onClick={() => setOnly("all")}>
              الكل
            </Chip>
            <Chip active={only === "error"} onClick={() => setOnly("error")}>
              الأخطاء فقط ({summary.error ?? 0})
            </Chip>
          </div>
          <Card className="mt-2 divide-y divide-border-soft overflow-hidden">
            <div className="hidden grid-cols-[48px_140px_110px_70px_70px_1fr] gap-3 bg-surface-alt px-4 py-2 text-xs text-text-muted lg:grid">
              <span>#</span>
              <span>الرقم الجامعي</span>
              <span>المقرر</span>
              <span>الدرجة</span>
              <span>التقدير</span>
              <span>الحالة</span>
            </div>
            {(rows.data ?? []).map((row) => {
              const n = row.normalized as Record<string, string | null>;
              const ok = row.action === "create";
              return (
                <div
                  key={row.row_no}
                  className="grid grid-cols-[40px_1fr_auto] gap-x-3 gap-y-1 px-4 py-3 text-sm lg:grid-cols-[48px_140px_110px_70px_70px_1fr] lg:items-center"
                >
                  <span className="text-text-muted">{row.row_no}</span>
                  <span className="font-medium text-text" dir="ltr">
                    {n.university_number}
                  </span>
                  <span className="text-text-muted lg:text-text">{n.course_code}</span>
                  <span className="hidden lg:block">{n.score ?? "—"}</span>
                  <span className="hidden font-bold lg:block" dir="ltr">
                    {n.letter || "—"}
                  </span>
                  <span
                    className={`col-span-3 text-xs lg:col-span-1 ${ok ? "text-success-strong" : "text-danger-strong"}`}
                  >
                    {ok
                      ? `مطابق · ${n.score ?? ""} \u2066${n.letter ?? ""}\u2069`
                      : (row.errors as string[]).join(" · ")}
                  </span>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </PortalShell>
  );
}
