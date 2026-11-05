import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Field,
  Labeled,
  Notice,
  problemMessage,
  SectionLabel,
  StatusBadge,
  Switch,
  TextArea,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { num } from "../../lib/reports";
import { count, N, fmtDate } from "../../lib/format";
import { ALL } from "../../components/Pager";
import { useConfirm } from "../../components/Confirm";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";

const DEGREE: Record<string, string> = {
  diploma: "دبلوم",
  bachelor: "بكالوريوس",
  honours: "بكالوريوس مرتبة الشرف",
  master: "ماجستير",
};

/** Back to the button that opened a form, once it closes (review 2026-11: the focus fell to
 * the page, and a keyboard user started again from the top). */
const focusOpener = (name: string) =>
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-opener="${CSS.escape(name)}"]`)?.focus(),
  );

/** An edit form that opens takes the focus and comes into view (it may open below a list). */
function useOpenFocus<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    ref.current.scrollIntoView({ block: "nearest" });
    ref.current
      .querySelector<HTMLElement>("input, select, textarea")
      ?.focus({ preventScroll: true });
  }, [active]);
  return ref;
}

/** Board: DesktopSystemStructure — college tree, years and terms, department programs. */
export function Structure() {
  const confirm = useConfirm();
  const client = useQueryClient();
  const colleges = useQuery({
    queryKey: ["colleges"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/colleges", { params: { query: ALL } }))?.results ?? [],
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/departments", { params: { query: ALL } }))?.results ?? [],
  });
  const programs = useQuery({
    queryKey: ["programs", "all"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/programs", { params: { query: { page_size: 100 } as never } }))
        ?.results ?? [],
  });
  const terms = useQuery({
    queryKey: ["terms"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/terms", { params: { query: ALL } }))?.results ?? [],
  });
  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/academic-years", { params: { query: ALL } }))?.results ?? [],
  });
  // The admission cycle applicants see now, and which programmes it offers: a programme added
  // here can be opened for applying at once (owner 2026-11-02, «تظهر مباشرة»).
  const cycles = useQuery({
    queryKey: ["admissions", "cycles"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/admission-cycles", { params: { query: ALL } }))?.results ?? [],
  });
  const cycle = cycles.data?.find((c) => c.is_active);
  const intakes = useQuery({
    queryKey: ["admissions", "intakes", cycle?.id],
    enabled: !!cycle,
    queryFn: async () =>
      ok(await api.GET("/api/v1/intakes", { params: { query: { ...ALL, cycle: cycle!.id } } }))
        ?.results ?? [],
  });
  const intakeOf = (program: number) => intakes.data?.find((i) => i.program === program);
  const [saved, setSaved] = useState(false);
  const [editingTerm, setEditingTerm] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  // The open form: a programme's details or its public page (description, fees, outcomes),
  // or the selected department's details.
  const [editing, setEditing] = useState<{ id: number; part: "details" | "page" } | null>(null);
  const [editingDept, setEditingDept] = useState(false);
  const dept = departments.data?.find((d) => d.id === picked) ?? departments.data?.[0];
  const deptPrograms = (programs.data ?? []).filter((p) => p.department === dept?.id);
  const refresh = (key: string) => {
    if (key === "departments" || key === "programs") setSaved(true);
    return client.invalidateQueries({ queryKey: [key] });
  };
  const toggleDept = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const { data, error } = await api.PATCH("/api/v1/departments/{id}", {
        params: { path: { id } },
        body: { is_active },
      });
      if (!data) throw error;
    },
    onSuccess: () => void refresh("departments"),
  });
  const openIntake = useMutation({
    mutationFn: (program: number) => addIntake(cycle!.id, program),
    onSuccess: () => {
      setSaved(true);
      void client.invalidateQueries({ queryKey: ["admissions", "intakes"] });
    },
  });
  const setCurrent = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await api.POST("/api/v1/terms/{id}/set-current", {
        params: { path: { id } },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      void refresh("terms");
      void refresh("academic-years");
    },
  });
  const [dForm, setD] = useState({ code: "", name_ar: "", name_en: "" });
  const addDept = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/departments", {
        body: { college: colleges.data![0]!.id, ...dForm },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setD({ code: "", name_ar: "", name_en: "" });
      void refresh("departments");
    },
  });
  const [tForm, setT] = useState({
    academic_year: "",
    name_ar: "",
    order: 1,
    starts_on: "",
    ends_on: "",
  });
  const addTerm = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/terms", {
        body: { ...tForm, academic_year: Number(tForm.academic_year) },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setT({ ...tForm, name_ar: "", starts_on: "", ends_on: "" });
      void refresh("terms");
    },
  });
  const err =
    setCurrent.error ?? addDept.error ?? addTerm.error ?? openIntake.error ?? toggleDept.error;
  // min-w-0 w-full: a field never sets its row's width (a text field's default is ~200px).
  const input = "min-h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm";
  return (
    <PortalShell
      title="الهيكل الأكاديمي"
      subtitle={`${colleges.data?.[0]?.name_ar ?? ""} · ${count(departments.data?.length ?? 0, N.department)} · ${count(programs.data?.length ?? 0, N.program)}`}
      back={{ label: "إدارة النظام", to: "/system" }}
    >
      {err ? (
        <div className="mb-3">
          <Notice>{problemMessage(err)}</Notice>
        </div>
      ) : saved ? (
        <div className="mb-3">
          <Notice tone="success">
            حُفظ. يظهر الآن في البوابة وفي استمارة التقديم، وفي الموقع العام خلال دقائق.
          </Notice>
        </div>
      ) : null}
      {/* One column on phones that keeps to the screen: an implicit grid column is «auto» and
          grows to its widest child, which pushed the page past a 320–360px Android screen. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <aside className="min-w-0 space-y-4">
          <SectionLabel>الأقسام</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(departments.data ?? []).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setPicked(d.id);
                  setEditing(null);
                  setEditingDept(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-start text-sm hover:bg-surface-alt ${dept?.id === d.id ? "bg-primary-soft/40 font-semibold" : ""}`}
              >
                <span>
                  {d.name_ar}
                  {!d.is_active && <span className="ms-2 text-xs text-text-muted">· موقوف</span>}
                </span>
                <span className="text-xs text-text-muted">
                  {count(
                    (programs.data ?? []).filter((p) => p.department === d.id).length,
                    N.program,
                  )}
                </span>
              </button>
            ))}
          </Card>
          <Card className="space-y-2 p-3">
            <p className="text-sm font-semibold">+ قسم</p>
            <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
              <Labeled label="رمز القسم">
                <input
                  dir="ltr"
                  value={dForm.code}
                  onChange={(e) => setD({ ...dForm, code: e.target.value.toUpperCase() })}
                  placeholder="IT"
                  className={input}
                />
              </Labeled>
              <Labeled label="اسم القسم">
                <input
                  value={dForm.name_ar}
                  onChange={(e) => setD({ ...dForm, name_ar: e.target.value })}
                  placeholder="اسم القسم"
                  className={input}
                />
              </Labeled>
            </div>
            <Labeled label="الاسم بالإنجليزية">
              <input
                dir="ltr"
                value={dForm.name_en}
                onChange={(e) => setD({ ...dForm, name_en: e.target.value })}
                placeholder="الاسم بالإنجليزية"
                className={`${input} w-full`}
              />
            </Labeled>
            <Button
              className="w-full"
              disabled={!dForm.code || !dForm.name_ar || !colleges.data?.length}
              onClick={() => addDept.mutate()}
            >
              إضافة القسم
            </Button>
          </Card>
          <SectionLabel>الأعوام والفصول</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(terms.data ?? []).map((t) => (
              <div key={t.id}>
                <div className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <b className="block">{t.name_ar}</b>
                    <span className="text-xs text-text-muted">
                      {years.data?.find((y) => y.id === t.academic_year)?.name ?? ""} ·{" "}
                      {fmtDate(t.starts_on)} – {fmtDate(t.ends_on)}
                    </span>
                  </span>
                  {t.is_current ? (
                    <StatusBadge status="approved" label="الحالي" />
                  ) : (
                    <Button
                      variant="ghost"
                      className="min-h-8 px-2 text-xs"
                      disabled={setCurrent.isPending}
                      onClick={async () =>
                        (await confirm({
                          title: `جعل «${t.name_ar}» الفصل الحالي؟`,
                          body: "يتغير الفصل الذي تعرضه كل لوحات الكلية وموادها وتقاريرها.",
                          confirm: "تعيينه الفصل الحالي",
                          tone: "primary",
                        })) && setCurrent.mutate(t.id)
                      }
                    >
                      تعيين كحالي
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label={`تعديل الفصل ${t.name_ar}`}
                    aria-expanded={editingTerm === t.id}
                    data-opener={`term:${t.id}`}
                    onClick={() => setEditingTerm(editingTerm === t.id ? null : t.id)}
                    className="tap-44 grid size-8 place-items-center rounded-lg text-text-muted hover:bg-surface-alt hover:text-primary"
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                </div>
                {editingTerm === t.id && (
                  <TermForm
                    term={t}
                    onDone={() => {
                      setEditingTerm(null);
                      focusOpener(`term:${t.id}`);
                      void refresh("terms");
                    }}
                  />
                )}
              </div>
            ))}
          </Card>
          <YearForm onDone={() => void refresh("academic-years")} />
          <Card className="space-y-2 p-3">
            <p className="text-sm font-semibold">+ فصل</p>
            <select
              value={tForm.academic_year}
              onChange={(e) => setT({ ...tForm, academic_year: e.target.value })}
              aria-label="العام"
              className={`${input} w-full`}
            >
              <option value="">العام الأكاديمي</option>
              {(years.data ?? []).map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-[minmax(0,1fr)_70px] gap-2">
              <Labeled label="اسم الفصل">
                <input
                  value={tForm.name_ar}
                  onChange={(e) => setT({ ...tForm, name_ar: e.target.value })}
                  placeholder="ربيع 2027"
                  className={input}
                />
              </Labeled>
              <Labeled label="الترتيب">
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={tForm.order}
                  onChange={(e) => setT({ ...tForm, order: Number(e.target.value) })}
                  className={input}
                />
              </Labeled>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="البداية">
                <input
                  type="date"
                  value={tForm.starts_on}
                  onChange={(e) => setT({ ...tForm, starts_on: e.target.value })}
                  className={input}
                />
              </Labeled>
              <Labeled label="النهاية">
                <input
                  type="date"
                  value={tForm.ends_on}
                  onChange={(e) => setT({ ...tForm, ends_on: e.target.value })}
                  className={input}
                />
              </Labeled>
            </div>
            <Button
              className="w-full"
              disabled={
                !tForm.academic_year || !tForm.name_ar || !tForm.starts_on || !tForm.ends_on
              }
              onClick={() => addTerm.mutate()}
            >
              إضافة الفصل
            </Button>
          </Card>
        </aside>
        {/* Its layout follows its own width (container query), not the screen's: beside the
            320px column at 1024–1279 it is narrow even on a laptop (owner, 2026-10-02). */}
        <section className="@container min-w-0">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>
              قسم {dept?.name_ar ?? ""} — البرامج · {num(deptPrograms.length)}
            </SectionLabel>
            {dept && (
              <span className="mb-2 flex shrink-0 flex-wrap gap-2">
                {/* Stopping is the temporary way out (owner, 2026-11-05): one tap, undone the same
                    way; deleting or merging is in «تعديل القسم». */}
                <Button
                  variant="ghost"
                  className="min-h-10 px-3 text-sm"
                  disabled={toggleDept.isPending}
                  onClick={async () => {
                    const stop = dept.is_active !== false;
                    if (
                      await confirm({
                        title: stop
                          ? `إيقاف «${dept.name_ar}» مؤقتًا؟`
                          : `إعادة تفعيل «${dept.name_ar}»؟`,
                        body: stop
                          ? "يختفي القسم وبرامجه من الموقع ومن التقديم، وتبقى مواده وطلابه وسجلاته كما هي. تعيد تفعيله متى شئت."
                          : "يعود القسم وبرامجه النشطة إلى الموقع وإلى التقديم.",
                        confirm: stop ? "إيقاف مؤقت" : "إعادة التفعيل",
                        tone: "primary",
                      })
                    )
                      toggleDept.mutate({ id: dept.id, is_active: !stop });
                  }}
                >
                  {dept.is_active === false ? "إعادة تفعيل" : "إيقاف مؤقت"}
                </Button>
                <Button
                  variant="secondary"
                  aria-expanded={editingDept}
                  data-opener="dept"
                  className="min-h-10 px-3 text-sm"
                  onClick={() => setEditingDept(!editingDept)}
                >
                  <Pencil size={16} aria-hidden />
                  تعديل القسم
                </Button>
              </span>
            )}
          </div>
          {dept && editingDept && (
            <DepartmentForm
              key={dept.id}
              department={dept}
              departments={departments.data ?? []}
              onDone={(deleted) => {
                setEditingDept(false);
                if (deleted) setPicked(null);
                else focusOpener("dept");
                void refresh("departments");
                void refresh("programs");
              }}
            />
          )}
          <Card className="divide-y divide-border-soft">
            <div className="hidden grid-cols-[minmax(0,1fr)_88px_120px_120px_56px] gap-3 bg-surface-alt px-4 py-2 text-xs text-text-muted @2xl:grid">
              <span>البرنامج</span>
              <span>الدرجة</span>
              <span>المدة</span>
              <span>الساعات</span>
              <span>الحالة</span>
            </div>
            {deptPrograms.map((p) => (
              <div
                key={p.id}
                // Phones: a card — name and status on one line, the facts on the next, then the
                // hours; from md the five columns of the header above.
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3 text-sm @2xl:grid-cols-[minmax(0,1fr)_88px_120px_120px_56px] @2xl:items-center @2xl:gap-3"
              >
                <span className="min-w-0">
                  <bdi className="block font-mono text-xs text-text-muted">{p.code}</bdi>
                  <b className="block">{p.name_ar}</b>
                  <span className="mt-0.5 flex flex-wrap gap-x-4">
                    {(
                      [
                        ["details", "تعديل البرنامج"],
                        ["page", "صفحة الموقع: الوصف والرسوم"],
                      ] as const
                    ).map(([part, text]) => {
                      const open = editing?.id === p.id && editing.part === part;
                      return (
                        <button
                          key={part}
                          type="button"
                          aria-expanded={open}
                          data-opener={`program:${p.id}:${part}`}
                          onClick={() => setEditing(open ? null : { id: p.id, part })}
                          className="tap-44 text-xs font-semibold text-primary hover:underline"
                        >
                          {open ? "إغلاق" : text}
                        </button>
                      );
                    })}
                  </span>
                  {cycle && (
                    <IntakeLine
                      cycle={cycle.name}
                      intake={intakeOf(p.id)}
                      ready={intakes.isSuccess}
                      busy={openIntake.isPending && openIntake.variables === p.id}
                      onOpen={() => openIntake.mutate(p.id)}
                    />
                  )}
                </span>
                <span className="hidden text-text-muted @2xl:block">
                  {DEGREE[p.degree] ?? p.degree}
                </span>
                <span className="col-span-2 text-xs text-text-muted @2xl:col-span-1 @2xl:text-sm">
                  <span className="@2xl:hidden">{DEGREE[p.degree] ?? p.degree} · </span>
                  {count(p.duration_terms, N.term)} · {num(p.levels_count)} مستويات
                </span>
                <span className="col-span-2 @2xl:col-span-1">
                  <HoursInput
                    program={p.id}
                    name={p.name_ar}
                    value={p.total_credit_hours ?? null}
                    onSaved={() => refresh("programs")}
                  />
                </span>
                {/* Its own size, beside the name on phones (it used to stretch into a bar). */}
                <span className="col-start-2 row-start-1 self-start justify-self-end @2xl:col-start-auto @2xl:row-start-auto @2xl:self-center @2xl:justify-self-start">
                  <StatusBadge
                    status={p.is_active ? "approved" : "closed"}
                    label={p.is_active ? "نشط" : "موقوف"}
                  />
                </span>
              </div>
            ))}
            {!deptPrograms.length && <p className="px-4 py-3 text-sm text-text-muted">لا برامج.</p>}
          </Card>
          {deptPrograms
            .filter((p) => p.id === editing?.id)
            .map((p) => {
              const done = () => {
                setEditing(null);
                focusOpener(`program:${p.id}:${editing!.part}`);
                void refresh("programs");
              };
              return editing?.part === "page" ? (
                <ProgramPageForm key={p.id} program={p} onDone={done} />
              ) : (
                <ProgramForm
                  key={p.id}
                  department={dept!}
                  departments={departments.data ?? []}
                  program={p}
                  onDone={done}
                />
              );
            })}
          {dept && (
            <ProgramForm
              key={`new-${dept.id}`}
              department={dept}
              departments={departments.data ?? []}
              cycle={cycle}
              onDone={() => {
                void refresh("programs");
                void client.invalidateQueries({ queryKey: ["admissions", "intakes"] });
              }}
            />
          )}
        </section>
      </div>
    </PortalShell>
  );
}

