import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router";

import { Button } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useSiteLogo } from "../../lib/site";
import { type FormSchema, sectionsOf, shown } from "../../lib/visitor";

const show = (v: unknown) =>
  Array.isArray(v)
    ? v.join("، ")
    : v === true
      ? "نعم"
      : v === false
        ? "لا"
        : v === undefined || v === null || v === ""
          ? "—"
          : String(v);

/**
 * The application on paper for the college's file (spec §11): the college's mark and name
 * from the site settings, the form's sections with bold labels, the college's fields, the
 * documents' names. Staff only (the reviewer's view); no buttons in print.
 */
export function ApplicationPrint() {
  const { id = "" } = useParams();
  const logo = useSiteLogo();
  const app = useQuery({
    queryKey: ["applications", id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/applications/{public_id}", {
          params: { path: { public_id: id } },
        }),
      ) ?? null,
  });
  const site = useQuery({
    queryKey: ["public", "site"],
    queryFn: async () => (await api.GET("/api/public/site")).data ?? null,
    staleTime: 60 * 60_000,
  });
  const a = app.data;
  useEffect(() => {
    if (a) document.title = `${a.reference_no} — ${a.full_name}`;
  }, [a]);
  if (!a) return <p className="p-6 text-sm text-text-muted">جارٍ التحميل…</p>;
  const schema = (a.form_schema ?? {}) as FormSchema;
  const answers = (a.answers ?? {}) as Record<string, unknown>;
  const staff = (a.staff_answers ?? {}) as Record<string, unknown>;
  const value = (key: string, audience?: string) =>
    show(!audience || audience === "applicant" ? answers[key] : staff[key]);
  return (
    <div className="mx-auto max-w-3xl bg-surface p-6 text-text print:max-w-none print:p-0">
      <div className="mb-4 flex gap-2 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer size={16} aria-hidden />
          طباعة
        </Button>
        <Link to={`/applications/${id}`}>
          <Button variant="secondary">رجوع إلى الطلب</Button>
        </Link>
      </div>
      <header className="flex items-center gap-4 border-b border-border pb-4">
        <img src={logo} alt="" className="size-16 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{site.data?.name_ar}</p>
          <p className="text-sm">{schema.title || "استمارة طلب الالتحاق بالكلية"}</p>
        </div>
        <div className="text-end text-xs">
          <p className="font-mono font-bold" dir="ltr">
            {a.reference_no}
          </p>
          {a.submitted_at && <p>قُدِّم {fmtDate(a.submitted_at)}</p>}
        </div>
      </header>
      <section className="mt-4 break-inside-avoid">
        <h2 className="mb-2 bg-surface-alt px-2 py-1 text-sm font-bold">بيانات الطلب</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {(
            [
              ["البرنامج", a.program_name],
              ["القسم", a.department_name],
              ["دورة القبول", a.cycle_name],
              ["البريد", a.email],
              ["الاسم", a.full_name],
              ["الهاتف", a.phone_e164 || "—"],
            ] as [string, string][]
          ).map(([k, v]) => (
            // A long email on a 390px phone stayed on one line past the page (review 2026-11-10,
            // fit.csv R89): the cell may shrink and the value wraps where it must.
            <div key={k} className="min-w-0">
              <dt className="font-bold">{k}</dt>
              <dd className="wrap-anywhere">
                <bdi>{v}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {sectionsOf(schema).map((section, i) => {
        const items = (section.fields ?? []).filter(
          (f) =>
            f.type !== "note" &&
            f.type !== "file" &&
            (f.audience && f.audience !== "applicant" ? true : shown(f, answers)),
        );
        if (!items.length) return null;
        return (
          <section key={i} className="mt-4 break-inside-avoid">
            <h2 className="mb-2 bg-surface-alt px-2 py-1 text-sm font-bold">{section.title}</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {items.map((f) => (
                <div key={f.key} className={f.width === "half" ? "min-w-0" : "col-span-2 min-w-0"}>
                  <dt className="font-bold">{f.label}</dt>
                  <dd className="min-h-5 border-b border-dotted border-border wrap-anywhere">
                    <bdi>{value(f.key, f.audience)}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      <section className="mt-4 break-inside-avoid">
        <h2 className="mb-2 bg-surface-alt px-2 py-1 text-sm font-bold">المستندات المرفقة</h2>
        <ul className="list-inside list-disc text-sm">
          {(a.documents ?? []).map((d) => (
            <li key={d.public_id}>
              {a.labels[d.doc_type] ?? d.doc_type} — {d.name}
            </li>
          ))}
        </ul>
      </section>
      <footer className="mt-8 grid grid-cols-2 gap-6 text-sm print:mt-12">
        <p className="border-t border-text pt-1">توقيع موظف القبول</p>
        <p className="border-t border-text pt-1">الختم والتاريخ</p>
      </footer>
    </div>
  );
}
