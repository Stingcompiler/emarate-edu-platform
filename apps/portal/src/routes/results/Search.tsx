import type { Schemas } from "@ecst/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { type FormEvent, useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  FilterBar,
  Card,
  CodeTile,
  EmptyState,
  Field,
  Notice,
  SectionLabel,
  SideNote,
  StatusBadge,
  TextArea,
  problemMessage,
  splitCode,
} from "../../components/ui";
import { api } from "../../lib/api";
import { ALL } from "../../components/Pager";

type Result = Schemas["Result"];

/** Board: ResultsOfficerSearch (phone). Desktop: derived — results and the request form side by side. */
export function ResultSearch() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [picked, setPicked] = useState<Result | null>(null);
  const results = useQuery({
    queryKey: ["results", "search", submitted],
    enabled: submitted.length > 0,
    queryFn: async () =>
      (await api.GET("/api/v1/results", { params: { query: { ...ALL, search: submitted } } })).data
        ?.results ?? [],
  });

  function search(event: FormEvent) {
    event.preventDefault();
    setPicked(null);
    setSubmitted(query.trim());
  }

  const rows = results.data ?? [];
  const student = rows[0];

  return (
    <PortalShell
      title="بحث في النتائج"
      subtitle="التعديل لا يُنفَّذ مباشرة — يُرسل طلبًا لأمين الشؤون العلمية."
    >
      <FilterBar>
        <form onSubmit={search} className="flex gap-2 lg:max-w-[calc(100%-380px-1.5rem)]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="الرقم الجامعي أو الاسم"
            dir="auto"
            className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <Button type="submit" disabled={!query.trim()}>
            <SearchIcon size={18} aria-hidden />
            بحث
          </Button>
        </form>
      </FilterBar>

      {submitted && !results.isPending && !rows.length && (
        <Card className="mt-4">
          <EmptyState icon={<SearchIcon size={24} aria-hidden />} title="لا نتائج مطابقة" />
        </Card>
      )}

      {!submitted && (
        // Before a search, explain what the page does instead of an empty wide screen.
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <SideNote title="١ ابحث">
            بالرقم الجامعي أو باسم الطالب؛ تظهر كل نتائجه المعتمدة.
          </SideNote>
          <SideNote title="٢ اختر النتيجة">تظهر درجتها وإصدارها وحالة نشرها.</SideNote>
          <SideNote title="٣ اطلب التعديل">
            بالقيمة الجديدة والسبب؛ لا تتغير قبل موافقة أمين الشؤون العلمية.
          </SideNote>
        </div>
      )}

      {student && (
        <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
          <div>
            <Card className="px-4 py-3">
              <p className="font-semibold text-text">{student.student_name}</p>
              <p className="text-xs text-text-muted" dir="ltr">
                {student.university_number}
              </p>
            </Card>
            <Card className="motion-stagger mt-3 divide-y divide-border-soft">
              {rows.map((r) => {
                const [top, bottom] = splitCode(r.course_code);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPicked(r)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-alt ${picked?.id === r.id ? "bg-primary-soft" : ""}`}
                  >
                    <CodeTile top={top} bottom={bottom} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">
                        {r.course_name}
                      </span>
                      <span className="text-xs text-text-muted">
                        {r.term_name} · الإصدار {r.version}
                      </span>
                    </span>
                    <span className="text-end">
                      <span className="block text-lg font-bold text-text" dir="ltr">
                        {r.letter || "—"}
                      </span>
                      <span className="text-xs text-text-muted">{r.score ?? "—"}</span>
                    </span>
                    <StatusBadge
                      status={r.is_published ? "published" : "committed"}
                      label={r.is_published ? "منشورة" : "معتمدة"}
                    />
                  </button>
                );
              })}
            </Card>
          </div>
          {picked && <CorrectionForm result={picked} onDone={() => setPicked(null)} />}
        </div>
      )}
    </PortalShell>
  );
}

function CorrectionForm({ result, onDone }: { result: Result; onDone: () => void }) {
  const [score, setScore] = useState("");
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/results/{id}/corrections", {
        params: { path: { id: result.id } },
        body: { score: score || null, reason },
      });
      if (!data) throw error;
    },
    onSuccess: () => setSent(true),
  });
  return (
    <section className="mt-5 lg:mt-0">
      <SectionLabel>طلب تعديل — {result.course_name}</SectionLabel>
      {sent ? (
        <Notice tone="success">
          أُرسل الطلب إلى أمين الشؤون العلمية. تُنشر القيمة الجديدة بعد الموافقة ويُشعر الطالب.
        </Notice>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
          className="space-y-3"
        >
          <Card>
            <div className="flex gap-6 border-b border-border-soft px-4 py-3 text-sm">
              <span className="text-text-muted">
                الحالية:{" "}
                <b className="text-text">
                  {result.score ?? "—"} {result.letter}
                </b>
              </span>
            </div>
            <Field
              label="الدرجة الجديدة (من 100)"
              inputMode="decimal"
              dir="ltr"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              required
            />
            <TextArea
              label="السبب (إلزامي)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </Card>
          {send.isError && <Notice>{problemMessage(send.error)}</Notice>}
          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={!score || !reason.trim() || send.isPending}
            >
              إرسال طلب التعديل
            </Button>
            <Button variant="secondary" onClick={onDone}>
              إلغاء
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