const PAGE_FIELDS = [
  "description_ar",
  "description_en",
  "outcomes_ar",
  "outcomes_en",
  "careers_ar",
  "careers_en",
] as const;
type PageKey = (typeof PAGE_FIELDS)[number] | "annual_fee_sdg" | "annual_fee_usd";

/**
 * What the public programme page shows beyond the structure (landing review 2026-10, PR 6b):
 * the description, yearly fees, outcomes and careers. Blank fields stay off the site.
 */
function ProgramPageForm({ program, onDone }: { program: Schemas["Program"]; onDone: () => void }) {
  const opened = useOpenFocus<HTMLFormElement>();
  const [form, setForm] = useState<Record<PageKey, string>>(
    () =>
      ({
        ...Object.fromEntries(PAGE_FIELDS.map((k) => [k, program[k] ?? ""])),
        annual_fee_sdg: program.annual_fee_sdg ? String(program.annual_fee_sdg) : "",
        annual_fee_usd: program.annual_fee_usd ? String(program.annual_fee_usd) : "",
      }) as Record<PageKey, string>,
  );
  const unsaved = useUnsavedChanges();
  const set = (key: PageKey, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH("/api/v1/programs/{id}", {
        params: { path: { id: program.id } },
        body: {
          ...Object.fromEntries(PAGE_FIELDS.map((k) => [k, form[k].trim()])),
          annual_fee_sdg: form.annual_fee_sdg ? Number(form.annual_fee_sdg) : null,
          annual_fee_usd: form.annual_fee_usd ? Number(form.annual_fee_usd) : null,
        },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      unsaved.saved();
      onDone();
    },
  });
  const lines = "سطر لكل بند";
  return (
    <Card className="mt-3">
      <form
        ref={opened}
        onInput={unsaved.onInput}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="border-b border-border-soft px-4 py-3">
          <p className="font-semibold">صفحة «{program.name_ar}» في الموقع</p>
          <p className="mt-0.5 text-xs text-text-muted">
            ما يُترك فارغًا لا يظهر في الموقع. تظهر التعديلات بعد إعادة بناء الموقع.
          </p>
        </div>
        <div className="grid @2xl:grid-cols-2">
          <TextArea
            label="الوصف"
            value={form.description_ar}
            onChange={(e) => set("description_ar", e.target.value)}
          />
          <TextArea
            label="الوصف بالإنجليزية"
            dir="ltr"
            value={form.description_en}
            onChange={(e) => set("description_en", e.target.value)}
          />
          <Field
            label="الرسوم السنوية بالجنيه السوداني"
            type="number"
            min={1}
            inputMode="numeric"
            value={form.annual_fee_sdg}
            onChange={(e) => set("annual_fee_sdg", e.target.value)}
          />
          <Field
            label="الرسوم السنوية بالدولار (للوافدين)"
            type="number"
            min={1}
            inputMode="numeric"
            value={form.annual_fee_usd}
            onChange={(e) => set("annual_fee_usd", e.target.value)}
          />
          <TextArea
            label={`مخرجات التعلم — ${lines}`}
            value={form.outcomes_ar}
            onChange={(e) => set("outcomes_ar", e.target.value)}
          />
          <TextArea
            label={`مخرجات التعلم بالإنجليزية — ${lines}`}
            dir="ltr"
            value={form.outcomes_en}
            onChange={(e) => set("outcomes_en", e.target.value)}
          />
          <TextArea
            label={`المسارات المهنية — ${lines}`}
            value={form.careers_ar}
            onChange={(e) => set("careers_ar", e.target.value)}
          />
          <TextArea
            label={`المسارات المهنية بالإنجليزية — ${lines}`}
            dir="ltr"
            value={form.careers_en}
            onChange={(e) => set("careers_en", e.target.value)}
          />
        </div>
        {save.isError && (
          <div className="px-4 pt-3">
            <Notice>{problemMessage(save.error)}</Notice>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-soft p-3">
          <Button variant="secondary" onClick={onDone}>
            إلغاء
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "جارٍ الحفظ…" : "حفظ صفحة البرنامج"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * The programme's total credit hours to graduate, edited in place (owner decision
 * 2026-09-28). The public site shows it; blank hides it — never a sum of the courses.
 */
function HoursInput({
  program,
  name,
  value,
  onSaved,
}: {
  program: number;
  name: string;
  value: number | null;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const save = useMutation({
    mutationFn: async (next: number | null) => {
      const { data, error } = await api.PATCH("/api/v1/programs/{id}", {
        params: { path: { id: program } },
        body: { total_credit_hours: next },
      });
      if (!data) throw error;
    },
    onSuccess: onSaved,
  });
  const commit = () => {
    const next = draft.trim() ? Number(draft) : null;
    if (next !== value) save.mutate(next);
  };
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-text-muted @2xl:hidden">ساعات للتخرج</span>
      <input
        type="number"
        min={1}
        max={300}
        value={draft}
        placeholder="—"
        aria-label={`الساعات المعتمدة للتخرج — ${name}`}
        aria-invalid={save.isError || undefined}
        title={save.isError ? problemMessage(save.error) : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={`w-16 rounded border px-1 py-1 text-sm max-lg:min-h-10 ${save.isError ? "border-danger" : "border-border"}`}
      />
      {/* It saves on leaving the field: say so (review 2026-09-29 PR 7, «تأكيد حفظ الساعات»). */}
      <span role="status" className="w-10 text-[11px]">
        {save.isPending ? (
          <span className="text-text-muted">…</span>
        ) : save.isSuccess ? (
          <span className="text-success-strong">حُفظ ✓</span>
        ) : save.isError ? (
          <span className="text-danger-strong">لم يُحفظ</span>
        ) : null}
      </span>
    </span>
  );
}

// min-w-0 w-full: a field never sets its row's width (a text field's default is ~200px).
const INPUT = "min-h-10 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm";
const LABEL = "grid min-w-0 gap-1 text-xs font-medium text-text-muted";

/** «تعديل/حذف» for a structure row; a row still in use answers 409 and is stopped instead. */
function useRemove(path: "/api/v1/departments/{id}" | "/api/v1/programs/{id}", id: number) {
  return useMutation({
    mutationFn: async () => {
      const { error, response } = await api.DELETE(path, { params: { path: { id } } });
      if (!response.ok) throw error;
    },
  });
}

/**
 * The selected department's name, code, description and status (admin review 2026-11-02:
 * a department could be added but never corrected). Stopping it hides it, with its
 * programmes, from the site and from applying; its students and courses stay.
 */
function DepartmentForm({
  department,
  departments,
  onDone,
}: {
  department: Schemas["Department"];
  departments: Schemas["Department"][];
  onDone: (deleted?: boolean) => void;
}) {
  const opened = useOpenFocus<HTMLFormElement>();
  const confirm = useConfirm();
  const unsaved = useUnsavedChanges();
  const [form, setForm] = useState({
    code: department.code,
    name_ar: department.name_ar,
    name_en: department.name_en ?? "",
    description: department.description ?? "",
    is_active: department.is_active ?? true,
  });
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH("/api/v1/departments/{id}", {
        params: { path: { id: department.id } },
        body: { ...form, code: form.code.trim(), name_ar: form.name_ar.trim() },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      unsaved.saved();
      onDone();
    },
  });
  const missing = !form.code.trim() || !form.name_ar.trim();
  const error = save.error;
  return (
    <Card className="mb-3">
      <form
        ref={opened}
        onInput={unsaved.onInput}
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            form.code.trim() !== department.code &&
            !(await confirm({
              title: "تغيير رمز القسم؟",
              body: `يتغير رابط صفحة القسم في الموقع من …/departments/${department.code}/ إلى …/departments/${form.code.trim()}/. أرقام الطلاب الحاليين لا تتغير.`,
              confirm: "تغيير الرمز",
              tone: "primary",
            }))
          )
            return;
          save.mutate();
        }}
        className="space-y-3 p-4"
      >
        <p className="font-semibold">تعديل قسم «{department.name_ar}»</p>
        <div className="grid gap-3 @lg:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)]">
          <label className={LABEL}>
            رمز القسم
            <input
              dir="ltr"
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className={INPUT}
            />
          </label>
          <label className={LABEL}>
            اسم القسم
            <input
              required
              value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className={LABEL}>
            الاسم بالإنجليزية
            <input
              dir="ltr"
              value={form.name_en}
              onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              className={INPUT}
            />
          </label>
        </div>
        <label className={LABEL}>
          نبذة تظهر في صفحة القسم بالموقع
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={`${INPUT} py-2`}
          />
        </label>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-alt px-3 py-2 text-sm">
          <span>
            <b className="block">القسم نشط</b>
            <span className="text-xs text-text-muted">
              الموقوف يختفي هو وبرامجه من الموقع ومن التقديم؛ طلابه ومواده تبقى كما هي.
            </span>
          </span>
          <Switch
            checked={form.is_active}
            onChange={(v) => setForm({ ...form, is_active: v })}
            label="القسم نشط"
          />
        </div>
        <DepartmentEnd department={department} departments={departments} onGone={onDone} />
        {error ? <Notice>{problemMessage(error)}</Notice> : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="me-auto" />
          <Button variant="secondary" onClick={() => onDone()}>
            إلغاء
          </Button>
          <Button
            type="submit"
            disabled={save.isPending || missing}
            why={missing ? "الرمز والاسم مطلوبان" : undefined}
          >
            {save.isPending ? "جارٍ الحفظ…" : "حفظ القسم"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * A programme's structure: add a new one to the department, or correct one (admin review
 * 2026-11-02). Its department stays: moving a programme would move its students and courses.
 */
function ProgramForm({
  department,
  departments,
  program,
  cycle,
  onDone,
}: {
  department: Schemas["Department"];
  departments: Schemas["Department"][];
  program?: Schemas["Program"];
  /** The active admission cycle: a new programme can be opened for applying in it. */
  cycle?: Schemas["Cycle"];
  onDone: () => void;
}) {
  const opened = useOpenFocus<HTMLFormElement>(!!program);
  const confirm = useConfirm();
  const unsaved = useUnsavedChanges();
  const blank = {
    code: "",
    name_ar: "",
    name_en: "",
    degree: "bachelor",
    levels_count: "4",
    duration_terms: "8",
    total_credit_hours: "",
    is_active: true,
    department: department.id,
    open_intake: true,
  };
  const initial = program
    ? {
        code: program.code,
        name_ar: program.name_ar,
        name_en: program.name_en ?? "",
        degree: program.degree as string,
        levels_count: String(program.levels_count),
        duration_terms: String(program.duration_terms),
        total_credit_hours: program.total_credit_hours ? String(program.total_credit_hours) : "",
        is_active: program.is_active ?? true,
        department: program.department,
        open_intake: false,
      }
    : blank;
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const save = useMutation({
    mutationFn: async () => {
      const { open_intake, ...fields } = form;
      const body = {
        ...fields,
        code: form.code.trim(),
        name_ar: form.name_ar.trim(),
        degree: form.degree as never,
        levels_count: Number(form.levels_count),
        duration_terms: Number(form.duration_terms),
        total_credit_hours: form.total_credit_hours ? Number(form.total_credit_hours) : null,
      };
      const { data, error } = program
        ? await api.PATCH("/api/v1/programs/{id}", { params: { path: { id: program.id } }, body })
        : await api.POST("/api/v1/programs", { body });
      if (!data) throw error;
      if (!program && cycle && open_intake) await addIntake(cycle.id, data.id);
    },
    onSuccess: () => {
      unsaved.saved();
      if (!program) setForm(blank);
      onDone();
    },
  });
  const remove = useRemove("/api/v1/programs/{id}", program?.id ?? 0);
  const missing = !form.code.trim() || !form.name_ar.trim();
  const error = save.error ?? remove.error;
  return (
    // A labelled form (it was a row of bare boxes whose placeholders were the only hint).
    <Card className="mt-3">
      <form
        ref={opened}
        onInput={unsaved.onInput}
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            program &&
            form.code.trim() !== program.code &&
            !(await confirm({
              title: "تغيير رمز البرنامج؟",
              body: `يتغير رابط صفحة البرنامج في الموقع من …/programs/${program.code}/ إلى …/programs/${form.code.trim()}/.`,
              confirm: "تغيير الرمز",
              tone: "primary",
            }))
          )
            return;
          save.mutate();
        }}
        className="space-y-3 p-4"
      >
        <p className="text-sm font-semibold">
          {program ? `تعديل برنامج «${program.name_ar}»` : `برنامج جديد في ${department.name_ar}`}
        </p>
        <div className="grid gap-3 @lg:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)]">
          <label className={LABEL}>
            رمز البرنامج
            <input
              dir="ltr"
              value={form.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              placeholder="BIT"
              className={INPUT}
            />
          </label>
          <label className={LABEL}>
            اسم البرنامج
            <input
              value={form.name_ar}
              onChange={(e) => set({ name_ar: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className={LABEL}>
            الاسم بالإنجليزية
            <input
              dir="ltr"
              value={form.name_en}
              onChange={(e) => set({ name_en: e.target.value })}
              className={INPUT}
            />
          </label>
        </div>
        <div role="group" aria-label="الدرجة" className={LABEL}>
          الدرجة
          <span className="flex flex-wrap gap-2">
            {Object.entries(DEGREE).map(([k, l]) => (
              <Chip key={k} active={form.degree === k} onClick={() => set({ degree: k })}>
                {l}
              </Chip>
            ))}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 @lg:max-w-md">
          <label className={LABEL}>
            مستويات
            <input
              type="number"
              min={1}
              max={10}
              value={form.levels_count}
              onChange={(e) => set({ levels_count: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className={LABEL}>
            فصول
            <input
              type="number"
              min={1}
              max={20}
              value={form.duration_terms}
              onChange={(e) => set({ duration_terms: e.target.value })}
              className={INPUT}
            />
          </label>
          <label className={LABEL}>
            ساعات للتخرج
            <input
              type="number"
              min={1}
              max={300}
              value={form.total_credit_hours}
              onChange={(e) => set({ total_credit_hours: e.target.value })}
              placeholder="—"
              className={INPUT}
            />
          </label>
        </div>
        {program && (
          <label className={`${LABEL} @lg:max-w-md`}>
            القسم
            <select
              value={form.department}
              onChange={(e) => set({ department: Number(e.target.value) })}
              className={INPUT}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_ar}
                </option>
              ))}
            </select>
            <span className="font-normal">
              يُنقل إلى قسم آخر ما دام لا طلاب عليه ولا مواد ولا طلبات تقديم.
            </span>
          </label>
        )}
        {!program && cycle && (
          <label className="flex items-start gap-2 rounded-lg bg-surface-alt px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.open_intake}
              onChange={(e) => set({ open_intake: e.target.checked })}
              className="mt-1 size-4 accent-primary"
            />
            <span>
              <b className="block">فتح التقديم عليه في «{cycle.name}»</b>
              <span className="text-xs text-text-muted">
                يظهر فورًا في استمارة التقديم. المقاعد والمستندات تُضبط من «الدورات والبرامج».
              </span>
            </span>
          </label>
        )}
        {program && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-alt px-3 py-2 text-sm">
            <span>
              <b className="block">البرنامج نشط</b>
              <span className="text-xs text-text-muted">
                الموقوف يختفي من الموقع ومن التقديم؛ طلابه الحاليون يبقون عليه.
              </span>
            </span>
            <Switch
              checked={form.is_active}
              onChange={(v) => set({ is_active: v })}
              label="البرنامج نشط"
            />
          </div>
        )}
        {error ? <Notice>{problemMessage(error)}</Notice> : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {program && (
            <>
              <Button
                variant="ghost"
                className="me-auto text-danger-strong"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `حذف برنامج «${program.name_ar}»؟`,
                      body: "يُحذف البرنامج فقط إن لم يكن عليه طلاب أو طلبات أو مواد. وإلا فأوقفه بدل حذفه.",
                      confirm: "حذف البرنامج",
                    })
                  )
                    remove.mutate(undefined, { onSuccess: onDone });
                }}
              >
                حذف البرنامج
              </Button>
              <Button variant="secondary" onClick={onDone}>
                إلغاء
              </Button>
            </>
          )}
          <Button
            type="submit"
            className="min-h-10 w-full px-5 @lg:w-auto"
            disabled={save.isPending || missing}
            why={missing ? "الرمز والاسم مطلوبان" : undefined}
          >
            {save.isPending ? "جارٍ الحفظ…" : program ? "حفظ البرنامج" : "+ برنامج"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Opens a programme for applying in a cycle, with the documents the cycles page also asks. */
async function addIntake(cycle: number, program: number) {
  const { data, error } = await api.POST("/api/v1/intakes", {
    body: {
      cycle,
      program,
      required_documents: [
        { key: "certificate", label: "الشهادة الثانوية", required: true },
        { key: "id", label: "الرقم الوطني أو الجواز", required: true },
      ],
    } as never,
  });
  if (!data) throw error;
}

/** Whether applicants can choose the programme in the active cycle, or a button to open it. */
function IntakeLine({
  cycle,
  intake,
  ready,
  busy,
  onOpen,
}: {
  cycle: string;
  intake?: Schemas["Intake"];
  ready: boolean;
  busy: boolean;
  onOpen: () => void;
}) {
  if (!ready) return null;
  if (intake)
    return (
      <span className="block text-xs text-text-muted">
        {intake.is_open ? `مفتوح للتقديم في «${cycle}»` : `التقديم موقوف في «${cycle}»`}
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-xs">
      <span className="text-warning-strong">غير مفتوح للتقديم</span>
      <button
        type="button"
        disabled={busy}
        onClick={onOpen}
        className="tap-44 font-semibold text-primary hover:underline"
      >
        {busy ? "…" : `فتح التقديم في «${cycle}»`}
      </button>
    </span>
  );
}

/**
 * A new academic year (admin review 2026-11-02, item 5: «+ فصل» could only pick a year that
 * already existed, so 2027/2028 could not be prepared from the portal).
 */
function YearForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", starts_on: "", ends_on: "" });
  const add = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/academic-years", {
        body: { ...form, name: form.name.trim() },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setForm({ name: "", starts_on: "", ends_on: "" });
      onDone();
    },
  });
  const missing = !form.name.trim() || !form.starts_on || !form.ends_on;
  return (
    <Card className="space-y-2 p-3">
      <p className="text-sm font-semibold">+ عام أكاديمي</p>
      <Labeled label="اسم العام">
        <input
          dir="ltr"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="2027/2028"
          className={INPUT}
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="البداية">
          <input
            type="date"
            value={form.starts_on}
            onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
            className={INPUT}
          />
        </Labeled>
        <Labeled label="النهاية">
          <input
            type="date"
            value={form.ends_on}
            onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
            className={INPUT}
          />
        </Labeled>
      </div>
      {add.isError && <Notice>{problemMessage(add.error)}</Notice>}
      <Button
        className="w-full"
        disabled={add.isPending || missing}
        why={missing ? "الاسم وتاريخا البداية والنهاية مطلوبة" : undefined}
        onClick={() => add.mutate()}
      >
        إضافة العام
      </Button>
    </Card>
  );
}

