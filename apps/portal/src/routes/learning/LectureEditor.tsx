import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Link2, Trash2, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  Notice,
  SectionLabel,
  StatusBadge,
  problemMessage,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useUnsavedChanges } from "../../lib/useUnsavedChanges";
import { fmtSize, useLectures, useCourse } from "../../lib/learning";
import { tusUpload } from "../../lib/tus";
import { asForm, formData } from "../../lib/upload";
import { useConfirm } from "../../components/Confirm";

/** Board: TeacherLectureNew (phone); desktop derived — form beside resources. `/lectures/new?offering=` or `/lectures/:id/edit`. */
export function LectureEditor() {
  const unsaved = useUnsavedChanges();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const existing = useQuery({
    queryKey: ["lecture", id],
    enabled: !!id,
    queryFn: async () =>
      ok(await api.GET("/api/v1/lectures/{public_id}", { params: { path: { public_id: id! } } })) ??
      null,
  });
  const l = existing.data;
  const offering = l?.offering ?? (Number(params.get("offering")) || undefined);
  const course = useCourse(offering).data;
  const siblings = useLectures(offering);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"theory" | "lab">("theory");
  useEffect(() => {
    if (l) {
      setTitle(l.title_ar);
      setDescription(l.description ?? "");
      setType((l.type as "theory" | "lab") ?? "theory");
    }
  }, [l]);
  const nextOrder = Math.max(0, ...(siblings.data ?? []).map((x) => x.order ?? 0)) + 1;
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["lecture", id] });
    void client.invalidateQueries({ queryKey: ["lectures"] });
  };
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      let publicId = id;
      if (!publicId) {
        const { data, error } = await api.POST("/api/v1/lectures", {
          body: { offering: offering!, title_ar: title, description, type, order: nextOrder },
        });
        if (!data) throw error;
        publicId = data.public_id;
      } else {
        const { data, error } = await api.PATCH("/api/v1/lectures/{public_id}", {
          params: { path: { public_id: publicId } },
          body: { title_ar: title, description, type },
        });
        if (!data) throw error;
      }
      if (publish) {
        const { data, error } = await api.POST("/api/v1/lectures/{public_id}/publish", {
          params: { path: { public_id: publicId } },
        });
        if (!data) throw error;
      }
      return publicId;
    },
    onSuccess: (publicId) => {
      unsaved.saved();
      refresh();
      navigate(`/lectures/${publicId}/edit`, { replace: true });
    },
  });
  const unpublish = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/v1/lectures/{public_id}/unpublish", {
        params: { path: { public_id: id! } },
      });
      if (!data) throw error;
    },
    onSuccess: refresh,
  });
  return (
    <PortalShell
      title={l ? l.title_ar : "محاضرة جديدة"}
      subtitle={`${course?.name_ar ?? ""} · المحاضرة ${String(l?.order ?? nextOrder).padStart(2, "0")} · الفيديو يُرفع مباشرة إلى شبكة البث`}
      back={{ label: course?.name_ar ?? "المادة", to: `/courses/${offering}` }}
    >
      <div className="contents" onInput={unsaved.onInput}>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
          <div className="space-y-4">
            <SectionLabel>الأساسيات</SectionLabel>
            <Card className="space-y-3 p-4">
              <label className="block text-sm font-semibold">
                العنوان
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 font-normal"
                />
              </label>
              <label className="block text-sm font-semibold">
                الوصف
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 block min-h-28 w-full rounded-lg border border-border bg-surface p-3 font-normal"
                />
              </label>
              <div className="flex gap-2">
                <Chip active={type === "theory"} onClick={() => setType("theory")}>
                  نظري
                </Chip>
                <Chip active={type === "lab"} onClick={() => setType("lab")}>
                  عملي
                </Chip>
              </div>
            </Card>
            {save.isError && <Notice>{problemMessage(save.error)}</Notice>}
            <div className="flex flex-wrap items-center gap-2">
              {l && (
                <StatusBadge
                  status={l.is_published ? "published" : "draft"}
                  label={l.is_published ? "منشورة" : "مسودة"}
                />
              )}
              <Button
                variant="secondary"
                disabled={!title.trim() || save.isPending}
                onClick={() => save.mutate(false)}
              >
                حفظ كمسودة
              </Button>
              {!l?.is_published && (
                <Button
                  disabled={!title.trim() || save.isPending}
                  onClick={() => save.mutate(true)}
                >
                  نشر المحاضرة
                </Button>
              )}
              {l?.is_published && (
                <Button variant="secondary" onClick={() => unpublish.mutate()}>
                  إلغاء النشر
                </Button>
              )}
            </div>
            <p className="text-xs text-text-muted">
              النشر يرسل إشعارًا لطلاب المادة داخل التطبيق وPush.
            </p>
          </div>
          <aside className="mt-6 lg:mt-0">
            <SectionLabel>الموارد</SectionLabel>
            {l ? (
              <div data-saves-itself>
                <Resources lecture={l} offering={l.offering} onChange={refresh} />
              </div>
            ) : (
              <Card className="p-4 text-sm text-text-muted">
                احفظ المسودة أولًا ثم أضف الفيديو والملفات والروابط.
              </Card>
            )}
          </aside>
        </div>
      </div>
    </PortalShell>
  );
}

