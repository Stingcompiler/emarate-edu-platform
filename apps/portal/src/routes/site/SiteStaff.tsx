import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Search, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";

import { useConfirm } from "../../components/Confirm";
import { PortalShell } from "../../components/PortalShell";
import { Select } from "../../components/Select";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Notice,
  QuietTab,
  SectionLabel,
  SideNote,
  Switch,
  WithSide,
  problemMessage,
} from "../../components/ui";
import type { Schemas } from "@ecst/api";

import { api, ok } from "../../lib/api";
import { ALL } from "../../components/Pager";
import { num } from "../../lib/reports";

type Group = Schemas["StaffGroup"];
type Row = Schemas["StaffRow"];
type Placement = Schemas["Placement"];

const BOARD = ["site", "staff"];

/** «تصنيف الكوادر» (owner, 2026-11-09): the site team adds people to the site's «الكوادر» —
 * staff accounts or people with no account — and sorts them into groups on a matrix. Adding
 * someone never makes an account; an account appears only with its own consent. No board:
 * derived from docs/06 §9 (the matrix is a table on ≥1024, one card a person on phones). */
export function SiteStaff() {
  const client = useQueryClient();
  const board = useQuery({
    queryKey: BOARD,
    queryFn: async () => ok(await api.GET("/api/v1/site-staff")),
  });
  const refresh = () => client.invalidateQueries({ queryKey: BOARD });
  const groups = board.data?.groups ?? [];
  const rows = board.data?.rows ?? [];
  return (
    <PortalShell
      title="تصنيف الكوادر"
      subtitle={`${num(rows.length)} في الصفحة · ${num(groups.length)} تصنيفات`}
      back={{ label: "محتوى الموقع", to: "/site" }}
    >
      <WithSide
        side={
          <SideNote title="كيف تعمل الصفحة؟">
            أضف من يظهر في «الكوادر» على الموقع: موظفًا له حساب، أو شخصًا بلا حساب كالعميد. ثم ضع كل
            شخص في تصنيف أو أكثر من المصفوفة. صاحب الحساب لا يظهر إلا إن وافق على ملفه العام من
            إعداداته، وأعضاء هيئة التدريس الموافقون يظهرون تلقائيًا في التصنيف الذي يضمّهم حتى تغيّر
            مكانهم. الإضافة هنا لا تُنشئ حسابًا.
          </SideNote>
        }
      >
        {board.isError && <Notice>{problemMessage(board.error)}</Notice>}
        <Groups groups={groups} onChange={refresh} />
        <AddPerson onAdded={refresh} />
        <SectionLabel>المصفوفة</SectionLabel>
        {board.isPending ? (
          <Card className="p-4 text-sm text-text-muted">جارٍ التحميل…</Card>
        ) : rows.length === 0 ? (
          <EmptyState icon={<UserPlus size={24} aria-hidden />} title="لا أحد في الصفحة بعد">
            أضف موظفًا أو شخصًا من الأعلى.
          </EmptyState>
        ) : (
          <Matrix groups={groups} rows={rows} onChange={refresh} />
        )}
      </WithSide>
    </PortalShell>
  );
}

const input =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-text";

function Groups({ groups, onChange }: { groups: Group[]; onChange: () => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/site-staff/groups", {
        body: { name_ar: name.trim(), name_en: nameEn.trim() } as Group,
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setName("");
      setNameEn("");
      onChange();
    },
  });
  const save = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<Group> }) => {
      const { data, error } = await api.PATCH("/api/v1/site-staff/groups/{id}", {
        params: { path: { id } },
        body: body as Group,
      });
      if (!data) throw error;
    },
    onSuccess: onChange,
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { response, error } = await api.DELETE("/api/v1/site-staff/groups/{id}", {
        params: { path: { id } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: onChange,
  });
  // Moving swaps the order with the neighbour (orders may repeat: number them first).
  const move = (index: number, by: -1 | 1) => {
    const other = groups[index + by];
    const group = groups[index];
    if (!other || !group) return;
    save.mutate({ id: group.id, body: { order: index + by + 1 } });
    save.mutate({ id: other.id, body: { order: index + 1 } });
  };
  const error = add.error ?? save.error ?? remove.error;
  return (
    <>
      <SectionLabel>التصنيفات</SectionLabel>
      <Card className="divide-y divide-border-soft">
        {groups.map((g, i) => (
          <GroupRow
            key={`${g.id}-${g.name_ar}-${g.name_en}`}
            group={g}
            first={i === 0}
            last={i === groups.length - 1}
            busy={save.isPending || remove.isPending}
            onSave={(body) => save.mutate({ id: g.id, body })}
            onMove={(by) => move(i, by)}
            onRemove={async () => {
              const yes = await confirm({
                title: `حذف تصنيف «${g.name_ar}»؟`,
                body: "يخرج منه من وُضع فيه، ويبقون في المصفوفة. لا يُحذف أحد.",
                confirm: "حذف التصنيف",
                tone: "danger",
              });
              if (yes) remove.mutate(g.id);
            }}
          />
        ))}
        <form
          className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !add.isPending) add.mutate();
          }}
        >
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="تصنيف جديد، مثل: مجلس الأمناء"
            aria-label="اسم التصنيف بالعربية"
          />
          <input
            className={input}
            dir="ltr"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="English name (optional)"
            aria-label="اسم التصنيف بالإنجليزية"
          />
          <Button type="submit" disabled={!name.trim() || add.isPending} why="اكتب اسم التصنيف">
            إضافة
          </Button>
        </form>
      </Card>
      {error && <Notice>{problemMessage(error)}</Notice>}
    </>
  );
}

