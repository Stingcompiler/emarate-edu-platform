import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, X } from "lucide-react";
import { useState } from "react";

import { useConfirm } from "../../components/Confirm";
import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Notice,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when } from "../../lib/format";

const STATES = [
  { key: "pending", label: "بانتظار القرار" },
  { key: "", label: "الكل" },
] as const;
const KIND: Record<string, string> = { announcement: "إعلان", notification: "إشعار" };
const STATE: Record<string, [string, string]> = {
  pending: ["pending", "بانتظار القرار"],
  approved: ["approved", "حُذف"],
  rejected: ["rejected", "رُفض"],
};

/**
 * «طلبات الحذف» (owner, 2026-11-05): announcements and sent notifications their authors asked
 * to delete. The system admin or the system supervisor approves (it is deleted, and the author
 * told) or refuses (it stays).
 */
export function Deletions() {
  const confirm = useConfirm();
  const client = useQueryClient();
  const [state, setState] = useState<string>("pending");
  const list = useQuery({
    queryKey: ["deletion-requests", state],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/deletion-requests", {
          params: { query: { page_size: 100, ...(state ? { state } : {}) } as never },
        }),
      )?.results ?? [],
  });
  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: number; approve: boolean }) => {
      const path = approve
        ? "/api/v1/deletion-requests/{id}/approve"
        : "/api/v1/deletion-requests/{id}/reject";
      const { data, error } = await api.POST(path, { params: { path: { id } }, body: {} });
      if (!data) throw error;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["deletion-requests"] }),
  });
  const rows = list.data ?? [];
  return (
    <PortalShell
      title="طلبات الحذف"
      subtitle="إعلانات وإشعارات طلب أصحابها حذفها"
      back={{ label: "إدارة النظام", to: "/system" }}
    >
      <div className="mb-4 flex gap-2">
        {STATES.map((s) => (
          <Chip key={s.key} active={state === s.key} onClick={() => setState(s.key)}>
            {s.label}
          </Chip>
        ))}
      </div>
      {decide.isError && (
        <div className="mb-3">
          <Notice>{problemMessage(decide.error)}</Notice>
        </div>
      )}
      {list.isSuccess && !rows.length ? (
        <Card>
          <EmptyState icon={<Trash2 size={24} aria-hidden />} title="لا طلبات">
            {state === "pending" ? "لا شيء ينتظر قرارك." : "لم يُطلب حذف شيء بعد."}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {rows.map((r) => {
            const [tone, label] = STATE[r.state ?? "pending"] ?? ["pending", r.state ?? ""];
            return (
              <Card key={r.id} className="p-4">
                <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>{KIND[r.kind] ?? r.kind}</span>
                  <StatusBadge status={tone} label={label} />
                </p>
                <h2 className="mt-1 font-bold text-text">{r.title}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  طلبه {r.requested_by_name} · {when(r.created_at)}
                </p>
                {r.reason && <p className="mt-2 text-sm text-text">السبب: {r.reason}</p>}
                {r.state !== "pending" && r.decided_by_name && (
                  <p className="mt-2 text-xs text-text-muted">
                    {r.state === "approved" ? "وافق" : "رفض"} {r.decided_by_name}
                    {r.decided_at ? ` · ${when(r.decided_at)}` : ""}
                  </p>
                )}
                {r.state === "pending" && r.is_mine && (
                  <p className="mt-3 border-t border-border-soft pt-3 text-xs text-text-muted">
                    طلبتَه بنفسك؛ يقرّر فيه معتمد آخر.
                  </p>
                )}
                {r.state === "pending" && !r.is_mine && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border-soft pt-3">
                    <Button
                      className="min-h-10"
                      disabled={decide.isPending}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `حذف ${KIND[r.kind] ?? ""} «${r.title}»؟`,
                            body:
                              r.kind === "notification"
                                ? "يُحذف الإشعار من صناديق كل من وصلهم، ويُبلَّغ صاحبه. لا يمكن التراجع."
                                : "يُحذف الإعلان من البوابة والموقع، ويُبلَّغ صاحبه. لا يمكن التراجع.",
                            confirm: "الموافقة والحذف",
                          })
                        )
                          decide.mutate({ id: r.id, approve: true });
                      }}
                    >
                      <Check size={16} aria-hidden />
                      موافقة وحذف
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-10"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: r.id, approve: false })}
                    >
                      <X size={16} aria-hidden />
                      رفض
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
