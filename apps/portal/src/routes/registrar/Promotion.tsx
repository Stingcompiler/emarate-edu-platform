import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import { useConfirm } from "../../components/Confirm";
import { PortalShell } from "../../components/PortalShell";
import { useToast } from "../../components/Toast";
import { Button, Card, EmptyState, FilterBar, Notice, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { N, count, levelSemester, when } from "../../lib/format";
import { Picker, num, useDepartments } from "../../lib/reports";
import { matches } from "../../lib/search";

type Row = {
  public_id: string;
  university_number: string;
  full_name_ar: string;
  program_name: string;
  department_name: string;
  level: number;
  semester: number;
  to_level: number | null;
  to_semester: number | null;
};

/**
 * «ترفيع الطلاب» (owner, 2026-11-05): at the end of the current term the head registrar moves
 * the active students on a semester — (المستوى ن، الأول) → (ن، الثاني) → (ن+1، الأول). Those who
 * failed courses move with their cohort; anyone unticked stays where they are. Once per term.
 */
export function Promotion() {
  const confirm = useConfirm();
  const toast = useToast();
  const client = useQueryClient();
  const departments = useDepartments();
  const [department, setDepartment] = useState<number>();
  const [search, setSearch] = useState("");
  const [kept, setKept] = useState<Set<string>>(new Set());
  const preview = useQuery({
    queryKey: ["student-promotion", department],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/student-promotion", {
          params: { query: department ? { department } : {} },
        }),
      ) ?? null,
  });
  const rows = (preview.data?.students ?? []) as Row[];
  const groups = useMemo(() => {
    const out = new Map<string, Row[]>();
    for (const r of rows) {
      const key = `${r.program_name}|${r.level}|${r.semester}`;
      out.set(key, [...(out.get(key) ?? []), r]);
    }
    return [...out.values()];
  }, [rows]);
  const moving = rows.filter((r) => r.to_level && !kept.has(r.public_id)).length;
  const done = Boolean(preview.data?.done_at);
  const apply = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/student-promotion", {
        body: { department: department ?? null, exclude: [...kept] },
      });
      if (!data) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast(`رُفِّع ${count(data.promoted, N.student)}`);
      setKept(new Set());
      void client.invalidateQueries({ queryKey: ["student-promotion"] });
      void client.invalidateQueries({ queryKey: ["students"] });
    },
  });
  const toggle = (id: string) =>
    setKept((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const needle = search.trim();
  const shown = (list: Row[]) =>
    list.filter((r) => matches(needle, r.full_name_ar, r.university_number));

  return (
    <PortalShell
      title="ترفيع الطلاب"
      subtitle={preview.data ? `نهاية ${preview.data.term_name}` : undefined}
      back={{ label: "سجل الطلاب", to: "/students" }}
    >
      <p className="mb-3 max-w-3xl text-sm text-text-muted">
        ينتقل كل طالب منتظم فصلًا دراسيًا: من الفصل الأول إلى الثاني في المستوى نفسه، ومن الفصل
        الثاني إلى الفصل الأول في المستوى التالي. من رسب في مواد ينتقل مع دفعته ويحملها؛ ومن يبقى
        مكانه أزل علامته. من في آخر فصل من برنامجه لا يتغير.
      </p>
      <FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرقم الجامعي"
            aria-label="بحث بالاسم أو الرقم الجامعي"
            className="min-h-10 min-w-0 flex-1 rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-sm"
          />
          <Picker
            label="القسم"
            value={department}
            items={departments.data ?? []}
            name={(d) => d.name_ar}
            onChange={(v) => {
              setDepartment(v);
              setKept(new Set());
            }}
            all="كل الأقسام"
          />
        </div>
      </FilterBar>
      {done && (
        <div className="mt-4">
          <Notice tone="success">
            رُفِّع الطلاب في نهاية هذا الفصل
            {preview.data?.done_at ? ` (${when(preview.data.done_at)})` : ""}. الترفيع التالي في
            نهاية الفصل القادم.
          </Notice>
        </div>
      )}
      {!done && (preview.data?.departments_done ?? 0) > 0 && (
        // Departments promoted on their own are left out of the college's run (review
        // 2026-11-10, R71): say so, the list below is the rest.
        <div className="mt-4">
          <Notice tone="info">
            رُفِّع {count(preview.data!.departments_done, N.department)} على حدة في نهاية هذا الفصل؛
            القائمة أدناه بقية الكلية، والترفيع يشملها وحدها.
          </Notice>
        </div>
      )}
      {apply.isError && (
        <div className="mt-4">
          <Notice>{problemMessage(apply.error)}</Notice>
        </div>
      )}
      {preview.isError && (
        <div className="mt-4">
          <Notice>{problemMessage(preview.error)}</Notice>
        </div>
      )}
      {preview.isSuccess && !rows.length ? (
        <Card className="mt-4">
          <EmptyState icon={<TrendingUp size={24} aria-hidden />} title="لا طلاب منتظمون">
            لا أحد للترفيع في هذا النطاق.
          </EmptyState>
        </Card>
      ) : (
        <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
          {groups.map((group) => {
            const first = group[0]!;
            const list = shown(group);
            const staying = group.filter((r) => kept.has(r.public_id)).length;
            if (needle && !list.length) return null;
            return (
              <Card key={`${first.program_name}-${first.level}-${first.semester}`}>
                <details open={Boolean(needle)}>
                  <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="block text-text">{first.program_name}</b>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
                        {levelSemester(first.level, first.semester)}
                        <ArrowLeft size={12} aria-label="إلى" />
                        {first.to_level
                          ? levelSemester(first.to_level, first.to_semester)
                          : "آخر فصل — يبقى"}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-text">
                      {count(group.length, N.student)}
                      {staying ? ` · يبقى ${num(staying)}` : ""}
                    </span>
                  </summary>
                  <ul className="divide-y divide-border-soft border-t border-border-soft">
                    {list.map((r) => (
                      <li key={r.public_id}>
                        <label className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">
                          {r.to_level && !done ? (
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={!kept.has(r.public_id)}
                              onChange={() => toggle(r.public_id)}
                            />
                          ) : (
                            // The last semester, or already promoted: nothing to choose.
                            <span className="size-4" aria-hidden />
                          )}
                          <span className="min-w-0 flex-1 truncate">{r.full_name_ar}</span>
                          <bdi className="num text-xs text-text-muted">{r.university_number}</bdi>
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              </Card>
            );
          })}
        </div>
      )}
      {rows.length > 0 && (
        <div className="sticky bottom-20 mt-4 lg:bottom-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
            <p className="text-sm text-text">
              يُرفَّع <b>{count(moving, N.student)}</b>
              {kept.size ? ` · يبقى ${num(kept.size)} مكانه` : ""}
            </p>
            <Button
              disabled={done || !moving || apply.isPending}
              why={
                done ? "رُفِّع الطلاب في نهاية هذا الفصل" : !moving ? "لا أحد للترفيع" : undefined
              }
              onClick={async () => {
                if (
                  await confirm({
                    title: `ترفيع ${count(moving, N.student)}؟`,
                    body: "ينتقل كل منهم فصلًا دراسيًا. يُجرى مرة واحدة في نهاية الفصل، ويُصحَّح أي طالب بعده من ملفه.",
                    confirm: "ترفيع",
                    tone: "primary",
                  })
                )
                  apply.mutate();
              }}
            >
              <TrendingUp size={16} aria-hidden />
              ترفيع
            </Button>
          </Card>
        </div>
      )}
    </PortalShell>
  );
}
