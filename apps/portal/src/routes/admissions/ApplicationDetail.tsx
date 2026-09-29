import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
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
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { can } from "../../lib/nav";
import { STATUS_LABEL, STATUS_TONE } from "../../lib/visitor";

const ACTION: Record<string, string> = {
  under_review: "بدء المراجعة",
  missing_documents: "طلب مستندات",
  eligible: "مؤهل",
  accepted: "قبول",
  rejected: "رفض",
  waitlisted: "قائمة الانتظار",
};

/** Board: DesktopApplicationDetail (desktop); phone derived (AdminApplication). */
export function ApplicationDetail() {
  const { id = "" } = useParams();
  const me = useMe();
  const client = useQueryClient();
  const path = { params: { path: { public_id: id } } };
  const app = useQuery({
    queryKey: ["applications", id],
    queryFn: async () => ok(await api.GET("/api/v1/applications/{public_id}", path)) ?? null,
  });
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const done = () => {
    setNote("");
    setMessage("");
    void client.invalidateQueries({ queryKey: ["applications"] });
  };
  const act = useMutation({
    mutationFn: async (kind: string) => {
      const res =
        kind === "claim"
          ? await api.POST("/api/v1/applications/{public_id}/claim", path)
          : kind === "register"
            ? await api.POST("/api/v1/applications/{public_id}/register", path)
            : kind.startsWith("msg:")
              ? await api.POST("/api/v1/applications/{public_id}/messages", {
                  ...path,
                  body: { body: message, channel: kind === "msg:email" ? "email" : "internal" },
                })
              : await api.POST("/api/v1/applications/{public_id}/transition", {
                  ...path,
                  body: { to: kind as never, note },
                });
      if (!res.data) throw res.error;
    },
    onSuccess: done,
  });
  const review = useMutation({
    mutationFn: async ({ doc, status }: { doc: string; status: "accepted" | "rejected" }) => {
      const { data, error } = await api.POST(
        "/api/v1/applications/{public_id}/documents/{document_id}/review",
        { params: { path: { public_id: id, document_id: doc } }, body: { status, note } },
      );
      if (!data) throw error;
    },
    onSuccess: done,
  });
  const openDoc = async (doc: string) => {
    const { data } = await api.GET(
      "/api/v1/applications/{public_id}/documents/{document_id}/link",
      { params: { path: { public_id: id, document_id: doc } } },
    );
    if (data) window.open(data.url, "_blank", "noopener");
  };
  const a = app.data;
  const reviewer = !!a?.documents;
  const open = !!a && (a.allowed_transitions.length > 0 || a.status === "accepted");
  return (
    <PortalShell
      title={a?.full_name ?? "طلب"}
      subtitle={a ? `${a.reference_no} · ${a.program_name} · ${a.cycle_name}` : undefined}
      back={{ label: "الطلبات", to: "/applications" }}
    >
      {a && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
          <div className="space-y-4">
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <StatusBadge
                status={STATUS_TONE[a.status] ?? "neutral"}
                label={STATUS_LABEL[a.status] ?? a.status}
              />
              <span className="text-sm text-text-muted">
                المسجل: {a.assigned_registrar_name ?? "غير موزع"}
              </span>
              {a.university_number && (
                <span className="text-sm font-semibold text-success-strong" dir="ltr">
                  {a.university_number}
                </span>
              )}
            </Card>
            {reviewer ? (
              <>
                <SectionLabel>البيانات</SectionLabel>
                <Card className="divide-y divide-border-soft text-sm">
                  {[
                    ["البريد", a.email],
                    ["الهاتف", a.phone_e164 || "—"],
                    ...Object.entries((a.answers ?? {}) as Record<string, unknown>).map(
                      ([k, v]) => [a.labels[k] ?? k, Array.isArray(v) ? v.join("، ") : String(v)],
                    ),
                  ].map(([k, v]: string[]) => (
                    <div key={k} className="flex justify-between gap-3 px-4 py-2.5">
                      <span className="text-text-muted">{k}</span>
                      <bdi className="font-medium text-text">{v}</bdi>
                    </div>
                  ))}
                </Card>
                <SectionLabel>المستندات · {(a.documents ?? []).length}</SectionLabel>
                <Card className="divide-y divide-border-soft">
                  {(a.documents ?? []).map((d) => (
                    <div
                      key={d.public_id}
                      className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => openDoc(d.public_id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-start hover:text-primary"
                      >
                        <FileText size={18} className="shrink-0 text-text-muted" aria-hidden />
                        <span className="min-w-0">
                          <span className="block font-medium text-text">
                            {a.labels[d.doc_type] ?? d.doc_type}
                          </span>
                          <span className="block truncate text-xs text-text-muted">
                            {d.name}
                            {d.note ? ` · ${d.note}` : ""}
                          </span>
                        </span>
                      </button>
                      <StatusBadge
                        status={
                          d.status === "accepted"
                            ? "approved"
                            : d.status === "rejected"
                              ? "rejected"
                              : "pending"
                        }
                        label={
                          d.status === "accepted"
                            ? "مقبول"
                            : d.status === "rejected"
                              ? "مرفوض"
                              : "للمراجعة"
                        }
                      />
                      {open && d.status !== "accepted" && (
                        <Button
                          variant="secondary"
                          className="min-h-8 px-3 text-xs"
                          onClick={() => review.mutate({ doc: d.public_id, status: "accepted" })}
                        >
                          قبول
                        </Button>
                      )}
                      {open && d.status !== "rejected" && (
                        <Button
                          variant="secondary"
                          className="min-h-8 px-3 text-xs text-danger-strong"
                          onClick={() => review.mutate({ doc: d.public_id, status: "rejected" })}
                        >
                          رفض
                        </Button>
                      )}
                    </div>
                  ))}
                </Card>
              </>
            ) : (
              <Notice tone="info">
                يعرض مدير القسم الأسماء والحالات فقط؛ البيانات والمستندات للمسجلين.
              </Notice>
            )}
            <SectionLabel>السجل</SectionLabel>
            <Card className="divide-y divide-border-soft text-sm">
              {a.history.map((h, i) => (
                <p key={i} className="px-4 py-2.5">
                  <b className="text-text">{STATUS_LABEL[h.to_status] ?? h.to_status}</b>
                  <span className="text-xs text-text-muted">
                    {" "}
                    · {h.changed_by ?? "المتقدم/النظام"} · {when(h.at)}
                  </span>
                  {h.note && <span className="block text-text-muted">{h.note}</span>}
                </p>
              ))}
            </Card>
            {reviewer && a.messages && a.messages.length > 0 && (
              <>
                <SectionLabel>الرسائل</SectionLabel>
                <Card className="space-y-2 p-4">
                  {a.messages.map((m) => (
                    <p
                      key={m.id}
                      className={`rounded-lg p-2.5 text-sm ${m.author ? "bg-primary-soft" : "bg-surface-alt"}`}
                    >
                      {m.author ?? a.full_name} ·{" "}
                      {m.channel === "internal"
                        ? "داخلي"
                        : m.channel === "email"
                          ? "بريد"
                          : "من المتقدم"}
                      : {m.body}
                    </p>
                  ))}
                </Card>
              </>
            )}
          </div>
          {reviewer && (
            <aside className="mt-6 space-y-4 lg:mt-0">
              {open && (
                <Card className="space-y-3 p-4">
                  {!a.assigned_registrar_name && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => act.mutate("claim")}
                    >
                      تولّي الطلب
                    </Button>
                  )}
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="ملاحظة الانتقال (إلزامية لطلب مستندات)"
                    className="block min-h-20 w-full rounded-lg border border-border bg-surface p-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    {a.allowed_transitions.map((t) => (
                      <Button
                        key={t}
                        variant={t === "rejected" ? "secondary" : "primary"}
                        className={t === "rejected" ? "text-danger-strong" : ""}
                        onClick={() => act.mutate(t)}
                        disabled={act.isPending}
                      >
                        {ACTION[t] ?? t}
                      </Button>
                    ))}
                  </div>
                  {a.status === "accepted" && can(me.data, "admissions.manage") && (
                    <Button className="w-full" onClick={() => act.mutate("register")}>
                      تحويل إلى طالب وإصدار الرقم الجامعي
                    </Button>
                  )}
                </Card>
              )}
              <Card className="space-y-2 p-4">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="رسالة للمتقدم أو ملاحظة داخلية"
                  className="block min-h-20 w-full rounded-lg border border-border bg-surface p-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button onClick={() => act.mutate("msg:email")} disabled={!message.trim()}>
                    إرسال بالبريد
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => act.mutate("msg:internal")}
                    disabled={!message.trim()}
                  >
                    ملاحظة داخلية
                  </Button>
                </div>
              </Card>
              {(act.isError || review.isError) && (
                <Notice>{problemMessage(act.error ?? review.error)}</Notice>
              )}
            </aside>
          )}
        </div>
      )}
    </PortalShell>
  );
}
