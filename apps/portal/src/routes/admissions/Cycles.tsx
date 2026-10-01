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
import { api, ok } from "../../lib/api";
import { count, N, fmtDate } from "../../lib/format";
import { ALL } from "../../components/Pager";

/** Board: HeadRegistrarCycles (phone); desktop derived — cycles + a table of intakes. */
export function Cycles() {
  const client = useQueryClient();
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
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="الاسم، مثل: قبول 2027/2028"
            aria-label="اسم الدورة"
            className="min-h-10 rounded-lg border border-border bg-surface px-3"
          />
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
          <Card className="mt-4 flex flex-wrap gap-x-6 gap-y-1 p-4 text-sm">
            <span>
              يفتح: <b>{fmtDate(cycle.opens_at)}</b>
            </span>
            <span>
              يُغلق: <b>{fmtDate(cycle.closes_at)}</b>
            </span>
            <StatusBadge
              status={cycle.is_active ? "approved" : "closed"}
              label={cycle.is_active ? "جارية" : "مغلقة"}
            />
          </Card>
          <SectionLabel>
            البرامج في هذه الدورة · {(intakes.data?.length ?? 0).toLocaleString("ar-u-nu-latn")}
          </SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(intakes.data ?? []).map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
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
                      <span className="w-10 text-end text-xs text-text-muted">
                        {Math.round(
                          (100 * (i.applications_count ?? 0)) / i.capacity,
                        ).toLocaleString("ar-u-nu-latn")}
                        ٪
                      </span>
                    </span>
                  ) : null}
                </span>

                <Button
                  variant={i.is_open ? "secondary" : "primary"}
                  className="min-h-9 px-3"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: i.id, is_open: !i.is_open })}
                >
                  {i.is_open ? "إغلاق" : "فتح"}
                </Button>
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
          </div>
          {(toggle.isError || add.isError) && (
            <div className="mt-3">
              <Notice>{problemMessage(toggle.error ?? add.error)}</Notice>
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}
