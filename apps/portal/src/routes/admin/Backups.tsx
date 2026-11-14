import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, Download } from "lucide-react";
import { useState } from "react";

import { useConfirm } from "../../components/Confirm";
import { FormDialog } from "../../components/FormDialog";
import { useToast } from "../../components/Toast";
import {
  Button,
  Card,
  Notice,
  PasswordField,
  SectionLabel,
  problemMessage,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { count, fmtDateTime, N } from "../../lib/format";
import { fmtSize } from "../../lib/learning";
import { can } from "../../lib/nav";

const FILE_PASSWORD_MIN = 10;

type Copy = {
  stamp: string;
  at: string;
  size: number;
  files: boolean;
  counts: { users: number; students: number; courses: number; applications: number } | null;
};

/**
 * «النسخ الاحتياطية» (owner, 2026-11-05: «لا أرى من أين ينشئ مدير النظام نسخة»). The daily
 * timer keeps the last copies; «إنشاء نسخة الآن» asks the worker for one more (before a big
 * change). «تنزيل» (owner, 2026-11-14: «لا أرى من أين أحمّل النسخة… قد ننقل النظام لاستضافة
 * أخرى») gives one copy as a single file under a password typed here — the system admin's
 * alone. No board: a list in a card on phones and on large screens alike (docs/06 §9).
 */
export function Backups() {
  const confirm = useConfirm();
  const client = useQueryClient();
  const me = useMe();
  const [downloading, setDownloading] = useState<Copy | null>(null);
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
  const copies = data?.copies ?? [];
  const mayDownload = can(me.data, "backups.download");
  return (
    <section className="mt-6 space-y-2" aria-labelledby="backups">
      <SectionLabel>
        <span id="backups">النسخ الاحتياطية</span>
      </SectionLabel>
      <Card className="divide-y divide-border-soft">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <DatabaseBackup size={20} aria-hidden className="shrink-0 text-primary" />
          <p className="min-w-0 flex-1 basis-56 text-sm">
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
          {copies.slice(0, 10).map((copy) => (
            <li
              key={copy.stamp}
              data-backup={copy.stamp}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm"
            >
              <span className="min-w-0 flex-1 basis-48">
                <b className="block">{fmtDateTime(copy.at)}</b>
                <span className="block text-xs text-text-muted">
                  {copy.files ? "قاعدة البيانات والملفات" : "قاعدة البيانات"} ·{" "}
                  <bdi>{fmtSize(copy.size)}</bdi>
                  {copy.counts &&
                    ` · ${count(copy.counts.students, N.student)} · ${count(copy.counts.users, N.account)}`}
                </span>
              </span>
              {mayDownload && (
                <Button
                  variant="secondary"
                  className="min-h-11 px-3"
                  aria-label={`تنزيل نسخة ${fmtDateTime(copy.at)}`}
                  onClick={() => setDownloading(copy)}
                >
                  <Download size={16} aria-hidden />
                  تنزيل
                </Button>
              )}
            </li>
          ))}
          {list.isSuccess && !copies.length && (
            <li className="px-4 py-3 text-sm text-text-muted">لا نسخ بعد.</li>
          )}
        </ul>
        <div className="space-y-1 bg-surface-alt px-4 py-3 text-xs leading-6 text-text-muted">
          <p>
            <b className="text-text">النسخ هنا على قرص الخادم نفسه.</b> نزّل نسخة بين حين وآخر
            واحفظها خارجه: هي ما يبقى إن فُقد الخادم، وما تنقل به المنصة إلى استضافة أخرى.
          </p>
          <p>
            <b className="text-text">الاستعادة</b> تستبدل قاعدة البيانات كلها، لذا تُجرى على الخادم
            فقط وفق دليل التشغيل (القسم 5). جرّبها أولًا على قاعدة منفصلة.
          </p>
        </div>
      </Card>
      {downloading && <DownloadDialog copy={downloading} onClose={() => setDownloading(null)} />}
    </section>
  );
}

/** The file's own password (twice) and the admin's password again, then the browser's own
 * download of a link that works once. */
function DownloadDialog({ copy, onClose }: { copy: Copy; onClose: () => void }) {
  const done = useToast();
  const [filePassword, setFilePassword] = useState("");
  const [again, setAgain] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState("");
  const ask = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/backups/download", {
        body: { stamp: copy.stamp, password, file_password: filePassword },
      });
      if (!data) throw error;
      return data;
    },
    onSuccess: (ticket) => {
      // An ordinary download by the browser: streamed to disk, whatever the size.
      const link = document.createElement("a");
      link.href = ticket.url;
      link.download = ticket.filename;
      document.body.append(link);
      link.click();
      link.remove();
      done("بدأ التنزيل");
      onClose();
    },
    onError: (error) => setProblem(problemMessage(error)),
  });
  const submit = () => {
    if (filePassword.length < FILE_PASSWORD_MIN)
      return setProblem(`كلمة سر الملف ${FILE_PASSWORD_MIN} أحرف على الأقل.`);
    if (filePassword !== again) return setProblem("كلمتا سر الملف غير متطابقتين.");
    if (!password) return setProblem("اكتب كلمة مرورك في المنصة للتأكيد.");
    setProblem("");
    ask.mutate();
  };
  return (
    <FormDialog
      title={`تنزيل نسخة ${fmtDateTime(copy.at)}`}
      submit={ask.isPending ? "جارٍ التجهيز…" : "تنزيل الملف"}
      busy={ask.isPending}
      onSubmit={submit}
      onClose={onClose}
    >
      <p className="text-sm leading-6 text-text-muted">
        ملف واحد فيه {copy.files ? "قاعدة البيانات والملفات المرفوعة" : "قاعدة البيانات"}، مشفّر
        بكلمة سر تختارها الآن. <b className="text-text">بدونها لا يُفتح الملف</b>، ولا يستطيع أحد
        استرجاعها: احفظها في مدير كلمات المرور.
      </p>
      <Card>
        <PasswordField
          label="كلمة سر الملف"
          hint={`${FILE_PASSWORD_MIN} أحرف على الأقل، غير كلمة مرور حسابك.`}
          autoComplete="new-password"
          value={filePassword}
          onChange={(event) => setFilePassword(event.target.value)}
        />
        <PasswordField
          label="أعد كتابة كلمة سر الملف"
          autoComplete="new-password"
          value={again}
          onChange={(event) => setAgain(event.target.value)}
        />
        <PasswordField
          label="كلمة مرورك في المنصة"
          hint="للتأكد أنك أنت: الملف يحمل بيانات الكلية كلها."
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Card>
      {problem && <Notice>{problem}</Notice>}
      <p className="text-xs leading-6 text-text-muted">
        يُسجَّل التنزيل في سجل العمليات، ويصل تنبيه به إلى مديري النظام.
      </p>
    </FormDialog>
  );
}
