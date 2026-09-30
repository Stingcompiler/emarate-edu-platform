import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { FilterBar, Button, Card, WithSide } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useDepartment } from "../../lib/department";
import { downloadCsv } from "../../lib/reports";
import { count, N } from "../../lib/format";
import { Pager } from "../../components/Pager";

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
  "assignment.published": "نشر واجبًا",
  "assignment.closed": "أغلق واجبًا",
  "assignment.draft": "أعاد واجبًا إلى مسودة",
  "account.create": "أنشأ حسابًا",
  "account.activate": "فعّل حسابه",
  "account.deactivate": "عطّل حسابًا",
  "account.password_reset": "أعاد تعيين كلمة المرور",
  "account.bootstrap_admin": "أنشأ أول مدير نظام",
  "announcement.update": "عدّل إعلانًا",
  "announcement.delete": "حذف إعلانًا",
  "announcement.archive": "أرشف إعلانًا",
  "regulation.create": "أنشأ لائحة",
  "regulation.update": "عدّل لائحة",
  "regulation.publish": "نشر لائحة",
  "regulation.new_version": "أصدر نسخة جديدة من لائحة",
  "regulation.acknowledge": "أقرّ بلائحة",
  "case.open": "فتح حالة طالب",
  "case.decide": "أصدر قرارًا في حالة",
  "case.publish": "نشر قرار حالة",
  "case.close": "أغلق حالة طالب",
  "case.reopen": "أعاد فتح حالة طالب",
  "misconduct.convert": "حوّل بلاغ غش إلى حالة",
  "misconduct.dismiss": "رفض بلاغ غش",
  "exam.delete": "حذف اختبارًا",
  "exam.hide": "أخفى اختبارًا",
  "exam.question_save": "حفظ سؤال اختبار",
  "exam.question_delete": "حذف سؤال اختبار",
  "exam.attempt_reopen": "أعاد فتح محاولة",
  "live.create": "أنشأ جلسة بث",
  "live.update": "عدّل جلسة بث",
  "live.cancel": "ألغى جلسة بث",
  "hr_notice.send": "أرسل تنبيهًا لأستاذ",
  "hr_notice.acknowledge": "أقرّ بتنبيه",
  "results.commit": "اعتمد دفعة نتائج",
  "results.import_validate": "تحقق من ملف نتائج",
  "results.import_delete": "حذف دفعة نتائج",
  "results.publish": "نشر نتائج",
  "results.unpublish": "ألغى نشر نتائج",
  "results.release": "أتاح النتائج للطلاب",
  "results.export": "صدّر النتائج",
  "results.correct": "عدّل نتيجة",
  "results.correction_request": "طلب تعديل نتيجة",
  "results.correction_approve": "وافق على تعديل نتيجة",
  "results.correction_reject": "رفض تعديل نتيجة",
  "results.scale_create": "أنشأ سلّم تقديرات",
  "results.scale_update": "عدّل سلّم تقديرات",
  "results.settings": "عدّل إعدادات النتائج",
  "students.import_validate": "تحقق من ملف طلاب",
  "students.import_commit": "استورد سجل طلاب",
  "students.import_reject": "رفض ملف طلاب",
  "term.set_current": "غيّر الفصل الحالي",
  "admissions.start": "بدأ طلب قبول",
  "admissions.register": "حوّل متقدمًا إلى طالب",
  "admissions.submit": "قدّم طلب قبول",
  "admissions.withdraw": "سحب طلب قبول",
  "admissions.assign": "وزّع طلب قبول",
  "admissions.transition": "غيّر حالة طلب قبول",
  "admissions.document_review": "راجع مستندًا",
  "admissions.template_create": "أنشأ نموذج تقديم",
  "admissions.template_version": "أصدر نسخة من نموذج تقديم",
  "admissions.template_publish": "نشر نموذج تقديم",
  "inquiry.submit": "أرسل استفسارًا",
  "inquiry.assign": "أسند استفسارًا",
  "inquiry.reroute": "حوّل استفسارًا",
  "inquiry.status": "غيّر حالة استفسار",
  "media.upload": "رفع ملف وسائط",
  "media.delete": "حذف ملف وسائط",
  "menu.update": "عدّل قائمة الموقع",
  "redirect.create": "أنشأ تحويل رابط",
  "redirect.update": "عدّل تحويل رابط",
  "redirect.delete": "حذف تحويل رابط",
  "site.settings": "عدّل إعدادات الموقع",
  "settings.update": "عدّل إعدادات النظام",
  "reports.snapshot": "حفظ لقطة تقرير",
  "backup.create": "أنشأ نسخة احتياطية",
  "page.create": "أنشأ صفحة",
  "page.update": "عدّل صفحة",
  "page.delete": "حذف صفحة",
  "news.create": "أنشأ خبرًا",
  "news.update": "عدّل خبرًا",
  "news.delete": "حذف خبرًا",
  "event.create": "أنشأ فعالية",
  "event.update": "عدّل فعالية",
  "event.delete": "حذف فعالية",
  "inquiry.email": "ردّ على استفسار بالبريد",
  "inquiry.whatsapp": "ردّ على استفسار عبر واتساب",
  "inquiry.note": "أضاف ملاحظة على استفسار",
};

