import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Notice,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";
import { when } from "../../lib/format";

type Inquiry = Schemas["Inquiry"];
const STATUS: Record<string, { label: string; tone: string }> = {
  new: { label: "جديد", tone: "new" },
  in_progress: { label: "قيد المعالجة", tone: "open" },
  waiting_for_user: { label: "بانتظار الزائر", tone: "pending" },
  resolved: { label: "تم الحل", tone: "approved" },
  closed: { label: "مغلق", tone: "closed" },
};
const TYPE: Record<string, string> = {
  admission: "القبول",
  programs: "البرامج",
  registration: "التسجيل",
  fees: "الرسوم",
  study: "الدراسة",
  technical: "تقني",
  general: "عام",
};
const TABS = [
  { key: "open", label: "بانتظار الرد" },
  { key: "waiting_for_user", label: "بانتظار الزائر" },
  { key: "late", label: "متأخرة" },
  { key: "closed", label: "مغلقة" },
];
const late = (i: Inquiry) =>
  !i.first_response_at && Date.now() - new Date(i.created_at).getTime() > 24 * 3_600_000;

/** Boards: AdminInquiries + AdminInquiry (phone), DesktopSiteInquiries (desktop: table + detail). */
export function Inquiries() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("open");
  const list = useQuery({
    queryKey: ["inquiries"],
    queryFn: async () => (await api.GET("/api/v1/inquiries")).data?.results ?? [],
  });
  const all = list.data ?? [];
  const shown = all.filter((i) =>
    tab === "late"
      ? late(i)
      : tab === "closed"
        ? ["resolved", "closed"].includes(i.status)
        : tab === "open"
          ? ["new", "in_progress"].includes(i.status)
          : i.status === tab,
  );
  const current = all.find((i) => i.public_id === id);

  return (
    <PortalShell
      title="الاستفسارات"
      subtitle="هدف الرد: 24 ساعة"
      back={id ? { label: "الاستفسارات", to: "/inquiries" } : undefined}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className={id ? "hidden lg:block" : ""}>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
            {TABS.map((t) => (
              <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}
              </Chip>
            ))}
          </div>
          {!shown.length ? (
            <Card className="mt-4">
              <EmptyState icon={<Inbox size={24} aria-hidden />} title="لا استفسارات هنا" />
            </Card>
          ) : (
            <Card className="mt-4 divide-y divide-border-soft">
              {shown.map((i) => (
                <button
                  key={i.public_id}
                  type="button"
                  onClick={() => navigate(`/inquiries/${i.public_id}`)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-surface-alt ${i.public_id === id ? "bg-primary-soft" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-text">
                        {(i.contact as { name: string }).name}
                      </span>
                      <span className="shrink-0 text-xs text-text-muted">{when(i.created_at)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-text-muted">
                      {i.subject} — {i.message}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <StatusBadge
                        status={STATUS[i.status]?.tone ?? "neutral"}
                        label={STATUS[i.status]?.label ?? i.status}
                      />
                      <StatusBadge status="neutral" label={TYPE[i.type] ?? i.type} />
                      {late(i) && <StatusBadge status="rejected" label="متأخر" />}
                    </span>
                  </span>
                </button>
              ))}
            </Card>
          )}
        </div>
        <div className={id ? "" : "hidden lg:block"}>
          {current ? (
            <InquiryDetail inquiry={current} />
          ) : (
            <Card className="hidden lg:block">
              <EmptyState icon={<Inbox size={24} aria-hidden />} title="اختر استفسارًا" />
            </Card>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

function InquiryDetail({ inquiry: i }: { inquiry: Inquiry }) {
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const done = () => {
    setBody("");
    void client.invalidateQueries({ queryKey: ["inquiries"] });
  };
  const path = { params: { path: { public_id: i.public_id } } };
  const reply = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/inquiries/{public_id}/reply", {
        ...path,
        body: { body, channel: internal ? "internal" : "email" },
      });
      if (!data) throw error;
    },
    onSuccess: done,
  });
  const whatsapp = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/inquiries/{public_id}/whatsapp", {
        ...path,
        body: { body },
      });
      if (!data) throw error;
      window.open(data.url, "_blank", "noopener");
    },
    onSuccess: done,
  });
  const move = useMutation({
    mutationFn: async (to: "resolved" | "waiting_for_user" | "in_progress" | "closed") => {
      const { data, error } = await api.POST("/api/v1/inquiries/{public_id}/transition", {
        ...path,
        body: { to, note: "" },
      });
      if (!data) throw error;
    },
    onSuccess: done,
  });
  const contact = i.contact as { name: string; email: string | null; phone_e164: string | null };
  const error = reply.error ?? whatsapp.error ?? move.error;
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-text">{contact.name}</p>
            <p className="text-xs text-text-muted" dir="ltr">
              {[contact.phone_e164, contact.email, i.reference_no].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {TYPE[i.type]}
              {i.department_name ? ` · ${i.department_name}` : ""} · {when(i.created_at)}
            </p>
          </div>
          <StatusBadge
            status={STATUS[i.status]?.tone ?? "neutral"}
            label={STATUS[i.status]?.label ?? i.status}
          />
        </div>
      </Card>
      <Card className="space-y-3 p-4">
        <Bubble who={contact.name} at={i.created_at} text={`${i.subject}\n${i.message}`} visitor />
        {i.messages.map((m) => (
          <Bubble
            key={m.id}
            who={m.author ?? contact.name}
            at={m.sent_at}
            text={m.body}
            visitor={!m.author}
            note={
              m.channel === "internal"
                ? "ملاحظة داخلية"
                : m.channel === "whatsapp_note"
                  ? "WhatsApp"
                  : m.channel === "email"
                    ? "بريد"
                    : undefined
            }
          />
        ))}
      </Card>
      <Card className="p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="اكتب الرد…"
          className="block min-h-28 w-full resize-y bg-transparent p-1 text-sm leading-relaxed text-text outline-none"
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="accent-[var(--color-primary)]"
          />{" "}
          ملاحظة داخلية (لا تصل للزائر)
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => reply.mutate()}
            disabled={!body.trim() || reply.isPending || (!internal && !contact.email)}
          >
            <Send size={16} aria-hidden className="rtl:-scale-x-100" />
            {internal ? "حفظ الملاحظة" : "رد بالبريد"}
          </Button>
          {contact.phone_e164 && (
            <Button
              variant="secondary"
              onClick={() => whatsapp.mutate()}
              disabled={!body.trim() || whatsapp.isPending}
            >
              <MessageCircle size={16} aria-hidden />
              WhatsApp
            </Button>
          )}
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        {i.status !== "waiting_for_user" && i.status !== "closed" && (
          <Button variant="secondary" onClick={() => move.mutate("waiting_for_user")}>
            بانتظار الزائر
          </Button>
        )}
        {i.status !== "resolved" && i.status !== "closed" && (
          <Button variant="secondary" onClick={() => move.mutate("resolved")}>
            تم الحل
          </Button>
        )}
        {(i.status === "resolved" || i.status === "closed") && (
          <Button variant="secondary" onClick={() => move.mutate("in_progress")}>
            إعادة فتح
          </Button>
        )}
      </div>
      {error && <Notice>{problemMessage(error)}</Notice>}
      <Link to="/inquiries" className="block text-center text-sm text-text-muted lg:hidden">
        العودة للقائمة
      </Link>
    </div>
  );
}

function Bubble({
  who,
  at,
  text,
  visitor,
  note,
}: {
  who: string;
  at: string;
  text: string;
  visitor?: boolean;
  note?: string;
}) {
  return (
    <div
      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${visitor ? "me-auto bg-surface-alt text-text" : "ms-auto bg-primary-soft text-text"}`}
    >
      <p className="whitespace-pre-line leading-relaxed" dir="auto">
        {text}
      </p>
      <p className="mt-1 text-[11px] text-text-muted">
        {who} · {when(at)}
        {note ? ` · ${note}` : ""}
      </p>
    </div>
  );
}
