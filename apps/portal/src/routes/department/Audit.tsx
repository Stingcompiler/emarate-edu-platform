import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { useDepartment } from "../../lib/department";
import { downloadCsv, num } from "../../lib/reports";

/** Arabic wording for audit actions; unknown ones fall back to "<object>: <verb>". */
const ACTIONS: Record<string, string> = {
  "offering.instructor_add": "عيّن مدرّسًا",
  "offering.instructor_remove": "أزال مدرّسًا",
  "offering.create": "أنشأ شعبة مادة",
  "offering.update": "عدّل شعبة مادة",
  "course.create": "أنشأ مادة",
  "course.update": "عدّل مادة",
  "membership.add": "أضاف عضوًا للقسم",
  "membership.remove": "أزال عضوًا من القسم",
  "lecture.create": "أنشأ محاضرة",
  "lecture.update": "عدّل محاضرة",
  "lecture.publish": "نشر محاضرة",
  "lecture.unpublish": "ألغى نشر محاضرة",
  "lecture.delete": "حذف محاضرة",
  "lecture.resource_add": "أضاف موردًا لمحاضرة",
  "lecture.resource_remove": "أزال موردًا من محاضرة",
  "assignment.create": "أنشأ واجبًا",
  "assignment.update": "عدّل واجبًا",
  "assignment.delete": "حذف واجبًا",
  "submission.submit": "سلّم واجبًا",
  "submission.grade": "صحّح تسليمًا",
  "submission.grade_approve": "اعتمد درجة",
  "enrollment.add": "سجّل طالبًا في مادة",
  "enrollment.bulk": "سجّل طلابًا جماعيًا",
  "enrollment.drop": "أسقط تسجيل طالب",
  "registration.approve": "اعتمد طلب تسجيل",
  "registration.reject": "رفض طلب تسجيل",
  "registration.complete": "أكمل تسجيله",
  "exam.create": "أنشأ اختبارًا",
  "exam.update": "عدّل اختبارًا",
  "exam.publish": "نشر اختبارًا",
  "exam.close": "أغلق اختبارًا",
  "exam.release": "أعلن نتائج اختبار",
  "exam.attempt_start": "بدأ محاولة اختبار",
  "exam.attempt_submit": "سلّم محاولة اختبار",
  "exam.attempt_extend": "مدّد وقت محاولة",
  "exam.attempt_invalidate": "ألغى محاولة",
  "exam.answer_grade": "صحّح إجابة",
  "announcement.create": "أنشأ إعلانًا",
  "announcement.publish": "نشر إعلانًا",
  "notification.send": "أرسل إشعارًا",
  "file.upload": "رفع ملفًا",
  "video.ticket": "بدأ رفع فيديو",
  "student.status": "غيّر حالة طالب",
  "misconduct.report": "أبلغ عن غش",
  "role.grant": "منح دورًا",
  "role.revoke": "سحب دورًا",
};
const actionLabel = (code: string) => ACTIONS[code] ?? code;

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" });

/** Board: DesktopDeptOperations — every change with before/after; never deleted. */
export function Audit() {
  const { id, department } = useDepartment();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["audit", id, search, page],
    queryFn: async () =>
      (
        await api.GET("/api/v1/audit-logs", {
          params: { query: { department: id, search: search || undefined, page } },
        })
      ).data ?? null,
  });
  const rows = list.data?.results ?? [];
  const groups: [string, typeof rows][] = [];
  for (const r of rows) {
    const k = dayKey(r.at);
    const last = groups.at(-1);
    if (last && last[0] === k) last[1].push(r);
    else groups.push([k, [r]]);
  }
  const csv = () =>
    downloadCsv(
      `audit-${department?.code ?? "all"}`,
      ["الوقت", "المنفّذ", "العملية", "الهدف", "قبل", "بعد"],
      rows.map((r) => [
        r.at,
        r.actor,
        r.action,
        r.target_repr,
        JSON.stringify(r.old ?? ""),
        JSON.stringify(r.new ?? ""),
      ]),
    );
  return (
    <PortalShell
      title="سجل العمليات"
      subtitle={`${department?.name_ar ?? ""} · ${num(list.data?.count ?? 0)} عملية · كل عملية تُسجَّل بالقيمة قبل/بعد ولا تُحذف`}
      back={{ label: "لوحة القسم", to: "/department" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="بحث في السجل (اسم، مادة، طالب…)"
          className="min-h-10 flex-1 rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-md"
        />
        <Button variant="secondary" className="min-h-9 px-3" onClick={csv}>
          تصدير CSV
        </Button>
      </div>
      <div className="mt-4 space-y-4">
        {groups.map(([day, items]) => (
          <section key={day}>
            <p className="mb-2 text-xs font-semibold text-text-muted">{day}</p>
            <Card className="divide-y divide-border-soft">
              {items.map((r) => (
                <div key={r.id} className="flex gap-3 px-4 py-3 text-sm">
                  <span className="w-12 shrink-0 text-xs text-text-muted">
                    {new Date(r.at).toLocaleTimeString("ar", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="text-text">{r.actor || "النظام"}</b>{" "}
                    <span className="text-text-muted">· {actionLabel(r.action)}</span>
                    <span className="block truncate text-text">{r.target_repr}</span>
                  </span>
                </div>
              ))}
            </Card>
          </section>
        ))}
        {!rows.length && !list.isPending && (
          <Card className="p-4 text-sm text-text-muted">لا عمليات مطابقة.</Card>
        )}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3 text-sm">
        <Button
          variant="secondary"
          className="min-h-9 px-3"
          disabled={!list.data?.previous}
          onClick={() => setPage((p) => p - 1)}
        >
          الأحدث
        </Button>
        <span className="text-text-muted">صفحة {num(page)}</span>
        <Button
          variant="secondary"
          className="min-h-9 px-3"
          disabled={!list.data?.next}
          onClick={() => setPage((p) => p + 1)}
        >
          الأقدم
        </Button>
      </div>
    </PortalShell>
  );
}
