import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";

import { api } from "../lib/api";
import { FormDialog } from "./FormDialog";
import { Card, Field, Notice, problemMessage } from "./ui";

const number = (n: number) => n.toLocaleString("ar-u-nu-latn");

/**
 * A department's or a programme's head asks the system admin to delete students, or a course,
 * with everything they hold (owner, 2026-11-15). Nothing changes until the admin decides; the
 * head follows the request on «طلبات الحذف التي أرسلتها». Rendered at the end of the page, outside
 * any form (a form inside another submits the outer one).
 */
export function RequestDeletionDialog(props: {
  kind: "student" | "course";
  ids: string[];
  /** What is asked for, as the head knows it («أحمد علي» or «3 طلاب»). */
  what: string;
  onSent: () => void;
  onClose: () => void;
}) {
  return createPortal(<Dialog {...props} />, document.body);
}

function Dialog({
  kind,
  ids,
  what,
  onSent,
  onClose,
}: {
  kind: "student" | "course";
  ids: string[];
  what: string;
  onSent: () => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/deletion-requests/records", {
        body: { kind, ids, reason: reason.trim() },
      });
      if (!data) throw error;
      return data;
    },
    onSuccess: onSent,
    onError: (error) => setProblem(problemMessage(error)),
  });
  if (send.data) {
    return (
      <FormDialog title="أُرسل طلب الحذف" submit="إغلاق" onSubmit={onClose} onClose={onClose}>
        <Notice tone="success">
          وصل طلبك إلى مدير النظام. لا يتغيّر شيء حتى يقرر، ويصلك إشعار بقراره.
        </Notice>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {Object.entries(send.data.preview ?? {}).map(([label, n]) => (
            <li key={label} className="flex justify-between border-b border-border-soft py-1">
              <span className="text-text-muted">{label}</span>
              <b>{number(Number(n))}</b>
            </li>
          ))}
        </ul>
        <Link to="/deletion-requests" className="text-sm font-semibold text-primary">
          طلبات الحذف التي أرسلتها
        </Link>
      </FormDialog>
    );
  }
  return (
    <FormDialog
      title={`طلب حذف ${what}`}
      submit={send.isPending ? "جارٍ الإرسال…" : "أرسل الطلب"}
      tone="danger"
      busy={send.isPending}
      onSubmit={() => {
        if (!reason.trim()) return setProblem("اكتب سبب الحذف: يقرأه مدير النظام قبل أن يقرر.");
        setProblem("");
        send.mutate();
      }}
      onClose={onClose}
    >
      <Notice tone="warning">
        إن وافق مدير النظام يُحذف {kind === "course" ? "المادة" : what} مع كل ما يرتبط به: التسجيلات
        والنتائج والتسليمات{kind === "course" ? " والمحاضرات والواجبات والاختبارات" : ""}. والحذف
        نهائي.
      </Notice>
      <Card>
        <Field
          label="سبب الحذف"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Card>
      {problem && <Notice>{problem}</Notice>}
    </FormDialog>
  );
}
