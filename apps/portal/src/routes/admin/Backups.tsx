import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup } from "lucide-react";

import { useConfirm } from "../../components/Confirm";
import { Button, Card, Notice, SectionLabel, problemMessage } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when } from "../../lib/format";
import { fmtSize } from "../../lib/learning";

/**
 * «النسخ الاحتياطية» (owner, 2026-11-05: «لا أرى من أين ينشئ مدير النظام نسخة»). The daily
 * timer keeps the last copies; «إنشاء نسخة الآن» asks the worker for one more (before a big
 * change). Restoring replaces the whole database, so it stays a server step (runbook §5): from
 * here it would let a taken-over admin account wipe the college's data.
 */
export function Backups() {
  const confirm = useConfirm();
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["backups"],
    queryFn: async () => ok(await api.GET("/api/v1/backups")),
    // While a copy is being made, look again every five seconds.
    refetchInterval: (query) => (query.state.data?.running ? 5000 : false),
  });
  const make = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/backups");
      if (!data) throw error;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["backups"] }),
  });
  const data = list.data;
  const running = !!data?.running || make.isPending;
  const items = data?.items ?? [];
  return (
    <section className="mt-6 space-y-2" aria-labelledby="backups">
      <SectionLabel>
        <span id="backups">النسخ الاحتياطية</span>
      </SectionLabel>
      <Card className="divide-y divide-border-soft">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <DatabaseBackup size={20} aria-hidden className="shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-sm">
            <b className="block">نسخة مشفّرة كل يوم تلقائيًا</b>
            <span className="text-text-muted">
              قاعدة البيانات والملفات المرفوعة، وتُحفظ آخر النسخ. أنشئ نسخة قبل أي تغيير كبير.
            </span>
          </p>
          <Button
            className="min-h-11 px-4"
            disabled={running}
            onClick={async () => {
              if (
                await confirm({
                  title: "إنشاء نسخة احتياطية الآن؟",
                  body: "تُنشأ في الخلفية خلال دقائق، ويمكنك متابعة العمل. تظهر في القائمة حين تكتمل.",
                  confirm: "إنشاء النسخة",
                  tone: "primary",
                })
              )
                make.mutate();
            }}
          >
            {running ? "جارٍ إنشاء النسخة…" : "إنشاء نسخة الآن"}
          </Button>
        </div>
        {(make.isError || data?.last_failed) && (
          <div className="px-4 py-3">
            <Notice>
              {make.isError
                ? problemMessage(make.error)
                : "تعذّر إنشاء آخر نسخة طُلبت من هنا. يصل التنبيه إلى بريد التشغيل، وتفاصيله في سجل الخادم."}
            </Notice>
          </div>
        )}
        <ul aria-busy={list.isLoading} className="divide-y divide-border-soft">
          {items.slice(0, 10).map((b) => (
            <li
              key={b.name}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
            >
              <span className="min-w-0 flex-1">
                <b className="block">
                  {b.kind === "database" ? "قاعدة البيانات" : "الملفات المرفوعة"}
                </b>
                <bdi dir="ltr" className="block truncate font-mono text-xs text-text-muted">
                  {b.name}
                </bdi>
              </span>
              <span className="text-text-muted">{b.at ? when(b.at) : "—"}</span>
              {b.size != null && <span className="text-text-muted">{fmtSize(b.size)}</span>}
            </li>
          ))}
          {list.isSuccess && !items.length && (
            <li className="px-4 py-3 text-sm text-text-muted">لا نسخ بعد.</li>
          )}
        </ul>
        <div className="bg-surface-alt px-4 py-3 text-xs leading-6 text-text-muted">
          <b className="text-text">الاستعادة</b> تستبدل قاعدة البيانات كلها، لذا تُجرى على الخادم
          فقط وبمفتاح التشفير المحفوظ خارجه، وفق دليل التشغيل (القسم 5: «تدريب الاستعادة»). جرّبها
          أولًا على قاعدة منفصلة.
        </div>
      </Card>
    </section>
  );
}
