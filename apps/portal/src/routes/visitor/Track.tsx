import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  Button,
  Card,
  Notice,
  SectionLabel,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { when, count, N } from "../../lib/format";
import { asForm, formData } from "../../lib/upload";
import {
  maskEmail,
  readSession,
  saveSession,
  STATUS_LABEL,
  STATUS_TONE,
  type VisitorSession,
  visitorApi,
} from "../../lib/visitor";
import { VerifyEmail } from "./VerifyEmail";
import { VisitorLayout } from "./VisitorLayout";

type App = {
  public_id: string;
  reference_no: string;
  program_name: string;
  status: string;
  submitted_at: string | null;
  can_edit: boolean;
  history: { to_status: string; note: string; at: string }[];
  messages: { id: number; from_college: boolean; body: string; sent_at: string }[];
  required_documents: { key: string; label: string; required?: boolean }[];
  documents: { doc_type: string; name: string }[];
};
type Inq = {
  public_id: string;
  reference_no: string;
  subject: string;
  status: string;
  status_label: string;
  created_at: string;
  messages: { from_college: boolean; body: string; sent_at: string }[];
};
const STAGES = [
  "submitted",
  "under_review",
  "missing_documents",
  "eligible",
  "accepted",
  "registered",
];
const STAGE_LABEL = ["مُقدَّم", "مراجعة", "ناقص", "مؤهل", "قرار", "تسجيل"];

/** Board: VisitorTrack (phone); desktop: the same list in the 800px public column. */
export function Track() {
  const [session, setSession] = useState<VisitorSession | null>(readSession);
  useEffect(() => {
    document.title = "متابعة طلبي — كلية الإمارات";
  }, []);
  const me = useQuery({
    queryKey: ["visitor", "me", session?.token],
    enabled: !!session,
    queryFn: async () => {
      const { data, response } = await visitorApi.GET("/api/visitor/me");
      if (response.status === 401) {
        saveSession(null);
        setSession(null);
        return null;
      }
      return data as unknown as { name: string; applications: App[]; inquiries: Inq[] };
    },
  });
  if (!session) {
    return (
      <VisitorLayout title="متابعة طلبي" step="تحقق من بريدك لترى طلباتك واستفساراتك">
        <VerifyEmail onVerified={setSession} />
      </VisitorLayout>
    );
  }
  const data = me.data;
  const minutes = Math.max(
    0,
    Math.round((new Date(session.expires_at).getTime() - Date.now()) / 60_000),
  );
  return (
    <VisitorLayout title="طلباتي" step={`جلسة متحققة · ${count(minutes, N.minute)}`}>
      <p className="text-sm text-text-muted" dir="auto">
        {maskEmail(session.email)} — تحققنا برمز أُرسل إلى بريدك
      </p>
      {data && !data.applications.length && !data.inquiries.length && (
        <Card className="mt-4 p-5 text-center text-sm text-text-muted">
          لا طلبات أو استفسارات بهذا البريد.{" "}
          <Link to="/apply" className="font-semibold text-primary">
            قدّم الآن
          </Link>
        </Card>
      )}
      {data?.applications.map((a) => (
        <ApplicationCard key={a.public_id} app={a} />
      ))}
      {data && data.inquiries.length > 0 && <SectionLabel>استفساراتي</SectionLabel>}
      {data?.inquiries.map((i) => (
        <InquiryCard key={i.public_id} inquiry={i} />
      ))}
    </VisitorLayout>
  );
}

