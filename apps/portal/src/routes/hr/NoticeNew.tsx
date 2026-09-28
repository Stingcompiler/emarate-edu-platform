import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Chip, Notice, SectionLabel, problemMessage } from "../../components/ui";
import { api } from "../../lib/api";
import { TOPIC_LABEL, days, initials, num, pct } from "../../lib/reports";
import { ROLE_LINE, useTeachersReport } from "./Teachers";
import { count, N } from "../../lib/format";

const TEMPLATES: Record<string, (d: string) => string> = {
  grading: (d) =>
    `نودّ لفت انتباهكم إلى أن متوسط زمن تصحيح التسليمات بلغ ${d}، متجاوزًا الحد المعتمد. نرجو معالجة المتأخر منها خلال أسبوع.`,
  uploads: () =>
    "نودّ لفت انتباهكم إلى تأخر رفع المحاضرات عن الخطة المعتمدة للفصل. نرجو استكمال الرفع في أقرب وقت.",
  live: () =>
    "نودّ لفت انتباهكم إلى أن عدد جلسات البث المنفذة أقل من المخطط. نرجو الالتزام بالجدول.",
  replies: () => "نودّ لفت انتباهكم إلى تأخر الرد على استفسارات الطلاب. نرجو المتابعة.",
  other: () => "",
};

/** Board: HRNoticeNew (phone); desktop derived — form beside the evidence. */
export function NoticeNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [teacherId, setTeacherId] = useState(params.get("teacher") ?? "");
  const report = useTeachersReport();
  const teacher = report.data?.rows.find((r) => r.public_id === teacherId);
  const [topic, setTopic] = useState("grading");
  const [body, setBody] = useState("");
  const [ack, setAck] = useState(true);
  const [cc, setCc] = useState(false);
  const [search, setSearch] = useState("");
  const profile = useQuery({
    queryKey: ["reports", "teacher", teacherId],
    enabled: !!teacherId,
    queryFn: async () =>
      (
        await api.GET("/api/v1/reports/teachers/{public_id}", {
          params: { path: { public_id: teacherId } },
        })
      ).data ?? null,
  });
  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/hr-notices", {
        body: {
          teacher: teacherId,
          topic: topic as never,
          body,
          requires_ack: ack,
          cc_department_manager: cc,
        } as never,
      });
      if (!data) throw error;
    },
    onSuccess: () => navigate(`/hr/teachers/${teacherId}`),
  });
  useEffect(() => {
    // Start from the topic's template once the teacher's figures are known.
    if (teacher && !body) setBody(TEMPLATES[topic]!(days(teacher.grading_days)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher]);
  const worst = profile.data?.offerings.slice().sort((a, b) => b.ungraded - a.ungraded)[0];
  return (
    <PortalShell
      title="تنبيه موجّه"
      subtitle="إلى أستاذ واحد فقط · لا إشعارات جماعية من الموارد البشرية"
      back={{ label: "أداء الأساتذة", to: "/hr" }}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="space-y-4">
          <SectionLabel>المستلم</SectionLabel>
          {teacher ? (
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-700">
                {initials(teacher.name)}
              </span>
              <span className="flex-1">
                <b className="block text-sm text-text">{teacher.name}</b>
                <span className="text-xs text-text-muted">{ROLE_LINE(teacher)}</span>
              </span>
              <button
                type="button"
                onClick={() => setTeacherId("")}
                className="text-sm font-semibold text-primary"
              >
                تغيير
              </button>
            </Card>
          ) : (
            <Card className="p-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم"
                className="mb-2 min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
              />
              <div className="max-h-64 divide-y divide-border-soft overflow-y-auto">
                {(report.data?.rows ?? [])
                  .filter((r) => r.name.includes(search))
                  .map((r) => (
                    <button
                      key={r.public_id}
                      type="button"
                      onClick={() => setTeacherId(r.public_id)}
                      className="block w-full px-2 py-2 text-start text-sm hover:bg-surface-alt"
                    >
                      {r.name} <span className="text-xs text-text-muted">· {ROLE_LINE(r)}</span>
                    </button>
                  ))}
              </div>
            </Card>
          )}
          <SectionLabel>الموضوع</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TOPIC_LABEL).map(([k, l]) => (
              <Chip
                key={k}
                active={topic === k}
                onClick={() => {
                  setTopic(k);
                  if (
                    !body ||
                    Object.values(TEMPLATES).some((f) => f(days(teacher?.grading_days)) === body)
                  )
                    setBody(TEMPLATES[k]!(days(teacher?.grading_days)));
                }}
              >
                {l}
              </Chip>
            ))}
          </div>
          <SectionLabel>الرسالة</SectionLabel>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="نص التنبيه"
            className="block min-h-36 w-full rounded-lg border border-border bg-surface p-3 text-sm"
          />
          <Card className="divide-y divide-border-soft text-sm">
            <label className="flex items-center justify-between px-4 py-3">
              يتطلب إقرار الاطلاع
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between px-4 py-3">
              نسخة إلى مدير القسم
              <input type="checkbox" checked={cc} onChange={(e) => setCc(e.target.checked)} />
            </label>
            <p className="px-4 py-3 text-xs text-text-muted">القنوات: داخل التطبيق · Push · بريد</p>
          </Card>
          <Notice tone="info">
            يُسجَّل التنبيه في ملف الأستاذ ويظهر لأمين الشؤون العلمية. لا يمكن حذفه بعد الإرسال.
          </Notice>
          {send.isError && <Notice>{problemMessage(send.error)}</Notice>}
          <Button
            className="w-full lg:w-auto"
            disabled={!teacherId || !body.trim() || send.isPending}
            onClick={() => send.mutate()}
          >
            إرسال التنبيه
          </Button>
        </div>
        {teacher && (
          <aside className="mt-6 lg:mt-0">
            <SectionLabel>الأدلة المرفقة تلقائيًا ({report.data?.term.name})</SectionLabel>
            <Card className="divide-y divide-border-soft text-sm">
              <div className="flex justify-between px-4 py-3">
                <span className="text-text-muted">
                  متوسط زمن التصحيح (الحد {count(report.data?.thresholds.grading_days, N.day)})
                </span>
                <b>{days(teacher.grading_days)}</b>
              </div>
              {worst && worst.ungraded > 0 && (
                <div className="flex justify-between px-4 py-3">
                  <span className="text-text-muted">تسليمات غير مصححة — {worst.name}</span>
                  <b>{num(worst.ungraded)}</b>
                </div>
              )}
              <div className="flex justify-between px-4 py-3">
                <span className="text-text-muted">المحاضرات المرفوعة</span>
                <b>
                  {teacher.lectures == null
                    ? "—"
                    : `${num(teacher.lectures)} / ${num(teacher.planned)}`}
                </b>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-text-muted">انتظام الرفع</span>
                <b>{pct(teacher.upload_percent)}</b>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-text-muted">البث المنفذ / المخطط</span>
                <b>
                  {num(teacher.live_held)} / {num(teacher.live_planned)}
                </b>
              </div>
            </Card>
          </aside>
        )}
      </div>
    </PortalShell>
  );
}
