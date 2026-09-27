import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Chip, Field, Notice, problemMessage } from "../../components/ui";
import { api } from "../../lib/api";
import { asForm, formData } from "../../lib/upload";

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
  const media = useQuery({
    queryKey: ["site", "media"],
    queryFn: async () => (await api.GET("/api/v1/content/media")).data?.results ?? [],
  });
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
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(media.data ?? []).map((m) => (
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
    </>
  );
}

type Item = Schemas["MenuItem"];
function Menus() {
  const client = useQueryClient();
  const [key, setKey] = useState("header");
  const menu = useQuery({
    queryKey: ["site", "menu", key],
    queryFn: async () =>
      (await api.GET("/api/v1/content/menus/{key}", { params: { path: { key } } })).data ?? null,
  });
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => setItems(menu.data?.items ?? []), [menu.data]);
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PUT("/api/v1/content/menus/{key}", {
        params: { path: { key } },
        body: items.map((it, i) => ({ ...it, order: i + 1 })) as never,
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["site", "menu"] }),
  });
  return (
    <div className="max-w-2xl">
      <div className="flex gap-2">
        <Chip active={key === "header"} onClick={() => setKey("header")}>
          القائمة العلوية
        </Chip>
        <Chip active={key === "footer"} onClick={() => setKey("footer")}>
          التذييل
        </Chip>
      </div>
      <Card className="mt-3 divide-y divide-border-soft">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 p-2">
            <input
              value={it.label_ar}
              onChange={(e) =>
                setItems((xs) =>
                  xs.map((x, j) => (j === i ? { ...x, label_ar: e.target.value } : x)),
                )
              }
              className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
            />
            <input
              dir="ltr"
              value={it.url}
              onChange={(e) =>
                setItems((xs) => xs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
              }
              className="min-h-10 w-40 rounded-lg border border-border bg-surface px-3 text-sm"
            />
            <button
              type="button"
              aria-label="حذف"
              onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
              className="grid size-9 place-items-center text-danger-strong"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </Card>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            setItems((xs) => [
              ...xs,
              { id: 0, label_ar: "", url: "/", order: xs.length + 1 } as Item,
            ])
          }
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
    <div className="max-w-2xl">
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
