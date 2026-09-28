import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, SectionLabel, Switch } from "../../components/ui";
import { api } from "../../lib/api";

type Display = Schemas["DisplaySettings"];
const FIELDS: { key: keyof Display; label: string; hint?: string }[] = [
  { key: "show_score", label: "الدرجة الكلية (من 100)" },
  { key: "show_letter", label: "التقدير الحرفي" },
  { key: "show_points", label: "النقاط" },
  { key: "show_gpa", label: "المعدل الفصلي والتراكمي" },
  {
    key: "history_open",
    label: "السجل الأكاديمي الكامل",
    hint: "كل الفصول السابقة، لا الأخير فقط.",
  },
];

/** Board: ResultsOfficerSettings (phone). Desktop: derived — two columns. */
export function ResultSettings() {
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["results", "settings"],
    queryFn: async () => (await api.GET("/api/v1/results/settings")).data ?? null,
  });
  const terms = useQuery({
    queryKey: ["terms"],
    queryFn: async () => (await api.GET("/api/v1/terms")).data?.results ?? [],
  });
  const releases = useQuery({
    queryKey: ["results", "releases"],
    queryFn: async () => (await api.GET("/api/v1/results/term-releases")).data?.results ?? [],
  });
  const scales = useQuery({
    queryKey: ["results", "scales"],
    queryFn: async () => (await api.GET("/api/v1/results/grading-scales")).data?.results ?? [],
  });
  const [notice, setNotice] = useState("");
  useEffect(() => setNotice(settings.data?.notice_text ?? ""), [settings.data?.notice_text]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Display>) => {
      const { data, error } = await api.PATCH("/api/v1/results/settings", { body: patch });
      if (!data) throw error;
      return data;
    },
    onSuccess: (data) => client.setQueryData(["results", "settings"], data),
  });
  const release = useMutation({
    mutationFn: async ({ term, visible }: { term: number; visible: boolean }) => {
      const existing = releases.data?.find((r) => r.term === term && r.program === null);
      if (existing) {
        await api.PUT("/api/v1/results/term-releases/{id}", {
          params: { path: { id: existing.id } },
          body: { term, program: null, is_visible: visible },
        });
      } else {
        await api.POST("/api/v1/results/term-releases", {
          body: { term, program: null, is_visible: visible },
        });
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["results", "releases"] }),
  });

  const hidden = new Set(
    (releases.data ?? []).filter((r) => r.program === null && !r.is_visible).map((r) => r.term),
  );

  return (
    <PortalShell
      title="إعدادات العرض"
      subtitle="تحدد ما يراه الطالب في «نتائجي» — لا تغيّر الدرجات نفسها."
    >
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div>
          <SectionLabel>الفصول الظاهرة للطلاب</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(terms.data ?? []).map((t) => (
              <Toggle
                key={t.id}
                label={t.name_ar}
                on={!hidden.has(t.id)}
                onChange={(visible) => release.mutate({ term: t.id, visible })}
              />
            ))}
          </Card>
          <SectionLabel>الحقول الظاهرة</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {settings.data &&
              FIELDS.map((f) => (
                <Toggle
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  on={Boolean(settings.data?.[f.key])}
                  onChange={(value) => save.mutate({ [f.key]: value })}
                />
              ))}
          </Card>
        </div>
        <div>
          <SectionLabel>مقياس التقدير</SectionLabel>
          <Card className="divide-y divide-border-soft">
            {(scales.data?.length ? scales.data : [{ id: 0, program: null, ranges: [] }]).map(
              (s) => (
                <div key={s.id} className="px-4 py-3 text-sm">
                  <p className="font-semibold text-text">
                    {s.program ? `برنامج #${s.program}` : "الافتراضي"}
                  </p>
                  <p className="mt-0.5 text-text-muted" dir="ltr">
                    {s.ranges.length
                      ? s.ranges.map((b) => `${b.letter} ≥ ${Number(b.min)}`).join(" · ")
                      : "A ≥ 85 · B+ ≥ 75 · B ≥ 70 · C+ ≥ 65 · C ≥ 60 · F"}
                  </p>
                </div>
              ),
            )}
          </Card>
          <SectionLabel>نص التنويه أسفل النتائج</SectionLabel>
          <Card className="p-4">
            <textarea
              aria-label="نص التنويه أسفل النتائج"
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
              className="block min-h-24 w-full resize-y bg-transparent text-sm leading-relaxed text-text outline-none"
            />
            <div className="mt-3 flex justify-end">
              <Button
                variant="secondary"
                onClick={() => save.mutate({ notice_text: notice })}
                disabled={save.isPending || notice === (settings.data?.notice_text ?? "")}
              >
                حفظ النص
              </Button>
            </div>
          </Card>
          {save.isError && (
            <div className="mt-3">
              <Notice>تعذّر الحفظ.</Notice>
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2.5">
      <span>
        <span className="block text-sm font-medium text-text">{label}</span>
        {hint && <span className="block text-xs text-text-muted">{hint}</span>}
      </span>
      <Switch checked={on} onChange={onChange} label={label} />
    </label>
  );
}
