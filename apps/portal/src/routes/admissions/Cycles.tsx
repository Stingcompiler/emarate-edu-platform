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

/** Board: HeadRegistrarCycles (phone); desktop derived — cycles + a table of intakes. */
export function Cycles() {
  const client = useQueryClient();
  const cycles = useQuery({
    queryKey: ["admissions", "cycles"],
    queryFn: async () => (await api.GET("/api/v1/admission-cycles")).data?.results ?? [],
  });
  const [picked, setPicked] = useState<number | null>(null);
  const cycle = cycles.data?.find((c) => c.id === picked) ?? cycles.data?.[0];
  const intakes = useQuery({
    queryKey: ["admissions", "intakes", cycle?.id],
    enabled: !!cycle,
    queryFn: async () =>
      (await api.GET("/api/v1/intakes", { params: { query: { cycle: cycle!.id } } })).data
        ?.results ?? [],
  });
  const programs = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await api.GET("/api/v1/programs")).data?.results ?? [],
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
    queryFn: async () => (await api.GET("/api/v1/academic-years")).data?.results ?? [],
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
        <summary className="cursor-pointer font-semibold text-primary">دورة جديدة</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="الاسم، مثل: قبول 2027/2028"
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
              يفتح: <b>{new Date(cycle.opens_at).toLocaleDateString("ar")}</b>
            </span>
            <span>
              يُغلق: <b>{new Date(cycle.closes_at).toLocaleDateString("ar")}</b>
            </span>
            <StatusBadge
              status={cycle.is_active ? "approved" : "closed"}
              label={cycle.is_active ? "جارية" : "مغلقة"}
            />
          </Card>
          <SectionLabel>
            البرامج في هذه الدورة · {(intakes.data?.length ?? 0).toLocaleString("ar")}
          </SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(intakes.data ?? []).map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">{i.program_name}</span>
                  <span className="text-xs text-text-muted">
                    {i.department_name} · {(i.applications_count ?? 0).toLocaleString("ar")} طلبًا
                    {i.capacity ? ` · ${i.capacity} مقعد` : ""}
                  </span>
                </span>
                <Button
                  variant={i.is_open ? "secondary" : "primary"}
                  className="min-h-9 px-3"
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
                <Chip key={p.id} onClick={() => add.mutate(p.id)}>
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
