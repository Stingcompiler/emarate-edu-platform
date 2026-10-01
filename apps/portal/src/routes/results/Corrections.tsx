import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import {
  FilterBar,
  Button,
  Card,
  Chip,
  CodeTile,
  EmptyState,
  Notice,
  SideNote,
  StatusBadge,
  STATUS_LABELS,
  WithSide,
  problemMessage,
  splitCode,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";
import { can } from "../../lib/nav";
import { ALL, Pager, useLocalPages } from "../../components/Pager";
import { useToast } from "../../components/Toast";

type Correction = Schemas["Correction"];
type Tab = "pending" | "approved" | "rejected";

/** Board: ResultsOfficerCorrections (phone). Desktop: derived — the list beside how a correction works. */
export function Corrections() {
  const me = useMe();
  const approver = can(me.data, "results.approve");
  const [tab, setTab] = useState<Tab>("pending");
  const list = useQuery({
    queryKey: ["result-corrections"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/result-corrections", { params: { query: ALL } }))?.results ?? [],
  });
  const all = list.data ?? [];
  const shown = all.filter((c) => c.status === tab);
  const paged = useLocalPages(shown, tab);
  const count = (status: Tab) => all.filter((c) => c.status === status).length;

  return (
    <PortalShell
      title="طلبات التعديل"
      subtitle="تُنفَّذ فقط بعد موافقة أمين الشؤون العلمية، وتظهر القيمتان في سجل النتيجة."
    >
      <WithSide
        side={
          <SideNote title="كيف يُعدَّل نتيجة منشورة؟">
            <ol className="list-decimal space-y-1 ps-4">
              <li>يرفع مسؤول النتائج طلب التعديل بالسبب والقيمة الجديدة.</li>
              <li>يوافق أمين الشؤون العلمية أو يرفض بملاحظة.</li>
              <li>عند الموافقة تتغير النتيجة، وتبقى القيمتان في سجلها.</li>
            </ol>
          </SideNote>
        }
      >
        <FilterBar>
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
        </FilterBar>
        {!shown.length ? (
          <Card className="mt-4">
            <EmptyState icon={<ClipboardCheck size={24} aria-hidden />} title="لا طلبات هنا" />
          </Card>
        ) : (
          <Card className="mt-4 divide-y divide-border-soft">
            {paged.shown.map((c) => (
              <CorrectionRow key={c.public_id} correction={c} approver={approver} />
            ))}
          </Card>
        )}
        <Pager page={paged.page} count={paged.count} onPage={paged.setPage} />
      </WithSide>
    </PortalShell>
  );
}

function CorrectionRow({ correction: c, approver }: { correction: Correction; approver: boolean }) {
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const toast = useToast();
  const decide = useMutation({
    mutationFn: async (approve: boolean) => {
      const { data, error } = await api.POST("/api/v1/result-corrections/{public_id}/decide", {
        params: { path: { public_id: c.public_id } },
        body: { approve, note },
      });
      if (!data) throw error;
    },
    onSuccess: (_, approve) => {
      toast(approve ? "اعتُمد التعديل" : "رُفض التعديل");
      void client.invalidateQueries({ queryKey: ["result-corrections"] });
    },
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
          <p className="mt-1 text-sm font-semibold">
            <s className="text-text-muted">{oldScore}</s>
            <span aria-hidden> ← </span>
            <span className="text-primary">{newScore}</span>
            <span className="sr-only">
              من {oldScore} إلى {newScore}
            </span>
          </p>
        </div>
      </div>
      {approver && c.status === "pending" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظة القرار (إلزامية عند الرفض)"
            aria-label="ملاحظة القرار"
            className="min-h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <Button onClick={() => decide.mutate(true)} disabled={decide.isPending}>
            موافقة
          </Button>
          <Button
            variant="secondary"
            onClick={() => decide.mutate(false)}
            disabled={decide.isPending || !note.trim()}
            title={note.trim() ? undefined : "اكتب سبب الرفض أولًا"}
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
