import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, X } from "lucide-react";
import { useState } from "react";

import { useConfirm } from "../../components/Confirm";
import { DeleteEverythingDialog } from "../../components/DeleteEverything";
import { FormDialog } from "../../components/FormDialog";
import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Notice,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { can } from "../../lib/nav";

const STATES = [
  { key: "pending", label: "بانتظار القرار" },
  { key: "", label: "الكل" },
] as const;
const KIND: Record<string, string> = {
  announcement: "إعلان",
  notification: "إشعار",
  student: "طلاب",
  course: "مادة",
};
// A head's request to delete students or a course (owner, 2026-11-15): the system admin alone
// decides; approving is the deletion itself, with its preview, confirmation and password.
const RECORDS = new Set(["student", "course"]);
const STATE: Record<string, [string, string]> = {
  pending: ["pending", "بانتظار القرار"],
  approved: ["approved", "حُذف"],
  rejected: ["rejected", "رُفض"],
};

/**
 * «طلبات الحذف» (owner, 2026-11-05): announcements and sent notifications their authors asked
 * to delete. The system admin or the system supervisor approves (it is deleted, and the author
 * told) or refuses (it stays). Since 2026-11-15 also students and courses a department's or a
 * programme's head asked to delete with everything they hold: the system admin alone decides.
 */
export function Deletions() {
  const confirm = useConfirm();
  const client = useQueryClient();
  const decidesRecords = can(useMe().data, "deletions.approve_records");
  const [approving, setApproving] = useState<{ id: number; kind: string; ids: string[] } | null>(
    null,
  );
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [note, setNote] = useState("");
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
    mutationFn: async ({ id, approve, note }: { id: number; approve: boolean; note?: string }) => {
      const path = approve
        ? "/api/v1/deletion-requests/{id}/approve"
        : "/api/v1/deletion-requests/{id}/reject";
      const { data, error } = await api.POST(path, {
        params: { path: { id } },
        body: note ? { note } : {},
      });
      if (!data) throw error;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["deletion-requests"] }),
  });
  const rows = list.data ?? [];
  return (
    <PortalShell
      title="طلبات الحذف"
      subtitle="إعلانات وإشعارات طلب أصحابها حذفها، وطلاب ومواد طلب رؤساء الأقسام والبرامج حذفها"
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
                {RECORDS.has(r.kind) && r.state === "pending" && (
                  <ul
                    className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm"
                    data-request-preview
                  >
                    {Object.entries(r.preview ?? {}).map(([what, n]) => (
                      <li
                        key={what}
                        className="flex justify-between border-b border-border-soft py-1"
                      >
                        <span className="text-text-muted">{what}</span>
                        <b>{Number(n).toLocaleString("ar-u-nu-latn")}</b>
                      </li>
                    ))}
                  </ul>
                )}
                {RECORDS.has(r.kind) && r.state === "rejected" && r.decision_note && (
                  <p className="mt-2 text-sm text-text-muted">سبب الرفض: {r.decision_note}</p>
                )}
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
                {r.state === "pending" && !r.is_mine && RECORDS.has(r.kind) && !decidesRecords && (
                  <p className="mt-3 border-t border-border-soft pt-3 text-xs text-text-muted">
                    يقرّر في حذف الطلاب والمواد مدير النظام وحده.
                  </p>
                )}
                {r.state === "pending" && !r.is_mine && RECORDS.has(r.kind) && decidesRecords && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border-soft pt-3">
                    <Button
                      className="min-h-10"
                      onClick={() =>
                        setApproving({ id: r.id, kind: r.kind, ids: (r.targets ?? []).map(String) })
                      }
                    >
                      <Check size={16} aria-hidden />
                      موافقة وحذف
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-10"
                      onClick={() => {
                        setNote("");
                        setRejecting(r.id);
                      }}
                    >
                      <X size={16} aria-hidden />
                      رفض
                    </Button>
                  </div>
                )}
                {r.state === "pending" && !r.is_mine && !RECORDS.has(r.kind) && (
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
      {approving && (
        <DeleteEverythingDialog
          kind={approving.kind as "student" | "course"}
          ids={approving.ids}
          requestId={approving.id}
          onDone={() => void client.invalidateQueries({ queryKey: ["deletion-requests"] })}
          onClose={() => setApproving(null)}
        />
      )}
      {rejecting != null && (
        <FormDialog
          title="رفض طلب الحذف"
          submit={decide.isPending ? "جارٍ الرفض…" : "رفض الطلب"}
          busy={decide.isPending}
          onSubmit={() =>
            decide.mutate(
              { id: rejecting, approve: false, note: note.trim() },
              { onSuccess: () => setRejecting(null) },
            )
          }
          onClose={() => setRejecting(null)}
        >
          <Card>
            <Field
              label="سبب الرفض (يصل إلى صاحب الطلب)"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Card>
        </FormDialog>
      )}
    </PortalShell>
  );
}
