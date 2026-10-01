import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Notice,
  StatusBadge,
  STATUS_LABELS,
  problemMessage,
  WithSide,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { can } from "../../lib/nav";
import { CATEGORIES } from "./RegulationNew";
import { useToast } from "../../components/Toast";

/** Board: StudentRegulations (reading + acknowledgement sheet). Desktop: derived. */
export function RegulationDetail() {
  const { id = "" } = useParams();
  const me = useMe();
  const client = useQueryClient();
  const staff = can(me.data, "regulations.manage");
  const [agreed, setAgreed] = useState(false);
  const path = { params: { path: { public_id: id } } };
  const regulation = useQuery({
    queryKey: ["regulations", id],
    queryFn: async () => ok(await api.GET("/api/v1/regulations/{public_id}", path)) ?? null,
  });
  const done = () => client.invalidateQueries({ queryKey: ["regulations"] });
  const toast = useToast();
  const acknowledge = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST(
        "/api/v1/regulations/{public_id}/acknowledge",
        path,
      );
      if (!response.ok) throw error;
    },
    onSuccess: () => {
      toast("سُجّل إقرارك باللائحة");
      void done();
    },
  });
  const publish = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST("/api/v1/regulations/{public_id}/publish", path);
      if (!response.ok) throw error;
    },
    onSuccess: done,
  });
  const openFile = async (fileId: string) => {
    const { data } = await api.GET("/api/v1/files/{public_id}/url", {
      params: { path: { public_id: fileId } },
    });
    if (data) window.open(data.url, "_blank", "noopener");
  };

  const r = regulation.data;
  return (
    <PortalShell
      title={r?.title ?? "لائحة"}
      back={{ label: "اللوائح", to: "/regulations" }}
      subtitle={
        r ? `الإصدار ${r.version}${staff && r.is_public ? " · على موقع الكلية" : ""}` : undefined
      }
    >
      {r && (
        // Desktop: the text to read (and acknowledge) beside its file, status and actions.
        <WithSide
          side={
            <div className="space-y-4">
              {staff && (
                <StatusBadge status={r.status} label={STATUS_LABELS[r.status] ?? r.status} />
              )}
              {/* Everyone gets the regulation's facts beside its text. */}
              <Card className="divide-y divide-border-soft text-sm">
                {(
                  [
                    ["التصنيف", CATEGORIES.find((c) => c.key === r.category)?.label ?? "—"],
                    ["الإصدار", r.version],
                    [
                      "تسري من",
                      r.effective_from
                        ? new Date(r.effective_from).toLocaleDateString("ar-u-nu-latn", {
                            dateStyle: "long",
                          })
                        : "—",
                    ],
                    ["الإقرار", r.requires_acknowledgement ? "مطلوب" : "للاطلاع فقط"],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 px-4 py-3">
                    <span className="text-text-muted">{k}</span>
                    <span className="font-medium text-text">{v}</span>
                  </div>
                ))}
              </Card>
              {r.file_detail && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => openFile(r.file_detail!.public_id)}
                >
                  <FileText size={18} aria-hidden /> {r.file_detail.name}
                </Button>
              )}
              {r.acknowledged && <Notice tone="success">أقررت بهذه اللائحة.</Notice>}
              {staff && r.status === "draft" && (
                <Button
                  className="w-full"
                  onClick={() => publish.mutate()}
                  disabled={publish.isPending}
                >
                  نشر الإصدار {r.version}
                </Button>
              )}
              {(acknowledge.isError || publish.isError) && (
                <Notice>{problemMessage(acknowledge.error ?? publish.error)}</Notice>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            {r.body && (
              <Card className="p-4">
                <p className="whitespace-pre-line text-[15px] leading-loose text-text">{r.body}</p>
              </Card>
            )}
            {r.requires_acknowledgement && r.acknowledged === false && (
              <Card className="sticky bottom-24 space-y-3 p-4 shadow-md lg:static lg:shadow-xs">
                <label className="flex items-center gap-3 text-sm text-text">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-primary)]"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  قرأت اللائحة وأقرّ بالالتزام بها
                </label>
                <Button
                  className="w-full"
                  disabled={!agreed || acknowledge.isPending}
                  onClick={() => acknowledge.mutate()}
                >
                  تسجيل الإقرار
                </Button>
              </Card>
            )}
          </div>
        </WithSide>
      )}
    </PortalShell>
  );
}
