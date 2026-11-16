import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { api, ok } from "../lib/api";
import { FormDialog } from "./FormDialog";
import { Card, Field, Notice, PasswordField, problemMessage } from "./ui";

export type DeletionKind = "student" | "course" | "program" | "department";

const WHAT: Record<DeletionKind, [string, string]> = {
  student: ["الطالب", "الطلاب"],
  course: ["المادة", "المواد"],
  program: ["البرنامج", "البرامج"],
  department: ["القسم", "الأقسام"],
};

const number = (n: number) => n.toLocaleString("ar-u-nu-latn");

/**
 * The system admin deletes a student, many students, a course, a programme or a department **with
 * everything it holds** (owner, 2026-11-15; core.deletions). First what goes, counted by the
 * server, then the confirmation: what is shown typed again (the student's number, the course's
 * code, the department's name, or how many students) and the admin's own password. A
 * department, and more than 50 students, are deleted by the worker after a backup: the dialog
 * follows the job to the end.
 */
/** Shown at the end of the page, outside any form: the dialog is a form of its own, and a form
 * inside another (the department's editor) would submit the outer one instead. */
export function DeleteEverythingDialog(props: Parameters<typeof Dialog>[0]): ReactNode {
  return createPortal(<Dialog {...props} />, document.body);
}

function Dialog({
  kind,
  ids,
  requestId,
  onDone,
  onClose,
}: {
  kind: DeletionKind;
  ids: string[];
  /** A head's request this deletion approves (approved only once the rows are gone). */
  requestId?: number;
  /** After a deletion that went through (the rows are gone). */
  onDone: () => void;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState("");
  const [job, setJob] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Record<string, number> | null>(null);
  const preview = useQuery({
    queryKey: ["deletion-preview", kind, ids],
    queryFn: async () =>
      ok(await api.POST("/api/v1/deletions/preview", { body: { kind, ids } })) ?? null,
    retry: false,
    staleTime: 0,
    meta: { silent: true },
  });
  const progress = useQuery({
    queryKey: ["deletion-job", job],
    enabled: !!job,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/deletions/jobs/{job_id}", { params: { path: { job_id: job! } } }),
      ) ?? null,
    refetchInterval: (query) =>
      query.state.data?.state === "done" || query.state.data?.state === "failed" ? false : 2000,
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/deletions", {
        body: { kind, ids, confirm: confirm.trim(), password, reason, request: requestId ?? null },
      });
      if (!data) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.job) setJob(data.job.id);
      else {
        setRemoved(data.removed ?? {});
        onDone();
      }
    },
    onError: (error) => setProblem(problemMessage(error)),
  });
  const shown = preview.data;
  const many = ids.length > 1;
  const [one, several] = WHAT[kind];
  const title = many ? `حذف ${number(ids.length)} من ${several}` : `حذف ${one} وكل ما يرتبط به`;
  const finished = progress.data?.state === "done";
  const finishedWith = progress.data?.removed;
  useEffect(() => {
    if (finished && !removed) {
      setRemoved(finishedWith ?? {});
      onDone();
    }
  }, [finished, finishedWith, removed, onDone]);

  if (removed || job) {
    const failed = progress.data?.state === "failed";
    return (
      <FormDialog title={title} submit="إغلاق" onSubmit={onClose} onClose={onClose}>
        {removed ? (
          <Notice tone="success">
            حُذف ما يلي:{" "}
            {Object.entries(removed)
              .map(([k, n]) => `${k} ${number(n)}`)
              .join("، ")}
            .
            {progress.data?.backup
              ? ` وقبل الحذف أُخذت نسخة احتياطية ${progress.data.backup}.`
              : ""}
          </Notice>
        ) : failed ? (
          <Notice>{progress.data?.error}</Notice>
        ) : (
          <Notice tone="info">
            {progress.data?.state === "running"
              ? "تُؤخذ نسخة احتياطية ثم يُحذف… قد يستغرق ذلك دقائق، ويمكنك إغلاق هذه النافذة."
              : "في الانتظار…"}
          </Notice>
        )}
      </FormDialog>
    );
  }

  const submit = () => {
    if (!shown) return;
    if (confirm.trim() !== shown.confirm)
      return setProblem(`اكتب «${shown.confirm}» كما هو للتأكيد.`);
    if (!password) return setProblem("اكتب كلمة مرورك في المنصة للتأكيد.");
    setProblem("");
    remove.mutate();
  };
  return (
    <FormDialog
      title={title}
      submit={remove.isPending ? "جارٍ الحذف…" : "احذف نهائيًا"}
      tone="danger"
      busy={remove.isPending || !shown}
      onSubmit={submit}
      onClose={onClose}
    >
      {preview.isError ? (
        <Notice>{problemMessage(preview.error)}</Notice>
      ) : !shown ? (
        <p className="text-sm text-text-muted">يُحسب ما سيُحذف…</p>
      ) : (
        <>
          <Notice tone="warning">
            <b>الحذف نهائي.</b> يُحذف {many ? several : one} ومعه كل ما يلي، ولا يُستعاد إلا
            باستعادة نسخة احتياطية تُرجع المنصة كلها إلى الخلف.
          </Notice>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" data-deletion-counts>
            {Object.entries(shown.counts).map(([label, n]) => (
              <li key={label} className="flex justify-between border-b border-border-soft py-1">
                <span className="text-text-muted">{label}</span>
                <b>{number(n)}</b>
              </li>
            ))}
          </ul>
          {!many && <p className="text-sm font-semibold">{shown.items[0]?.name}</p>}
          {shown.backup && (
            <p className="text-sm leading-6 text-text-muted">
              تُؤخذ نسخة احتياطية من المنصة كلها قبل الحذف، ويُرفض الحذف إن تعذّرت.
            </p>
          )}
          <Card>
            <Field
              label="السبب (يُحفظ في سجل العمليات)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <Field
              label={`اكتب «${shown.confirm}» للتأكيد`}
              autoComplete="off"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            <PasswordField
              label="كلمة مرورك في المنصة"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Card>
          <p className="text-xs leading-6 text-text-muted">
            يبقى في سجل العمليات نسخة مما حُذف، منها سجل الطالب الدراسي، يقرؤها مدير النظام.
          </p>
        </>
      )}
      {problem && <Notice>{problem}</Notice>}
    </FormDialog>
  );
}
