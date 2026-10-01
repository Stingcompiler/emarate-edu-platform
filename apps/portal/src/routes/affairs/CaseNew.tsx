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
import { useToast } from "../../components/Toast";

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

  // A confidential case must name the right student (review 2026-09-29): an exact university
  // number is taken at once; otherwise the staff member picks from the matches.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const students = useQuery({
    queryKey: ["students", "lookup", number],
    enabled: number.trim().length >= 3 && !reportId && !pickedId,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/students", {
          params: { query: { search: number.trim(), page_size: 8 } },
        }),
      )?.results ?? [],
  });
  const exact = (students.data ?? []).find(
    (s) => s.university_number.toLowerCase() === number.trim().toLowerCase(),
  );
  const [chosen, setChosen] = useState<NonNullable<typeof students.data>[number] | null>(null);
  const student = chosen ?? exact ?? null;

  const toast = useToast();
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
    onSuccess: (caseId) => {
      toast("فُتحت الحالة");
      navigate(`/cases/${caseId}`);
    },
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
                {student ? (
                  <div className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="block text-text">{student.full_name_ar}</b>
                      <span className="text-xs text-text-muted">
                        <bdi dir="ltr">{student.university_number}</bdi> · {student.program_name} ·
                        المستوى {student.level}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      className="min-h-11 px-3"
                      onClick={() => {
                        setChosen(null);
                        setPickedId(null);
                        setNumber("");
                      }}
                    >
                      تغيير
                    </Button>
                  </div>
                ) : (
                  <>
                    <Field
                      label="الرقم الجامعي أو الاسم"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      hint="اكتب الرقم كاملًا أو اختر من النتائج."
                    />
                    {(students.data ?? []).length > 0 && (
                      <div className="divide-y divide-border-soft border-t border-border-soft">
                        {(students.data ?? []).map((s) => (
                          <button
                            key={s.public_id}
                            type="button"
                            onClick={() => {
                              setChosen(s);
                              setPickedId(s.public_id);
                            }}
                            className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-start text-sm hover:bg-surface-alt"
                          >
                            <span className="min-w-0 flex-1 truncate">{s.full_name_ar}</span>
                            <bdi dir="ltr" className="text-xs text-text-muted">
                              {s.university_number}
                            </bdi>
                          </button>
                        ))}
                      </div>
                    )}
                    {number.trim().length >= 3 && students.isSuccess && !students.data?.length && (
                      <p className="px-4 pb-3 text-xs text-text-muted">
                        لا طالب بهذا الرقم أو الاسم.
                      </p>
                    )}
                  </>
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
