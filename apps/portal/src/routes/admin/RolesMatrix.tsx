import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, Notice, ScrollRegion, WithSide } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { downloadCsv, num } from "../../lib/reports";

/** What each capability lets a role do (accounts/rbac.py; docs/03 is the reference). */
const CAPABILITY: Record<string, string> = {
  "settings.manage": "إعدادات النظام",
  "structure.manage": "تعديل الهيكل الأكاديمي",
  "structure.view": "عرض الهيكل الأكاديمي",
  "users.view": "عرض المستخدمين",
  "audit.view": "سجل التدقيق",
  "courses.view": "عرض المواد",
  "courses.manage": "المواد والتعيينات",
  "courses.delete": "حذف المواد",
  "membership.manage": "إضافة أعضاء القسم",
  "membership.remove": "إزالة أعضاء القسم",
  "learning.view": "عرض المحاضرات والأعمال",
  "learning.manage": "المحاضرات والواجبات والاختبارات",
  "learning.delete": "حذف المحاضرات والواجبات والاختبارات",
  "students.view": "عرض سجلات الطلاب",
  "students.import": "استيراد سجل الطلاب",
  "students.manage": "إضافة سجلات الطلاب وتعديلها",
  "students.delete": "حذف سجل طالب أُضيف خطأً",
  "students.status": "تغيير حالة الطالب",
  "registration.approve": "اعتماد طلبات التسجيل",
  "enrollment.manage": "التسجيل في المواد",
  "results.manage": "رفع النتائج ونشرها",
  "results.view": "عرض النتائج",
  "results.correct": "طلب تعديل نتيجة",
  "results.approve": "الموافقة على تعديل النتائج",
  "results.settings": "إعدادات عرض النتائج",
  "regulations.manage": "نشر اللوائح",
  "cases.manage": "إدارة حالات الطلاب",
  "cases.view": "عرض الحالات",
  "admissions.manage": "إدارة القبول: الدورات والقوالب والقرار",
  "admissions.review": "مراجعة طلبات التقديم",
  "admissions.view": "عرض طلبات التقديم",
  "reports.department": "تقارير القسم",
  "reports.teachers": "مؤشرات الأساتذة",
  "reports.admissions": "تقارير القبول",
  "reports.affairs": "تقارير شؤون الطلاب",
  "hr.view": "الموارد البشرية",
  "hr.notify": "تنبيه الأساتذة",
  "content.manage": "محتوى الموقع",
  "events.manage": "الفعاليات",
};
const GROUPS: [string, string[]][] = [
  ["النظام", ["settings", "structure", "users", "audit"]],
  ["القسم والتدريس", ["courses", "membership", "learning"]],
  ["الطلاب والتسجيل", ["students", "registration", "enrollment"]],
  ["النتائج", ["results"]],
  ["شؤون الطلاب", ["regulations", "cases"]],
  ["القبول", ["admissions"]],
  ["التقارير والموارد البشرية", ["reports", "hr"]],
  ["الموقع", ["content", "events"]],
];

/**
 * «الأدوار والصلاحيات» (review 2026-09-29 PR 7, board DesktopRolesMatrix): read-only — the
 * matrix is what the code enforces, so changing it is a code change reviewed against docs/03.
 * Roles are given to people from «المستخدمون».
 */
