import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Button, Card, Notice } from "../../components/ui";
import { useSiteLogo } from "../../lib/site";
import { fieldsOf, type FormSchema, visitorApi } from "../../lib/visitor";
import { GuideSections } from "./Apply";
import { VisitorLayout } from "./VisitorLayout";

/**
 * «دليل تعبئة استمارة طلب الالتحاق بالكلية» (spec §7): a public page built from the published
 * form of an open programme — applicant fields only (the server never sends the college's own),
 * the required documents, how to send the application. «طباعة / حفظ PDF» prints it with the
 * college's mark; the browser's PDF keeps the Arabic shaping and fonts. No personal data.
 */
export function Guide() {
  const [params, setParams] = useSearchParams();
  const logo = useSiteLogo();
  useEffect(() => {
    document.title = "دليل تعبئة استمارة طلب الالتحاق — كلية الإمارات";
  }, []);
  const intakes = useQuery({
    queryKey: ["public", "intakes"],
    queryFn: async () => (await visitorApi.GET("/api/public/intakes")).data ?? [],
  });
  const rows = intakes.data ?? [];
  const chosen = rows.find((i) => i.program_code === params.get("program")) ?? rows[0] ?? null;
  const [intakeId, setIntakeId] = useState<number | null>(null);
  useEffect(() => setIntakeId(chosen?.id ?? null), [chosen?.id]);
  const intake = useQuery({
    queryKey: ["public", "intake", intakeId],
    enabled: intakeId !== null,
    queryFn: async () =>
      (
        await visitorApi.GET("/api/public/intakes/{id}", {
          params: { path: { id: intakeId! } },
        })
      ).data ?? null,
  });
  const site = useQuery({
    queryKey: ["public", "site"],
    queryFn: async () => (await visitorApi.GET("/api/public/site")).data ?? null,
    staleTime: 60 * 60_000,
  });
  const form = intake.data?.form as { schema?: FormSchema } | null | undefined;
  const schema = form?.schema;
  const files = fieldsOf(schema).filter((f) => f.type === "file");
  const documents = [
    ...((intake.data?.required_documents ?? []) as {
      key: string;
      label: string;
      required?: boolean;
    }[]),
    ...files.map((f) => ({ key: f.key, label: f.label, required: f.required })),
  ];
  return (
    <VisitorLayout title="دليل تعبئة الاستمارة">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer size={16} aria-hidden />
          طباعة / حفظ PDF
        </Button>
        <Link to={chosen ? `/apply?program=${chosen.program_code}` : "/apply"}>
          <Button variant="secondary">ابدأ التقديم</Button>
        </Link>
        {rows.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-text-muted">
            البرنامج:
            <select
              value={chosen?.program_code ?? ""}
              onChange={(e) => setParams({ program: e.target.value })}
              className="min-h-11 rounded-lg border border-border bg-surface px-2 text-sm text-text"
            >
              {rows.map((i) => (
                <option key={i.id} value={i.program_code}>
                  {i.program_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {intakes.isSuccess && !rows.length && (
        <Notice tone="info">لا تقديم مفتوح الآن؛ يظهر الدليل حين يُفتح التقديم.</Notice>
      )}
      {chosen && (
        <Card className="space-y-5 p-5 text-sm print:border-0 print:p-0 print:shadow-none">
          <header className="flex items-center gap-4 border-b border-border pb-4">
            <img src={logo} alt="" className="size-14 object-contain" />
            <div className="min-w-0">
              <p className="font-bold text-text">{site.data?.name_ar}</p>
              <h2 className="text-lg font-bold text-text">
                دليل تعبئة {schema?.title || "استمارة طلب الالتحاق بالكلية"}
              </h2>
              <p className="text-text-muted">
                {chosen.program_name} · {chosen.cycle_name}
              </p>
            </div>
          </header>
          {schema ? <GuideSections schema={schema} level={2} /> : <p>…</p>}
          {documents.length > 0 && (
            <section className="break-inside-avoid">
              <h2 className="font-bold text-text">المستندات المطلوبة</h2>
              <ul className="mt-2 list-inside list-disc text-text-muted">
                {documents.map((d) => (
                  <li key={d.key}>
                    {d.label}
                    {d.required ? " *" : " (اختياري)"}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-text-muted">
                صورة واضحة بالكاميرا تكفي؛ PDF أو JPG أو PNG.
              </p>
            </section>
          )}
          <section className="break-inside-avoid">
            <h2 className="font-bold text-text">المراجعة والإرسال</h2>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-text-muted">
              <li>تحقق من بريدك برمز يصلك، ثم اختر البرنامج.</li>
              <li>املأ الاستمارة؛ تُحفظ المسودة تلقائيًا.</li>
              <li>ارفع المستندات، وراجع بياناتك، ثم أرسل الطلب واحتفظ بالرقم المرجعي.</li>
              <li>إرسال الطلب لا يعني القبول؛ تابع حالته من «متابعة طلبي» ببريدك.</li>
            </ol>
            {(site.data?.phone || site.data?.email) && (
              <p className="mt-2 text-text-muted">
                للاستفسار: {site.data?.phone && <bdi dir="ltr">{site.data.phone}</bdi>}
                {site.data?.phone && site.data?.email ? " · " : ""}
                {site.data?.email && <bdi dir="ltr">{site.data.email}</bdi>}
              </p>
            )}
          </section>
        </Card>
      )}
    </VisitorLayout>
  );
}
