import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { Avatar, Button, Card, Notice, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when, count, N } from "../../lib/format";
import { initials, num } from "../../lib/reports";
import { useToast } from "../../components/Toast";
import { useConfirm } from "../../components/Confirm";

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
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const toast = useToast();
  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { data, error } = await api.POST("/api/v1/registration-requests/{public_id}/decide", {
        params: { path: { public_id: id } },
        body: { approve, reason: approve ? "" : (reasons[id] ?? "") },
      });
      if (!data) throw error;
    },
    // The decided request fades and folds away, then the list refreshes (review §2.6).
    onSuccess: (_, { id, approve }) => {
      setLeaving((l) => new Set(l).add(id));
      toast(approve ? "اعتُمد التسجيل" : "رُفض الطلب");
      setTimeout(() => void client.invalidateQueries({ queryKey: ["registration-requests"] }), 250);
    },
  });
  // Owner, 2026-11-07: a student says the account on their record is not theirs.
  const confirm = useConfirm();
  const reports = useQuery({
    queryKey: ["identity-reports", "open"],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/identity-reports", {
          params: { query: { status: "open", page_size: 100 } },
        }),
      ) ?? null,
  });
  const openReports = reports.data?.results ?? [];
  const [dismissals, setDismissals] = useState<Record<string, string>>({});
  const settle = useMutation({
    mutationFn: async ({ id, uphold }: { id: string; uphold: boolean }) => {
      const { data, error } = await api.POST("/api/v1/identity-reports/{public_id}/decide", {
        params: { path: { public_id: id } },
        body: { uphold, reason: uphold ? "" : (dismissals[id] ?? "") },
      });
      if (!data) throw error;
    },
    onSuccess: (_, { uphold }) => {
      toast(uphold ? "أُوقف الحساب وتحرّر السجل" : "رُفض البلاغ");
      void client.invalidateQueries({ queryKey: ["identity-reports"] });
    },
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
      {openReports.length > 0 && (
        <section className="mb-6 space-y-3" aria-labelledby="identity-reports">
          <h2 id="identity-reports" className="text-sm font-semibold text-text">
            بلاغات انتحال · {num(openReports.length)}
          </h2>
          {settle.isError && <Notice>{problemMessage(settle.error)}</Notice>}
          <div className="grid gap-3 lg:grid-cols-2">
            {openReports.map((r) => (
              <Card key={r.public_id} className="space-y-3 border-warning p-4">
                <div className="flex items-center gap-3">
                  <Avatar text={initials(r.full_name_ar)} size="lg" tone="primary" />
                  <span className="min-w-0 flex-1">
                    <b className="block text-text">{r.full_name_ar}</b>
                    <span className="text-xs text-text-muted">
                      <bdi>{r.university_number}</bdi> · المستوى {num(r.level)} · {r.program}
                    </span>
                  </span>
                  <span className="text-xs text-text-muted">{when(r.created_at)}</span>
                </div>
                <dl className="grid gap-1 text-xs">
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-text-muted">الحساب القائم:</dt>
                    <dd className="min-w-0 break-all">
                      <bdi>{r.account_email ?? "—"}</bdi>
                      {r.account_created_at && ` · أُنشئ ${when(r.account_created_at)}`}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-text-muted">المبلِّغ:</dt>
                    <dd className="min-w-0 break-all">
                      <bdi>{r.contact_email}</bdi>
                    </dd>
                  </div>
                  {r.official_email && (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="text-text-muted">البريد في السجل:</dt>
                      <dd className="min-w-0 break-all">
                        <bdi>{r.official_email}</bdi>
                      </dd>
                    </div>
                  )}
                </dl>
                {r.note && <p className="rounded-lg bg-surface-alt p-2 text-sm">{r.note}</p>}
                <p className="text-xs text-text-muted">
                  تحقّق من هوية المبلِّغ قبل القرار. الإيقاف يعطّل الحساب القائم ويفكّه عن السجل،
                  فيُنشئ الطالب حسابه من جديد.
                </p>
                <Button
                  className="min-h-9 w-full px-4 sm:w-auto"
                  disabled={settle.isPending}
                  onClick={async () =>
                    (await confirm({
                      title: `إيقاف الحساب القائم على ${r.full_name_ar}؟`,
                      body: "يُعطَّل الحساب ويُفك عن سجل الطالب، ويُرسل بريد إلى المبلِّغ ليُنشئ حسابه.",
                      confirm: "إيقاف الحساب",
                      tone: "danger",
                    })) && settle.mutate({ id: r.public_id, uphold: true })
                  }
                >
                  إيقاف الحساب
                </Button>
                <div className="flex flex-wrap items-start gap-2 border-t border-border-soft pt-3">
                  <input
                    value={dismissals[r.public_id] ?? ""}
                    onChange={(e) =>
                      setDismissals({ ...dismissals, [r.public_id]: e.target.value })
                    }
                    placeholder="سبب رفض البلاغ"
                    aria-label="سبب رفض البلاغ"
                    className="min-h-9 min-w-0 flex-1 basis-48 rounded-lg border border-border px-2 text-sm"
                  />
                  <Button
                    variant="secondary"
                    className="min-h-9 px-3"
                    disabled={!dismissals[r.public_id]?.trim()}
                    why="اكتب سبب رفض البلاغ أولًا"
                    onClick={() => settle.mutate({ id: r.public_id, uphold: false })}
                  >
                    رفض البلاغ
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
      {openReports.length > 0 && rows.length > 0 && (
        <h2 className="mb-3 text-sm font-semibold text-text">طلبات التسجيل</h2>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((r) => (
          <Card
            key={r.public_id}
            className={`space-y-3 p-4 ${leaving.has(r.public_id) ? "motion-leave" : ""}`}
          >
            <div className="flex items-center gap-3">
              <Avatar text={initials(r.full_name_ar)} size="lg" tone="primary" />
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
              {r.moves_account && (
                <span className="rounded-full bg-info-soft px-2 py-0.5 text-info-strong">
                  نقل حساب خريج
                </span>
              )}
            </div>
            {r.moves_account && (
              // A graduate's own account asks to move to this new record (owner, 2026-11-08).
              <p className="text-xs text-text-muted">
                حساب قائم لخريج بهذا البريد يطلب الانتقال إلى هذا السجل. تأكد أنه الطالب نفسه:
                الاعتماد ينقل الحساب ويؤرشف سجله السابق، والرفض يُبقيه على سجله السابق.
              </p>
            )}
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
