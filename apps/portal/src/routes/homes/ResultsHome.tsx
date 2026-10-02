import { useQuery } from "@tanstack/react-query";
import { FileUp, Search, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, SectionLabel, StatusBadge, STATUS_LABELS } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when, fileName } from "../../lib/format";
import { num } from "../../lib/reports";
import { Inbox } from "./Inbox";
import { ALL } from "../../components/Pager";

/** Board: ResultsOfficerHome (phone); desktop derived — actions and batches beside display settings. */
export function ResultsHome() {
  const me = useMe();
  const batches = useQuery({
    queryKey: ["result-imports", "home"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/result-imports", { params: { query: { page_size: 20 } } }))
        ?.results ?? [],
  });
  const corrections = useQuery({
    queryKey: ["result-corrections", "pending"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/result-corrections", {
          params: { query: { ...ALL, status: "pending" } },
        }),
      )?.count ?? 0,
  });
  const display = useQuery({
    queryKey: ["results", "settings"],
    queryFn: async () => ok(await api.GET("/api/v1/results/settings")) ?? null,
  });
  const list = batches.data ?? [];
  const d = display.data;
  const fields = d
    ? [d.show_score, d.show_letter, d.show_points, d.show_gpa].filter(Boolean).length
    : 0;
  return (
    <PortalShell
      title="النتائج"
      subtitle={`${me.data?.full_name_ar ?? ""} · مسؤول النتائج · الرفع بملف جاهز فقط`}
    >
      <div className="grid grid-cols-3 gap-2">
        {[
          { to: "/result-imports", label: "رفع ملف نتائج", icon: FileUp },
          { to: "/results/search", label: "بحث نتيجة", icon: Search },
          { to: "/results/settings", label: "إعدادات العرض", icon: SlidersHorizontal },
        ].map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="rounded-2xl bg-surface p-3 text-center text-xs font-semibold shadow-sm hover:bg-surface-alt"
          >
            <a.icon size={20} className="mx-auto mb-1 text-primary" aria-hidden />
            {a.label}
          </Link>
        ))}
      </div>
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="space-y-4">
          <SectionLabel>يحتاج إجراءً</SectionLabel>
          <Inbox
            items={[
              {
                n: list.filter((b) => b.status === "has_errors").length,
                title: "دفعات بها أخطاء",
                meta: list
                  .filter((b) => b.status === "has_errors")
                  .map((b) => fileName(b.file_name))
                  .join(" · "),
                to: "/result-imports",
                tone: "danger",
              },
              {
                n: list.filter((b) => b.status === "validated").length,
                title: "دفعات جاهزة للاعتماد",
                to: "/result-imports",
              },
              {
                n: list.filter((b) => b.status === "committed").length,
                title: "دفعات معتمدة بانتظار النشر",
                to: "/result-imports",
                tone: "info",
              },
              {
                n: corrections.data ?? 0,
                title: "طلبات تعديل بانتظار موافقة أمين الشؤون العلمية",
                to: "/result-corrections",
                tone: "info",
              },
            ]}
          />
          <SectionLabel>الدفعات</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {list.map((b) => (
              <Link
                key={b.public_id}
                to={`/result-imports/${b.public_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{fileName(b.file_name)}</b>
                  <span className="text-xs text-text-muted">
                    {b.department_name || "الكلية"} · {b.term_name} · {b.uploaded_by} ·{" "}
                    {when(b.created_at)}
                  </span>
                </span>
                <StatusBadge status={b.status} label={STATUS_LABELS[b.status] ?? b.status} />
              </Link>
            ))}
            {!list.length && <p className="px-4 py-4 text-sm text-text-muted">لا دفعات بعد.</p>}
          </Card>
        </div>
        <aside className="mt-6 space-y-4 lg:mt-0">
          <SectionLabel>إعدادات العرض</SectionLabel>
          <Link to="/results/settings" className="block">
            <Card className="divide-y divide-border-soft text-sm hover:shadow-md">
              <p className="flex justify-between px-4 py-2.5">
                <span className="text-text-muted">الحقول الظاهرة</span>
                <b>
                  {num(fields)}/{num(4)}
                </b>
              </p>
              <p className="flex justify-between px-4 py-2.5">
                <span className="text-text-muted">السجل السابق</span>
                <b>{d?.history_open ? "مفتوح" : "مغلق"}</b>
              </p>
              {d?.notice_text && (
                <p className="px-4 py-2.5 text-xs text-text-muted">{d.notice_text}</p>
              )}
            </Card>
          </Link>
        </aside>
      </div>
    </PortalShell>
  );
}
