import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  SectionLabel,
  TextArea,
  problemMessage,
  SideNote,
  WithSide,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { KIND } from "./Cases";
import { ALL } from "../../components/Pager";

/** Board: StudentAffairsCaseNew (phone). Opening from a misconduct report converts it. Desktop: derived. */
export function CaseNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reportId = params.get("report");
  const report = useQuery({
    queryKey: ["misconduct-reports", reportId],
    enabled: !!reportId,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/misconduct-reports/{public_id}", {
          params: { path: { public_id: reportId! } },
        }),
      ) ?? null,
  });
  const [kind, setKind] = useState<keyof typeof KIND>("academic");
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const students = useQuery({
    queryKey: ["students", "lookup", number],
    enabled: number.trim().length >= 4 && !reportId,
    queryFn: async () =>
      (await api.GET("/api/v1/students", { params: { query: { ...ALL, search: number.trim() } } }))
        .data?.results ?? [],
  });
  const student = students.data?.[0];

  const open = useMutation({
    mutationFn: async () => {
      if (reportId) {
        const { data, error } = await api.POST("/api/v1/misconduct-reports/{public_id}/resolve", {
          params: { path: { public_id: reportId } },
          body: { convert: true, note: "" },
        });
        if (!data?.case) throw error;
        return data.case;
      }
      const { data, error } = await api.POST("/api/v1/cases", {
        body: { student_record: student!.public_id, kind, title, description },
      });
      if (!data) throw error;
      return data.public_id;
    },
    onSuccess: (caseId) => navigate(`/cases/${caseId}`),
  });
  const dismiss = useMutation({
    mutationFn: async () => {
      await api.POST("/api/v1/misconduct-reports/{public_id}/resolve", {
        params: { path: { public_id: reportId! } },
        body: { convert: false, note: "" },
      });
    },
    onSuccess: () => navigate("/cases"),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    open.mutate();
  }

  const r = report.data;
  return (
    <PortalShell
      title="فتح حالة"
      back={{ label: "الحالات", to: "/cases" }}
      subtitle="الحالة سرية حتى تُنشر للطالب. كل تغيير يُسجَّل باسمك."
    >
      <form onSubmit={submit}>
        <WithSide
          side={
            <SideNote title="بعد فتح الحالة">
              <ol className="list-decimal space-y-1 ps-4">
                <li>تبقى سرية: لا يراها إلا المخوَّلون.</li>
                <li>تُضاف الإفادات والمرفقات، ثم يُتخذ القرار.</li>
                <li>يرى الطالب الحالة وقرارها فقط عند نشرها له.</li>
              </ol>
            </SideNote>
          }
        >
          {r ? (
            <Card className="border-danger-soft p-4">
              <p className="text-sm font-semibold text-text">
                من بلاغ {r.reported_by} — {r.course_code}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {r.student.full_name_ar} · <span dir="ltr">{r.student.university_number}</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-text">«{r.evidence}»</p>
            </Card>
          ) : (
            <>
              <SectionLabel>النوع</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {Object.entries(KIND).map(([key, k]) => (
                  <Chip
                    key={key}
                    active={kind === key}
                    onClick={() => setKind(key as keyof typeof KIND)}
                  >
                    {k.label}
                  </Chip>
                ))}
              </div>
              <SectionLabel>الطالب</SectionLabel>
              <Card>
                <Field
                  label="الرقم الجامعي"
                  dir="ltr"
                  className="text-end"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
                {student && (
                  <p className="px-4 pb-3 text-sm text-text">
                    {student.full_name_ar} · {student.program_name} · المستوى {student.level}
                  </p>
                )}
              </Card>
              <SectionLabel>التفاصيل</SectionLabel>
              <Card>
                <Field
                  label="العنوان"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
                <TextArea
                  label="الوصف"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Card>
            </>
          )}
          {(open.isError || dismiss.isError) && (
            <div className="mt-3">
              <Notice>{problemMessage(open.error ?? dismiss.error)}</Notice>
            </div>
          )}
          <div className="mt-5 flex gap-2">
            {reportId && (
              <Button
                variant="secondary"
                onClick={() => dismiss.mutate()}
                disabled={dismiss.isPending}
              >
                رفض البلاغ
              </Button>
            )}
            <Button
              type="submit"
              className="flex-1"
              disabled={open.isPending || (!reportId && (!student || !title))}
            >
              فتح الحالة
            </Button>
          </div>
        </WithSide>
      </form>
    </PortalShell>
  );
}
