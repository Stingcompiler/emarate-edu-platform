import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  CodeTile,
  EmptyState,
  Notice,
  StatusBadge,
  STATUS_LABELS,
  problemMessage,
  splitCode,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { can } from "../../lib/nav";

type Correction = Schemas["Correction"];
type Tab = "pending" | "approved" | "rejected";

/** Board: ResultsOfficerCorrections (phone). Desktop: derived — the same list, wider. */
export function Corrections() {
  const me = useMe();
  const approver = can(me.data, "results.approve");
  const [tab, setTab] = useState<Tab>("pending");
  const list = useQuery({
    queryKey: ["result-corrections"],
    queryFn: async () => (await api.GET("/api/v1/result-corrections")).data?.results ?? [],
  });
  const all = list.data ?? [];
  const shown = all.filter((c) => c.status === tab);
  const count = (status: Tab) => all.filter((c) => c.status === status).length;

  return (
    <PortalShell
      title="طلبات التعديل"
      subtitle="تُنفَّذ فقط بعد موافقة أمين الشؤون العلمية، وتظهر القيمتان في سجل النتيجة."
    >
      <div className="max-w-3xl">
        <div className="flex gap-2">
          <Chip active={tab === "pending"} onClick={() => setTab("pending")}>
            معلّقة {count("pending")}
          </Chip>
          <Chip active={tab === "approved"} onClick={() => setTab("approved")}>
            مقبولة {count("approved")}
          </Chip>
          <Chip active={tab === "rejected"} onClick={() => setTab("rejected")}>
            مرفوضة {count("rejected")}
          </Chip>
        </div>
        {!shown.length ? (
          <Card className="mt-4">
            <EmptyState icon={<ClipboardCheck size={24} aria-hidden />} title="لا طلبات هنا" />
          </Card>
        ) : (
          <Card className="mt-4 divide-y divide-border-soft">
            {shown.map((c) => (
              <CorrectionRow key={c.public_id} correction={c} approver={approver} />
            ))}
          </Card>
        )}
      </div>
    </PortalShell>
  );
}

function CorrectionRow({ correction: c, approver }: { correction: Correction; approver: boolean }) {
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: async (approve: boolean) => {
      const { data, error } = await api.POST("/api/v1/result-corrections/{public_id}/decide", {
        params: { path: { public_id: c.public_id } },
        body: { approve, note },
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["result-corrections"] }),
  });
  const [top, bottom] = splitCode(c.result.course_code);
  const oldScore = (c.old as { score?: string | null }).score ?? "—";
  const newScore = (c.new as { score?: string | null }).score ?? "—";
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <CodeTile top={top} bottom={bottom} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">
            {c.result.student_name} · <span dir="ltr">{c.result.university_number}</span>
          </p>
          <p className="text-xs leading-relaxed text-text-muted">
            {c.result.course_name} · {c.reason} · {when(c.created_at)}
          </p>
          {c.decision_note && <p className="mt-1 text-xs text-text-muted">«{c.decision_note}»</p>}
        </div>
        <div className="shrink-0 text-end">
          <StatusBadge
            status={c.status}
            label={
              c.status === "pending" ? "بانتظار الموافقة" : (STATUS_LABELS[c.status] ?? c.status)
            }
          />
          <p className="mt-1 text-sm font-semibold text-text" dir="ltr">
            {oldScore} → {newScore}
          </p>
        </div>
      </div>
      {approver && c.status === "pending" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظة القرار (اختيارية)"
            className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <Button onClick={() => decide.mutate(true)} disabled={decide.isPending}>
            موافقة
          </Button>
          <Button
            variant="secondary"
            onClick={() => decide.mutate(false)}
            disabled={decide.isPending}
          >
            رفض
          </Button>
        </div>
      )}
      {decide.isError && (
        <div className="mt-2">
          <Notice>{problemMessage(decide.error)}</Notice>
        </div>
      )}
    </div>
  );
}
