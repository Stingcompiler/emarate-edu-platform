import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Pencil, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Notice,
  SectionLabel,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";
import { when } from "../../lib/format";
import { dueLabel, fmtSize, openFile, useMyCourses } from "../../lib/learning";
import { asForm, formData } from "../../lib/upload";

const absolute = (iso: string) =>
  new Date(iso).toLocaleString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });

/** Boards: StudentAssignment (student); staff see the submissions (TeacherGrading). */
export function Assignment() {
  const { id = "" } = useParams();
  const path = { params: { path: { public_id: id } } };
  const assignment = useQuery({
    queryKey: ["assignment", id],
    queryFn: async () => (await api.GET("/api/v1/assignments/{public_id}", path)).data ?? null,
  });
  const courses = useMyCourses();
  const a = assignment.data;
  const course = courses.data?.find((c) => c.offering_id === a?.offering);
  const staff = !!course && course.my_role !== "student";
  return (
    <PortalShell
      title={a?.title ?? "واجب"}
      titleAction={
        staff ? (
          <Link to={`/assignments/${id}/edit`}>
            <Button variant="secondary" className="min-h-9 px-3">
              <Pencil size={16} aria-hidden />
              تعديل
            </Button>
          </Link>
        ) : undefined
      }
      subtitle={
        a
          ? `${a.course_name} · ${Number(a.max_grade).toLocaleString("ar")} درجة · حتى ${absolute(a.due_at)}`
          : undefined
      }
      back={a ? { label: a.course_name, to: `/courses/${a.offering}` } : undefined}
    >
      {a && (staff ? <Submissions id={id} max={a.max_grade ?? "0"} /> : <StudentView a={a} />)}
    </PortalShell>
  );
}

type A = NonNullable<Awaited<ReturnType<typeof loadAssignment>>>;
async function loadAssignment(id: string) {
  return (await api.GET("/api/v1/assignments/{public_id}", { params: { path: { public_id: id } } }))
    .data;
}

