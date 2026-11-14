import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, Download, History } from "lucide-react";
import { useEffect, useState } from "react";

import { useConfirm } from "../../components/Confirm";
import { FormDialog } from "../../components/FormDialog";
import { useToast } from "../../components/Toast";
import {
  Button,
  Card,
  Field,
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

type Counts = { users: number; students: number; courses: number; applications: number };
type Copy = { stamp: string; at: string; size: number; files: boolean; counts: Counts | null };

const CONFIRM_WORD = "استعادة";
const STEPS: Record<string, string> = {
  check: "فحص النسخة",
  safety: "حفظ نسخة من الوضع الحالي",
  database: "استعادة قاعدة البيانات",
  files: "استعادة الملفات",
  upgrade: "ترقية البيانات إلى الإصدار الحالي",
};
const DAY_MS = 86_400_000;

/** «This tab asked for a restore», kept across the reload the waiting screen does. */
const asked = {
  key: "ecst:restore-asked",
  set() {
    try {
      sessionStorage.setItem(this.key, "1");
    } catch {
      // Private mode: the page then simply does not reload by itself.
    }
  },
  take(): boolean {
    try {
      const was = sessionStorage.getItem(this.key) === "1";
      sessionStorage.removeItem(this.key);
      return was;
    } catch {
      return false;
    }
  },
};

/** "20261114T031500Z" → the moment it names. */
function stampDate(stamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  return m ? fmtDateTime(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : stamp;
}

/**
 * «النسخ الاحتياطية» (owner, 2026-11-05: «لا أرى من أين ينشئ مدير النظام نسخة»). The daily
 * timer keeps the last copies; «إنشاء نسخة الآن» asks the worker for one more (before a big
 * change). «تنزيل» (owner, 2026-11-14: «لا أرى من أين أحمّل النسخة… قد ننقل النظام لاستضافة
 * أخرى») gives one copy as a single file under a password typed here — the system admin's
 * alone. «استعادة» (the same message: «استعادة النسخة لا يوجد لها زر») puts the platform back
 * to a copy: its numbers beside today's, the confirmation word and the admin's password; the
 * worker does it and the page shows where it is, then what came of it.
 * No board: a list in a card on phones and on large screens alike (docs/06 §9).
 */
export function Backups() {
  const confirm = useConfirm();
  const client = useQueryClient();
  const me = useMe();
  const [downloading, setDownloading] = useState<Copy | null>(null);
  const [restoring, setRestoring] = useState<Copy | null>(null);
  const list = useQuery({
    queryKey: ["backups"],
    queryFn: async () => ok(await api.GET("/api/v1/backups")),
    // While a copy is being made, look again every five seconds; while one is being restored,
    // every two — the answer turns into «maintenance» when the platform closes, and the
    // waiting screen takes over (MaintenanceGate).
    refetchInterval: (query) => {
      const found = query.state.data;
      if (found?.restore && ["queued", "running"].includes(found.restore.state)) return 2000;
      return found?.running ? 5000 : false;
    },
    meta: { silent: true },
  });
  const make = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/backups");
      if (!data) throw error;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["backups"] }),
  });
  const data = list.data;
  const restore = data?.restore ?? null;
  const restoreRuns = !!restore && ["queued", "running"].includes(restore.state);
  const running = !!data?.running || make.isPending || restoreRuns;
  const copies = data?.copies ?? [];
  const mayDownload = can(me.data, "backups.download");
  const mayRestore = can(me.data, "backups.restore");
  // A restore asked from this tab has just ended without the waiting screen ever showing (a
  // small database is back before the next question): everything else on the page still
  // shows the rows that were replaced, so the page loads again, once.
  const settled = restore?.state === "done" || restore?.state === "failed";
  useEffect(() => {
    if (!settled || !asked.take()) return;
    if (restore?.state === "done") window.location.reload();
    // `finished` too: a second restore ends in the same «done» the first one left.
  }, [settled, restore?.state, restore?.finished]);
  // What came of the last restore stays on the page for a day.
  const recent = !!restore?.finished && Date.now() - new Date(restore.finished).getTime() < DAY_MS;
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
        {restore && restoreRuns && (
          <div className="px-4 py-3">
            <Notice tone="info">
              تُستعاد نسخة {stampDate(restore.stamp)}
              {restore.step && STEPS[restore.step] ? `: ${STEPS[restore.step]}` : ""}. تتوقف المنصة
              للجميع دقائق ثم تعود وحدها.
            </Notice>
          </div>
        )}
        {restore && recent && restore.state === "done" && (
          <div className="px-4 py-3" data-restore="done">
            <Notice tone="success">
              استُعيدت نسخة {stampDate(restore.stamp)}: المنصة الآن كما كانت عند أخذها.
              {restore.kept_before &&
                ` الوضع الذي كان قبل الاستعادة محفوظ في نسخة ${stampDate(restore.kept_before)}؛ استعدها إن أردت التراجع.`}
            </Notice>
          </div>
        )}
        {restore && recent && restore.state === "failed" && (
          <div className="px-4 py-3" data-restore="failed">
            <Notice>
              لم تكتمل استعادة نسخة {stampDate(restore.stamp)}. {restore.error}
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
              {(mayDownload || mayRestore) && (
                <span className="flex flex-wrap gap-2">
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
                  {mayRestore && !running && (
                    <Button
                      variant="secondary"
                      className="min-h-11 px-3"
                      aria-label={`استعادة نسخة ${fmtDateTime(copy.at)}`}
                      onClick={() => setRestoring(copy)}
                    >
                      <History size={16} aria-hidden />
                      استعادة
                    </Button>
                  )}
                </span>
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
            <b className="text-text">الاستعادة</b> تعيد المنصة كلها إلى لحظة النسخة: يُمحى ما أُدخل
            بعدها، وتتوقف المنصة دقائق. تُحفظ قبلها نسخة من الوضع الحالي، فتستطيع التراجع. لمدير
            النظام وحده.
          </p>
        </div>
      </Card>
      {downloading && <DownloadDialog copy={downloading} onClose={() => setDownloading(null)} />}
      {restoring && data && (
        <RestoreDialog copy={restoring} now={data.now} onClose={() => setRestoring(null)} />
      )}
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

const COUNTED: [keyof Counts, string][] = [
  ["students", "الطلاب"],
  ["users", "الحسابات"],
  ["courses", "المواد"],
  ["applications", "طلبات التقديم"],
];

/** What is lost, in numbers: today's beside the copy's. Then the word and the password. */
function RestoreDialog({ copy, now, onClose }: { copy: Copy; now: Counts; onClose: () => void }) {
  const client = useQueryClient();
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState("");
  const ask = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/backups/restore", {
        body: { stamp: copy.stamp, password },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      // The list now says «تُستعاد…» and keeps asking; the waiting screen takes over when the
      // platform closes.
      asked.set();
      void client.invalidateQueries({ queryKey: ["backups"] });
      onClose();
    },
    onError: (error) => setProblem(problemMessage(error)),
  });
  const submit = () => {
    if (word.trim() !== CONFIRM_WORD) return setProblem(`اكتب كلمة «${CONFIRM_WORD}» للتأكيد.`);
    if (!password) return setProblem("اكتب كلمة مرورك في المنصة للتأكيد.");
    setProblem("");
    ask.mutate();
  };
  return (
    <FormDialog
      title={`استعادة نسخة ${fmtDateTime(copy.at)}`}
      submit={ask.isPending ? "جارٍ الطلب…" : "استعادة النسخة"}
      tone="danger"
      busy={ask.isPending}
      onSubmit={submit}
      onClose={onClose}
    >
      <Notice tone="warning">
        تعود المنصة كلها إلى ما كانت عليه في {fmtDateTime(copy.at)}. <b>كل ما أُدخل بعدها يُمحى</b>:
        تسجيلات، إجابات اختبارات، واجبات، نتائج، حسابات.
      </Notice>
      {copy.counts && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-text-muted">
              <th className="py-1 text-start font-normal" />
              <th className="py-1 text-start font-normal">الآن</th>
              <th className="py-1 text-start font-normal">في النسخة</th>
            </tr>
          </thead>
          <tbody>
            {COUNTED.map(([key, label]) => (
              <tr key={key} className="border-t border-border-soft">
                <th className="py-1.5 text-start font-normal text-text-muted">{label}</th>
                <td className="py-1.5 font-semibold">{now[key].toLocaleString("ar-u-nu-latn")}</td>
                <td className="py-1.5 font-semibold">
                  {copy.counts![key].toLocaleString("ar-u-nu-latn")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ul className="list-disc space-y-1 ps-5 text-sm leading-6 text-text-muted">
        <li>تتوقف المنصة للجميع دقائق، ثم تعود وحدها.</li>
        <li>تُحفظ أولًا نسخة من الوضع الحالي، فتستطيع التراجع باستعادتها.</li>
        {!copy.files && <li>هذه النسخة لا تحمل الملفات المرفوعة: تبقى الملفات كما هي الآن.</li>}
      </ul>
      <Card>
        <Field
          label={`اكتب كلمة «${CONFIRM_WORD}» للتأكيد`}
          autoComplete="off"
          value={word}
          onChange={(event) => setWord(event.target.value)}
        />
        <PasswordField
          label="كلمة مرورك في المنصة"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Card>
      {problem && <Notice>{problem}</Notice>}
      <p className="text-xs leading-6 text-text-muted">
        تُسجَّل الاستعادة في سجل العمليات، ويصل تنبيه بها إلى مديري النظام.
      </p>
    </FormDialog>
  );
}
