import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, SectionLabel, problemMessage, WithSide } from "../../components/ui";
import { api } from "../../lib/api";
import { TOPIC_LABEL, days, num, pct } from "../../lib/reports";

/** A teacher reads an HR notice (notification action URL) and acknowledges it. */
export function MyNotice() {
  const { id = "" } = useParams();
  const client = useQueryClient();
  const path = { params: { path: { public_id: id } } };
  const notice = useQuery({
    queryKey: ["hr-notices", id],
    queryFn: async () => (await api.GET("/api/v1/hr-notices/{public_id}", path)).data ?? null,
  });
  const ack = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/hr-notices/{public_id}/acknowledge", path);
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["hr-notices", id] }),
  });
  const n = notice.data;
  const e = (n?.evidence ?? {}) as Record<string, number | string | null>;
  return (
    <PortalShell
      title={n?.subject ?? "تنبيه"}
      subtitle={
        n
          ? `${n.sent_by} · ${new Date(n.created_at).toLocaleDateString("ar")} · ${TOPIC_LABEL[n.topic ?? "other"]}`
          : undefined
      }
      back={{ label: "الإشعارات", to: "/notifications" }}
    >
      {n && (
        <WithSide
          side={
            <div className="space-y-4">
              {n.acknowledged_at ? (
                <Notice tone="success">
                  أقررت بالاطلاع في {new Date(n.acknowledged_at).toLocaleString("ar")}.
                </Notice>
              ) : n.requires_ack ? (
                <Button onClick={() => ack.mutate()} disabled={ack.isPending}>
                  أقرّ بالاطلاع
                </Button>
              ) : null}
              {ack.isError && <Notice>{problemMessage(ack.error)}</Notice>}
            </div>
          }
        >
          <div className="space-y-4">
            <Card className="whitespace-pre-line p-4 text-sm leading-7 text-text">{n.body}</Card>
            {e.term && (
              <>
                <SectionLabel>المؤشرات عند الإرسال — {String(e.term)}</SectionLabel>
                <Card className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
                  <span>
                    <b className="block text-lg">{days(e.grading_days as number | null)}</b>
                    <span className="text-xs text-text-muted">زمن التصحيح</span>
                  </span>
                  <span>
                    <b className="block text-lg">{pct(e.upload_percent as number | null)}</b>
                    <span className="text-xs text-text-muted">انتظام الرفع</span>
                  </span>
                  <span>
                    <b className="block text-lg">{num(e.ungraded as number | null)}</b>
                    <span className="text-xs text-text-muted">غير مصحح</span>
                  </span>
                  <span>
                    <b className="block text-lg">
                      {num(e.live_held as number | null)}/{num(e.live_planned as number | null)}
                    </b>
                    <span className="text-xs text-text-muted">بث منفذ</span>
                  </span>
                </Card>
              </>
            )}
          </div>
        </WithSide>
      )}
    </PortalShell>
  );
}
