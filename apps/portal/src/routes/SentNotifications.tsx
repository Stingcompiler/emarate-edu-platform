import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";

import { useConfirm } from "../components/Confirm";
import { Button, Card, EmptyState, Notice, StatusBadge, problemMessage } from "../components/ui";
import { api, ok } from "../lib/api";
import { hasRole, useMe } from "../lib/auth";
import { when } from "../lib/format";

/**
 * «المرسلة»: the notifications one sent stay here, with how many read them (owner, 2026-11-05).
 * Deleting one removes it from every recipient; the system admin does it at once, anyone else
 * asks and the system admin or supervisor decides.
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
  const rows = sent.data ?? [];
  if (sent.isSuccess && !rows.length)
    return (
      <EmptyState icon={<Send size={24} aria-hidden />} title="لم ترسل إشعارات بعد">
        ما ترسله من «إشعار جديد» يبقى هنا.
      </EmptyState>
    );
  return (
    <div className="space-y-3">
      {remove.isError && <Notice>{problemMessage(remove.error)}</Notice>}
      {rows.map((n) => (
        <Card key={n.public_id} className="p-4">
          <h2 className="font-bold text-text">{n.title}</h2>
          {n.body && <p className="mt-1 whitespace-pre-line text-sm text-text">{n.body}</p>}
          <p className="mt-2 text-xs text-text-muted">
            {when(n.created_at)} · قرأه {(n.read_count ?? 0).toLocaleString("ar-u-nu-latn")} من{" "}
            {(n.recipients_count ?? 0).toLocaleString("ar-u-nu-latn")}
          </p>
          <div className="mt-3 border-t border-border-soft pt-3">
            {n.deletion_pending ? (
              <StatusBadge status="pending" label="طلب الحذف بانتظار الموافقة" />
            ) : (
              <Button
                variant="ghost"
                className="min-h-10 px-2 text-sm text-danger-strong"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: atOnce ? `حذف «${n.title}»؟` : `طلب حذف «${n.title}»؟`,
                      body: atOnce
                        ? "يُحذف الإشعار من صناديق كل من وصلهم."
                        : "يبقى الإشعار حتى يوافق مدير النظام أو مشرف النظام على حذفه من صناديق من وصلهم، ويصلك إشعار بالقرار.",
                      confirm: atOnce ? "حذف" : "إرسال الطلب",
                      tone: atOnce ? "danger" : "primary",
                    })
                  )
                    remove.mutate(n.public_id);
                }}
              >
                <Trash2 size={16} aria-hidden />
                {atOnce ? "حذف" : "طلب حذف"}
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