function StudentView({ a }: { a: A }) {
  const client = useQueryClient();
  const path = { params: { path: { public_id: a.public_id } } };
  const mine = useQuery({
    queryKey: ["assignment", a.public_id, "mine"],
    queryFn: async () =>
      (await api.GET("/api/v1/assignments/{public_id}/my-submission", path)).data ?? null,
  });
  const s = mine.data;
  const now = Date.now();
  const due = new Date(a.due_at).getTime();
  const hardEnd =
    a.late_policy === "none" ? due : a.late_until ? new Date(a.late_until).getTime() : due;
  const closed = a.status === "closed" || now > hardEnd;
  const canSubmit = !closed && (!s || (a.allow_resubmission && !s.grade));
  const left = Math.max(0, due - now);
  const types = a.submission_types ?? [];
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      <div className="space-y-4">
        <div className="flex items-center gap-4 rounded-2xl bg-header p-4 text-white shadow-sm">
          <div className="text-center">
            <p className="text-2xl font-bold">
              {Math.floor(left / 86_400_000).toLocaleString("ar")}
            </p>
            <p className="text-[11px] text-navy-200">يوم</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">
              {Math.floor((left % 86_400_000) / 3_600_000).toLocaleString("ar")}
            </p>
            <p className="text-[11px] text-navy-200">ساعة</p>
          </div>
          <p className="flex-1 text-sm text-navy-100">
            {closed
              ? "انتهى موعد التسليم"
              : due < now
                ? `بعد الموعد — ${a.late_policy === "penalty" ? `يُقبل بخصم ${a.late_penalty_percent}٪` : "يُقبل ويُعلَّم متأخرًا"}`
                : `متبقٍ على التسليم · ${dueLabel(a.due_at)}`}
            {a.allow_resubmission ? " · يُسمح بإعادة التسليم حتى الموعد" : ""}
          </p>
        </div>
        {a.description && (
          <Card className="whitespace-pre-line p-4 text-sm leading-7 text-text">
            {a.description}
          </Card>
        )}
        <SectionLabel>ما يجب تسليمه</SectionLabel>
        <Card className="divide-y divide-border-soft text-sm">
          {types.includes("file") && (
            <p className="px-4 py-3">
              ملف{" "}
              {a.allowed_extensions?.length ? <bdi>({a.allowed_extensions.join(", ")})</bdi> : ""} ·
              حتى <bdi>{a.max_file_size_mb} MB</bdi> · {a.max_files?.toLocaleString("ar")} ملفات كحد
              أقصى
            </p>
          )}
          {(a.link_fields ?? []).map((f) => (
            <p key={f.label} className="px-4 py-3">
              رابط: {f.label}
              {f.required ? "" : " · اختياري"}
            </p>
          ))}
          {types.includes("text") && <p className="px-4 py-3">نص / ملاحظة</p>}
        </Card>
        <SectionLabel>تسليمي</SectionLabel>
        {s ? (
          <Card className="space-y-2 p-4 text-sm">
            <p className="font-semibold text-text">
              الإصدار {s.current_version.version_no.toLocaleString("ar")} —{" "}
              {s.current_version.is_late ? "متأخر" : "في الوقت"}
            </p>
            <p className="text-xs text-text-muted">
              {when(s.current_version.submitted_at)} · الإصدارات المحفوظة:{" "}
              {s.versions_count.toLocaleString("ar")}
            </p>
            {s.current_version.content && (
              <p dir="auto" className="whitespace-pre-line rounded-lg bg-surface-alt p-3">
                {s.current_version.content}
              </p>
            )}
            {((s.current_version.files as string[]) ?? []).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => openFile(f)}
                className="flex items-center gap-2 text-primary"
              >
                <Paperclip size={14} aria-hidden /> ملف مرفق
              </button>
            ))}
            {Object.entries((s.current_version.links as Record<string, string>) ?? {}).map(
              ([k, v]) => (
                <a
                  key={k}
                  href={v}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-primary"
                  dir="ltr"
                >
                  {k}: {v}
                </a>
              ),
            )}
            {s.grade && s.grade.status === "approved" && (
              <div className="mt-2 rounded-lg bg-success-soft p-3 text-success-strong">
                <b className="text-lg">
                  {Number(s.grade.final_score).toLocaleString("ar")} /{" "}
                  {Number(a.max_grade).toLocaleString("ar")}
                </b>
                {s.grade.feedback && <p className="mt-1 text-sm">«{s.grade.feedback}»</p>}
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-4 text-sm text-text-muted">
            لم تسلّم بعد — يظهر هنا كل إصدار تسلّمه.
          </Card>
        )}
      </div>
      <aside className="mt-6 lg:mt-0">
        {canSubmit ? (
          <SubmitForm
            a={a}
            again={!!s}
            onDone={() => {
              void client.invalidateQueries({ queryKey: ["assignment", a.public_id] });
              void client.invalidateQueries({ queryKey: ["assignments"] });
            }}
          />
        ) : (
          <Notice tone="info">
            {closed
              ? "أُغلق التسليم."
              : s?.grade
                ? "صُحِّح التسليم؛ لا يمكن إعادة التسليم."
                : "لا تُقبل إعادة التسليم لهذا الواجب."}
          </Notice>
        )}
      </aside>
    </div>
  );
}

