import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Notice,
  SectionLabel,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";
import { num } from "../../lib/reports";

const DEGREE: Record<string, string> = {
  diploma: "دبلوم",
  bachelor: "بكالوريوس",
  honours: "بكالوريوس مرتبة الشرف",
  master: "ماجستير",
};

/** Board: DesktopSystemStructure — college tree, years and terms, department programs. */
export function Structure() {
  const client = useQueryClient();
  const colleges = useQuery({
    queryKey: ["colleges"],
    queryFn: async () => (await api.GET("/api/v1/colleges")).data?.results ?? [],
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await api.GET("/api/v1/departments")).data?.results ?? [],
  });
  const programs = useQuery({
    queryKey: ["programs", "all"],
    queryFn: async () =>
      (await api.GET("/api/v1/programs", { params: { query: { page_size: 100 } as never } })).data
        ?.results ?? [],
  });
  const terms = useQuery({
    queryKey: ["terms"],
    queryFn: async () => (await api.GET("/api/v1/terms")).data?.results ?? [],
  });
  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => (await api.GET("/api/v1/academic-years")).data?.results ?? [],
  });
  const [picked, setPicked] = useState<number | null>(null);
  const dept = departments.data?.find((d) => d.id === picked) ?? departments.data?.[0];
  const deptPrograms = (programs.data ?? []).filter((p) => p.department === dept?.id);
  const refresh = (key: string) => client.invalidateQueries({ queryKey: [key] });
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
  const [pForm, setP] = useState({
    code: "",
    name_ar: "",
    name_en: "",
    degree: "bachelor",
    levels_count: 4,
    duration_terms: 8,
  });
  const addProgram = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/programs", {
        body: { department: dept!.id, ...pForm, degree: pForm.degree as never },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setP({ ...pForm, code: "", name_ar: "", name_en: "" });
      void refresh("programs");
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
  const err = setCurrent.error ?? addDept.error ?? addProgram.error ?? addTerm.error;
  const input = "min-h-10 rounded-lg border border-border bg-surface px-3 text-sm";
  return (
    <PortalShell
      title="الهيكل الأكاديمي"
      subtitle={`${colleges.data?.[0]?.name_ar ?? ""} · ${num(departments.data?.length ?? 0)} أقسام · ${num(programs.data?.length ?? 0)} برنامجًا`}
      back={{ label: "إدارة النظام", to: "/system" }}
    >
      {err ? (
        <div className="mb-3">
          <Notice>{problemMessage(err)}</Notice>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4">
          <SectionLabel>الأقسام</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(departments.data ?? []).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setPicked(d.id)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-start text-sm hover:bg-surface-alt ${dept?.id === d.id ? "bg-primary-soft/40 font-semibold" : ""}`}
              >
                <span>{d.name_ar}</span>
                <span className="text-xs text-text-muted">
                  {num((programs.data ?? []).filter((p) => p.department === d.id).length)} برامج
                </span>
              </button>
            ))}
          </Card>
          <Card className="space-y-2 p-3">
            <p className="text-sm font-semibold">+ قسم</p>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <input
                dir="ltr"
                value={dForm.code}
                onChange={(e) => setD({ ...dForm, code: e.target.value.toUpperCase() })}
                placeholder="CODE"
                aria-label="رمز القسم"
                className={input}
              />
              <input
                value={dForm.name_ar}
                onChange={(e) => setD({ ...dForm, name_ar: e.target.value })}
                placeholder="اسم القسم"
                aria-label="اسم القسم"
                className={input}
              />
            </div>
            <input
              dir="ltr"
              value={dForm.name_en}
              onChange={(e) => setD({ ...dForm, name_en: e.target.value })}
              placeholder="English name"
              aria-label="الاسم بالإنجليزية"
              className={`${input} w-full`}
            />
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
              <div key={t.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <b className="block">{t.name_ar}</b>
                  <span className="text-xs text-text-muted">
                    {new Date(t.starts_on).toLocaleDateString("ar")} –{" "}
                    {new Date(t.ends_on).toLocaleDateString("ar")}
                  </span>
                </span>
                {t.is_current ? (
                  <StatusBadge status="approved" label="الحالي" />
                ) : (
                  <Button
                    variant="ghost"
                    className="min-h-8 px-2 text-xs"
                    onClick={() => setCurrent.mutate(t.id)}
                  >
                    تعيين كحالي
                  </Button>
                )}
              </div>
            ))}
          </Card>
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
            <div className="grid grid-cols-[1fr_70px] gap-2">
              <input
                value={tForm.name_ar}
                onChange={(e) => setT({ ...tForm, name_ar: e.target.value })}
                placeholder="ربيع 2027"
                aria-label="اسم الفصل"
                className={input}
              />
              <input
                type="number"
                min={1}
                max={3}
                value={tForm.order}
                onChange={(e) => setT({ ...tForm, order: Number(e.target.value) })}
                aria-label="الترتيب"
                className={input}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={tForm.starts_on}
                onChange={(e) => setT({ ...tForm, starts_on: e.target.value })}
                aria-label="البداية"
                className={input}
              />
              <input
                type="date"
                value={tForm.ends_on}
                onChange={(e) => setT({ ...tForm, ends_on: e.target.value })}
                aria-label="النهاية"
                className={input}
              />
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
        <section>
          <SectionLabel>
            قسم {dept?.name_ar ?? ""} — البرامج · {num(deptPrograms.length)}
          </SectionLabel>
          <Card className="divide-y divide-border-soft">
            <div className="hidden grid-cols-[80px_minmax(0,1fr)_120px_80px_80px_80px] gap-3 bg-surface-alt px-4 py-2 text-xs text-text-muted md:grid">
              <span>الرمز</span>
              <span>البرنامج</span>
              <span>الدرجة</span>
              <span>المدة</span>
              <span>المستويات</span>
              <span>الحالة</span>
            </div>
            {deptPrograms.map((p) => (
              <div
                key={p.id}
                className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[80px_minmax(0,1fr)_120px_80px_80px_80px] md:items-center md:gap-3"
              >
                <bdi className="font-mono text-xs text-text-muted">{p.code}</bdi>
                <b>{p.name_ar}</b>
                <span className="text-text-muted">{DEGREE[p.degree] ?? p.degree}</span>
                <span className="text-text-muted">{num(p.duration_terms)} فصول</span>
                <span className="text-text-muted">{num(p.levels_count)}</span>
                <StatusBadge
                  status={p.is_active ? "approved" : "closed"}
                  label={p.is_active ? "نشط" : "موقوف"}
                />
              </div>
            ))}
            {!deptPrograms.length && <p className="px-4 py-3 text-sm text-text-muted">لا برامج.</p>}
          </Card>
          {dept && (
            <Card className="mt-3 grid gap-2 p-3 sm:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)]">
              <input
                dir="ltr"
                value={pForm.code}
                onChange={(e) => setP({ ...pForm, code: e.target.value.toUpperCase() })}
                placeholder="BIT"
                aria-label="رمز البرنامج"
                className={input}
              />
              <input
                value={pForm.name_ar}
                onChange={(e) => setP({ ...pForm, name_ar: e.target.value })}
                placeholder="اسم البرنامج"
                aria-label="اسم البرنامج"
                className={input}
              />
              <input
                dir="ltr"
                value={pForm.name_en}
                onChange={(e) => setP({ ...pForm, name_en: e.target.value })}
                placeholder="English name"
                aria-label="الاسم بالإنجليزية"
                className={input}
              />
              <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
                {Object.entries(DEGREE).map(([k, l]) => (
                  <Chip
                    key={k}
                    active={pForm.degree === k}
                    onClick={() => setP({ ...pForm, degree: k })}
                  >
                    {l}
                  </Chip>
                ))}
                <label className="flex items-center gap-1 text-xs text-text-muted">
                  مستويات
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={pForm.levels_count}
                    onChange={(e) => setP({ ...pForm, levels_count: Number(e.target.value) })}
                    className="w-14 rounded border border-border px-1 py-1"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-text-muted">
                  فصول
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={pForm.duration_terms}
                    onChange={(e) => setP({ ...pForm, duration_terms: Number(e.target.value) })}
                    className="w-14 rounded border border-border px-1 py-1"
                  />
                </label>
                <Button
                  className="ms-auto min-h-9 px-4"
                  disabled={!pForm.code || !pForm.name_ar}
                  onClick={() => addProgram.mutate()}
                >
                  + برنامج
                </Button>
              </div>
            </Card>
          )}
        </section>
      </div>
    </PortalShell>
  );
}
