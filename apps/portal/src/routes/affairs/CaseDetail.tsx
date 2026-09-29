import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Field,
  Notice,
  SectionLabel,
  StatusBadge,
  STATUS_LABELS,
  TextArea,
  problemMessage,
  SideNote,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { can } from "../../lib/nav";
import { EVENTS, KIND, KindTile } from "./Cases";

/** Board: StudentAffairsStudent (case timeline) — phone; desktop derived: details beside actions. */
export function CaseDetail() {
  const { id = "" } = useParams();
  const me = useMe();
  const client = useQueryClient();
  const manager = can(me.data, "cases.manage");
  const path = { params: { path: { public_id: id } } };
  const data = useQuery({
    queryKey: ["cases", id],
    queryFn: async () => ok(await api.GET("/api/v1/cases/{public_id}", path)) ?? null,
  });
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState("");
  const [sanction, setSanction] = useState("");

  const act = useMutation({
    mutationFn: async (kind: "note" | "decide" | "publish" | "close" | "reopen") => {
      const call =
        kind === "note"
          ? api.POST("/api/v1/cases/{public_id}/notes", { ...path, body: { note } })
          : kind === "decide"
            ? api.POST("/api/v1/cases/{public_id}/decide", {
                ...path,
                body: { decision, sanction },
              })
            : api.POST(`/api/v1/cases/{public_id}/${kind}`, path);
      const { error, response } = await call;
      if (!response.ok) throw error;
    },
    onSuccess: () => {
      setNote("");
      void client.invalidateQueries({ queryKey: ["cases"] });
    },
  });

  const c = data.data;
  return (
    <PortalShell
      title={c?.title ?? "حالة"}
      back={{ label: "الحالات", to: "/cases" }}
      subtitle={c ? `${c.student.full_name_ar} · ${c.student.university_number}` : undefined}
    >
      {c && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
          <div>
            <Card className="flex items-center gap-3 p-4">
              <KindTile kind={c.kind} />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-text">
                  {KIND[c.kind as keyof typeof KIND]?.label}
                </p>
                <p className="text-text-muted">
                  {c.published_to_student ? "منشورة للطالب" : "داخلية — لم تُنشر للطالب"}
                </p>
              </div>
              <StatusBadge status={c.status} label={STATUS_LABELS[c.status] ?? c.status} />
            </Card>
            {c.description && (
              <Card className="mt-3 p-4 text-sm leading-relaxed text-text">{c.description}</Card>
            )}
            {c.decision && (
              <Card className="mt-3 p-4 text-sm">
                <p className="text-xs text-text-muted">القرار</p>
                <p className="mt-1 font-semibold text-text">{c.decision}</p>
                {c.sanction && <p className="mt-1 text-text-muted">العقوبة: {c.sanction}</p>}
              </Card>
            )}
            <SectionLabel>السجل</SectionLabel>
            <Card>
              <ol className="divide-y divide-border-soft">
                {c.events.map((e, i) => (
                  <li key={i} className="px-4 py-3 text-sm">
                    <span className="font-semibold text-text">{EVENTS[e.kind] ?? e.kind}</span>
                    <span className="text-xs text-text-muted">
                      {" "}
                      · {e.by} · {when(e.at)}
                    </span>
                    {e.note && <p className="mt-1 leading-relaxed text-text-muted">{e.note}</p>}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
          {!manager && (
            <aside className="mt-6 lg:mt-0">
              <SideNote title="للاطلاع">
                يضيف أمين شؤون الطلاب الملاحظات ويتخذ القرار. يرى الطالب الحالة وقرارها فقط عند
                نشرها له.
              </SideNote>
            </aside>
          )}
          {manager && (
            <aside className="mt-6 space-y-4 lg:mt-0">
              <Card>
                <TextArea
                  label="ملاحظة داخلية"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="p-3">
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={!note.trim() || act.isPending}
                    onClick={() => act.mutate("note")}
                  >
                    إضافة ملاحظة
                  </Button>
                </div>
              </Card>
              {c.status !== "closed" && (
                <Card>
                  <TextArea
                    label="القرار"
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  />
                  <Field
                    label="العقوبة (اختيارية)"
                    value={sanction}
                    onChange={(e) => setSanction(e.target.value)}
                  />
                  <div className="p-3">
                    <Button
                      className="w-full"
                      disabled={!decision.trim() || act.isPending}
                      onClick={() => act.mutate("decide")}
                    >
                      تسجيل القرار
                    </Button>
                  </div>
                </Card>
              )}
              <div className="flex flex-wrap gap-2">
                {!c.published_to_student && c.decision && (
                  <Button onClick={() => act.mutate("publish")} disabled={act.isPending}>
                    نشر للطالب
                  </Button>
                )}
                {c.status === "closed" ? (
                  <Button
                    variant="secondary"
                    onClick={() => act.mutate("reopen")}
                    disabled={act.isPending}
                  >
                    إعادة فتح
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => act.mutate("close")}
                    disabled={act.isPending}
                  >
                    إقفال
                  </Button>
                )}
              </div>
              {act.isError && <Notice>{problemMessage(act.error)}</Notice>}
            </aside>
          )}
        </div>
      )}
    </PortalShell>
  );
}