/** A term's name, order and dates, corrected in place (admin review 2026-11-02, item 6). */
function TermForm({ term, onDone }: { term: Schemas["Term"]; onDone: () => void }) {
  const opened = useOpenFocus<HTMLFormElement>();
  const unsaved = useUnsavedChanges();
  const [form, setForm] = useState({
    name_ar: term.name_ar,
    order: String(term.order),
    starts_on: term.starts_on,
    ends_on: term.ends_on,
  });
  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.PATCH("/api/v1/terms/{id}", {
        params: { path: { id: term.id } },
        body: { ...form, name_ar: form.name_ar.trim(), order: Number(form.order) },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      unsaved.saved();
      onDone();
    },
  });
  const missing = !form.name_ar.trim() || !form.starts_on || !form.ends_on;
  return (
    <form
      ref={opened}
      onInput={unsaved.onInput}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-2 border-t border-border-soft bg-surface-alt/50 p-3"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_70px] gap-2">
        <Labeled label="اسم الفصل">
          <input
            value={form.name_ar}
            onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
            className={INPUT}
          />
        </Labeled>
        <Labeled label="الترتيب">
          <input
            type="number"
            min={1}
            max={3}
            value={form.order}
            onChange={(e) => setForm({ ...form, order: e.target.value })}
            className={INPUT}
          />
        </Labeled>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="البداية">
          <input
            type="date"
            value={form.starts_on}
            onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
            className={INPUT}
          />
        </Labeled>
        <Labeled label="النهاية">
          <input
            type="date"
            value={form.ends_on}
            onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
            className={INPUT}
          />
        </Labeled>
      </div>
      {save.isError && <Notice>{problemMessage(save.error)}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          إلغاء
        </Button>
        <Button
          type="submit"
          disabled={save.isPending || missing}
          why={missing ? "الاسم والتاريخان مطلوبة" : undefined}
        >
          {save.isPending ? "جارٍ الحفظ…" : "حفظ الفصل"}
        </Button>
      </div>
    </form>
  );
}

