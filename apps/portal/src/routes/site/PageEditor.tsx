import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  SectionLabel,
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";

type Block = {
  type: "heading" | "paragraph" | "note" | "html" | "image" | "cta";
  text?: string;
  html?: string;
  url?: string;
  alt?: string;
};
const TYPES: { key: Block["type"]; label: string }[] = [
  { key: "heading", label: "عنوان" },
  { key: "paragraph", label: "فقرة" },
  { key: "note", label: "ملاحظة بارزة" },
  { key: "image", label: "صورة" },
  { key: "cta", label: "زر إجراء" },
  { key: "html", label: "HTML" },
];

/** Board: DesktopSiteCMS (desktop): blocks editor + live preview. Phone derived: stacked. */
export function PageEditor() {
  const { id } = useParams();
  const creating = !id || id === "new";
  const navigate = useNavigate();
  const client = useQueryClient();
  const page = useQuery({
    queryKey: ["site", "pages", id],
    enabled: !creating,
    queryFn: async () =>
      (await api.GET("/api/v1/content/pages/{public_id}", { params: { path: { public_id: id! } } }))
        .data ?? null,
  });
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([{ type: "paragraph", text: "" }]);
  useEffect(() => {
    if (page.data) {
      setSlug(page.data.slug);
      setTitle(page.data.title_ar);
      setBlocks((page.data.blocks as Block[]) ?? []);
    }
  }, [page.data]);
  const save = useMutation({
    mutationFn: async (status: "draft" | "published") => {
      const body = { slug, title_ar: title, blocks, status } as never;
      const res = creating
        ? await api.POST("/api/v1/content/pages", { body })
        : await api.PATCH("/api/v1/content/pages/{public_id}", {
            params: { path: { public_id: id! } },
            body,
          });
      if (!res.data) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: ["site"] });
      if (creating) navigate(`/site/pages/${data.public_id}`, { replace: true });
    },
  });
  const update = (i: number, patch: Partial<Block>) =>
    setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const moveBlock = (i: number, d: number) =>
    setBlocks((bs) => {
      const next = [...bs];
      const [x] = next.splice(i, 1);
      next.splice(i + d, 0, x!);
      return next;
    });

  return (
    <PortalShell
      title={title || "صفحة جديدة"}
      subtitle={
        page.data
          ? page.data.status === "published"
            ? "منشورة"
            : "مسودة · تغييرات غير منشورة"
          : undefined
      }
      back={{ label: "محتوى الموقع", to: "/site" }}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div>
          <Card>
            <Field label="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Field
              label="الرابط"
              dir="ltr"
              value={slug}
              // An official page (about/dean, privacy …) keeps its address on the site.
              disabled={page.data?.official}
              onChange={(e) =>
                setSlug(e.target.value.replace(/[^a-z0-9؀-ۿ/-]/gi, "-").toLowerCase())
              }
              hint={
                page.data?.official
                  ? `صفحة رسمية — تظهر على /${page.data.path}/ وفي قوائم الموقع بعد نشرها`
                  : `تظهر على /${slug ? (page.data?.path ?? `p/${slug}`) : "p/…"}/`
              }
            />
          </Card>
          <SectionLabel>الكتل</SectionLabel>
          <div className="space-y-3">
            {blocks.map((b, i) => (
              <Card key={i} className="p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
                  <span className="font-semibold">
                    {TYPES.find((t) => t.key === b.type)?.label}
                  </span>
                  <span className="ms-auto flex gap-1">
                    <button
                      type="button"
                      aria-label="أعلى"
                      disabled={i === 0}
                      onClick={() => moveBlock(i, -1)}
                      className="grid size-8 place-items-center rounded-md hover:bg-surface-alt disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="أسفل"
                      disabled={i === blocks.length - 1}
                      onClick={() => moveBlock(i, 1)}
                      className="grid size-8 place-items-center rounded-md hover:bg-surface-alt disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="حذف"
                      onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))}
                      className="grid size-8 place-items-center rounded-md text-danger-strong hover:bg-danger-soft"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
                {b.type === "html" ? (
                  <textarea
                    dir="ltr"
                    value={b.html ?? ""}
                    onChange={(e) => update(i, { html: e.target.value })}
                    className="block min-h-24 w-full rounded-lg border border-border bg-surface p-2 font-mono text-xs"
                  />
                ) : b.type === "image" || b.type === "cta" ? (
                  <div className="grid gap-2">
                    <input
                      value={b.text ?? b.alt ?? ""}
                      onChange={(e) =>
                        update(
                          i,
                          b.type === "image" ? { alt: e.target.value } : { text: e.target.value },
                        )
                      }
                      placeholder={b.type === "image" ? "وصف الصورة" : "نص الزر"}
                      className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                    />
                    <input
                      dir="ltr"
                      value={b.url ?? ""}
                      onChange={(e) => update(i, { url: e.target.value })}
                      placeholder="https://… أو /path"
                      className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                    />
                  </div>
                ) : (
                  <textarea
                    value={b.text ?? ""}
                    onChange={(e) => update(i, { text: e.target.value })}
                    className={`block w-full resize-y rounded-lg border border-border bg-surface p-2 ${b.type === "heading" ? "min-h-11 text-lg font-bold" : "min-h-24 text-sm leading-relaxed"}`}
                  />
                )}
              </Card>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <Chip key={t.key} onClick={() => setBlocks((bs) => [...bs, { type: t.key }])}>
                <Plus size={14} aria-hidden />
                {t.label}
              </Chip>
            ))}
          </div>
          {save.isError && (
            <div className="mt-3">
              <Notice>{problemMessage(save.error)}</Notice>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => save.mutate("draft")}
              disabled={!slug || !title || save.isPending}
            >
              حفظ مسودة
            </Button>
            <Button
              className="flex-1"
              onClick={() => save.mutate("published")}
              disabled={!slug || !title || save.isPending}
            >
              نشر الصفحة
            </Button>
          </div>
        </div>
        <aside className="mt-6 lg:sticky lg:top-6 lg:mt-0">
          <SectionLabel>معاينة</SectionLabel>
          <Card className="space-y-3 p-5">
            <h2 className="font-display text-2xl font-bold text-text">{title}</h2>
            {blocks.map((b, i) =>
              b.type === "heading" ? (
                <h3 key={i} className="text-lg font-bold text-text">
                  {b.text}
                </h3>
              ) : b.type === "paragraph" ? (
                <p key={i} className="whitespace-pre-line text-sm leading-loose text-text">
                  {b.text}
                </p>
              ) : b.type === "note" ? (
                <p
                  key={i}
                  className="whitespace-pre-line rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm leading-relaxed text-text"
                >
                  {b.text}
                </p>
              ) : b.type === "cta" ? (
                <span
                  key={i}
                  className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
                >
                  {b.text}
                </span>
              ) : b.type === "image" ? (
                <div
                  key={i}
                  className="grid h-32 place-items-center rounded-lg bg-surface-alt text-xs text-text-muted"
                >
                  {b.alt || "صورة"}
                </div>
              ) : (
                <p key={i} className="text-xs text-text-muted">
                  [HTML — يُعقَّم في الخادم]
                </p>
              ),
            )}
          </Card>
        </aside>
      </div>
    </PortalShell>
  );
}
