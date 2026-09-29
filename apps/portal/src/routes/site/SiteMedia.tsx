import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Image as ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  problemMessage,
  SectionLabel,
  WithSide,
  EmptyState,
} from "../../components/ui";
import { api } from "../../lib/api";
import { asForm, formData } from "../../lib/upload";
import { Pager, useServerPages } from "../../components/Pager";

type Tab = "media" | "menus" | "settings";

/** Board: DesktopSiteMedia (desktop: gallery, menus, settings tabs). Phone derived. */
export function SiteMedia() {
  const [tab, setTab] = useState<Tab>("media");
  return (
    <PortalShell title="الوسائط والقوائم والإعدادات" back={{ label: "محتوى الموقع", to: "/site" }}>
      <div className="flex gap-2">
        <Chip active={tab === "media"} onClick={() => setTab("media")}>
          الوسائط
        </Chip>
        <Chip active={tab === "menus"} onClick={() => setTab("menus")}>
          القوائم
        </Chip>
        <Chip active={tab === "settings"} onClick={() => setTab("settings")}>
          إعدادات الموقع
        </Chip>
      </div>
      <div className="mt-4">
        {tab === "media" ? <Media /> : tab === "menus" ? <Menus /> : <SiteSettingsForm />}
      </div>
    </PortalShell>
  );
}

