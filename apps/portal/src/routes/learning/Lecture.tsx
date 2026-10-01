import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Link2, Pencil, PlayCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Button, Card, CodeTile, SectionLabel, WithSide } from "../../components/ui";
import { count, N } from "../../lib/format";
import { api, ok } from "../../lib/api";
import {
  dueLabel,
  fmtSize,
  openFile,
  useAssignments,
  useLectures,
  useCourse,
  isCourseStaff,
  splitCourse,
  courseTone,
} from "../../lib/learning";

type Resource = NonNullable<ReturnType<typeof useLectures>["data"]>[number]["resources"][number];

/** Boards: StudentLecture (phone), DesktopStudentCourse (a lecture open beside the course's list). */
export function Lecture() {
  const { id = "" } = useParams();
  const lecture = useQuery({
    queryKey: ["lecture", id],
    queryFn: async () =>
      ok(await api.GET("/api/v1/lectures/{public_id}", { params: { path: { public_id: id } } })) ??
      null,
  });
  const l = lecture.data;
  const siblings = useLectures(l?.offering);
  const assignments = useAssignments(l?.offering);
  const list = (siblings.data ?? [])
    .filter((x) => x.is_published || x.public_id === id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const index = list.findIndex((x) => x.public_id === id);
  const prev = index > 0 ? list[index - 1] : undefined;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : undefined;
  const related = (assignments.data ?? []).filter((a) => a.lecture === id);
  const video = l?.resources.find((r) => r.kind === "video" && r.video);
  const course = useCourse(l?.offering).data;
  const staff = isCourseStaff(course);
  const [top, bottom] = splitCourse(course?.code ?? "");
  // The course's staff see how many students opened each lecture (docs/07); a student's
  // opening is noted once per visit. Staff opening it are not counted.
  const opened = l?.public_id;
  const asStudent = course?.my_role === "student";
  useEffect(() => {
    if (opened && asStudent)
      void api.POST("/api/v1/lectures/{public_id}/view", {
        params: { path: { public_id: opened } },
      });
  }, [opened, asStudent]);
  return (
    <PortalShell
      title={l?.title_ar ?? "المحاضرة"}
      titleAction={
        staff ? (
          <Link to={`/lectures/${id}/edit`}>
            <Button variant="secondary" className="min-h-9 px-3">
              <Pencil size={16} aria-hidden />
              تعديل
            </Button>
          </Link>
        ) : undefined
      }
      subtitle={
        l
          ? `المحاضرة ${String(l.order ?? 0).padStart(2, "0")} · ${l.type === "lab" ? "عملي" : "نظري"}${list.length ? ` · ${index + 1} من ${list.length}` : ""}`
          : undefined
      }
      back={l ? { label: "المادة", to: `/courses/${l.offering}` } : undefined}
    >
      {l && (
        <WithSide
          side={
            // The course's lectures beside the one open (board DesktopStudentCourse): where
            // you are, and one tap to the next. Phones find it under the lecture.
            <Card className="overflow-hidden">
              <Link
                to={`/courses/${l.offering}`}
                className="flex items-center gap-3 border-b border-border-soft px-4 py-3 hover:bg-surface-alt"
              >
                {course && <CodeTile top={top} bottom={bottom} tone={courseTone(course.code)} />}
                <span className="min-w-0">
                  <b className="block truncate text-sm text-text">{course?.name_ar ?? "المادة"}</b>
                  <span className="text-xs text-text-muted">{count(list.length, N.lecture)}</span>
                </span>
              </Link>
              <ol className="max-h-[60vh] overflow-y-auto py-1">
                {list.map((x, i) => {
                  const current = x.public_id === id;
                  return (
                    <li key={x.public_id}>
                      <Link
                        to={`/lectures/${x.public_id}`}
                        aria-current={current ? "page" : undefined}
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-alt ${current ? "bg-primary-soft/50 font-semibold" : ""}`}
                      >
                        <span
                          className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${current ? "bg-primary text-on-primary" : "bg-surface-alt text-text-muted"}`}
                        >
                          {(i + 1).toLocaleString("ar-u-nu-latn")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-text">{x.title_ar}</span>
                        {!x.is_published && <span className="text-xs text-text-muted">مسودة</span>}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </Card>
          }
        >
          <div className="space-y-4">
            {video?.video && (
              <Player
                videoId={video.video.public_id}
                provider={video.video.provider}
                status={video.video.status}
              />
            )}
            <div>
              <SectionLabel>الموارد</SectionLabel>
              {l.resources.some((r) => r.kind !== "video") ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {l.resources
                    .filter((r) => r.kind !== "video")
                    .map((r) => (
                      <Card key={r.id} className="overflow-hidden">
                        <ResourceRow r={r} />
                      </Card>
                    ))}
                </div>
              ) : (
                <Card className="px-4 py-3 text-sm text-text-muted">لا ملفات.</Card>
              )}
            </div>
            {l.description && (
              <Card className="p-4">
                <h2 className="text-sm font-semibold text-text">عن المحاضرة</h2>
                <p className="mt-1 whitespace-pre-line text-sm leading-7 text-text">
                  {l.description}
                </p>
              </Card>
            )}
            {related.length > 0 && (
              <div>
                <SectionLabel>مرتبط بهذه المحاضرة</SectionLabel>
                <Card className="divide-y divide-border-soft">
                  {related.map((a) => (
                    <Link
                      key={a.public_id}
                      to={`/assignments/${a.public_id}`}
                      className="block px-4 py-3 hover:bg-surface-alt"
                    >
                      <b className="block text-sm text-text">{a.title}</b>
                      <span className="text-xs text-text-muted">{dueLabel(a.due_at)}</span>
                    </Link>
                  ))}
                </Card>
              </div>
            )}
            <div className="flex justify-between gap-3">
              {prev ? (
                <Link
                  to={`/lectures/${prev.public_id}`}
                  className="text-sm font-semibold text-primary"
                >
                  السابقة · {prev.title_ar}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  to={`/lectures/${next.public_id}`}
                  className="text-end text-sm font-semibold text-primary"
                >
                  التالية · {next.title_ar}
                </Link>
              )}
            </div>
          </div>
        </WithSide>
      )}
    </PortalShell>
  );
}

function ResourceRow({ r }: { r: Resource }) {
  const icon =
    r.kind === "link" ? <Link2 size={18} aria-hidden /> : <FileText size={18} aria-hidden />;
  const content = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-700">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">
          {r.title || r.file?.name || r.url}
        </span>
        <span className="text-xs text-text-muted">
          {r.kind === "link" ? "رابط خارجي · يتطلب اتصالًا" : r.file ? fmtSize(r.file.size) : ""}
        </span>
      </span>
      <ExternalLink size={16} className="text-text-muted" aria-hidden />
    </>
  );
  return r.kind === "link" ? (
    <a
      href={r.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
    >
      {content}
    </a>
  ) : (
    <button
      type="button"
      onClick={() => r.file && openFile(r.file.public_id)}
      className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-alt"
    >
      {content}
    </button>
  );
}

/** Private video: a signed, expiring link fetched on demand (docs/05 §8.2). */
function Player({
  videoId,
  provider,
  status,
}: {
  videoId: string;
  provider: string;
  status: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  if (status !== "ready")
    return (
      <Card className="grid aspect-video place-items-center text-sm text-text-muted">
        الفيديو قيد المعالجة…
      </Card>
    );
  const load = async () => {
    const { data } = await api.GET("/api/v1/videos/{public_id}/playback", {
      params: { path: { public_id: videoId } },
    });
    if (data?.url) setUrl(data.url);
    else setError(true);
  };
  if (!url)
    return (
      <Card className="grid aspect-video place-items-center bg-header">
        <Button variant="ghost" className="text-white hover:bg-white/10" onClick={load}>
          <PlayCircle size={28} aria-hidden />{" "}
          {error ? "تعذّر التحميل — أعد المحاولة" : "تشغيل التسجيل"}
        </Button>
      </Card>
    );
  return provider === "bunny" ? (
    <iframe
      src={url}
      title="تسجيل المحاضرة"
      className="aspect-video w-full rounded-2xl border-0"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  ) : (
    <video src={url} controls autoPlay className="aspect-video w-full rounded-2xl bg-black" />
  );
}
