import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Notice,
  SectionLabel,
  StatusBadge,
  problemMessage,
  WithSide,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { formatClock } from "../../lib/exam";
import { count, N } from "../../lib/format";
import { Pager, useServerPages } from "../../components/Pager";

type Row = Schemas["AttemptSummary"];
const LABEL: Record<string, string> = {
  in_progress: "جارٍ",
  submitted: "أُرسل",
  auto_submitted: "أُرسل تلقائيًا",
  invalidated: "أُلغي",
};
const TONE: Record<string, string> = {
  in_progress: "open",
  submitted: "approved",
  auto_submitted: "approved",
  invalidated: "rejected",
};

/** Board: TeacherExamMonitor (phone); desktop derived. Refreshes every 30 seconds. */
export function ExamMonitor() {
  const { id = "" } = useParams();
  const client = useQueryClient();
  const exam = useQuery({
    queryKey: ["exams", id],
    queryFn: async () =>
      ok(await api.GET("/api/v1/exams/{public_id}", { params: { path: { public_id: id } } })) ??
      null,
  });
  // Paged by the server, and each figure counted there: a 500-student exam shows every
  // attempt and true totals (review 2026-09-29, P3).
  const rows = useServerPages(
    ["exams", id, "attempts"],
    async (page) =>
      ok(
        await api.GET("/api/v1/exams/{public_id}/attempts", {
          params: { path: { public_id: id }, query: { page } },
        }),
      ),
    { refetchInterval: 30_000 },
  );
  const stateCount = (state: "in_progress" | "done" | "invalidated") =>
    ({
      queryKey: ["exams", id, "attempts", "count", state],
      queryFn: async () =>
        ok(
          await api.GET("/api/v1/exams/{public_id}/attempts", {
            params: { path: { public_id: id }, query: { state, page_size: 1 } },
          }),
        )?.count ?? 0,
      refetchInterval: 30_000,
    }) as const;
  const running = useQuery(stateCount("in_progress"));
  const done = useQuery(stateCount("done"));
  const invalidated = useQuery(stateCount("invalidated"));
  const [picked, setPicked] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const act = useMutation({
    mutationFn: async (kind: "extend" | "reopen" | "invalidate") => {
      const path = { params: { path: { public_id: picked!.public_id } } };
      const res =
        kind === "extend"
          ? await api.POST("/api/v1/exam-attempts/{public_id}/extend", {
              ...path,
              body: { minutes: 5 },
            })
          : kind === "reopen"
            ? await api.POST("/api/v1/exam-attempts/{public_id}/reopen", {
                ...path,
                body: { minutes: 10, reason },
              })
            : await api.POST("/api/v1/exam-attempts/{public_id}/invalidate", {
                ...path,
                body: { reason },
              });
      if (!res.data) throw res.error;
    },
    onSuccess: () => {
      setPicked(null);
      setReason("");
      void client.invalidateQueries({ queryKey: ["exams", id, "attempts"] });
    },
  });
  const list = rows.items;
  const counts = {
    in_progress: running.data ?? 0,
    submitted: done.data ?? 0,
    invalidated: invalidated.data ?? 0,
  };
  const quiet = (r: Row) =>
    r.status === "in_progress" &&
    r.last_saved_at &&
    Date.now() - new Date(r.last_saved_at).getTime() > 120_000;

  return (
    <PortalShell
      title={exam.data?.title ?? "مراقبة"}
      subtitle="يتحدث كل 30 ثانية"
      back={{ label: "الاختبار", to: `/exams/${id}` }}
    >
      {/* Desktop: the attempts; the chosen attempt's actions beside them. */}
      <WithSide
        side={
          <div>
            {picked ? (
              <>
                <SectionLabel>
                  إجراء على محاولة {(picked.student as { full_name_ar: string }).full_name_ar}
                </SectionLabel>
                <Card className="space-y-3 p-4">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="السبب (إلزامي لإعادة الفتح والإلغاء)"
                    className="min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    {picked.status === "in_progress" && (
                      <Button variant="secondary" onClick={() => act.mutate("extend")}>
                        تمديد 5 دقائق
                      </Button>
                    )}
                    {picked.status !== "in_progress" && picked.status !== "invalidated" && (
                      <Button
                        variant="secondary"
                        disabled={!reason.trim()}
                        onClick={() => act.mutate("reopen")}
                      >
                        إعادة فتح بسبب
                      </Button>
                    )}
                    {picked.status !== "invalidated" && (
                      <Button
                        variant="secondary"
                        className="text-danger-strong"
                        disabled={!reason.trim()}
                        onClick={() => act.mutate("invalidate")}
                      >
                        إلغاء المحاولة
                      </Button>
                    )}
                  </div>
                  {act.isError && <Notice>{problemMessage(act.error)}</Notice>}
                  <p className="text-xs leading-relaxed text-text-muted">
                    المحاولة المنقطعة تستمر بالحفظ على جهاز الطالب وتُرسل عند عودة الاتصال؛ يُغلقها
                    الخادم تلقائيًا عند انتهاء الوقت.
                  </p>
                </Card>
              </>
            ) : (
              <p className="hidden rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted lg:block">
                اختر محاولة لتمديدها أو إعادة فتحها أو إلغائها.
              </p>
            )}
          </div>
        }
      >
        <Card className="grid grid-cols-3 divide-x divide-border-soft text-center">
          {[
            { n: counts.submitted, l: "أُرسل" },
            { n: counts.in_progress, l: "جارٍ" },
            { n: counts.invalidated, l: "أُلغي" },
          ].map((s) => (
            <div key={s.l} className="py-3">
              <p className="text-xl font-bold text-text">{s.n.toLocaleString("ar-u-nu-latn")}</p>
              <p className="text-xs text-text-muted">{s.l}</p>
            </div>
          ))}
        </Card>
        <SectionLabel>المحاولات — الأقرب للانتهاء أولًا</SectionLabel>
        <Card className="divide-y divide-border-soft">
          {list.map((r) => {
            const s = r.student as { full_name_ar: string; university_number: string };
            const meta = (r.client_meta ?? {}) as { blur?: number };
            return (
              <button
                key={r.public_id}
                type="button"
                onClick={() => setPicked(r)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-alt ${picked?.public_id === r.public_id ? "bg-primary-soft" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">{s.full_name_ar}</span>
                  <span className="text-xs text-text-muted">
                    <span dir="ltr">{s.university_number}</span>
                    {quiet(r) && " · آخر حفظ قبل أكثر من دقيقتين — انقطاع؟"}
                    {meta.blur ? ` · غادر الشاشة ${count(meta.blur, N.time)}` : ""}
                  </span>
                </span>
                {r.remaining_seconds !== null ? (
                  <span className="text-sm font-bold tabular-nums text-text">
                    {formatClock(r.remaining_seconds * 1000)}
                  </span>
                ) : (
                  r.score !== null && (
                    <span className="text-sm font-bold text-text">
                      {Number(r.score).toLocaleString("ar-u-nu-latn")}
                    </span>
                  )
                )}
                <StatusBadge
                  status={TONE[r.status] ?? "neutral"}
                  label={LABEL[r.status] ?? r.status}
                />
              </button>
            );
          })}
        </Card>
        <Pager page={rows.page} count={rows.count} onPage={rows.setPage} label="صفحات المحاولات" />
      </WithSide>
    </PortalShell>
  );
}
