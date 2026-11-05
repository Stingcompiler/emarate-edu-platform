import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { useConfirm } from "../../components/Confirm";
import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Labeled,
  Notice,
  problemMessage,
  SectionLabel,
  StatusBadge,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { hasRole, useMe } from "../../lib/auth";
import { count, N, fmtDate } from "../../lib/format";
import { ALL } from "../../components/Pager";

/** Board: HeadRegistrarCycles (phone); desktop derived — cycles + a table of intakes. */
export function Cycles() {
  const client = useQueryClient();
  const me = useMe();
  const confirm = useConfirm();
  // Deleting is the admin's and the head registrar's; the system supervisor never deletes.
  const deletes = hasRole(me.data, "system_admin", "head_registrar");
  const [editing, setEditing] = useState(false);
  const cycles = useQuery({
    queryKey: ["admissions", "cycles"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/admission-cycles", { params: { query: ALL } }))?.results ?? [],
  });
  const [picked, setPicked] = useState<number | null>(null);
  const cycle = cycles.data?.find((c) => c.id === picked) ?? cycles.data?.[0];
  const intakes = useQuery({
    queryKey: ["admissions", "intakes", cycle?.id],
    enabled: !!cycle,
    queryFn: async () =>
      ok(await api.GET("/api/v1/intakes", { params: { query: { ...ALL, cycle: cycle!.id } } }))
        ?.results ?? [],
  });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/programs", { params: { query: ALL } }))?.results ?? [],
  });
  // Which form a programme uses (spec §5): the college's default unless one is chosen; the
  // newest published version of that form is offered to applicants.
  const templates = useQuery({
    queryKey: ["admissions", "templates"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/form-templates", { params: { query: ALL } }))?.results ?? [],
  });
  // Published forms only (a draft could still change under its version); one per name.
  const forms = [
    ...new Map(
      (templates.data ?? [])
        .filter((tpl) => tpl.status === "published")
        .map((tpl) => [tpl.name, tpl] as const),
    ).values(),
  ].filter((tpl) => tpl.name !== "default");
  const linkForm = useMutation({
    mutationFn: async ({ id, form_template }: { id: number; form_template: number | null }) => {
      const { data, error } = await api.PATCH("/api/v1/intakes/{id}", {
        params: { path: { id } },
        body: { form_template } as never,
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admissions", "intakes"] }),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, is_open }: { id: number; is_open: boolean }) => {
      const { data, error } = await api.PATCH("/api/v1/intakes/{id}", {
        params: { path: { id } },
        body: { is_open },
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admissions", "intakes"] }),
  });
  const add = useMutation({
    mutationFn: async (program: number) => {
      const { data, error } = await api.POST("/api/v1/intakes", {
        body: {
          cycle: cycle!.id,
          program,
          required_documents: [
            { key: "certificate", label: "الشهادة الثانوية", required: true },
            { key: "id", label: "الرقم الوطني أو الجواز", required: true },
          ],
        } as never,
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admissions", "intakes"] }),
  });
  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/academic-years", { params: { query: ALL } }))?.results ?? [],
  });
  const [draft, setDraft] = useState({ name: "", opens: "", closes: "" });
  const create = useMutation({
    mutationFn: async () => {
      const year = years.data?.find((y) => y.is_current) ?? years.data?.[0];
      const { data, error } = await api.POST("/api/v1/admission-cycles", {
        body: {
          academic_year: year!.id,
          name: draft.name,
          opens_at: new Date(draft.opens).toISOString(),
          closes_at: new Date(draft.closes).toISOString(),
        } as never,
      });
      if (!data) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setDraft({ name: "", opens: "", closes: "" });
      setPicked(id);
      void client.invalidateQueries({ queryKey: ["admissions", "cycles"] });
    },
  });
  const used = new Set((intakes.data ?? []).map((i) => i.program));
  const applied = (intakes.data ?? []).reduce((n, i) => n + (i.applications_count ?? 0), 0);
  const removeCycle = useMutation({
    mutationFn: async (id: number) => {
      const { error, response } = await api.DELETE("/api/v1/admission-cycles/{id}", {
        params: { path: { id } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => {
      setPicked(null);
      setEditing(false);
      void client.invalidateQueries({ queryKey: ["admissions"] });
    },
  });
  const removeIntake = useMutation({
    mutationFn: async (id: number) => {
      const { error, response } = await api.DELETE("/api/v1/intakes/{id}", {
        params: { path: { id } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admissions", "intakes"] }),
  });
  return (
    <PortalShell
      title="دورات القبول"
      subtitle="الدورة تحدد الفترة والبرامج المفتوحة والسعة والقالب لكل برنامج"
    >
      <div className="flex flex-wrap gap-2">
        {(cycles.data ?? []).map((c) => (
          <Chip key={c.id} active={c.id === cycle?.id} onClick={() => setPicked(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>
      <details className="mt-3 rounded-xl border border-border-soft bg-surface p-3 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary">
          دورة جديدة
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
          <Labeled label="اسم الدورة">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="الاسم، مثل: قبول 2027/2028"
              className="min-h-10 w-full rounded-lg border border-border bg-surface px-3"
            />
          </Labeled>
          <label className="flex items-center gap-2 text-xs text-text-muted">
            يفتح
            <input
              type="date"
              value={draft.opens}
              onChange={(e) => setDraft({ ...draft, opens: e.target.value })}
              className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-2"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-text-muted">
            يُغلق
            <input
              type="date"
              value={draft.closes}
              onChange={(e) => setDraft({ ...draft, closes: e.target.value })}
              className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-2"
            />
          </label>
          <Button
            onClick={() => create.mutate()}
            disabled={!draft.name || !draft.opens || !draft.closes || create.isPending}
          >
            إنشاء
          </Button>
        </div>
        {create.isError && (
          <div className="mt-2">
            <Notice>{problemMessage(create.error)}</Notice>
          </div>
        )}
      </details>
      {cycle && (
        <>
          <Card className="mt-4 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span>
                يفتح: <b>{fmtDate(cycle.opens_at)}</b>
              </span>
              <span>
                يُغلق: <b>{fmtDate(cycle.closes_at)}</b>
              </span>
              <StatusBadge
                status={cycle.is_active ? "approved" : "closed"}
                label={cycle.is_active ? "جارية" : "موقوفة"}
              />
              <span className="ms-auto flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="min-h-10 px-3 sm:min-h-9"
                  aria-expanded={editing}
                  onClick={() => setEditing(!editing)}
                >
                  <Pencil size={16} aria-hidden />
                  تعديل
                </Button>
                {deletes && (
                  <Button
                    variant="ghost"
                    className="min-h-10 px-3 text-danger-strong sm:min-h-9"
                    disabled={applied > 0 || removeCycle.isPending}
                    why={applied > 0 ? "في الدورة طلبات؛ أوقفها من «تعديل» بدل حذفها" : undefined}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `حذف الدورة «${cycle.name}»؟`,
                          body: `تُحذف معها برامجها (${(intakes.data?.length ?? 0).toLocaleString("ar-u-nu-latn")}). لا طلبات فيها، ولا يمكن التراجع.`,
                          confirm: "حذف الدورة",
                        })
                      )
                        removeCycle.mutate(cycle.id);
                    }}
                  >
                    <Trash2 size={16} aria-hidden />
                    حذف
                  </Button>
                )}
              </span>
            </div>
            {editing && (
              <CycleForm
                key={cycle.id}
                cycle={cycle}
                onDone={() => {
                  setEditing(false);
                  void client.invalidateQueries({ queryKey: ["admissions", "cycles"] });
                }}
              />
            )}
            {removeCycle.isError && (
              <div className="mt-3">
                <Notice>{problemMessage(removeCycle.error)}</Notice>
              </div>
            )}
          </Card>
          <SectionLabel>
            البرامج في هذه الدورة · {(intakes.data?.length ?? 0).toLocaleString("ar-u-nu-latn")}
          </SectionLabel>
          {/* Two columns on wide screens: one row across 1100px put the button far from the
              programme it closes. */}
          <Card className="grid divide-y divide-border-soft overflow-hidden xl:grid-cols-2 xl:divide-y-0 xl:[&>div]:border-b xl:[&>div]:border-border-soft xl:[&>div:last-child:nth-child(odd)]:col-span-2 xl:[&>div:nth-child(odd)]:border-e">
            {(intakes.data ?? []).map((i) => (
              <div key={i.id} className="flex items-start gap-4 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-text">{i.program_name}</span>
                    <StatusBadge
                      status={i.is_open ? "approved" : "closed"}
                      label={i.is_open ? "يقبل" : "مغلق"}
                    />
                  </span>
                  <span className="text-xs text-text-muted">
                    {i.department_name} · {count(i.applications_count ?? 0, N.application)}
                    {i.capacity ? ` · ${i.capacity} مقعد` : ""}
                  </span>
                  {/* Applications against seats (board DesktopHeadRegistrar «الدورات بحالة وسعة»). */}
                  {i.capacity ? (
                    <span className="mt-1.5 flex max-w-xs items-center gap-2">
                      <span
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt"
                        role="progressbar"
                        aria-label={`الطلبات من المقاعد — ${i.program_name}`}
                        aria-valuemin={0}
                        aria-valuemax={i.capacity}
                        aria-valuenow={Math.min(i.capacity, i.applications_count ?? 0)}
                      >
                        <span
                          className={`block h-full rounded-full ${(i.applications_count ?? 0) >= i.capacity ? "bg-warning" : "bg-primary"}`}
                          style={{
                            width: `${Math.min(100, (100 * (i.applications_count ?? 0)) / i.capacity)}%`,
                          }}
                        />
                      </span>
                      <span className="shrink-0 text-end text-xs whitespace-nowrap text-text-muted">
                        {Math.round(
                          (100 * (i.applications_count ?? 0)) / i.capacity,
                        ).toLocaleString("ar-u-nu-latn")}
                        ٪
                      </span>
                    </span>
                  ) : null}
                  {forms.length > 0 && (
                    <label className="mt-1.5 flex items-center gap-2 text-xs text-text-muted">
                      الاستمارة:
                      <select
                        value={
                          forms.find(
                            (f) =>
                              f.name ===
                              (templates.data ?? []).find((tpl) => tpl.id === i.form_template)
                                ?.name,
                          )?.id ?? ""
                        }
                        disabled={linkForm.isPending}
                        onChange={(e) =>
                          linkForm.mutate({
                            id: i.id,
                            form_template: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        className="min-h-11 rounded-lg border border-border bg-surface px-2 text-xs text-text sm:min-h-9"
                      >
                        <option value="">الاستمارة الافتراضية</option>
                        {forms.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </span>

                {/* Top-aligned beside the name: centred, it sat over the seats percentage. */}
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Button
                    variant={i.is_open ? "secondary" : "primary"}
                    className="min-h-10 px-3 sm:min-h-9"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: i.id, is_open: !i.is_open })}
                  >
                    {i.is_open ? "إغلاق" : "فتح"}
                  </Button>
                  {/* A programme added by mistake leaves the cycle while no one has applied. */}
                  {deletes && !i.applications_count && (
                    <Button
                      variant="ghost"
                      className="min-h-10 px-2 text-xs text-danger-strong sm:min-h-8"
                      disabled={removeIntake.isPending}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `إزالة «${i.program_name}» من الدورة؟`,
                            body: "لا طلبات عليه؛ يمكن إضافته مجددًا.",
                            confirm: "إزالة",
                          })
                        )
                          removeIntake.mutate(i.id);
                      }}
                    >
                      إزالة
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </Card>
          <SectionLabel>إضافة برنامج</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {(programs.data ?? [])
              .filter((p) => !used.has(p.id))
              .map((p) => (
                <Chip key={p.id} disabled={add.isPending} onClick={() => add.mutate(p.id)}>
                  + {p.name_ar}
                </Chip>
              ))}
            {programs.data && programs.data.every((p) => used.has(p.id)) && (
              <p className="text-sm text-text-muted">كل البرامج مضافة إلى هذه الدورة.</p>
            )}
          </div>
          {(toggle.isError || add.isError || linkForm.isError || removeIntake.isError) && (
            <div className="mt-3">
              <Notice>
                {problemMessage(toggle.error ?? add.error ?? linkForm.error ?? removeIntake.error)}
              </Notice>
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}

type Cycle = { id: number; name: string; opens_at: string; closes_at: string; is_active?: boolean };

/** A cycle's name, window and state, corrected in place (owner, 2026-11-05). */
function CycleForm({ cycle, onDone }: { cycle: Cycle; onDone: () => void }) {
  const [f, setF] = useState({
    name: cycle.name,
    opens: cycle.opens_at.slice(0, 10),
    closes: cycle.closes_at.slice(0, 10),
    is_active: cycle.is_active ?? true,
  });
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH("/api/v1/admission-cycles/{id}", {
        params: { path: { id: cycle.id } },
        body: {
          name: f.name.trim(),
          opens_at: new Date(f.opens).toISOString(),
          closes_at: new Date(f.closes).toISOString(),
          is_active: f.is_active,
        },
      });
      if (!data) throw error;
    },
    onSuccess: onDone,
  });
  const missing = !f.name.trim() || !f.opens || !f.closes;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="mt-3 grid gap-2 border-t border-border-soft pt-3 sm:grid-cols-[minmax(0,1fr)_170px_170px]"
    >
      <Labeled label="اسم الدورة">
        <input
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="min-h-10 w-full rounded-lg border border-border bg-surface px-3"
        />
      </Labeled>
      <Labeled label="يفتح">
        <input
          type="date"
          value={f.opens}
          onChange={(e) => setF({ ...f, opens: e.target.value })}
          className="min-h-10 w-full rounded-lg border border-border bg-surface px-2"
        />
      </Labeled>
      <Labeled label="يُغلق">
        <input
          type="date"
          value={f.closes}
          onChange={(e) => setF({ ...f, closes: e.target.value })}
          className="min-h-10 w-full rounded-lg border border-border bg-surface px-2"
        />
      </Labeled>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-3">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={f.is_active}
          onChange={(e) => setF({ ...f, is_active: e.target.checked })}
        />
        الدورة جارية (أزل العلامة لإيقافها دون حذف)
      </label>
      {save.isError && (
        <div className="sm:col-span-3">
          <Notice>{problemMessage(save.error)}</Notice>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-3">
        <Button
          type="submit"
          disabled={missing || save.isPending}
          why={missing ? "أكمل الاسم والتاريخين" : undefined}
        >
          حفظ
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
