import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Image as ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  FilterBar,
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
import { api, ok } from "../../lib/api";
import { asForm, formData } from "../../lib/upload";
import { Pager, useServerPages } from "../../components/Pager";
import { useConfirm } from "../../components/Confirm";
import { useToast } from "../../components/Toast";

type Tab = "media" | "menus" | "settings";

/** Board: DesktopSiteMedia (desktop: gallery, menus, settings tabs). Phone derived. */
export function SiteMedia() {
  const [tab, setTab] = useState<Tab>("media");
  return (
    <PortalShell title="الوسائط والقوائم والإعدادات" back={{ label: "محتوى الموقع", to: "/site" }}>
      <FilterBar>
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
      </FilterBar>
      <div className="mt-4">
        {tab === "media" ? <Media /> : tab === "menus" ? <Menus /> : <SiteSettingsForm />}
      </div>
    </PortalShell>
  );
}

function Media() {
  const confirm = useConfirm();
  const client = useQueryClient();
  // 10 per page from the server (docs: owner 2026-09-29).
  const media = useServerPages(["site", "media"], async (page) =>
    ok(await api.GET("/api/v1/content/media", { params: { query: { page } } })),
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
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary">
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
          <Card key={m.public_id} className="flex flex-col overflow-hidden">
            <img src={m.url} alt={m.alt_ar ?? ""} className="aspect-video w-full object-cover" />
            {/* The name on its own lines; the size and delete under it (two cards a row on
                phones left the name a few letters). */}
            <p className="line-clamp-2 px-2 pt-2 text-xs break-words text-text">
              {m.alt_ar || "بلا alt"}
            </p>
            <div className="mt-auto flex items-center justify-between gap-2 px-2 pb-1 text-xs">
              <span className="text-text-muted" dir="ltr">
                {m.width}×{m.height}
              </span>
              <button
                type="button"
                aria-label="حذف"
                onClick={async () =>
                  (await confirm({
                    title: "حذف الصورة؟",
                    body: "تختفي من كل صفحة أو خبر يستخدمها.",
                    confirm: "حذف",
                  })) && remove.mutate(m.public_id)
                }
                className="grid size-11 place-items-center rounded-lg text-danger-strong hover:bg-danger-soft"
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
      ok(await api.GET("/api/v1/content/menus/{key}", { params: { path: { key } } })) ?? null,
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

type Figure = { value: string; label_ar: string; label_en?: string };

function SiteSettingsForm() {
  const settings = useQuery({
    queryKey: ["site", "settings"],
    queryFn: async () => ok(await api.GET("/api/v1/content/site-settings")) ?? null,
  });
  const media = useQuery({
    queryKey: ["site", "media", "all"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/content/media", { params: { query: { page_size: 100 } } }))
        ?.results ?? [],
  });
  const [form, setForm] = useState({
    name_ar: "",
    tagline: "",
    email: "",
    phone: "",
    whatsapp_e164: "",
    address: "",
    founded_year: "",
    licence_ar: "",
    licence_en: "",
    licence_url: "",
    office_hours_ar: "",
    office_hours_en: "",
    map_url: "",
    hero_image: "",
    share_image: "",
    logo: "",
  });
  const [figures, setFigures] = useState<Figure[]>([]);
  useEffect(() => {
    const s = settings.data;
    if (s) {
      setForm({
        name_ar: s.name_ar ?? "",
        tagline: s.tagline ?? "",
        email: s.email ?? "",
        phone: s.phone ?? "",
        whatsapp_e164: s.whatsapp_e164 ?? "",
        address: s.address ?? "",
        founded_year: s.founded_year ? String(s.founded_year) : "",
        licence_ar: s.licence_ar ?? "",
        licence_en: s.licence_en ?? "",
        licence_url: s.licence_url ?? "",
        office_hours_ar: s.office_hours_ar ?? "",
        office_hours_en: s.office_hours_en ?? "",
        map_url: s.map_url ?? "",
        hero_image: s.hero_image ?? "",
        share_image: s.share_image ?? "",
        logo: s.logo ?? "",
      });
      setFigures(((s.figures as Figure[] | undefined) ?? []).map((f) => ({ ...f })));
    }
  }, [settings.data]);
  const toast = useToast();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        founded_year: form.founded_year ? Number(form.founded_year) : null,
        hero_image: form.hero_image || null,
        share_image: form.share_image || null,
        logo: form.logo || null,
        figures,
      };
      const { data, error } = await api.PATCH("/api/v1/content/site-settings", {
        body: body as never,
      });
      if (!data) throw error;
      return data;
    },
    onSuccess: (saved) => {
      // The portal's logo follows at once (the public copy may be cached for a minute).
      client.setQueryData(["public", "site"], saved);
      toast("حُفظت إعدادات الموقع");
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
            <Field
              label="ساعات العمل"
              value={form.office_hours_ar}
              placeholder="الأحد–الخميس 8:00–15:00"
              onChange={(e) => set({ office_hours_ar: e.target.value })}
            />
            <Field
              label="ساعات العمل بالإنجليزية"
              dir="ltr"
              value={form.office_hours_en}
              onChange={(e) => set({ office_hours_en: e.target.value })}
            />
            <Field
              label="رابط الخريطة (https://…)"
              dir="ltr"
              value={form.map_url}
              onChange={(e) => set({ map_url: e.target.value })}
            />
          </Card>
        </div>
        <div>
          {/* What makes a parent trust the college (review 2026-09-30): shown on the home
              page only once filled in — never a zero or a portal count. */}
          <SectionLabel>الترخيص والأرقام — تظهر في الصفحة الرئيسية</SectionLabel>
          <Card>
            <Field
              label="سنة التأسيس"
              inputMode="numeric"
              dir="ltr"
              value={form.founded_year}
              onChange={(e) => set({ founded_year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            />
            <Field
              label="الترخيص (جملة واحدة)"
              value={form.licence_ar}
              placeholder="مرخّصة من وزارة التعليم العالي والبحث العلمي — القرار رقم … لسنة …"
              onChange={(e) => set({ licence_ar: e.target.value })}
            />
            <Field
              label="الترخيص بالإنجليزية"
              dir="ltr"
              value={form.licence_en}
              onChange={(e) => set({ licence_en: e.target.value })}
            />
            <Field
              label="رابط التفاصيل"
              dir="ltr"
              value={form.licence_url}
              placeholder="/ar/about/accreditation/"
              onChange={(e) => set({ licence_url: e.target.value })}
            />
          </Card>
          <Card className="mt-3 space-y-2 p-4">
            <p className="text-sm font-semibold text-text">أرقام الكلية (حتى ستة)</p>
            <p className="text-xs text-text-muted">
              أرقام موثّقة تحددها الكلية، مثل: الخريجون، البرامج المعتمدة، الشركاء.
            </p>
            {figures.map((f, i) => (
              <div
                key={i}
                className="grid grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <input
                  aria-label={`الرقم ${i + 1}`}
                  dir="ltr"
                  value={f.value}
                  placeholder="1,200+"
                  onChange={(e) =>
                    setFigures((all) =>
                      all.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                    )
                  }
                  className="min-h-11 rounded-lg border border-border bg-surface px-2 text-center text-sm"
                />
                <input
                  aria-label={`عنوان الرقم ${i + 1}`}
                  value={f.label_ar}
                  placeholder="خريج"
                  onChange={(e) =>
                    setFigures((all) =>
                      all.map((x, j) => (j === i ? { ...x, label_ar: e.target.value } : x)),
                    )
                  }
                  className="min-h-11 rounded-lg border border-border bg-surface px-2 text-sm"
                />
                <input
                  aria-label={`عنوان الرقم ${i + 1} بالإنجليزية`}
                  dir="ltr"
                  value={f.label_en ?? ""}
                  placeholder="graduates"
                  onChange={(e) =>
                    setFigures((all) =>
                      all.map((x, j) => (j === i ? { ...x, label_en: e.target.value } : x)),
                    )
                  }
                  className="col-span-2 min-h-11 rounded-lg border border-border bg-surface px-2 text-sm sm:col-span-1"
                />
                <button
                  type="button"
                  aria-label={`حذف الرقم ${i + 1}`}
                  onClick={() => setFigures((all) => all.filter((_, j) => j !== i))}
                  className="col-start-3 row-start-1 grid size-11 place-items-center rounded-lg text-danger-strong hover:bg-danger-soft sm:col-start-auto sm:row-start-auto"
                >
                  ×
                </button>
              </div>
            ))}
            {figures.length < 6 && (
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() =>
                  setFigures((all) => [...all, { value: "", label_ar: "", label_en: "" }])
                }
              >
                + رقم
              </Button>
            )}
          </Card>
        </div>
        <div>
          <SectionLabel>الصور — من مكتبة الوسائط</SectionLabel>
          <Card>
            {(
              [
                ["logo", "الشعار — في الموقع والبوابة ونتائج البحث؛ صورة مربعة (PNG بخلفية شفافة)"],
                ["hero_image", "صورة الصفحة الرئيسية (الحرم أو الطلاب)"],
                ["share_image", "صورة المشاركة (واتساب وفيسبوك)؛ الشعار إن تُركت"],
              ] as const
            ).map(([key, label]) => {
              const picked = (media.data ?? []).find((m) => m.public_id === form[key]);
              return (
                <label
                  key={key}
                  className="block border-b border-border-soft px-4 py-3 last:border-b-0"
                >
                  <span className="block text-xs text-text-muted">{label}</span>
                  <span className="mt-1 flex items-center gap-3">
                    {picked?.url && (
                      <img
                        src={picked.url}
                        alt=""
                        className={`size-12 shrink-0 rounded-lg ${key === "logo" ? "bg-surface-alt object-contain p-1" : "object-cover"}`}
                      />
                    )}
                    <select
                      value={form[key]}
                      onChange={(e) => set({ [key]: e.target.value })}
                      className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                    >
                      <option value="">{key === "logo" ? "الشعار الافتراضي" : "بلا صورة"}</option>
                      {(media.data ?? []).map((m) => (
                        <option key={m.public_id} value={m.public_id}>
                          {m.alt_ar || m.url.split("/").pop()}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              );
            })}
          </Card>
        </div>
      </div>
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
