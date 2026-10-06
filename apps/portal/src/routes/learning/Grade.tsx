import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, SectionLabel, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when, score as markOf } from "../../lib/format";
import { initials } from "../../lib/reports";
import { openFile } from "../../lib/learning";
import { ALL } from "../../components/Pager";
import { useToast } from "../../components/Toast";

/** Boards: TeacherGradeSubmission (phone), DesktopTeacherGrading — the assignment's queue, the
 *  work, and the grade panel side by side on wide screens. */
export function Grade() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const path = { params: { path: { public_id: id } } };
  const submission = useQuery({
    queryKey: ["submission", id],
    queryFn: async () => ok(await api.GET("/api/v1/submissions/{public_id}", path)) ?? null,
  });
  const s = submission.data;
  const assignment = useQuery({
    queryKey: ["assignment", s?.assignment],
    enabled: !!s,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/assignments/{public_id}", {
          params: { path: { public_id: s!.assignment } },
        }),
      ) ?? null,
  });
  const siblings = useQuery({
    queryKey: ["assignment", s?.assignment, "submissions"],
    enabled: !!s,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/assignments/{public_id}/submissions", {
          params: { path: { public_id: s!.assignment }, query: ALL },
        }),
      )?.results ?? [],
  });
  const a = assignment.data;
  const max = Number(a?.max_grade ?? 0);
  const queue = (siblings.data ?? []).filter((x) => x.grade?.status !== "approved");
  const position = queue.findIndex((x) => x.public_id === id);
  // Walk the queue in order; previous for a second look.
  const next = position >= 0 ? queue[position + 1] : queue.find((x) => x.public_id !== id);
  const previous = position > 0 ? queue[position - 1] : undefined;
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (s?.grade) {
      setScore(String(Number(s.grade.score)));
      setFeedback(s.grade.feedback ?? "");
    } else {
      setScore("");
      setFeedback("");
    }
  }, [s]);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["submission", id] });
    void client.invalidateQueries({ queryKey: ["assignment"] });
    void client.invalidateQueries({ queryKey: ["grading"] });
  };
  const toast = useToast();
  const save = useMutation({
    mutationFn: async (andNext: boolean) => {
      const { data, error } = await api.PUT("/api/v1/submissions/{public_id}/grade", {
        ...path,
        body: { score, feedback },
      });
      if (!data) throw error;
      if (data.status === "suggested") {
        const approved = await api.POST("/api/v1/submissions/{public_id}/grade/approve", path);
        if (!approved.data && approved.response.status !== 403) throw approved.error;
      }
      return andNext;
    },
    onSuccess: (andNext) => {
      toast("حُفظت الدرجة");
      refresh();
      if (andNext && next) navigate(`/submissions/${next.public_id}`);
    },
  });
  const approve = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/submissions/{public_id}/grade/approve", path);
      if (!data) throw error;
    },
    onSuccess: refresh,
  });
  // J / K walk the queue (board DesktopTeacherGrading), unless typing in the form.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        t.closest("input, textarea, select, [contenteditable]")
      )
        return;
      if (e.key === "j" && next) navigate(`/submissions/${next.public_id}`);
      if (e.key === "k" && previous) navigate(`/submissions/${previous.public_id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, navigate]);
  const [list, setList] = useState<"open" | "done">("open");
  const done = (siblings.data ?? []).filter((x) => x.grade?.status === "approved");
  const shown = list === "open" ? queue : done;
  const v = s?.current_version;
  const valid = score !== "" && Number(score) >= 0 && Number(score) <= max;
  return (
    <PortalShell
      title={s?.student.full_name_ar ?? "تصحيح"}
      subtitle={
        s && a
          ? `${a.title} · ${position >= 0 ? `${position + 1} من ${queue.length}` : "مصحح"}`
          : undefined
      }
      back={s ? { label: a?.title ?? "الواجب", to: `/assignments/${s.assignment}` } : undefined}
    >
      {s && v && a && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
          {/* The assignment's queue beside the work (board DesktopTeacherGrading): wide screens
              only — smaller ones walk it with «التالي» and «السابق». */}
          <nav aria-label="تسليمات الواجب" className="hidden xl:block xl:sticky xl:top-20">
            <Card className="overflow-hidden">
              <div className="flex gap-1 border-b border-border-soft p-2" role="tablist">
                {(
                  [
                    ["open", `غير مصحح ${queue.length.toLocaleString("ar-u-nu-latn")}`],
                    ["done", `مصحح ${done.length.toLocaleString("ar-u-nu-latn")}`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={list === key}
                    onClick={() => setList(key)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${list === key ? "bg-text text-bg" : "text-text-muted hover:bg-surface-alt"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul className="max-h-[70vh] divide-y divide-border-soft overflow-y-auto">
                {shown.map((x) => {
                  const current = x.public_id === id;
                  return (
                    <li key={x.public_id}>
                      <button
                        type="button"
                        aria-current={current ? "page" : undefined}
                        onClick={() => navigate(`/submissions/${x.public_id}`)}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-start hover:bg-surface-alt ${current ? "border-s-2 border-primary bg-primary-soft/40" : ""}`}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-alt text-xs font-semibold text-text-muted">
                          {initials(x.student.full_name_ar)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-sm text-text">
                            {x.student.full_name_ar}
                          </b>
                          <span
                            className={`text-xs ${x.is_late ? "text-warning-strong" : "text-text-muted"}`}
                          >
                            {when(x.first_submitted_at)}
                            {x.is_late ? " · متأخر" : ""}
                          </span>
                        </span>
                        {x.grade?.status === "approved" && (
                          <b className="shrink-0 text-xs text-success-strong">
                            {markOf(x.grade.score, max)}
                          </b>
                        )}
                        {x.grade?.status === "suggested" && (
                          <span className="shrink-0 text-[11px] font-semibold text-warning-strong">
                            اقتراح
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
                {!shown.length && (
                  <li className="px-3 py-4 text-sm text-text-muted">
                    {list === "open" ? "لا تسليمات بانتظار التصحيح." : "لا تسليمات مصححة بعد."}
                  </li>
                )}
              </ul>
            </Card>
          </nav>
          {/* Keyed by the submission: the next one slides in (review §2.6, sequential grading). */}
          <div key={id} className="motion-next space-y-4">
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-700">
                {initials(s.student.full_name_ar)}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-text">{s.student.full_name_ar}</b>
                <span className="text-xs text-text-muted">
                  <bdi>{s.student.university_number}</bdi> · الإصدار{" "}
                  {v.version_no.toLocaleString("ar-u-nu-latn")} · {when(v.submitted_at)}
                </span>
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${v.is_late ? "bg-warning-soft text-warning-strong" : "bg-success-soft text-success-strong"}`}
              >
                {v.is_late ? "متأخر" : "في الوقت"}
              </span>
            </Card>
            {v.content && (
              <Card className="p-4 text-sm leading-7 text-text">
                <p dir="auto" className="whitespace-pre-line">
                  {v.content}
                </p>
              </Card>
            )}
            {(((v.files as string[]) ?? []).length > 0 ||
              Object.keys((v.links as object) ?? {}).length > 0) && (
              <Card className="divide-y divide-border-soft">
                {((v.files as string[]) ?? []).map((f, i) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => openFile(f)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm text-primary hover:bg-surface-alt"
                  >
                    <Paperclip size={16} aria-hidden /> الملف{" "}
                    {(i + 1).toLocaleString("ar-u-nu-latn")}
                  </button>
                ))}
                {Object.entries((v.links as Record<string, string>) ?? {}).map(([k, url]) => (
                  <a
                    key={k}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-3 text-sm text-primary hover:bg-surface-alt"
                  >
                    {k} · <bdi>{url}</bdi>
                  </a>
                ))}
              </Card>
            )}
          </div>
          <aside className="mt-6 space-y-3 lg:mt-0">
            {s.grade?.status === "suggested" && (
              <Card className="space-y-2 bg-warning-soft p-4 text-sm text-warning-strong">
                <b>اقتراح آلي — {markOf(s.grade.score, max)} · يتطلب اعتمادك</b>
                {s.grade.feedback && <p>{s.grade.feedback}</p>}
                <Button
                  className="w-full"
                  onClick={() => approve.mutate()}
                  disabled={approve.isPending}
                >
                  اعتماد الاقتراح
                </Button>
              </Card>
            )}
            <SectionLabel>الدرجة من {max.toLocaleString("ar-u-nu-latn")}</SectionLabel>
            <Card className="space-y-3 p-4">
              <input
                inputMode="decimal"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                aria-label="الدرجة"
                className="block min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-center text-2xl font-bold"
                dir="ltr"
              />
              <div className="flex flex-wrap justify-center gap-1.5">
                {[
                  ...new Set(
                    [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0].map((f) => Math.round(max * f * 2) / 2),
                  ),
                ].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={score === String(n)}
                    onClick={() => setScore(String(n))}
                    className={`min-h-11 min-w-11 rounded-full border px-3 text-sm lg:min-h-9 lg:min-w-9 ${score === String(n) ? "border-text bg-text text-bg" : "border-border-soft hover:bg-surface-alt"}`}
                  >
                    {n.toLocaleString("ar-u-nu-latn")}
                  </button>
                ))}
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="ملاحظة للطالب (تظهر مع الدرجة)"
                aria-label="ملاحظة للطالب"
                className="block min-h-24 w-full rounded-lg border border-border bg-surface p-2 text-sm"
              />
              {(save.isError || approve.isError) && (
                <Notice>{problemMessage(save.error ?? approve.error)}</Notice>
              )}
              {save.isSuccess && !next && (
                <Notice tone="info">لا تسليمات أخرى بانتظارك هنا.</Notice>
              )}
              {/* Pinned above the phone's tab bar: grading is done one after another. */}
              <div
                data-dock
                className="sticky bottom-24 z-10 -mx-4 space-y-2 bg-surface px-4 py-2 lg:static lg:mx-0 lg:p-0"
              >
                <Button
                  className="min-h-11 w-full"
                  disabled={!valid || save.isPending}
                  onClick={() => save.mutate(true)}
                >
                  {save.isPending ? "جارٍ الحفظ…" : next ? "اعتماد وحفظ ثم التالي" : "اعتماد وحفظ"}
                </Button>
                {(previous || next) && (
                  <div className="flex gap-2">
                    {previous && (
                      <Button
                        variant="ghost"
                        className="min-h-11 flex-1"
                        onClick={() => navigate(`/submissions/${previous.public_id}`)}
                      >
                        السابق
                      </Button>
                    )}
                    {next && (
                      <Button
                        variant="ghost"
                        className="min-h-11 flex-1"
                        onClick={() => navigate(`/submissions/${next.public_id}`)}
                      >
                        تخطَّ
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <p className="hidden text-center text-xs text-text-muted lg:block">
                <kbd className="rounded border border-border-soft px-1">J</kbd> التالي ·{" "}
                <kbd className="rounded border border-border-soft px-1">K</kbd> السابق
              </p>
            </Card>
          </aside>
        </div>
      )}
    </PortalShell>
  );
}