type L = NonNullable<Awaited<ReturnType<typeof loadLecture>>>;
async function loadLecture(id: string) {
  return ok(await api.GET("/api/v1/lectures/{public_id}", { params: { path: { public_id: id } } }));
}

function Resources({
  lecture,
  offering,
  onChange,
}: {
  lecture: L;
  offering: number;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState({ title: "", url: "" });
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const path = { params: { path: { public_id: lecture.public_id } } };
  const order = lecture.resources.length + 1;
  const add = async (body: {
    kind: "file" | "link" | "video";
    title: string;
    file?: string;
    video?: string;
    url?: string;
  }) => {
    const { data, error } = await api.POST("/api/v1/lectures/{public_id}/resources", {
      ...path,
      body: { ...body, order },
    });
    if (!data) throw error;
    onChange();
  };
  const run = async (task: () => Promise<void>) => {
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
    }
  };
  const uploadFile = (file: File) =>
    run(async () => {
      setProgress(`${file.name}…`);
      const { data, error } = await api.POST("/api/v1/files", {
        body: formData({ file, purpose: "lecture", offering: String(offering) }) as never,
        ...asForm,
      });
      if (!data) throw error;
      await add({ kind: "file", title: file.name, file: data.public_id });
    });
  const uploadVideo = (file: File) =>
    run(async () => {
      setProgress("تجهيز الرفع…");
      const { data, error } = await api.POST("/api/v1/videos/upload-ticket", {
        body: { offering, title: lecture.title_ar, size: file.size },
      });
      if (!data) throw error;
      const ticket = data.ticket as {
        mode: string;
        endpoint?: string;
        headers?: Record<string, string>;
      };
      if (ticket.mode === "tus") {
        await tusUpload(
          file,
          { endpoint: ticket.endpoint!, headers: ticket.headers ?? {} },
          {
            title: lecture.title_ar,
            onProgress: (f) => setProgress(`يُرفع مباشرة · ${Math.round(f * 100)}٪`),
          },
        );
      } else {
        setProgress("يُرفع…");
        const res = await api.POST("/api/v1/videos/{public_id}/upload", {
          params: { path: { public_id: data.video.public_id } },
          body: formData({ file }) as never,
          ...asForm,
        });
        if (!res.data) throw res.error;
      }
      await add({ kind: "video", title: "تسجيل المحاضرة", video: data.video.public_id });
    });
  const remove = (resourceId: number) =>
    run(async () => {
      const { error, response } = await api.DELETE(
        "/api/v1/lectures/{public_id}/resources/{resource_id}",
        { params: { path: { public_id: lecture.public_id, resource_id: String(resourceId) } } },
      );
      if (!response.ok) throw error;
      onChange();
    });
  return (
    <div className="space-y-3">
      <Card className="divide-y divide-border-soft">
        {lecture.resources.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary-700">
              {r.kind === "video" ? (
                <Video size={16} aria-hidden />
              ) : r.kind === "link" ? (
                <Link2 size={16} aria-hidden />
              ) : (
                <FileText size={16} aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{r.title}</span>
              <span className="block truncate text-xs text-text-muted">
                {r.kind === "video" ? (
                  r.video?.status === "ready" ? (
                    "جاهز ✓"
                  ) : (
                    "قيد المعالجة"
                  )
                ) : r.kind === "file" && r.file ? (
                  `${fmtSize(r.file.size)} · رُفع ✓`
                ) : (
                  <bdi>{r.url}</bdi>
                )}
              </span>
            </span>
            <button
              type="button"
              aria-label="حذف"
              onClick={async () =>
                (await confirm({ title: `حذف «${r.title}»؟`, confirm: "حذف المورد" })) &&
                remove(r.id)
              }
              className="grid size-8 place-items-center text-danger-strong"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
        ))}
        {!lecture.resources.length && (
          <p className="px-4 py-3 text-sm text-text-muted">لا موارد بعد.</p>
        )}
      </Card>
      {progress && <Notice tone="info">{progress}</Notice>}
      {error ? <Notice>{problemMessage(error)}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="min-h-9 px-3"
          disabled={!!progress}
          onClick={() => videoInput.current?.click()}
        >
          + فيديو
        </Button>
        <Button
          variant="secondary"
          className="min-h-9 px-3"
          disabled={!!progress}
          onClick={() => fileInput.current?.click()}
        >
          + ملف
        </Button>
      </div>
      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])}
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
      />
      <Card className="space-y-2 p-3">
        <input
          value={link.title}
          onChange={(e) => setLink({ ...link, title: e.target.value })}
          placeholder="عنوان الرابط"
          aria-label="عنوان الرابط"
          className="block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
        />
        <input
          dir="ltr"
          value={link.url}
          onChange={(e) => setLink({ ...link, url: e.target.value })}
          placeholder="https://"
          aria-label="الرابط"
          className="block min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
        />
        <Button
          variant="secondary"
          className="min-h-9 w-full"
          disabled={!link.url.startsWith("https://") || !link.title.trim()}
          onClick={() =>
            run(async () => {
              await add({ kind: "link", title: link.title, url: link.url });
              setLink({ title: "", url: "" });
            })
          }
        >
          + رابط
        </Button>
      </Card>
    </div>
  );
}
