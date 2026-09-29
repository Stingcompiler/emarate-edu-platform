import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, SectionLabel, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when } from "../../lib/format";
import { initials } from "../../lib/reports";
import { openFile } from "../../lib/learning";
import { ALL } from "../../components/Pager";

/** Board: TeacherGradeSubmission (phone); desktop derived — work on the right, grade panel on the left. */
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
  const next = queue.find((x) => x.public_id !== id);
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
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
          <div className="space-y-4">
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-700">
                {initials(s.student.full_name_ar)}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-text">{s.student.full_name_ar}</b>
                <span className="text-xs text-text-muted">
                  <bdi>{s.student.university_number}</bdi> · الإصدار{" "}
                  {v.version_no.toLocaleString("ar")} · {when(v.submitted_at)}
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
                    <Paperclip size={16} aria-hidden /> الملف {(i + 1).toLocaleString("ar")}
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
                <b>
                  اقتراح آلي — {Number(s.grade.score).toLocaleString("ar")} /{" "}
                  {max.toLocaleString("ar")} · يتطلب اعتمادك
                </b>
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
            <SectionLabel>الدرجة من {max.toLocaleString("ar")}</SectionLabel>
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
                {[max, max * 0.9, max * 0.8, max * 0.7, max * 0.5]
                  .map((n) => Math.round(n * 2) / 2)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScore(String(n))}
                      className="rounded-full border border-border-soft px-2.5 py-1 text-xs hover:bg-surface-alt"
                    >
                      {n.toLocaleString("ar")}
                    </button>
                  ))}
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="ملاحظة للطالب (تظهر مع الدرجة)"
                className="block min-h-24 w-full rounded-lg border border-border bg-surface p-2 text-sm"
              />
              {(save.isError || approve.isError) && (
                <Notice>{problemMessage(save.error ?? approve.error)}</Notice>
              )}
              <Button
                className="w-full"
                disabled={!valid || save.isPending}
                onClick={() => save.mutate(true)}
              >
                {next ? "اعتماد وحفظ ثم التالي" : "اعتماد وحفظ"}
              </Button>
              {next && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate(`/submissions/${next.public_id}`)}
                >
                  تخطٍّ
                </Button>
              )}
            </Card>
          </aside>
        </div>
      )}
    </PortalShell>
  );
}
