import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, Notice, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when, count, N } from "../../lib/format";
import { initials, num } from "../../lib/reports";

/** Board: AdminApprovals (phone); desktop derived — cards in two columns. */
export function Approvals() {
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["registration-requests", "pending"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/registration-requests", {
          params: { query: { status: "pending_approval", page_size: 100 } },
        }),
      ) ?? null,
  });
  const rows = list.data?.results ?? [];
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { data, error } = await api.POST("/api/v1/registration-requests/{public_id}/decide", {
        params: { path: { public_id: id } },
        body: { approve, reason: approve ? "" : (reasons[id] ?? "") },
      });
      if (!data) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["registration-requests"] }),
  });
  const matching = rows.filter((r) => r.email_matches_record);
  const approveAll = useMutation({
    mutationFn: async () => {
      for (const r of matching) {
        const { data, error } = await api.POST("/api/v1/registration-requests/{public_id}/decide", {
          params: { path: { public_id: r.public_id } },
          body: { approve: true },
        });
        if (!data) throw error;
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["registration-requests"] }),
  });
  return (
    <PortalShell
      title="طلبات التسجيل"
      subtitle={`${rows.length ? `${count(rows.length, N.student)} أكملوا رمز التحقق` : "لا طلبات بانتظار الاعتماد"} · الاعتماد يفعّل الحساب ويُشعر الطالب فورًا`}
      back={{ label: "لوحة القسم", to: "/department" }}
    >
      {matching.length > 1 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <span className="flex-1 text-sm">
            {count(matching.length, N.application)} بريدها مطابق للسجل الرسمي
          </span>
          <Button onClick={() => approveAll.mutate()} disabled={approveAll.isPending}>
            اعتماد الـ{num(matching.length)} معًا
          </Button>
        </Card>
      )}
      {(decide.isError || approveAll.isError) && (
        <div className="mb-3">
          <Notice>{problemMessage(decide.error ?? approveAll.error)}</Notice>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.public_id} className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-700">
                {initials(r.full_name_ar)}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-text">{r.full_name_ar}</b>
                <span className="text-xs text-text-muted">
                  <bdi>{r.university_number}</bdi> · <bdi>{r.email}</bdi>
                </span>
              </span>
              <span className="text-xs text-text-muted">{when(r.created_at)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-success-strong">
                الرقم في السجل
              </span>
              <span
                className={`rounded-full px-2 py-0.5 ${r.email_matches_record ? "bg-success-soft text-success-strong" : "bg-warning-soft text-warning-strong"}`}
              >
                {r.email_matches_record ? "البريد مطابق للسجل" : "بريد مختلف عن السجل"}
              </span>
              <span className="rounded-full bg-neutral-soft px-2 py-0.5 text-neutral-strong">
                المستوى {num(r.level)} · {r.program}
              </span>
            </div>
            {!r.email_matches_record && r.official_email && (
              <p className="text-xs text-text-muted">
                البريد في السجل: <bdi>{r.official_email}</bdi> — راجع بطاقة الطالب قبل الاعتماد.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-9 px-4"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.public_id, approve: true })}
              >
                اعتماد
              </Button>
              <input
                value={reasons[r.public_id] ?? ""}
                onChange={(e) => setReasons({ ...reasons, [r.public_id]: e.target.value })}
                placeholder="سبب الرفض"
                aria-label="سبب الرفض"
                className="min-h-9 flex-1 rounded-lg border border-border px-2 text-sm"
              />
              <Button
                variant="secondary"
                className="min-h-9 px-3 text-danger-strong"
                disabled={!reasons[r.public_id]?.trim()}
                onClick={() => decide.mutate({ id: r.public_id, approve: false })}
              >
                رفض
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {!rows.length && !list.isPending && (
        <Card className="p-5 text-sm text-text-muted">لا طلبات بانتظار الاعتماد.</Card>
      )}
    </PortalShell>
  );
}