/** Fallback for codes without a label above: "<verb> <object>" so no raw code reaches the page. */
const VERBS: Record<string, string> = {
  create: "أنشأ",
  update: "عدّل",
  delete: "حذف",
  publish: "نشر",
  archive: "أرشف",
  send: "أرسل",
  reply: "ردّ على",
  email: "راسل بالبريد",
  whatsapp: "راسل عبر واتساب",
};
const NOUNS: Record<string, string> = {
  admissions: "القبول",
  inquiry: "استفسار",
  page: "صفحة",
  news: "خبر",
  event: "فعالية",
  college: "بيانات الكلية",
  department: "قسم",
  program: "برنامج",
  academic_year: "عام دراسي",
  term: "فصل دراسي",
};
export function actionLabel(code: string): string {
  if (ACTIONS[code]) return ACTIONS[code];
  const [noun = "", rest = ""] = code.split(".");
  const verb = rest.split("_").pop() ?? rest;
  const object = rest.includes("_") ? rest.slice(0, rest.lastIndexOf("_")) : noun;
  return `${VERBS[verb] ?? "عملية"} · ${NOUNS[object] ?? NOUNS[noun] ?? object}`;
}

type Entry = {
  id: number;
  at: string;
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  target_repr: string;
  old: unknown;
  new: unknown;
};

const show = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? "—"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

/** One entry in full: who, when, what, and each changed field before and after (board
 *  DesktopDeptOperations). The log is read-only; nothing here edits it. */