function GroupRow({
  group: g,
  first,
  last,
  busy,
  onSave,
  onMove,
  onRemove,
}: {
  group: Group;
  first: boolean;
  last: boolean;
  busy: boolean;
  onSave: (body: Partial<Group>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(g.name_ar);
  const [nameEn, setNameEn] = useState(g.name_en ?? "");
  const changed = name.trim() !== g.name_ar || nameEn.trim() !== (g.name_en ?? "");
  return (
    // Two lines at every size: the names, then the controls (they do not fit beside the names).
    <div className="grid gap-2 p-3 sm:grid-cols-2">
      <input
        className={input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={`اسم التصنيف «${g.name_ar}»`}
      />
      <input
        className={input}
        dir="ltr"
        value={nameEn}
        onChange={(e) => setNameEn(e.target.value)}
        placeholder="English name"
        aria-label={`الاسم الإنجليزي لتصنيف «${g.name_ar}»`}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          {changed && (
            <Button
              variant="secondary"
              disabled={!name.trim() || busy}
              why="اكتب اسم التصنيف"
              onClick={() => onSave({ name_ar: name.trim(), name_en: nameEn.trim() })}
            >
              حفظ
            </Button>
          )}
          <span className="flex items-center gap-1 text-xs text-text-muted">
            يظهر
            <Switch
              checked={g.is_visible ?? true}
              label={`إظهار «${g.name_ar}» في الموقع`}
              disabled={busy}
              onChange={(v) => onSave({ is_visible: v })}
            />
          </span>
          <Chip
            active={!!g.holds_faculty}
            disabled={busy || !!g.holds_faculty}
            onClick={() => onSave({ holds_faculty: true })}
          >
            {g.holds_faculty ? "يضم هيئة التدريس تلقائيًا" : "اجعله لهيئة التدريس"}
          </Chip>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            className="grid size-11 place-items-center rounded-lg text-text-muted hover:bg-surface-alt disabled:opacity-40"
            aria-label={`نقل «${g.name_ar}» للأعلى`}
            disabled={first || busy}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={18} />
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-lg text-text-muted hover:bg-surface-alt disabled:opacity-40"
            aria-label={`نقل «${g.name_ar}» للأسفل`}
            disabled={last || busy}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={18} />
          </button>
          {!g.holds_faculty && (
            <button
              type="button"
              className="grid size-11 place-items-center rounded-lg text-danger-strong hover:bg-danger-soft disabled:opacity-40"
              aria-label={`حذف تصنيف «${g.name_ar}»`}
              disabled={busy}
              onClick={onRemove}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddPerson({ onAdded }: { onAdded: () => void }) {
  const [mode, setMode] = useState<"account" | "person">("account");
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState({ name_ar: "", name_en: "", title_ar: "", title_en: "" });
  const [photo, setPhoto] = useState("");
  const people = useQuery({
    queryKey: ["site", "staff", "people", search],
    enabled: mode === "account" && search.trim().length >= 2,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/site-staff/people", {
          params: { query: { search: search.trim() } },
        }),
      ),
  });
  const media = useQuery({
    queryKey: ["site", "media"],
    enabled: mode === "person",
    queryFn: async () =>
      ok(await api.GET("/api/v1/content/media", { params: { query: ALL } }))?.results ?? [],
  });
  const add = useMutation({
    mutationFn: async (body: Schemas["StaffEntryWriteRequest"]) => {
      const { data, error } = await api.POST("/api/v1/site-staff/entries", { body });
      if (!data) throw error;
    },
    onSuccess: () => {
      setPerson({ name_ar: "", name_en: "", title_ar: "", title_en: "" });
      setPhoto("");
      void people.refetch();
      onAdded();
    },
  });
  return (
    <>
      <SectionLabel>إضافة إلى الصفحة</SectionLabel>
      <Card className="p-3">
        <div className="mb-3 flex gap-1" role="tablist" aria-label="نوع الإضافة">
          <QuietTab
            role="tab"
            aria-selected={mode === "account"}
            active={mode === "account"}
            onClick={() => setMode("account")}
          >
            موظف له حساب
          </QuietTab>
          <QuietTab
            role="tab"
            aria-selected={mode === "person"}
            active={mode === "person"}
            onClick={() => setMode("person")}
          >
            شخص بلا حساب
          </QuietTab>
        </div>
        {mode === "account" ? (
          <>
            <label className="relative block">
              <Search
                size={18}
                className="pointer-events-none absolute start-3 top-3 text-text-muted"
                aria-hidden
              />
              <input
                className={`${input} ps-10`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو البريد"
                aria-label="ابحث عن موظف"
              />
            </label>
            {search.trim().length >= 2 && (
              <ul className="mt-2 divide-y divide-border-soft">
                {(people.data ?? []).map((p) => (
                  <li key={p.public_id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm text-text">{p.full_name_ar}</b>
                      <span className="block text-xs text-text-muted">
                        {[
                          p.academic_title_ar,
                          p.public_profile ? "وافق على الظهور" : "لم يوافق على الظهور بعد",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {p.on_page ? (
                      <span className="text-xs text-text-muted">في الصفحة</span>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={add.isPending}
                        onClick={() => add.mutate({ user: p.public_id })}
                      >
                        <UserPlus size={16} aria-hidden />
                        إضافة
                      </Button>
                    )}
                  </li>
                ))}
                {people.data?.length === 0 && (
                  <li className="py-2 text-sm text-text-muted">لا موظف بهذا الاسم.</li>
                )}
              </ul>
            )}
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (person.name_ar.trim() && !add.isPending)
                add.mutate({ ...person, photo: photo || null });
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={input}
                value={person.name_ar}
                onChange={(e) => setPerson({ ...person, name_ar: e.target.value })}
                placeholder="الاسم بالعربية"
                aria-label="الاسم بالعربية"
                required
              />
              <input
                className={input}
                dir="ltr"
                value={person.name_en}
                onChange={(e) => setPerson({ ...person, name_en: e.target.value })}
                placeholder="Name in English (optional)"
                aria-label="الاسم بالإنجليزية"
              />
              <input
                className={input}
                value={person.title_ar}
                onChange={(e) => setPerson({ ...person, title_ar: e.target.value })}
                placeholder="اللقب، مثل: أ.د."
                aria-label="اللقب بالعربية"
              />
              <input
                className={input}
                dir="ltr"
                value={person.title_en}
                onChange={(e) => setPerson({ ...person, title_en: e.target.value })}
                placeholder="Title in English (optional)"
                aria-label="اللقب بالإنجليزية"
              />
              <Select
                value={photo}
                onChange={(e) => setPhoto(e.target.value)}
                className={`${input} sm:col-span-2`}
                aria-label="الصورة"
              >
                <option value="">بلا صورة (الحرف الأول من الاسم)</option>
                {(media.data ?? []).map((m) => (
                  <option key={m.public_id} value={m.public_id}>
                    {m.alt_ar || m.url.split("/").pop()}
                  </option>
                ))}
              </Select>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              الصورة من مكتبة الوسائط؛ ارفعها هناك أولًا إن لم تكن فيها.
            </p>
            <Button
              type="submit"
              className="mt-3 w-full sm:w-auto"
              disabled={!person.name_ar.trim() || add.isPending}
              why="اكتب الاسم بالعربية"
            >
              إضافة إلى الصفحة
            </Button>
          </form>
        )}
        {add.isError && <Notice>{problemMessage(add.error)}</Notice>}
      </Card>
    </>
  );
}

const rowKey = (r: Row) => r.entry ?? `user-${r.user}`;

function Matrix({
  groups,
  rows,
  onChange,
}: {
  groups: Group[];
  rows: Row[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState<string>();
  const place = useMutation({
    mutationFn: async ({ row, placements }: { row: Row; placements: Placement[] }) => {
      const result = row.entry
        ? await api.PATCH("/api/v1/site-staff/entries/{public_id}", {
            params: { path: { public_id: row.entry } },
            body: { placements },
          })
        : await api.POST("/api/v1/site-staff/entries", {
            body: { user: row.user, placements },
          });
      if (!result.data) throw result.error;
    },
    onSuccess: onChange,
  });
  const toggle = (row: Row, group: Group) => {
    const has = row.placements.some((p) => p.group === group.id);
    const placements = has
      ? row.placements.filter((p) => p.group !== group.id)
      : [...row.placements, { group: group.id, position_ar: "", position_en: "", order: 0 }];
    place.mutate({ row, placements });
  };
  return (
    <>
      {place.isError && <Notice>{problemMessage(place.error)}</Notice>}
      {/* ≥1024: people down, groups across, a tick a cell. */}
      <Card className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft text-start text-xs text-text-muted">
              <th className="p-3 text-start font-semibold">الاسم</th>
              {groups.map((g) => (
                <th key={g.id} className="p-3 text-center font-semibold">
                  {g.name_ar}
                  {!g.is_visible && <span className="block font-normal">(مخفي)</span>}
                </th>
              ))}
              <th className="p-3">
                <span className="sr-only">تعديل</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <MatrixRow
                key={rowKey(r)}
                row={r}
                groups={groups}
                open={open === rowKey(r)}
                busy={place.isPending}
                onToggle={(g) => toggle(r, g)}
                onOpen={() => setOpen(open === rowKey(r) ? undefined : rowKey(r))}
                onChange={onChange}
              />
            ))}
          </tbody>
        </table>
      </Card>
      {/* Phones: one card a person, a chip a group. */}
      <div className="space-y-3 lg:hidden">
        {rows.map((r) => (
          <Card key={rowKey(r)} className="p-3">
            <Person row={r} />
            <div className="mt-2 flex flex-wrap gap-2">
              {groups.map((g) => (
                <Chip
                  key={g.id}
                  active={r.placements.some((p) => p.group === g.id)}
                  disabled={place.isPending}
                  onClick={() => toggle(r, g)}
                  aria-label={`${r.name_ar} في «${g.name_ar}»`}
                >
                  {g.name_ar}
                </Chip>
              ))}
            </div>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => setOpen(open === rowKey(r) ? undefined : rowKey(r))}
              aria-expanded={open === rowKey(r)}
            >
              {open === rowKey(r) ? "إغلاق" : "المسمّى والترتيب والبيانات"}
            </Button>
            {open === rowKey(r) && (
              <Edit row={r} groups={groups} onDone={() => setOpen(undefined)} onChange={onChange} />
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

function Person({ row: r }: { row: Row }) {
  return (
    <div className="min-w-0">
      <b className="block text-text">{r.name_ar}</b>
      <span className="block text-xs text-text-muted">
        {[r.title_ar, r.account ? "حساب في المنصة" : "بلا حساب"].filter(Boolean).join(" · ")}
      </span>
      <span className="mt-1 flex flex-wrap gap-1">
        {r.automatic && (
          <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] text-info-strong">
            تلقائي
          </span>
        )}
        {!r.consent && (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] text-warning-strong">
            لم يوافق على الظهور — لن يظهر
          </span>
        )}
      </span>
    </div>
  );
}

function MatrixRow({
  row: r,
  groups,
  open,
  busy,
  onToggle,
  onOpen,
  onChange,
}: {
  row: Row;
  groups: Group[];
  open: boolean;
  busy: boolean;
  onToggle: (g: Group) => void;
  onOpen: () => void;
  onChange: () => void;
}) {
  return (
    <>
      <tr className="border-b border-border-soft last:border-b-0">
        <td className="p-3">
          <Person row={r} />
        </td>
        {groups.map((g) => (
          <td key={g.id} className="p-3 text-center">
            <input
              type="checkbox"
              className="size-5 accent-[var(--color-primary)]"
              checked={r.placements.some((p) => p.group === g.id)}
              disabled={busy}
              onChange={() => onToggle(g)}
              aria-label={`${r.name_ar} في «${g.name_ar}»`}
            />
          </td>
        ))}
        <td className="p-3 text-end">
          <Button variant="ghost" onClick={onOpen} aria-expanded={open}>
            {open ? "إغلاق" : "تعديل"}
          </Button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border-soft bg-surface-alt/40">
          <td colSpan={groups.length + 2} className="p-3">
            <Edit row={r} groups={groups} onDone={onOpen} onChange={onChange} />
          </td>
        </tr>
      )}
    </>
  );
}

/** A person's details: the position and order in each group they are in, and — for a person
 * with no account — their name, title and photo. */
function Edit({
  row: r,
  groups,
  onDone,
  onChange,
}: {
  row: Row;
  groups: Group[];
  onDone: () => void;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const [placements, setPlacements] = useState<Placement[]>(r.placements);
  const [person, setPerson] = useState({
    name_ar: r.name_ar,
    name_en: r.name_en,
    title_ar: r.title_ar,
    title_en: r.title_en,
  });
  const save = useMutation({
    mutationFn: async () => {
      const body = { placements, ...(r.account ? {} : person) };
      const result = r.entry
        ? await api.PATCH("/api/v1/site-staff/entries/{public_id}", {
            params: { path: { public_id: r.entry } },
            body,
          })
        : await api.POST("/api/v1/site-staff/entries", { body: { user: r.user, placements } });
      if (!result.data) throw result.error;
    },
    onSuccess: () => {
      onChange();
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { response, error } = await api.DELETE("/api/v1/site-staff/entries/{public_id}", {
        params: { path: { public_id: r.entry ?? "" } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: onChange,
  });
  const name = (id: number) => groups.find((g) => g.id === id)?.name_ar ?? "";
  const set = (i: number, patch: Partial<Placement>) =>
    setPlacements(placements.map((p, j) => (i === j ? { ...p, ...patch } : p)));
  return (
    <div className="mt-2 space-y-3">
      {placements.length === 0 && (
        <p className="text-sm text-text-muted">لا يظهر في أي تصنيف. ضع علامة في المصفوفة أولًا.</p>
      )}
      {placements.map((p, i) => (
        <div key={p.group} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
          <input
            className={input}
            value={p.position_ar ?? ""}
            onChange={(e) => set(i, { position_ar: e.target.value })}
            placeholder={`المسمّى في «${name(p.group)}»، مثل: عميد الكلية`}
            aria-label={`المسمّى في «${name(p.group)}»`}
          />
          <input
            className={input}
            dir="ltr"
            value={p.position_en ?? ""}
            onChange={(e) => set(i, { position_en: e.target.value })}
            placeholder="Position in English"
            aria-label={`المسمّى بالإنجليزية في «${name(p.group)}»`}
          />
          <input
            className={input}
            type="number"
            min={0}
            max={999}
            value={p.order ?? 0}
            onChange={(e) => set(i, { order: Number(e.target.value) || 0 })}
            aria-label={`الترتيب في «${name(p.group)}» (الأصغر أولًا)`}
            title="الترتيب: الأصغر يظهر أولًا"
          />
        </div>
      ))}
      {!r.account && (
        <Card>
          <Field
            label="الاسم بالعربية"
            value={person.name_ar}
            onChange={(e) => setPerson({ ...person, name_ar: e.target.value })}
          />
          <Field
            label="الاسم بالإنجليزية"
            dir="ltr"
            value={person.name_en}
            onChange={(e) => setPerson({ ...person, name_en: e.target.value })}
          />
          <Field
            label="اللقب بالعربية"
            value={person.title_ar}
            onChange={(e) => setPerson({ ...person, title_ar: e.target.value })}
          />
          <Field
            label="اللقب بالإنجليزية"
            dir="ltr"
            value={person.title_en}
            onChange={(e) => setPerson({ ...person, title_en: e.target.value })}
          />
        </Card>
      )}
      {r.account && (
        <p className="text-xs text-text-muted">
          الاسم واللقب والصورة من حساب الموظف، ويعدّلها هو من إعداداته.
        </p>
      )}
      {save.isError && <Notice>{problemMessage(save.error)}</Notice>}
      {remove.isError && <Notice>{problemMessage(remove.error)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={save.isPending || (!r.account && !person.name_ar.trim())}
          why="اكتب الاسم بالعربية"
          onClick={() => save.mutate()}
        >
          حفظ
        </Button>
        {r.entry && (
          <Button
            variant="secondary"
            disabled={remove.isPending}
            onClick={async () => {
              const yes = await confirm({
                title: r.teaching
                  ? "إعادته إلى التصنيف التلقائي؟"
                  : `إزالة ${r.name_ar} من الصفحة؟`,
                body: r.teaching
                  ? "يعود إلى التصنيف الذي يضم هيئة التدريس كما كان، ويُنسى ما غيّرته هنا."
                  : "يختفي من «الكوادر» على الموقع. حسابه، إن كان له حساب، لا يتأثر.",
                confirm: r.teaching ? "إعادة" : "إزالة",
                tone: r.teaching ? undefined : "danger",
              });
              if (yes) remove.mutate();
            }}
          >
            {r.teaching ? "إعادة إلى التلقائي" : "إزالة من الصفحة"}
          </Button>
        )}
      </div>
    </div>
  );
}
