import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
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
import { htmlToText, textToHtml } from "../../lib/richText";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import { slugify } from "../../lib/format";
import { ALL, Pager, useLocalPages } from "../../components/Pager";
import { useConfirm } from "../../components/Confirm";

const day = new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric" });
const month = new Intl.DateTimeFormat("ar-u-nu-latn", { month: "long" });
const time = new Intl.DateTimeFormat("ar-u-nu-latn", { hour: "numeric", minute: "2-digit" });
const LABEL: Record<string, string> = { draft: "مسودة", published: "منشورة", cancelled: "ملغاة" };

/** Board: EventsManagerHome (phone); desktop derived. */
export function Events() {
  const events = useQuery({
    queryKey: ["site", "events"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/content/events", { params: { query: ALL } }))?.results ?? [],
  });
  // Upcoming (soonest first) and past (latest first), with the next one as the page's hero
  // (review 2026-09-29 PR 7 «الفعاليات: القادمة والسابقة، والبطل»).
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const now = Date.now();
  const upcoming = (events.data ?? [])
    .filter((e) => new Date(e.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = (events.data ?? [])
    .filter((e) => new Date(e.ends_at).getTime() <= now)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const next = upcoming[0];
  const list = tab === "upcoming" ? upcoming.slice(next ? 1 : 0) : past;
  const paged = useLocalPages(list, [tab]);
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
          <>
            <div className="mb-3 flex gap-2" role="group" aria-label="القادمة أو السابقة">
              <Chip active={tab === "upcoming"} onClick={() => setTab("upcoming")}>
                القادمة {upcoming.length.toLocaleString("ar-u-nu-latn")}
              </Chip>
              <Chip active={tab === "past"} onClick={() => setTab("past")}>
                السابقة {past.length.toLocaleString("ar-u-nu-latn")}
              </Chip>
            </div>
            {tab === "upcoming" && next && (
              <Link
                to={`/events/${next.public_id}`}
                className="mb-3 block overflow-hidden rounded-2xl bg-header text-white hover:opacity-95"
              >
                {next.cover_url && (
                  <img src={next.cover_url} alt="" className="aspect-[3/1] w-full object-cover" />
                )}
                <span className="flex items-center gap-4 p-4">
                  <span className="grid w-16 shrink-0 place-items-center rounded-xl bg-white/10 py-2">
                    <span className="text-2xl font-bold leading-tight">
                      {day.format(new Date(next.starts_at))}
                    </span>
                    <span className="text-xs">{month.format(new Date(next.starts_at))}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-xs text-navy-200">الفعالية القادمة</span>
                    <b className="block truncate text-lg">{next.title}</b>
                    <span className="text-sm text-navy-200">
                      {time.format(new Date(next.starts_at))}
                      {next.location ? ` · ${next.location}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                    {LABEL[next.status ?? "draft"] ?? ""}
                  </span>
                </span>
              </Link>
            )}
            {list.length > 0 ? (
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
                      <span className="block truncate text-sm font-semibold text-text">
                        {e.title}
                      </span>
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
            ) : (
              <p className="px-1 py-3 text-sm text-text-muted">
                {tab === "upcoming" ? (next ? "" : "لا فعاليات قادمة.") : "لا فعاليات سابقة."}
              </p>
            )}
          </>
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
  const confirm = useConfirm();
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
        description: htmlToText(e.description),
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
        description: textToHtml(form.description),
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
  // What's missing before publishing, said instead of a silently disabled button.
  const endsBeforeStart =
    !!form.starts_at && !!form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at);
  const missing = [
    !form.title && "العنوان",
    !form.slug && "الرابط",
    !form.description.trim() && "الوصف",
  ].filter(Boolean) as string[];
  const status = event.data?.status;
  const statusLine =
    status === "published"
      ? new Date(event.data!.ends_at) < new Date()
        ? "انتهت · ما زالت ظاهرة في الأرشيف"
        : "منشورة على الموقع وتقويم الطلاب"
      : status === "cancelled"
        ? "أُلغيت · تظهر للزوار ملغاة"
        : "مسودة · لا يراها أحد بعد";
  return (
    <PortalShell
      title={form.title || "فعالية جديدة"}
      subtitle={creating ? "تُنشر على الموقع وتقويم الطلاب" : statusLine}
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
            {endsBeforeStart && (
              <div className="mt-3">
                <Notice tone="warning">النهاية يجب أن تكون بعد البداية.</Notice>
              </div>
            )}
            {missing.length > 0 && (
              <p className="mt-3 text-xs text-text-muted">للنشر أكمل: {missing.join("، ")}.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2 lg:justify-end">
              <Button
                variant="secondary"
                onClick={() => save.mutate("draft")}
                disabled={!form.slug || !form.title || endsBeforeStart || save.isPending}
              >
                حفظ مسودة
              </Button>
              <Button
                className="flex-1 lg:flex-none lg:px-8"
                onClick={() => save.mutate("published")}
                disabled={missing.length > 0 || endsBeforeStart || save.isPending}
              >
                نشر الفعالية
              </Button>
              {!creating && (
                <Button
                  variant="secondary"
                  className="text-danger-strong"
                  disabled={save.isPending || status === "cancelled"}
                  onClick={async () =>
                    (await confirm({
                      title: "إلغاء الفعالية؟",
                      body: "تظهر للزوار والطلاب أنها أُلغيت.",
                      confirm: "إلغاء الفعالية",
                      cancel: "تراجع",
                    })) && save.mutate("cancelled")
                  }
                >
                  إلغاء الفعالية
                </Button>
              )}
            </div>
          </div>
          <aside className="mt-6 lg:sticky lg:top-20 lg:mt-0">
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
