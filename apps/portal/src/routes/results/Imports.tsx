import { useMutation, useQuery } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  CodeTile,
  EmptyState,
  Notice,
  SectionLabel,
  StatusBadge,
  STATUS_LABELS,
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { asForm, formData } from "../../lib/upload";

/** Boards: ResultsOfficerHome (phone), DesktopResultsImport step 1 (desktop). */
export function ResultImports() {
  const me = useMe();
  const navigate = useNavigate();
  const scope = me.data?.capabilities?.["results.manage"];
  const collegeWide = !!scope?.everything;

  const terms = useQuery({
    queryKey: ["terms"],
    queryFn: async () => (await api.GET("/api/v1/terms")).data?.results ?? [],
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await api.GET("/api/v1/departments")).data?.results ?? [],
  });
  const batches = useQuery({
    queryKey: ["result-imports"],
    queryFn: async () => (await api.GET("/api/v1/result-imports")).data?.results ?? [],
  });

  const [term, setTerm] = useState("");
  const [department, setDepartment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const currentTerm = terms.data?.find((t) => t.is_current);
  const allowedDepartments = (departments.data ?? []).filter(
    (d) => collegeWide || scope?.departments.includes(d.id),
  );

  const upload = useMutation({
    mutationFn: async () => {
      const body = formData({
        file,
        term: term || String(currentTerm?.id ?? ""),
        department: department || (collegeWide ? "" : String(allowedDepartments[0]?.id ?? "")),
      });
      const { data, error } = await api.POST("/api/v1/result-imports", {
        body: body as never,
        ...asForm,
      });
      if (!data) throw error;
      return data;
    },
    onSuccess: (batch) => navigate(`/result-imports/${batch.public_id}`),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    upload.mutate();
  }

  return (
    <PortalShell title="رفع النتائج" subtitle="الرفع بملف جاهز فقط؛ لا تُدخل الدرجات يدويًا.">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
        <section className="order-last">
          <SectionLabel>رفع ملف نتائج (Excel / CSV)</SectionLabel>
          <Card className="p-4">
            <form onSubmit={submit} className="space-y-3">
              <label className="block text-sm">
                <span className="text-xs text-text-muted">الفصل</span>
                <select
                  className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3"
                  value={term || currentTerm?.id || ""}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  {(terms.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name_ar}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs text-text-muted">القسم</span>
                <select
                  className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  {collegeWide && <option value="">كل الأقسام (الكلية)</option>}
                  {allowedDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name_ar}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface-alt px-4 py-4 text-center text-sm text-text-muted hover:border-primary">
                <FileUp size={22} aria-hidden className="text-primary" />
                {file ? (
                  <span className="font-semibold text-text">{file.name}</span>
                ) : (
                  "اختر ملف .xlsx أو .csv"
                )}
                <span className="text-xs">
                  الأعمدة: الرقم الجامعي، رمز المقرر، الدرجة (والتقدير والحالة اختياريًا)
                </span>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {upload.isError && <Notice>{problemMessage(upload.error)}</Notice>}
              <Button type="submit" className="w-full" disabled={!file || upload.isPending}>
                {upload.isPending ? "جارٍ التحقق…" : "تحقق ومعاينة"}
              </Button>
            </form>
          </Card>
        </section>

        <section className="mt-6 lg:mt-0">
          <SectionLabel>الدفعات</SectionLabel>
          {!batches.data?.length ? (
            <Card>
              <EmptyState icon={<FileUp size={24} aria-hidden />} title="لا دفعات بعد">
                ارفع أول ملف نتائج.
              </EmptyState>
            </Card>
          ) : (
            <Card className="divide-y divide-border-soft">
              {batches.data.map((b) => (
                <Link
                  key={b.public_id}
                  to={`/result-imports/${b.public_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  <CodeTile top={b.department_name?.slice(0, 3) ?? "كل"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{b.file_name}</p>
                    <p className="text-xs text-text-muted">
                      {b.term_name} · {(b.summary as { rows?: number }).rows ?? 0} صفًا ·{" "}
                      {b.uploaded_by} · {when(b.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={b.status} label={STATUS_LABELS[b.status] ?? b.status} />
                </Link>
              ))}
            </Card>
          )}
        </section>
      </div>
    </PortalShell>
  );
}
