import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, RotateCcw, Send, Trash2 } from "lucide-react";

import { useConfirm } from "../components/Confirm";
import { Button, Card, EmptyState, Notice, StatusBadge, problemMessage } from "../components/ui";
import { api, ok } from "../lib/api";
import { hasRole, useMe } from "../lib/auth";
import { when } from "../lib/format";

/**
 * «المرسلة»: the notifications one sent stay here, with how many read them (owner, 2026-11-05).
 * «حذف» is soft and immediate: off every inbox, kept here, «استعادة» brings it back. Deleting
 * for good is the system admin's at once, anyone else's by request (admin or supervisor).
 */
export function SentNotifications() {
  const me = useMe();
  const confirm = useConfirm();
  const client = useQueryClient();
  const atOnce = hasRole(me.data, "system_admin");
  const sent = useQuery({
    queryKey: ["notifications", "sent"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/notifications/sent", {
          params: { query: { page_size: 100 } as never },
        }),
      )?.results ?? [],
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE("/api/v1/notifications/sent/{public_id}", {
        params: { path: { public_id: id } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications", "sent"] }),
  });
  const hide = useMutation({
    mutationFn: async ({ id, hidden }: { id: string; hidden: boolean }) => {
      const path = hidden
        ? "/api/v1/notifications/sent/{public_id}/hide"
        : "/api/v1/notifications/sent/{public_id}/restore";
      const { data, error } = await api.POST(path, { params: { path: { public_id: id } } });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const rows = sent.data ?? [];
  if (sent.isSuccess && !rows.length)
    return (
      <EmptyState icon={<Send size={24} aria-hidden />} title="لم ترسل إشعارات بعد">
        ما ترسله من «إشعار جديد» يبقى هنا.
      </EmptyState>
    );
  return (
    <div className="space-y-3">
      {(remove.isError || hide.isError) && (
        <Notice>{problemMessage(remove.error ?? hide.error)}</Notice>
      )}
      {rows.map((n) => (
        <Card key={n.public_id} className="p-4">
          <h2 className="font-bold text-text">{n.title}</h2>
          {n.body && <p className="mt-1 whitespace-pre-line text-sm text-text">{n.body}</p>}
          <p className="mt-2 text-xs text-text-muted">
            {when(n.created_at)} · قرأه {(n.read_count ?? 0).toLocaleString("ar-u-nu-latn")} من{" "}
            {(n.recipients_count ?? 0).toLocaleString("ar-u-nu-latn")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-soft pt-3">
            {n.hidden_at ? (
              <>
                <StatusBadge status="closed" label="محذوف — مخفي عن المستلمين" />
                <Button
                  variant="secondary"
                  className="min-h-10 px-3 text-sm"
                  disabled={hide.isPending}
                  onClick={() => hide.mutate({ id: n.public_id, hidden: false })}
                >
                  <RotateCcw size={16} aria-hidden />
                  استعادة
                </Button>
                {n.deletion_pending ? (
                  <StatusBadge status="pending" label="الحذف النهائي بانتظار الموافقة" />
                ) : (
                  <Button
                    variant="ghost"
                    className="min-h-10 px-2 text-sm text-danger-strong"
                    disabled={remove.isPending}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `حذف «${n.title}» نهائيًا؟`,
                          body: atOnce
                            ? "يُحذف الإشعار نهائيًا ولا يمكن استعادته."
                            : "يُرسل طلب إلى مدير النظام أو مشرف النظام؛ بعد موافقته لا يمكن استعادة الإشعار.",
                          confirm: atOnce ? "حذف نهائي" : "إرسال الطلب",
                          tone: atOnce ? "danger" : "primary",
                        })
                      )
                        remove.mutate(n.public_id);
                    }}
                  >
                    <Trash2 size={16} aria-hidden />
                    {atOnce ? "حذف نهائي" : "طلب حذف نهائي"}
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="ghost"
                className="min-h-10 px-2 text-sm text-danger-strong"
                disabled={hide.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `حذف «${n.title}»؟`,
                      body: "يختفي الآن من صناديق كل من وصلهم، ويبقى هنا لتستعيده متى شئت.",
                      confirm: "حذف",
                    })
                  )
                    hide.mutate({ id: n.public_id, hidden: true });
                }}
              >
                <EyeOff size={16} aria-hidden />
                حذف
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
