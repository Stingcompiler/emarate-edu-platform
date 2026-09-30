import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, SideNote, WithSide, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { ALL, Pager, useLocalPages } from "../../components/Pager";
import { useConfirm } from "../../components/Confirm";
import { count, N } from "../../lib/format";

/** Board: DesktopSiteRedirects (desktop). Phone derived as a card list. 404 suggestions arrive with the public site (Phase 9). */
export function Redirects() {
  const confirm = useConfirm();
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["site", "redirects"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/content/redirects", { params: { query: ALL } }))?.results ?? [],
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: ["site", "redirects"] });
  const add = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/content/redirects", {
        body: { from_path: from, to_path: to, permanent: true },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setFrom("");
      setTo("");
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.DELETE("/api/v1/content/redirects/{id}", { params: { path: { id } } });
    },
    onSuccess: refresh,
  });
  const paged = useLocalPages(list.data ?? []);
  return (
    <PortalShell
      title="التحويلات"
      subtitle={`${(list.data?.length ?? 0).toLocaleString("ar-u-nu-latn")} نشطة`}
      back={{ label: "محتوى الموقع", to: "/site" }}
    >
      <WithSide
        side={
          <SideNote title="متى تحتاج تحويلًا؟">
            حين يتغير رابط صفحة أو تُحذف، أضف تحويلًا من الرابط القديم إلى الجديد حتى لا يصل من حفظه
            أو وجده في Google إلى صفحة غير موجودة. العدّاد يبيّن كم مرة استُخدم.
          </SideNote>
        }
      >
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <input
            dir="ltr"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="/old-path"
            aria-label="من المسار"
            className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <span className="text-text-muted" aria-hidden>
            ←
          </span>
          <input
            dir="ltr"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="/new-path"
            aria-label="إلى المسار"
            className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <Button onClick={() => add.mutate()} disabled={!from || !to || add.isPending}>
            + تحويل
          </Button>
        </Card>
        {add.isError && (
          <div className="mt-3">
            <Notice>{problemMessage(add.error)}</Notice>
          </div>
        )}
        <Card className="mt-4 divide-y divide-border-soft">
          {paged.shown.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm" dir="ltr">
              <span className="min-w-0 flex-1 truncate font-mono text-text">
                {r.from_path} → {r.to_path}
              </span>
              <span className="text-xs text-text-muted">{count(r.hits, N.time)}</span>
              <button
                type="button"
                aria-label="حذف"
                onClick={async () =>
                  (await confirm({
                    title: "حذف التحويل؟",
                    body: `${r.from_path} ← ${r.to_path}`,
                    confirm: "حذف",
                  })) && remove.mutate(r.id)
                }
                className="grid size-11 place-items-center rounded-lg text-danger-strong hover:bg-danger-soft"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </Card>
        <Pager page={paged.page} count={paged.count} onPage={paged.setPage} />
      </WithSide>
    </PortalShell>
  );
}
