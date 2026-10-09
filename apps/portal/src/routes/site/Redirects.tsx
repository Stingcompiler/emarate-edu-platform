import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Route, Trash2 } from "lucide-react";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  EmptyState,
  Notice,
  SideNote,
  WithSide,
  problemMessage,
} from "../../components/ui";
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
        {/* Phones: the two paths stacked with their labels, the button full width.
            Desktop (board DesktopSiteRedirects): one row, old → new. */}
        <Card className="p-3">
          <form
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (from && to && !add.isPending) add.mutate();
            }}
          >
            <label className="block min-w-0">
              <span className="mb-1 block text-xs text-text-muted">من (الرابط القديم)</span>
              <input
                dir="ltr"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="/old-path"
                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
              />
            </label>
            <span aria-hidden className="hidden pb-3 text-text-muted lg:block">
              ←
            </span>
            <label className="block min-w-0">
              <span className="mb-1 block text-xs text-text-muted">إلى (الرابط الجديد)</span>
              <input
                dir="ltr"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="/new-path"
                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
              />
            </label>
            <Button
              type="submit"
              className="min-h-11 w-full lg:w-auto"
              disabled={!from || !to || add.isPending}
            >
              + تحويل
            </Button>
          </form>
        </Card>
        {add.isError && (
          <div className="mt-3">
            <Notice>{problemMessage(add.error)}</Notice>
          </div>
        )}
        <Card className="mt-4 divide-y divide-border-soft">
          {paged.shown.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-4 py-3 text-sm lg:items-center">
              {/* Both paths in full (they wrap): on a phone the destination used to be cut off. */}
              <div
                className="min-w-0 flex-1 font-mono lg:flex lg:items-baseline lg:gap-2"
                dir="ltr"
              >
                <p className="break-all text-text">
                  <span className="sr-only">من </span>
                  {r.from_path}
                </p>
                <p className="mt-1 flex gap-1.5 text-text-muted lg:mt-0">
                  <span aria-hidden>→</span>
                  <span className="sr-only">إلى </span>
                  <span className="min-w-0 break-all">{r.to_path}</span>
                </p>
              </div>
              <span className="shrink-0 pt-3 text-xs text-text-muted lg:pt-0">
                {count(r.hits, N.time)}
              </span>
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
          {list.data && !list.data.length && (
            <EmptyState icon={<Route size={24} aria-hidden />} title="لا تحويلات بعد">
              أضف تحويلًا حين تغيّر رابط صفحة، فيصل من حفظ الرابط القديم إلى الجديد.
            </EmptyState>
          )}
        </Card>
        <Pager page={paged.page} count={paged.count} onPage={paged.setPage} />
      </WithSide>
    </PortalShell>
  );
}