function Media() {
  const client = useQueryClient();
  // 10 per page from the server (docs: owner 2026-09-29).
  const media = useServerPages(
    ["site", "media"],
    async (page) => (await api.GET("/api/v1/content/media", { params: { query: { page } } })).data,
  );
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { data, error } = await api.POST("/api/v1/content/media", {
        body: formData({ file, alt_ar: file.name.replace(/\.[^.]+$/, "") }) as never,
        ...asForm,
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["site", "media"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.DELETE("/api/v1/content/media/{public_id}", {
        params: { path: { public_id: id } },
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["site", "media"] }),
  });
  return (
    <>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white">
        <Upload size={16} aria-hidden /> رفع صورة
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
        />
      </label>
      {upload.isError && (
        <div className="mt-3">
          <Notice>{problemMessage(upload.error)}</Notice>
        </div>
      )}
      {media.query.isSuccess && !media.count && (
        <Card className="mt-4">
          <EmptyState icon={<ImageIcon size={24} aria-hidden />} title="لا صور بعد">
            الصور المرفوعة هنا تُستخدم أغلفةً للأخبار والفعاليات وفي صفحات الموقع. اكتب لكل صورة
            وصفًا (نصًا بديلًا) يقرؤه من لا يرى الصورة.
          </EmptyState>
        </Card>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {media.items.map((m) => (
          <Card key={m.public_id} className="overflow-hidden">
            <img src={m.url} alt={m.alt_ar ?? ""} className="aspect-video w-full object-cover" />
            <div className="flex items-center gap-2 p-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-text">{m.alt_ar || "بلا alt"}</span>
              <span className="text-text-muted" dir="ltr">
                {m.width}×{m.height}
              </span>
              <button
                type="button"
                aria-label="حذف"
                onClick={() => remove.mutate(m.public_id)}
                className="text-danger-strong"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </Card>
        ))}
      </div>
      <Pager page={media.page} count={media.count} onPage={media.setPage} label="صفحات الوسائط" />
    </>
  );
}

type Link = { label_ar: string; label_en: string; url: string };
type Entry = Link & { children: Link[] };

const move = <T,>(xs: T[], i: number, by: -1 | 1): T[] => {
  const j = i + by;
  if (j < 0 || j >= xs.length) return xs;
  const out = [...xs];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
};

/** Board: DesktopSiteMedia «قوائم الموقع». Two levels: a link, or a group of links. */
function Menus() {
  const client = useQueryClient();
  const [key, setKey] = useState<"header" | "footer">("header");
  const menu = useQuery({
    queryKey: ["site", "menu", key],
    queryFn: async () =>
      (await api.GET("/api/v1/content/menus/{key}", { params: { path: { key } } })).data ?? null,
  });
  const [items, setItems] = useState<Entry[]>([]);
  useEffect(
    () =>
      setItems(
        (menu.data?.items ?? []).map((it) => ({
          label_ar: it.label_ar,
          label_en: it.label_en ?? "",
          url: it.url ?? "",
          children: (it.children ?? []).map((c) => ({
            label_ar: c.label_ar,
            label_en: c.label_en ?? "",
            url: c.url ?? "",
          })),
        })),
      ),
    [menu.data],
  );
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PUT("/api/v1/content/menus/{key}", {
        params: { path: { key } },
        body: items.map((it, i) => ({ ...it, order: i + 1 })),
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["site", "menu"] }),
  });
  const setEntry = (i: number, patch: Partial<Entry>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setChild = (i: number, c: number, patch: Partial<Link>) =>
    setEntry(i, {
      children: items[i]!.children.map((x, j) => (j === c ? { ...x, ...patch } : x)),
    });
  const blank: Link = { label_ar: "", label_en: "", url: "/" };

  return (
    <WithSide
      side={
        // Desktop: a live preview of the menu as the site will group it.
        <Card className="p-4">
          <h2 className="text-xs font-semibold text-text-muted">معاينة</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {items.map((it, i) => (
              <li key={i}>
                <span className="font-semibold text-text">{it.label_ar || "—"}</span>
                {it.children.length > 0 && (
                  <ul className="mt-1 space-y-0.5 border-s-2 border-border-soft ps-3 text-text-muted">
                    {it.children.map((c, j) => (
                      <li key={j}>{c.label_ar || "—"}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      }
    >
      <div className="flex gap-2">
        <Chip active={key === "header"} onClick={() => setKey("header")}>
          القائمة العلوية
        </Chip>
        <Chip active={key === "footer"} onClick={() => setKey("footer")}>
          التذييل
        </Chip>
      </div>
      <p className="mt-3 text-xs leading-5 text-text-muted">
        المسار بلا لغة (مثل <span dir="ltr">/admissions</span>) أو رابط https. الرابط لصفحة لم تُنشر
        بعد لا يظهر في الموقع حتى تُنشر. المجموعة تُعرض قائمةً منسدلة، وتُترك بلا رابط.
      </p>
      <div className="mt-3 space-y-3">
        {items.map((it, i) => (
          <Card key={i} className="p-3">
            <MenuRow
              link={it}
              group={it.children.length > 0}
              onChange={(patch) => setEntry(i, patch)}
              onMove={(by) => setItems((xs) => move(xs, i, by))}
              onRemove={() => setItems((xs) => xs.filter((_, j) => j !== i))}
            />
            {it.children.length > 0 && (
              <div className="mt-2 space-y-2 border-s-2 border-border-soft ps-3">
                {it.children.map((c, ci) => (
                  <MenuRow
                    key={ci}
                    link={c}
                    onChange={(patch) => setChild(i, ci, patch)}
                    onMove={(by) => setEntry(i, { children: move(it.children, ci, by) })}
                    onRemove={() =>
                      setEntry(i, { children: it.children.filter((_, j) => j !== ci) })
                    }
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                setEntry(i, {
                  // Turning a link into a group moves its own link inside it.
                  url: "",
                  children: [
                    ...it.children,
                    it.children.length ? blank : { ...blank, url: it.url },
                  ],
                })
              }
              className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary"
            >
              <Plus size={14} aria-hidden />
              رابط فرعي
            </button>
          </Card>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => setItems((xs) => [...xs, { ...blank, children: [] }])}
        >
          <Plus size={16} aria-hidden />
          رابط
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          حفظ القائمة
        </Button>
      </div>
      {save.isError && (
        <div className="mt-3">
          <Notice>{problemMessage(save.error)}</Notice>
        </div>
      )}
      {save.isSuccess && (
        <p className="mt-3 text-sm text-success-strong" role="status">
          حُفظت القائمة؛ تظهر في الموقع بعد إعادة بنائه.
        </p>
      )}
    </WithSide>
  );
}

function MenuRow({
  link,
  group = false,
  onChange,
  onMove,
  onRemove,
}: {
  link: Link;
  group?: boolean;
  onChange: (patch: Partial<Link>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const input = "min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm";
  const icon = "grid size-9 shrink-0 place-items-center rounded-md hover:bg-surface-alt";
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 gap-2">
        <input
          aria-label="الاسم بالعربية"
          placeholder="الاسم"
          value={link.label_ar}
          onChange={(e) => onChange({ label_ar: e.target.value })}
          className={`${input} min-w-0 flex-1 ${group ? "font-semibold" : ""}`}
        />
        <input
          dir="ltr"
          aria-label="الاسم بالإنجليزية"
          placeholder="English"
          value={link.label_en}
          onChange={(e) => onChange({ label_en: e.target.value })}
          className={`${input} min-w-0 flex-1`}
        />
      </div>
      <div className="flex items-center gap-1">
        {group ? (
          <span className="flex-1 px-1 text-xs text-text-muted sm:w-40 sm:flex-none">مجموعة</span>
        ) : (
          <input
            dir="ltr"
            aria-label="الرابط"
            value={link.url}
            onChange={(e) => onChange({ url: e.target.value })}
            className={`${input} min-w-0 flex-1 sm:w-40 sm:flex-none`}
          />
        )}
        <button type="button" aria-label="أعلى" onClick={() => onMove(-1)} className={icon}>
          <ArrowUp size={16} />
        </button>
        <button type="button" aria-label="أسفل" onClick={() => onMove(1)} className={icon}>
          <ArrowDown size={16} />
        </button>
        <button
          type="button"
          aria-label="حذف"
          onClick={onRemove}
          className={`${icon} text-danger-strong`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function SiteSettingsForm() {
  const settings = useQuery({
    queryKey: ["site", "settings"],
    queryFn: async () => (await api.GET("/api/v1/content/site-settings")).data ?? null,
  });
  const [form, setForm] = useState({
    name_ar: "",
    tagline: "",
    email: "",
    phone: "",
    whatsapp_e164: "",
    address: "",
  });
  useEffect(() => {
    const s = settings.data;
    if (s)
      setForm({
        name_ar: s.name_ar ?? "",
        tagline: s.tagline ?? "",
        email: s.email ?? "",
        phone: s.phone ?? "",
        whatsapp_e164: s.whatsapp_e164 ?? "",
        address: s.address ?? "",
      });
  }, [settings.data]);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH("/api/v1/content/site-settings", { body: form });
      if (!data) throw error;
    },
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div>
          <SectionLabel>الهوية</SectionLabel>
          <Card>
            <Field
              label="اسم الكلية"
              value={form.name_ar}
              onChange={(e) => set({ name_ar: e.target.value })}
            />
            <Field
              label="الشعار النصي"
              value={form.tagline}
              onChange={(e) => set({ tagline: e.target.value })}
            />
          </Card>
        </div>
        <div>
          <SectionLabel>التواصل — يظهر في التذييل وصفحة «تواصل»</SectionLabel>
          <Card>
            <Field
              label="البريد"
              dir="ltr"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
            <Field
              label="الهاتف"
              dir="ltr"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
            <Field
              label="رقم WhatsApp (E.164)"
              dir="ltr"
              value={form.whatsapp_e164}
              onChange={(e) => set({ whatsapp_e164: e.target.value })}
            />
            <Field
              label="العنوان"
              value={form.address}
              onChange={(e) => set({ address: e.target.value })}
            />
          </Card>
        </div>
      </div>
      {save.isSuccess && (
        <div className="mt-3">
          <Notice tone="success">حُفظت الإعدادات.</Notice>
        </div>
      )}
      {save.isError && (
        <div className="mt-3">
          <Notice>{problemMessage(save.error)}</Notice>
        </div>
      )}
      <Button className="mt-4" onClick={() => save.mutate()} disabled={save.isPending}>
        حفظ
      </Button>
    </div>
  );
}