export function Roles() {
  const matrix = useQuery({
    queryKey: ["roles"],
    queryFn: async () => ok(await api.GET("/api/v1/roles")) ?? null,
  });
  const [picked, setPicked] = useState("system_admin");
  const m = matrix.data;
  const roles = m?.roles ?? [];
  const role = roles.find((r) => r.key === picked) ?? roles[0];
  const caps = m?.capabilities ?? [];
  const mine = caps.filter((c) => role && c.roles.includes(role.key));
  const grouped = GROUPS.map(([title, prefixes]) => ({
    title,
    rows: caps.filter((c) => prefixes.includes(c.key.split(".")[0]!)),
  })).filter((g) => g.rows.length);
  const csv = () =>
    downloadCsv(
      "roles-matrix",
      ["الصلاحية", ...roles.map((r) => r.label)],
      caps.map((c) => [
        CAPABILITY[c.key] ?? c.key,
        ...roles.map((r) => (c.roles.includes(r.key) ? (r.department_scoped ? "قسمه" : "✓") : "")),
      ]),
    );
  return (
    <PortalShell
      title={`الأدوار والصلاحيات · ${num(roles.length)}`}
      subtitle="للقراءة: المصفوفة كما يطبّقها النظام (docs/03). تُمنح الأدوار للأشخاص من «المستخدمون»."
      back={{ label: "إدارة النظام", to: "/system" }}
      titleAction={
        <button
          type="button"
          onClick={csv}
          className="min-h-9 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-alt"
        >
          تصدير المصفوفة
        </button>
      }
    >
      <WithSide
        side={
          role && (
            <Card className="p-4 text-sm">
              <b className="block text-base text-text">{role.label}</b>
              <dl className="mt-2 divide-y divide-border-soft">
                {[
                  [
                    "المعرّف",
                    <bdi key="k" className="font-mono text-xs">
                      {role.key}
                    </bdi>,
                  ],
                  ["النطاق", role.department_scoped ? "قسم واحد (إلزامي)" : "الكلية"],
                  ["المستخدمون", num(role.users)],
                  ["الصلاحيات", num(mine.length)],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-3 py-1.5">
                    <dt className="text-text-muted">{k}</dt>
                    <dd className="font-semibold text-text">{v}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-3 space-y-1 text-xs text-text-muted">
                {mine.map((c) => (
                  <li key={c.key}>· {CAPABILITY[c.key] ?? c.key}</li>
                ))}
              </ul>
              <Link
                to={`/system/users?role=${role.key}`}
                className="mt-4 inline-block font-semibold text-primary hover:underline"
              >
                من يحمل هذا الدور
              </Link>
            </Card>
          )
        }
      >
        {matrix.isError && <Notice>تعذّر تحميل المصفوفة.</Notice>}
        <Card className="overflow-hidden">
          <ScrollRegion label="مصفوفة الصلاحيات">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-surface-alt text-text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    الصلاحية
                  </th>
                  {roles.map((r) => (
                    <th key={r.key} scope="col" className="px-1 py-2 align-bottom font-medium">
                      <button
                        type="button"
                        onClick={() => setPicked(r.key)}
                        aria-pressed={role?.key === r.key}
                        className={`mx-auto block rounded px-1 py-1 [writing-mode:vertical-rl] hover:text-text ${role?.key === r.key ? "bg-primary-soft font-bold text-primary-700" : ""}`}
                      >
                        {r.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              {grouped.map((g) => (
                <tbody key={g.title} className="divide-y divide-border-soft">
                  <tr className="bg-bg-subtle">
                    <th
                      scope="rowgroup"
                      colSpan={roles.length + 1}
                      className="px-3 py-1.5 text-start text-[11px] font-semibold text-text-muted"
                    >
                      {g.title}
                    </th>
                  </tr>
                  {g.rows.map((c) => (
                    <tr key={c.key}>
                      <th scope="row" className="px-3 py-2 text-start font-normal text-text">
                        {CAPABILITY[c.key] ?? c.key}
                      </th>
                      {roles.map((r) => {
                        const has = c.roles.includes(r.key);
                        return (
                          <td
                            key={r.key}
                            className={`px-1 py-2 text-center ${role?.key === r.key ? "bg-primary-soft/30" : ""}`}
                          >
                            {has ? (
                              <span
                                className={`inline-grid min-w-6 place-items-center rounded px-1 py-0.5 font-bold ${r.department_scoped ? "bg-info-soft text-info-strong" : "bg-success-soft text-success-strong"}`}
                              >
                                {r.department_scoped ? "قسمه" : "✓"}
                              </span>
                            ) : (
                              <span className="text-n300" aria-label="لا">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </ScrollRegion>
        </Card>
        <p className="mt-2 text-xs text-text-muted">
          ✓ في كل الكلية · «قسمه» داخل قسمه فقط · — لا يملكها. اختر عمود دور لترى تفاصيله.
        </p>
      </WithSide>
    </PortalShell>
  );
}
