import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2 } from "lucide-react";
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
  StatusBadge,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import { useConfirm } from "../../components/Confirm";
import { Segmented } from "../../components/motion";
import { useToast } from "../../components/Toast";

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

/** Board: DesktopSiteCMS (desktop): blocks editor + live preview, insertion between blocks, the
 *  media library and the search panel. Phones switch between editing and the preview. */
export function PageEditor() {
  const confirm = useConfirm();
  const unsaved = useUnsavedChanges();
  const { id } = useParams();
  const creating = !id || id === "new";
  const navigate = useNavigate();
  const client = useQueryClient();
  const page = useQuery({
    queryKey: ["site", "pages", id],
    enabled: !creating,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/content/pages/{public_id}", {
          params: { path: { public_id: id! } },
        }),
      ) ?? null,
  });
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([{ type: "paragraph", text: "" }]);
  // The search result's text (review 2026-09-29 PR 7, «لوح SEO»): blank → the site uses the
  // page's first paragraph.
  const [description, setDescription] = useState("");
  // «عرض الصور» (owner request 2026-10-01): consecutive images one per row or in a grid.
  const [layout, setLayout] = useState<"single" | "grid">("single");
  // Phones: edit or preview, one at a time; large screens show both side by side.
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  // Where «+» between blocks inserts, and which image block is choosing from the library.
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const media = useQuery({
    queryKey: ["site", "media", "all"],
    enabled: picking !== null,
    queryFn: async () =>
      ok(await api.GET("/api/v1/content/media", { params: { query: { page_size: 100 } } }))
        ?.results ?? [],
  });
  useEffect(() => {
    if (page.data) {
      setSlug(page.data.slug);
      setTitle(page.data.title_ar);
      setBlocks((page.data.blocks as Block[]) ?? []);
      setDescription(((page.data.seo ?? {}) as { description?: string }).description ?? "");
      setLayout(page.data.image_layout ?? "single");
    }
  }, [page.data]);
  const firstParagraph = blocks.find((b) => b.type === "paragraph" && b.text?.trim())?.text ?? "";
  const searchText = (description.trim() || firstParagraph).slice(0, 160);
  const toast = useToast();
  const save = useMutation({
    mutationFn: async (status: "draft" | "published") => {
      const seo = { ...((page.data?.seo ?? {}) as object), description: description.trim() };
      const body = { slug, title_ar: title, blocks, image_layout: layout, status, seo } as never;
      const res = creating
        ? await api.POST("/api/v1/content/pages", { body })
        : await api.PATCH("/api/v1/content/pages/{public_id}", {
            params: { path: { public_id: id! } },
            body,
          });
      if (!res.data) throw res.error;
      return res.data;
    },
    onSuccess: (data, status) => {
      unsaved.saved();
      // The badge keeps the page's state; the note says what this save did.
      const was = published ? "live" : "draft";
      toast(
        {
          "live-published": "حُفظت الصفحة المنشورة",
          "draft-published": "نُشرت الصفحة",
          "live-draft": "أُلغي نشر الصفحة",
          "draft-draft": "حُفظت المسودة",
        }[`${was}-${status}` as const],
      );
      void client.invalidateQueries({ queryKey: ["site"] });
      if (creating) navigate(`/site/pages/${data.public_id}`, { replace: true });
    },
  });
  // On a live page, saving keeps it live; taking it down is its own, confirmed action
  // (review 2026-09-29: «حفظ مسودة» used to unpublish a published page silently).
  const published = page.data?.status === "published";
  // The preview groups consecutive images as the site does in a grid.
  const preview: (
    { kind: "block"; block: Block; at: number } | { kind: "images"; images: Block[]; at: number }
  )[] = [];
  blocks.forEach((block, at) => {
    const last = preview[preview.length - 1];
    if (layout === "grid" && block.type === "image" && block.url) {
      if (last?.kind === "images") last.images.push(block);
      else preview.push({ kind: "images", images: [block], at });
    } else preview.push({ kind: "block", block, at });
  });
  const state = unsaved.dirty
    ? { tone: "pending", label: "تغييرات غير محفوظة" }
    : save.isSuccess
      ? { tone: "approved", label: "حُفظ ✓" }
      : published
        ? { tone: "published", label: "منشورة" }
        : { tone: "draft", label: "مسودة" };
  const update = (i: number, patch: Partial<Block>) =>
    setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const insert = (at: number, type: Block["type"]) => {
    setBlocks((bs) => [...bs.slice(0, at), { type }, ...bs.slice(at)]);
    setInsertAt(null);
  };
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
      <div className="contents" onInput={unsaved.onInput}>
        <div className="mb-3 lg:hidden">
          <Segmented
            label="التحرير أو المعاينة"
            value={pane}
            onChange={setPane}
            options={[
              { key: "edit", label: "تحرير" },
              { key: "preview", label: "معاينة" },
            ]}
          />
        </div>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div className={pane === "edit" ? "" : "hidden lg:block"}>
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
                    ? `صفحة رسمية — تظهر على \u2066/${page.data.path}/\u2069 وفي قوائم الموقع بعد نشرها`
                    : `تظهر على \u2066/${slug ? (page.data?.path ?? `p/${slug}`) : "p/…"}/\u2069`
                }
              />
            </Card>
            <SectionLabel>الكتل</SectionLabel>
            {blocks.some((b) => b.type === "image") && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 shadow-xs">
                <span className="text-sm font-semibold text-text">عرض الصور في الموقع</span>
                <Segmented
                  label="عرض الصور في الموقع"
                  value={layout}
                  onChange={(next) => {
                    setLayout(next);
                    unsaved.changed();
                  }}
                  options={[
                    { key: "single", label: "واحدة" },
                    { key: "grid", label: "شبكة" },
                  ]}
                />
              </div>
            )}
            <div className="space-y-3">
              {blocks.map((b, i) => (
                <div key={i}>
                  {i > 0 && (
                    <div className="-my-1.5 flex justify-center" data-saves-itself>
                      {insertAt === i ? (
                        <span className="flex flex-wrap justify-center gap-1.5 rounded-xl bg-surface p-2 shadow-md">
                          {TYPES.map((t) => (
                            <Chip key={t.key} onClick={() => insert(i, t.key)}>
                              {t.label}
                            </Chip>
                          ))}
                          <Chip onClick={() => setInsertAt(null)}>إلغاء</Chip>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setInsertAt(i)}
                          aria-label={`إضافة كتلة قبل الكتلة ${i + 1}`}
                          className="grid size-7 place-items-center rounded-full border border-dashed border-border bg-surface text-text-muted hover:border-primary hover:text-primary"
                        >
                          <Plus size={14} aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                  <Card className="p-3">
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
                        aria-label={`كتلة ${i + 1}: HTML`}
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
                              b.type === "image"
                                ? { alt: e.target.value }
                                : { text: e.target.value },
                            )
                          }
                          placeholder={b.type === "image" ? "وصف الصورة" : "نص الزر"}
                          aria-label={`كتلة ${i + 1}: ${b.type === "image" ? "وصف الصورة" : "نص الزر"}`}
                          className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                        />
                        <input
                          dir="ltr"
                          value={b.url ?? ""}
                          onChange={(e) => update(i, { url: e.target.value })}
                          placeholder="https://… أو /path"
                          aria-label={`كتلة ${i + 1}: الرابط`}
                          className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                        />
                        {b.type === "image" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setPicking(picking === i ? null : i)}
                              aria-expanded={picking === i}
                              className="inline-flex items-center gap-1.5 justify-self-start text-sm font-semibold text-primary"
                            >
                              <ImageIcon size={15} aria-hidden /> من مكتبة الوسائط
                            </button>
                            {picking === i && (
                              <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto rounded-lg bg-surface-alt p-2 sm:grid-cols-4">
                                {(media.data ?? []).map((m) => (
                                  <button
                                    key={m.public_id}
                                    type="button"
                                    onClick={() => {
                                      update(i, { url: m.url, alt: b.alt || m.alt_ar || "" });
                                      setPicking(null);
                                    }}
                                    className="overflow-hidden rounded-md ring-primary hover:ring-2"
                                    aria-label={m.alt_ar || "صورة من المكتبة"}
                                  >
                                    <img
                                      src={m.url}
                                      alt=""
                                      className="aspect-square w-full object-cover"
                                    />
                                  </button>
                                ))}
                                {!media.isPending && !media.data?.length && (
                                  <p className="col-span-full p-2 text-xs text-text-muted">
                                    المكتبة فارغة — ارفع صورًا من «الوسائط».
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <textarea
                        aria-label={`كتلة ${i + 1}: ${TYPES.find((t) => t.key === b.type)?.label ?? "نص"}`}
                        value={b.text ?? ""}
                        onChange={(e) => update(i, { text: e.target.value })}
                        className={`block w-full resize-y rounded-lg border border-border bg-surface p-2 ${b.type === "heading" ? "min-h-11 text-lg font-bold" : "min-h-24 text-sm leading-relaxed"}`}
                      />
                    )}
                  </Card>
                </div>
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
            {/* Above the phone's tab bar while editing; in the flow on large screens. */}
            <div
              data-dock
              className="sticky bottom-24 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-2 shadow-md lg:static lg:bg-transparent lg:p-0 lg:shadow-none"
            >
              <StatusBadge status={state.tone} label={state.label} />
              {published ? (
                <>
                  <Button
                    variant="secondary"
                    className="min-h-11"
                    onClick={async () =>
                      (await confirm({
                        title: "إلغاء نشر الصفحة؟",
                        body: "تختفي من موقع الكلية وقوائمه حتى تنشرها مجددًا.",
                        confirm: "إلغاء النشر",
                      })) && save.mutate("draft")
                    }
                    disabled={save.isPending}
                  >
                    إلغاء النشر
                  </Button>
                  <Button
                    className="min-h-11 flex-1"
                    onClick={() => save.mutate("published")}
                    disabled={!slug || !title || save.isPending}
                  >
                    حفظ التعديلات ونشرها
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => save.mutate("draft")}
                    disabled={!slug || !title || save.isPending}
                  >
                    حفظ مسودة
                  </Button>
                  <Button
                    className="min-h-11 flex-1"
                    onClick={() => save.mutate("published")}
                    disabled={!slug || !title || save.isPending}
                  >
                    نشر الصفحة
                  </Button>
                </>
              )}
            </div>
          </div>
          <aside
            className={`mt-6 space-y-4 lg:sticky lg:top-20 lg:mt-0 lg:block ${pane === "preview" ? "" : "hidden"}`}
          >
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-text">الظهور في نتائج البحث</h2>
              <label className="mt-2 block">
                <span className="text-xs text-text-muted">
                  الوصف (يُترك فارغًا فيُستخدم أول فقرة)
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={300}
                  className="mt-1 block min-h-16 w-full rounded-lg border border-border bg-surface p-2 text-sm"
                />
              </label>
              <p
                className={`text-end text-[11px] ${description.length > 160 ? "text-danger-strong" : "text-text-muted"}`}
              >
                {description.length.toLocaleString("ar-u-nu-latn")} / 160
              </p>
              {/* How a search engine shows it. */}
              <div className="mt-2 rounded-lg bg-surface-alt p-3" aria-hidden="true">
                <p className="text-xs text-success-strong" dir="ltr">
                  ecst.edu.sd › {page.data?.path ?? (slug ? `p/${slug}` : "…")}
                </p>
                <p className="truncate text-base text-primary">
                  {title || "عنوان الصفحة"} | كلية الإمارات للعلوم والتكنولوجيا
                </p>
                <p className="line-clamp-2 text-xs text-text-muted">
                  {searchText || "اكتب وصفًا أو فقرة أولى تعرّف بالصفحة."}
                </p>
              </div>
            </Card>
            <SectionLabel>معاينة</SectionLabel>
            <Card className="space-y-3 p-5">
              <h2 className="font-display text-2xl font-bold text-text">{title}</h2>
              {preview.map((item) =>
                item.kind === "images" ? (
                  <div key={`g${item.at}`} className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                    {item.images.map((b, n) => (
                      <img
                        key={n}
                        src={b.url}
                        alt={b.alt ?? ""}
                        className="aspect-[4/3] w-full rounded-lg object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  renderBlock(item.block, item.at)
                ),
              )}
            </Card>
          </aside>
        </div>
      </div>
    </PortalShell>
  );

  function renderBlock(b: Block, i: number) {
    return b.type === "heading" ? (
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
      b.url ? (
        <img key={i} src={b.url} alt={b.alt ?? ""} className="w-full rounded-lg" />
      ) : (
        <div
          key={i}
          className="grid h-32 place-items-center rounded-lg bg-surface-alt text-xs text-text-muted"
        >
          {b.alt || "صورة"}
        </div>
      )
    ) : (
      <p key={i} className="text-xs text-text-muted">
        [HTML — يُعقَّم في الخادم]
      </p>
    );
  }
}
