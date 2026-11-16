import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { PortalShell } from "../../components/PortalShell";
import { Card, EmptyState, StatusBadge } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when } from "../../lib/format";

const KIND: Record<string, string> = { student: "طلاب", course: "مادة", program: "برنامج" };
const STATE: Record<string, [string, string]> = {
  pending: ["pending", "بانتظار قرار مدير النظام"],
  approved: ["approved", "حُذف"],
  rejected: ["rejected", "رُفض"],
};

/**
 * «طلبات الحذف التي أرسلتها»: the students and courses a department's or a programme's head asked
 * the system admin to delete (owner, 2026-11-15), and what was decided — with the reason when
 * it was refused.
 */
export function MyDeletionRequests() {
  const list = useQuery({
    queryKey: ["deletion-requests", "mine"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/deletion-requests/mine", {
          params: { query: { page_size: 100 } as never },
        }),
      )?.results ?? [],
  });
  const rows = list.data ?? [];
  return (
    <PortalShell
      title="طلبات الحذف التي أرسلتها"
      subtitle="يقرّر فيها مدير النظام؛ لا يتغيّر شيء قبل قراره"
      back={{ label: "طلاب القسم", to: "/department/students" }}
    >
      {list.isSuccess && !rows.length ? (
        <Card>
          <EmptyState icon={<Trash2 size={24} aria-hidden />} title="لا طلبات">
            لم ترسل طلب حذف بعد.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {rows.map((r) => {
            const [tone, label] = STATE[r.state ?? "pending"] ?? ["pending", r.state ?? ""];
            return (
              <Card key={r.id} className="p-4" data-my-request={r.state}>
                <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>{KIND[r.kind] ?? r.kind}</span>
                  <StatusBadge status={tone} label={label} />
                </p>
                <h2 className="mt-1 font-bold text-text">{r.title}</h2>
                <p className="mt-1 text-sm text-text-muted">{when(r.created_at)}</p>
                {r.reason && <p className="mt-2 text-sm">السبب: {r.reason}</p>}
                {r.state === "rejected" && r.decision_note && (
                  <p className="mt-2 text-sm text-text-muted">سبب الرفض: {r.decision_note}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