/**
 * What is on a department and the ways out (owner, 2026-11-05: «القسم لا يمكن حذفه إذا كان
 * يحتوي على برامج… كيف يمكن تسهيل حذفه أو تعطيله مؤقتًا»): merge it into another department
 * (its programmes and teaching members move; it is deleted, or stopped when the audit log
 * holds its history), or delete it with its programmes when none is in use. Stopping it is
 * the switch above, and «إيقاف مؤقت» beside its name.
 */
function DepartmentEnd({
  department,
  departments,
  onGone,
}: {
  department: Schemas["Department"];
  departments: Schemas["Department"][];
  onGone: (deleted?: boolean) => void;
}) {
  const confirm = useConfirm();
  const usage = useQuery({
    queryKey: ["department-usage", department.id],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/departments/{id}/usage", {
          params: { path: { id: department.id } },
        }),
      ),
  });
  const [into, setInto] = useState("");
  const merge = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/departments/{id}/merge", {
        params: { path: { id: department.id } },
        body: { into: Number(into) },
      });
      if (!data) throw error;
      return data.result;
    },
    onSuccess: () => onGone(true),
  });
  const removeAll = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.DELETE("/api/v1/departments/{id}", {
        params: { path: { id: department.id }, query: { with_programs: "1" } as never },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => onGone(true),
  });
  const u = usage.data;
  if (!u) return null;
  const busy = u.programs.filter((p) => !p.free);
  const roles = u.roles.map((r) => `${r.role}: ${r.user}`).join("، ");
  const others = departments.filter((d) => d.id !== department.id);
  const target = others.find((d) => String(d.id) === into);
  const blocked = [
    u.courses ? count(u.courses, N.course) : "",
    u.students ? `${num(u.students)} طالب` : "",
    busy.length ? `${count(busy.length, N.program)} عليها طلاب أو مواد أو طلبات` : "",
  ].filter(Boolean);
  return (
    <div className="space-y-3 rounded-lg border border-border-soft p-3 text-sm">
      <p className="font-semibold">ما في القسم</p>
      <ul className="space-y-1 text-text-muted">
        <li>
          {u.programs.length
            ? `البرامج: ${u.programs.map((p) => p.name_ar).join("، ")}`
            : "لا برامج"}
        </li>
        {u.courses > 0 && <li>المواد: {num(u.courses)}</li>}
        {u.students > 0 && <li>الطلاب: {num(u.students)}</li>}
        {u.members > 0 && <li>أعضاء هيئة التدريس: {num(u.members)}</li>}
        {roles && <li>الأدوار: {roles}</li>}
      </ul>
      {error(merge.error ?? removeAll.error)}
      {u.can_merge ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className={`${LABEL} min-w-48 flex-1`}>
            دمج في قسم آخر
            <select value={into} onChange={(e) => setInto(e.target.value)} className={INPUT}>
              <option value="">اختر القسم…</option>
              {others.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_ar}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            className="min-h-10"
            disabled={!target || merge.isPending}
            why={target ? undefined : "اختر القسم أولًا"}
            onClick={async () => {
              if (
                target &&
                (await confirm({
                  title: `دمج «${department.name_ar}» في «${target.name_ar}»؟`,
                  body: [
                    u.programs.length
                      ? `تنتقل البرامج (${u.programs.map((p) => p.name_ar).join("، ")}) وأعضاء هيئة التدريس إلى «${target.name_ar}».`
                      : `ينتقل أعضاء هيئة التدريس إلى «${target.name_ar}».`,
                    roles ? `تُلغى أدوار هذا القسم: ${roles}.` : "",
                    u.history
                      ? "للقسم سجل في التدقيق، فيبقى موقوفًا مخفيًا بدل حذفه."
                      : "ثم يُحذف القسم، ويحوَّل رابطه في الموقع إلى القسم الجديد.",
                  ]
                    .filter(Boolean)
                    .join(" "),
                  confirm: "دمج القسم",
                  tone: "primary",
                }))
              )
                merge.mutate();
            }}
          >
            دمج
          </Button>
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          لا يُدمج ولا يُحذف وفيه {blocked.join(" و")}؛ أوقفه مؤقتًا بدلًا من ذلك، أو انقل هذه
          أولًا.
        </p>
      )}
      {u.can_delete && (
        <Button
          variant="ghost"
          className="text-danger-strong"
          disabled={removeAll.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: u.programs.length
                  ? `حذف «${department.name_ar}» وبرامجه (${num(u.programs.length)})؟`
                  : `حذف قسم «${department.name_ar}»؟`,
                body: [
                  u.programs.length
                    ? `تُحذف معه البرامج: ${u.programs.map((p) => p.name_ar).join("، ")}.`
                    : "",
                  roles ? `وتُلغى أدوار هذا القسم: ${roles}.` : "",
                  "لا يمكن التراجع.",
                ]
                  .filter(Boolean)
                  .join(" "),
                confirm: "حذف نهائيًا",
              })
            )
              removeAll.mutate();
          }}
        >
          {u.programs.length ? "حذف القسم مع برامجه" : "حذف القسم"}
        </Button>
      )}
      {u.can_merge && !u.can_delete && (
        <p className="text-xs text-text-muted">
          للقسم سجل في التدقيق، والسجل لا يُحذف: يُدمج أو يُوقف، ولا يُحذف.
        </p>
      )}
    </div>
  );
}

function error(e: unknown) {
  return e ? <Notice>{problemMessage(e)}</Notice> : null;
}