function SubmitForm({ a, again, onDone }: { a: A; again: boolean; onDone: () => void }) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const types = a.submission_types ?? [];
  const submit = useMutation({
    mutationFn: async () => {
      const ids: string[] = [];
      for (const file of files) {
        const { data, error } = await api.POST("/api/v1/files", {
          body: formData({ file, purpose: "submission", offering: String(a.offering) }) as never,
          ...asForm,
        });
        if (!data) throw error;
        ids.push(data.public_id);
      }
      const { data, error } = await api.POST("/api/v1/assignments/{public_id}/submit", {
        params: { path: { public_id: a.public_id } },
        body: {
          content,
          files: ids,
          links: Object.fromEntries(Object.entries(links).filter(([, v]) => v.trim())),
        },
      });
      if (!data) throw error;
    },
    onSuccess: () => {
      setContent("");
      setFiles([]);
      setLinks({});
      onDone();
    },
  });
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold text-text">
        {again ? "إعادة التسليم — إصدار جديد" : "تسليم الواجب"}
      </p>
      {types.includes("file") && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-border p-5 text-sm text-text-muted hover:bg-surface-alt"
          >
            <Upload size={22} aria-hidden />
            اضغط لاختيار ملف أو التقاط صورة
            <span className="text-xs">
              {a.allowed_extensions?.length
                ? a.allowed_extensions.join(", ").toUpperCase()
                : "PDF, JPG, PNG"}{" "}
              · حتى <bdi>{a.max_file_size_mb} MB</bdi>
            </span>
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept={a.allowed_extensions?.map((e) => `.${e}`).join(",") || undefined}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, a.max_files ?? 3))}
          />
          {files.map((f) => (
            <p key={f.name} className="text-xs text-text">
              {f.name} · {fmtSize(f.size)}
            </p>
          ))}
        </>
      )}
      {(a.link_fields ?? []).map((f) => (
        <label key={f.label} className="block text-xs text-text-muted">
          {f.label}
          {f.required ? " *" : ""}
          <input
            dir="ltr"
            value={links[f.label] ?? ""}
            onChange={(e) => setLinks({ ...links, [f.label]: e.target.value })}
            placeholder="https://"
            className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
          />
        </label>
      ))}
      <label className="block text-xs text-text-muted">
        {types.includes("text") ? "الإجابة / ملاحظة" : "ملاحظة للأستاذ (اختياري)"}
        <textarea
          dir="auto"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="mt-1 block min-h-24 w-full rounded-lg border border-border bg-surface p-2 text-sm"
        />
      </label>
      {submit.isError && <Notice>{problemMessage(submit.error)}</Notice>}
      <Button
        className="w-full"
        disabled={
          submit.isPending ||
          (!files.length && !content.trim() && !Object.values(links).some((v) => v.trim()))
        }
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? "جارٍ الإرسال…" : "إرسال التسليم"}
      </Button>
      <p className="text-center text-[11px] text-text-muted">يُحفظ كل إصدار.</p>
    </Card>
  );
}

function Submissions({ id, max }: { id: string; max: string }) {
  const list = useQuery({
    queryKey: ["assignment", id, "submissions"],
    queryFn: async () =>
      (
        await api.GET("/api/v1/assignments/{public_id}/submissions", {
          params: { path: { public_id: id } },
        })
      ).data?.results ?? [],
  });
  const rows = list.data ?? [];
  const waiting = rows.filter((r) => r.grade?.status !== "approved").length;
  return (
    <>
      <p className="mb-3 text-sm text-text-muted">
        {rows.length.toLocaleString("ar")} تسليمًا · {waiting.toLocaleString("ar")} بانتظار التصحيح
      </p>
      <Card className="divide-y divide-border-soft">
        {rows.map((r) => (
          <Link
            key={r.public_id}
            to={`/submissions/${r.public_id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-text">
                {r.student.full_name_ar}
              </span>
              <span className="text-xs text-text-muted">
                <bdi>{r.student.university_number}</bdi> ·{" "}
                {when(r.current_version?.submitted_at ?? r.first_submitted_at)}
                {r.is_late ? " · متأخر" : ""} · إصدار {r.versions_count.toLocaleString("ar")}
              </span>
            </span>
            {r.grade?.status === "approved" ? (
              <b className="text-sm text-success-strong">
                {Number(r.grade.final_score).toLocaleString("ar")}/
                {Number(max).toLocaleString("ar")}
              </b>
            ) : r.grade ? (
              <StatusBadge status="suggested" label="مقترح" />
            ) : (
              <StatusBadge status="pending" label="للتصحيح" />
            )}
          </Link>
        ))}
        {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا تسليمات بعد.</p>}
      </Card>
    </>
  );
}