function AuditDetail({ r }: { r: Entry }) {
  const before = (r.old && typeof r.old === "object" ? r.old : {}) as Record<string, unknown>;
  const after = (r.new && typeof r.new === "object" ? r.new : {}) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => show(before[k]) !== show(after[k]),
  );
  return (
    <div className="space-y-3 text-sm">
      <div>
        <b className="block text-text">{actionLabel(r.action)}</b>
        <span className="text-xs text-text-muted">
          {new Date(r.at).toLocaleString("ar-u-nu-latn", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          · بواسطة {r.actor || "النظام"}
        </span>
      </div>
      <dl className="divide-y divide-border-soft">
        {[
          ["الهدف", r.target_repr],
          ["النوع", r.target_type],
          ["المعرّف", r.target_id],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-1.5">
            <dt className="text-text-muted">{k}</dt>
            <dd className="min-w-0 truncate text-end font-semibold text-text">
              <bdi>{v || "—"}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      {fields.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border-soft">
          <table className="w-full table-fixed text-xs">
            <thead className="bg-surface-alt text-text-muted">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-start font-medium">
                  الحقل
                </th>
                <th scope="col" className="px-2 py-1.5 text-start font-medium">
                  قبل
                </th>
                <th scope="col" className="px-2 py-1.5 text-start font-medium">
                  بعد
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {fields.map((k) => (
                <tr key={k}>
                  <th scope="row" className="px-2 py-1.5 text-start font-normal text-text-muted">
                    <bdi>{k}</bdi>
                  </th>
                  <td className="break-words bg-danger-soft/50 px-2 py-1.5">
                    <bdi>{show(before[k])}</bdi>
                  </td>
                  <td className="break-words bg-success-soft/50 px-2 py-1.5">
                    <bdi>{show(after[k])}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-text-muted">لا قيم متغيّرة مسجّلة لهذه العملية.</p>
      )}
    </div>
  );
}

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("ar-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/** Board: DesktopDeptOperations — every change with before/after; never deleted. Choosing an
 *  entry shows it in full beside the list (under it on phones). */
export function Audit() {
  const me = useMe();
  const everything = !!(
    me.data?.capabilities?.["audit.view"] as { everything?: boolean } | undefined
  )?.everything;
  const dept = useDepartment();
  const id = everything ? undefined : dept.id;
  const department = everything ? undefined : dept.department;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const list = useQuery({
    queryKey: ["audit", id, search, page],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/audit-logs", {
          params: { query: { department: id, search: search || undefined, page } },
        }),
      ) ?? null,
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
      subtitle={`${department?.name_ar ?? "كل الكلية"} · ${count(list.data?.count ?? 0, N.operation)} · كل عملية تُسجَّل بالقيمة قبل/بعد ولا تُحذف`}
      back={
        everything
          ? { label: "إدارة النظام", to: "/system" }
          : { label: "لوحة القسم", to: "/department" }
      }
    >
      <FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="بحث في السجل (اسم، مادة، طالب…)"
            aria-label="بحث في السجل (اسم، مادة، طالب)"
            className="min-h-10 flex-1 rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-md"
          />
          <Button variant="secondary" className="min-h-9 px-3" onClick={csv}>
            تصدير CSV
          </Button>
        </div>
      </FilterBar>
      <WithSide
        side={
          <Card className="hidden p-4 lg:block">
            {rows.find((r) => r.id === picked) ? (
              <AuditDetail r={rows.find((r) => r.id === picked)! as Entry} />
            ) : (
              <p className="text-sm text-text-muted">
                اختر عملية لترى تفاصيلها وقيمها قبل التغيير وبعده.
              </p>
            )}
            <p className="mt-4 text-xs leading-relaxed text-text-muted">
              السجل للقراءة فقط: لا تُعدَّل عملية ولا تُحذف.
            </p>
          </Card>
        }
      >
        <div className="mt-4 space-y-4">
          {groups.map(([day, items]) => (
            <section key={day}>
              <p className="mb-2 text-xs font-semibold text-text-muted">{day}</p>
              <Card className="divide-y divide-border-soft">
                {items.map((r) => (
                  <div key={r.id}>
                    <button
                      type="button"
                      aria-expanded={picked === r.id}
                      onClick={() => setPicked(picked === r.id ? null : r.id)}
                      className={`flex w-full gap-3 px-4 py-3 text-start text-sm hover:bg-surface-alt ${picked === r.id ? "bg-primary-soft/40" : ""}`}
                    >
                      <span className="w-12 shrink-0 text-xs text-text-muted">
                        {new Date(r.at).toLocaleTimeString("ar-u-nu-latn", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="text-text">{r.actor || "النظام"}</b>{" "}
                        <span className="text-text-muted">· {actionLabel(r.action)}</span>
                        <span className="block truncate text-text">{r.target_repr}</span>
                      </span>
                    </button>
                    {/* Phones: the details open under the entry. */}
                    {picked === r.id && (
                      <div className="border-t border-border-soft bg-surface-alt/40 px-4 py-3 lg:hidden">
                        <AuditDetail r={r as Entry} />
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          ))}
          {!rows.length && !list.isPending && (
            <Card className="p-4 text-sm text-text-muted">لا عمليات مطابقة.</Card>
          )}
        </div>
      </WithSide>
      <Pager page={page} count={list.data?.count ?? 0} onPage={setPage} label="صفحات السجل" />
    </PortalShell>
  );
}
