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
import { useConfirm } from "../../components/Confirm";

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

/** Board: TeacherExamMonitor (phone); desktop derived — who sent, who is writing, who has not
 *  started, with the chosen attempt's actions beside the list (a panel on phones). Refreshes
 *  every 30 seconds. */
export function ExamMonitor() {
  const confirm = useConfirm();
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
  // «لم يبدأ» (review 2026-09-29 PR 7): enrolled students with no attempt yet.
  const enrolled = exam.data?.students_count ?? null;
  const notStarted =
    enrolled === null ? null : Math.max(0, enrolled - (exam.data?.started_count ?? 0));
  const figures = [
    { n: counts.submitted, l: "أُرسل", bar: "bg-success" },
    { n: counts.in_progress, l: "جارٍ", bar: "bg-primary" },
    ...(notStarted === null ? [] : [{ n: notStarted, l: "لم يبدأ", bar: "bg-n300" }]),
    { n: counts.invalidated, l: "أُلغي", bar: "bg-danger" },
  ];
  const total = figures.reduce((n, f) => n + f.n, 0);
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
              // Phones: a panel over the list, above the tab bar, so acting never means
              // scrolling to the bottom of a 500-row list.
              <div className="max-lg:fixed max-lg:inset-x-3 max-lg:bottom-24 max-lg:z-30 max-lg:rounded-2xl max-lg:bg-bg max-lg:p-1 max-lg:shadow-2xl">
                <div className="flex items-center justify-between lg:hidden">
                  <span />
                  <button
                    type="button"
                    onClick={() => setPicked(null)}
                    className="min-h-11 px-3 text-sm font-semibold text-primary"
                  >
                    إغلاق
                  </button>
                </div>
                <SectionLabel>
                  إجراء على محاولة {(picked.student as { full_name_ar: string }).full_name_ar}
                </SectionLabel>
                <Card className="space-y-3 p-4">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="السبب (إلزامي لإعادة الفتح والإلغاء)"
                    aria-label="السبب"
                    className="min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    {picked.status === "in_progress" && (
                      <Button
                        variant="secondary"
                        disabled={act.isPending}
                        onClick={() => act.mutate("extend")}
                      >
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
                        onClick={async () =>
                          (await confirm({
                            title: "إلغاء المحاولة؟",
                            body: "تُلغى محاولة الطالب ولا تُحتسب درجتها. يُسجَّل السبب في السجل.",
                            confirm: "إلغاء المحاولة",
                            cancel: "تراجع",
                          })) && act.mutate("invalidate")
                        }
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
              </div>
            ) : (
              <p className="hidden rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted lg:block">
                اختر محاولة لتمديدها أو إعادة فتحها أو إلغائها.
              </p>
            )}
          </div>
        }
      >
        <Card className="p-3">
          <div
            className={`grid text-center ${figures.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}
          >
            {figures.map((f) => (
              <div key={f.l} className="py-1">
                <p className="text-xl font-bold text-text">{f.n.toLocaleString("ar-u-nu-latn")}</p>
                <p className="flex items-center justify-center gap-1 text-xs text-text-muted">
                  <span aria-hidden="true" className={`size-2 rounded-full ${f.bar}`} />
                  {f.l}
                </p>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div
              className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-alt"
              aria-hidden="true"
            >
              {figures.map((f) => (
                <span key={f.l} className={f.bar} style={{ width: `${(100 * f.n) / total}%` }} />
              ))}
            </div>
          )}
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
          {!list.length && !rows.query.isPending && (
            <p className="px-4 py-5 text-sm text-text-muted">لم يبدأ أحد الاختبار بعد.</p>
          )}
        </Card>
        <Pager page={rows.page} count={rows.count} onPage={rows.setPage} label="صفحات المحاولات" />
      </WithSide>
    </PortalShell>
  );
}