function ApplicationCard({ app }: { app: App }) {
  const client = useQueryClient();
  const [reply, setReply] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: ["visitor", "me"] });
  const upload = useMutation({
    mutationFn: async ({ key, file }: { key: string; file: File }) => {
      const { data, error } = await visitorApi.POST(
        "/api/visitor/applications/{public_id}/documents",
        {
          params: { path: { public_id: app.public_id } },
          body: formData({ doc_type: key, file }) as never,
          ...asForm,
        },
      );
      if (!data) throw error;
    },
    onSuccess: refresh,
  });
  const resubmit = useMutation({
    mutationFn: async () => {
      const { data, error } = await visitorApi.POST(
        "/api/visitor/applications/{public_id}/submit",
        { params: { path: { public_id: app.public_id } } },
      );
      if (!data) throw error;
    },
    onSuccess: refresh,
  });
  const send = useMutation({
    mutationFn: async () => {
      const { response, error } = await visitorApi.POST(
        "/api/visitor/applications/{public_id}/messages",
        { params: { path: { public_id: app.public_id } }, body: { body: reply } },
      );
      if (!response.ok) throw error;
    },
    onSuccess: () => {
      setReply("");
      void refresh();
    },
  });
  const stage = STAGES.indexOf(
    app.status === "waitlisted" || app.status === "accepted" || app.status === "rejected"
      ? "accepted"
      : app.status === "activated"
        ? "registered"
        : app.status,
  );
  const lastNote = [...app.history]
    .reverse()
    .find((h) => h.to_status === "missing_documents")?.note;
  const lastMessage = [...app.messages].reverse().find((m) => m.from_college);
  return (
    <Card className="mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-text-muted" dir="ltr">
            {app.reference_no}
          </p>
          <p className="font-bold text-text">{app.program_name}</p>
          {app.submitted_at && (
            <p className="text-xs text-text-muted">قُدِّم {when(app.submitted_at)}</p>
          )}
        </div>
        <StatusBadge
          status={STATUS_TONE[app.status] ?? "neutral"}
          label={STATUS_LABEL[app.status] ?? app.status}
        />
      </div>
      {app.status === "draft" ? (
        <Link to={`/apply?app=${app.public_id}`} className="mt-3 block">
          <Button variant="secondary" className="w-full">
            إكمال الطلب
          </Button>
        </Link>
      ) : (
        <ol className="mt-4 grid grid-cols-6 gap-1" aria-label="مراحل الطلب">
          {STAGE_LABEL.map((label, i) => (
            <li key={label} className="text-center">
              <span
                className={`block h-1.5 rounded-full ${i <= stage ? (app.status === "rejected" && i === stage ? "bg-danger" : "bg-primary") : "bg-surface-alt"}`}
              />
              <span className="mt-1 block text-[11px] text-text-muted">{label}</span>
            </li>
          ))}
        </ol>
      )}
      {app.status === "missing_documents" && (
        <div className="mt-4 space-y-3 rounded-xl bg-warning-soft p-3">
          <p className="text-sm font-semibold text-warning-strong">مطلوب منك: {lastNote}</p>
          {app.required_documents.map((d) => (
            <label
              key={d.key}
              className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg bg-surface px-3 text-sm"
            >
              <span>
                {d.label}
                {app.documents.some((x) => x.doc_type === d.key) ? " · مرفوع ✓" : ""}
              </span>
              <span className="text-primary">رفع</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={(e) =>
                  e.target.files?.[0] && upload.mutate({ key: d.key, file: e.target.files[0] })
                }
              />
            </label>
          ))}
          <Button
            className="w-full"
            onClick={() => resubmit.mutate()}
            disabled={resubmit.isPending}
          >
            إعادة الإرسال للمراجعة
          </Button>
        </div>
      )}
      {lastMessage && (
        <p className="mt-3 rounded-lg bg-surface-alt p-3 text-sm leading-relaxed text-text">
          مسجل القسم · {when(lastMessage.sent_at)} — «{lastMessage.body}»
        </p>
      )}
      {!["withdrawn", "expired", "rejected", "activated"].includes(app.status) && (
        <div className="mt-3 flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="الرد على المسجل"
            className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <Button
            variant="secondary"
            onClick={() => send.mutate()}
            disabled={!reply.trim() || send.isPending}
          >
            إرسال
          </Button>
        </div>
      )}
      {(upload.isError || resubmit.isError || send.isError) && (
        <div className="mt-2">
          <Notice>{problemMessage(upload.error ?? resubmit.error ?? send.error)}</Notice>
        </div>
      )}
    </Card>
  );
}

function InquiryCard({ inquiry: i }: { inquiry: Inq }) {
  const client = useQueryClient();
  const [reply, setReply] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      const { response, error } = await visitorApi.POST(
        "/api/visitor/inquiries/{public_id}/messages",
        { params: { path: { public_id: i.public_id } }, body: { body: reply } },
      );
      if (!response.ok) throw error;
    },
    onSuccess: () => {
      setReply("");
      void client.invalidateQueries({ queryKey: ["visitor", "me"] });
    },
  });
  return (
    <Card className="mt-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-text-muted" dir="ltr">
            {i.reference_no}
          </p>
          <p className="font-semibold text-text">{i.subject}</p>
        </div>
        <StatusBadge status="open" label={i.status_label} />
      </div>
      {i.messages.map((m, n) => (
        <p
          key={n}
          className={`mt-2 rounded-lg p-2.5 text-sm ${m.from_college ? "bg-primary-soft" : "bg-surface-alt"}`}
        >
          {m.from_college ? "الكلية: " : "أنت: "}
          {m.body}
        </p>
      ))}
      {i.status !== "closed" && (
        <div className="mt-3 flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="ردك"
            className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <Button
            variant="secondary"
            onClick={() => send.mutate()}
            disabled={!reply.trim() || send.isPending}
          >
            إرسال
          </Button>
        </div>
      )}
    </Card>
  );
}
