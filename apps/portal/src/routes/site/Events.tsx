import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  problemMessage,
  SectionLabel,
  SideFigures,
  SideNote,
  StatusBadge,
  TextArea,
  WithSide,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import { slugify } from "../../lib/format";
import { ALL, Pager, useLocalPages } from "../../components/Pager";

const day = new Intl.DateTimeFormat("ar", { day: "numeric" });
const month = new Intl.DateTimeFormat("ar", { month: "long" });
const time = new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit" });
const LABEL: Record<string, string> = { draft: "مسودة", published: "منشورة", cancelled: "ملغاة" };

/** Board: EventsManagerHome (phone); desktop derived. */
export function Events() {
  const events = useQuery({
    queryKey: ["site", "events"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/content/events", { params: { query: ALL } }))?.results ?? [],
  });
  const paged = useLocalPages(events.data ?? []);
  return (
    <PortalShell
      title="الفعاليات"
      titleAction={
        <Link to="/events/new">
          <Button className="min-h-9 px-3">
            <Plus size={16} aria-hidden />
            فعالية
          </Button>
        </Link>
      }
    >
      <WithSide
        side={
          <>
            <SideFigures
              rows={[
                [
                  "قادمة",
                  (events.data ?? []).filter((e) => new Date(e.ends_at).getTime() > Date.now())
                    .length,
                ],
                ["منشورة", (events.data ?? []).filter((e) => e.status === "published").length],
              ]}
            />
            <SideNote title="على الموقع">
              الفعالية المنشورة تظهر في صفحة الفعاليات والتقويم والرئيسية، وتبقى صفحتها بعد انتهائها
              ضمن «فعاليات سابقة».
            </SideNote>
          </>
        }
      >
        {!events.data?.length ? (
          <Card>
            <EmptyState icon={<CalendarDays size={24} aria-hidden />} title="لا فعاليات بعد" />
          </Card>
        ) : (
          <Card className="divide-y divide-border-soft">
            {paged.shown.map((e) => (
              <Link
                key={e.public_id}
                to={`/events/${e.public_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
              >
                <span className="grid w-14 shrink-0 place-items-center rounded-lg bg-accent-soft py-1 text-accent">
                  <span className="text-lg font-bold leading-tight">
                    {day.format(new Date(e.starts_at))}
                  </span>
                  <span className="text-[11px]">{month.format(new Date(e.starts_at))}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">{e.title}</span>
                  <span className="text-xs text-text-muted">
                    {time.format(new Date(e.starts_at))}
                    {e.location ? ` · ${e.location}` : ""}
                  </span>
                </span>
                <StatusBadge
                  status={e.status === "cancelled" ? "rejected" : (e.status ?? "draft")}
                  label={LABEL[e.status ?? "draft"] ?? ""}
                />
              </Link>
            ))}
          </Card>
        )}
        <Pager page={paged.page} count={paged.count} onPage={paged.setPage} />
      </WithSide>
    </PortalShell>
  );
}

const local = (iso: string) =>
  new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

/** Board: EventsManagerEventNew (phone): details + live preview card; desktop derived side by side. */
export function EventEditor() {
  const unsaved = useUnsavedChanges();
  const { id } = useParams();
  const creating = !id || id === "new";
  const [slugEdited, setSlugEdited] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  const event = useQuery({
    queryKey: ["site", "events", id],
    enabled: !creating,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/content/events/{public_id}", {
          params: { path: { public_id: id! } },
        }),
      ) ?? null,
  });
  const start = new Date(Date.now() + 7 * 86_400_000);
  const [form, setForm] = useState({
    slug: "",
    title: "",
    description: "",
    location: "",
    registration_url: "",
    starts_at: local(start.toISOString()),
    ends_at: local(new Date(start.getTime() + 3 * 3_600_000).toISOString()),
  });
  useEffect(() => {
    const e = event.data;
    if (e)
      setForm({
        slug: e.slug,
        title: e.title,
        description: e.description.replace(/<[^>]+>/g, ""),
        location: e.location ?? "",
        registration_url: e.registration_url ?? "",
        starts_at: local(e.starts_at),
        ends_at: local(e.ends_at),
      });
  }, [event.data]);
  const save = useMutation({
    mutationFn: async (status: "draft" | "published" | "cancelled") => {
      const body = {
        ...form,
        description: `<p>${form.description.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</p>`,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        status,
      } as never;
      const res = creating
        ? await api.POST("/api/v1/content/events", { body })
        : await api.PATCH("/api/v1/content/events/{public_id}", {
            params: { path: { public_id: id! } },
            body,
          });
      if (!res.data) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      unsaved.saved();
      void client.invalidateQueries({ queryKey: ["site", "events"] });
      if (creating) navigate(`/events/${data.public_id}`, { replace: true });
    },
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const s = new Date(form.starts_at);
  return (
    <PortalShell
      title={form.title || "فعالية جديدة"}
      subtitle="تُنشر على الموقع وتقويم الطلاب"
      back={{ label: "الفعاليات", to: "/events" }}
    >
      <div className="contents" onInput={unsaved.onInput}>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
          <div>
            <SectionLabel>التفاصيل</SectionLabel>
            <Card>
              <Field
                label="العنوان"
                value={form.title}
                onChange={(e) =>
                  set({
                    title: e.target.value,
                    // New items take their link from the title until the link is edited by hand.
                    ...(creating && !slugEdited ? { slug: slugify(e.target.value, 120) } : {}),
                  })
                }
              />
              <Field
                label="الرابط"
                dir="ltr"
                value={form.slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  set({ slug: e.target.value });
                }}
                hint="يُملأ من العنوان تلقائيًا؛ يمكن تعديله (حروف وأرقام وشرطات)"
              />
              <Field
                label="يبدأ"
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => set({ starts_at: e.target.value })}
              />
              <Field
                label="ينتهي"
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => set({ ends_at: e.target.value })}
              />
              <Field
                label="المكان"
                value={form.location}
                onChange={(e) => set({ location: e.target.value })}
              />
              <TextArea
                label="الوصف"
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
              <Field
                label="رابط التسجيل (اختياري)"
                dir="ltr"
                value={form.registration_url}
                onChange={(e) => set({ registration_url: e.target.value })}
              />
            </Card>
            {save.isError && (
              <div className="mt-3">
                <Notice>{problemMessage(save.error)}</Notice>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => save.mutate("draft")}
                disabled={!form.slug || !form.title || save.isPending}
              >
                حفظ مسودة
              </Button>
              <Button
                className="flex-1"
                onClick={() => save.mutate("published")}
                disabled={!form.slug || !form.title || !form.description || save.isPending}
              >
                نشر الفعالية
              </Button>
              {!creating && (
                <Button
                  variant="secondary"
                  className="text-danger-strong"
                  onClick={() => save.mutate("cancelled")}
                >
                  إلغاء الفعالية
                </Button>
              )}
            </div>
          </div>
          <aside className="mt-6 lg:sticky lg:top-6 lg:mt-0">
            <SectionLabel>المعاينة</SectionLabel>
            <Card className="flex gap-3 p-4">
              <span className="grid w-14 shrink-0 place-items-center rounded-lg bg-accent-soft py-1 text-accent">
                <span className="text-lg font-bold">{day.format(s)}</span>
                <span className="text-[11px]">{month.format(s)}</span>
              </span>
              <span>
                <span className="block font-semibold text-text">
                  {form.title || "عنوان الفعالية"}
                </span>
                <span className="text-xs text-text-muted">
                  {time.format(s)}
                  {form.location ? ` · ${form.location}` : ""}
                </span>
              </span>
            </Card>
          </aside>
        </div>
      </div>
    </PortalShell>
  );
}
