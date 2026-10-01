import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, FileText, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { LiveBanner } from "../../components/LiveBanner";
import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  CodeTile,
  EmptyState,
  SectionLabel,
  SideFigures,
  StatusBadge,
  WithSide,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when, count, N } from "../../lib/format";
import {
  dueLabel,
  splitCourse,
  courseTone,
  taskState,
  useAssignments,
  useLectures,
  useCourse,
  isCourseStaff,
} from "../../lib/learning";
import { ALL } from "../../components/Pager";
import { LectureOrder } from "./LectureOrder";

const TABS = [
  { key: "lectures", label: "المحاضرات" },
  { key: "work", label: "الأعمال" },
  { key: "news", label: "الإعلانات" },
  { key: "grades", label: "درجاتي" },
] as const;

/** Board: StudentCourse / TeacherCourse (phone); desktop derived — tabs over a two-column body. */
export function Course() {
  const { id = "" } = useParams();
  const offering = Number(id);
  const course = useCourse(offering).data;
  const staff = isCourseStaff(course);
  const lectures = useLectures(offering);
  const assignments = useAssignments(offering);
  const exams = useQuery({
    queryKey: ["exams", offering],
    queryFn: async () =>
      ok(await api.GET("/api/v1/exams", { params: { query: { ...ALL, offering } } }))?.results ??
      [],
  });
  const live = useQuery({
    queryKey: ["live", offering],
    queryFn: async () =>
      ok(await api.GET("/api/v1/live-sessions", { params: { query: { ...ALL, offering } } }))
        ?.results ?? [],
  });
  const news = useQuery({
    queryKey: ["announcements", "offering", offering],
    // This course's announcements, filtered by the server (review 2026-09-29, P3).
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/announcements", {
          params: { query: { ...ALL, scope: "offering", scope_id: offering } },
        }),
      )?.results ?? [],
  });
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("lectures");
  const [ordering, setOrdering] = useState(false);
  const tabs = TABS.filter((t) => t.key !== "grades" || !staff);
  const lecs = (lectures.data ?? []).slice().sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  const work = (assignments.data ?? []).slice().sort((a, b) => a.due_at.localeCompare(b.due_at));
  const now = Date.now();
  const liveNow = (live.data ?? []).find(
    (s) =>
      s.status !== "cancelled" &&
      new Date(s.starts_at).getTime() <= now &&
      new Date(s.ends_at).getTime() > now,
  );
  const graded = work.filter((a) => a.mine?.graded);
  const earned = graded.reduce((n, a) => n + Number(a.mine?.score ?? 0), 0);
  const possible = graded.reduce((n, a) => n + Number(a.max_grade ?? 0), 0);
  const [top, bottom] = splitCourse(course?.code ?? "");
  const people = course?.instructors ?? [];
  // The side column (board DesktopStudentCourse; review 2026-09-29 PR 7): where the course
  // stands, what comes next and its latest announcement. Phones get it under the tab.
  const published = lecs.filter((l) => l.is_published).length;
  const handedIn = work.filter((a) => a.mine).length;
  const next = work.find((a) => !a.mine && new Date(a.due_at).getTime() > now);
  const nextExam = (exams.data ?? [])
    .filter((e) => e.status === "published" && new Date(e.closes_at ?? e.opens_at).getTime() > now)
    .sort((a, b) => a.opens_at.localeCompare(b.opens_at))[0];
  const latest = news.data?.[0];
  const side = (
    <>
      <SideFigures
        title="المادة في أرقام"
        rows={
          staff
            ? [
                ["محاضرة منشورة", published],
                ["مسودة", lecs.length - published],
                ["واجب", work.length],
                ["اختبار", exams.data?.length ?? 0],
              ]
            : [
                ["محاضرة", published],
                [`سلّمت من ${work.length.toLocaleString("ar-u-nu-latn")}`, handedIn],
                ["اختبار", exams.data?.length ?? 0],
                [
                  "من أعمال الفصل",
                  possible
                    ? `${Math.round((100 * earned) / possible).toLocaleString("ar-u-nu-latn")}٪`
                    : "—",
                ],
              ]
        }
      />
      {!staff && (next || nextExam) && (
        <Card className="divide-y divide-border-soft">
          <h2 className="px-4 pt-3 pb-2 text-xs font-semibold text-text-muted">التالي</h2>
          {next && (
            <Link
              to={`/assignments/${next.public_id}`}
              className="block px-4 py-3 hover:bg-surface-alt"
            >
              <b className="block truncate text-sm text-text">{next.title}</b>
              <span className="text-xs text-warning-strong">{dueLabel(next.due_at)}</span>
            </Link>
          )}
          {nextExam && (
            <Link
              to={`/exams/${nextExam.public_id}`}
              className="block px-4 py-3 hover:bg-surface-alt"
            >
              <b className="block truncate text-sm text-text">{nextExam.title}</b>
              <span className="text-xs text-text-muted">
                {when(nextExam.opens_at)} · {count(nextExam.duration_minutes, N.minute)}
              </span>
            </Link>
          )}
        </Card>
      )}
      {latest && (
        <Card className="p-4">
          <h2 className="text-xs font-semibold text-text-muted">آخر إعلان</h2>
          <b className="mt-1 block text-sm text-text">{latest.title}</b>
          <p className="text-xs text-text-muted">
            {latest.author} · {when(latest.created_at)}
          </p>
          {tab !== "news" && (
            <button
              type="button"
              onClick={() => setTab("news")}
              className="mt-2 text-sm font-semibold text-primary"
            >
              كل الإعلانات
            </button>
          )}
        </Card>
      )}
    </>
  );
  return (
    <PortalShell
      title={course?.name_ar ?? "المادة"}
      subtitle={
        course
          ? `${people.map((p) => `${p.role === "ta" ? "معيد: " : ""}${p.user.full_name_ar}`).join(" · ") || "بلا أستاذ"} · شعبة \u2068${course.section}\u2069 · ${count(course.credit_hours, N.hour)}`
          : undefined
      }
      back={{ label: "موادي", to: "/courses" }}
    >
      {course && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <CodeTile top={top} bottom={bottom} tone={courseTone(course.code)} />
            <div className="flex flex-wrap gap-2">
              {tabs.map((t) => (
                <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
                  {t.label}
                  {t.key === "lectures"
                    ? ` ${lecs.length.toLocaleString("ar-u-nu-latn")}`
                    : t.key === "work"
                      ? ` ${(work.length + (exams.data?.length ?? 0)).toLocaleString("ar-u-nu-latn")}`
                      : t.key === "news"
                        ? ` ${(news.data?.length ?? 0).toLocaleString("ar-u-nu-latn")}`
                        : ""}
                </Chip>
              ))}
            </div>
            {staff && (
              <div className="ms-auto flex flex-wrap gap-2">
                <Link to={`/courses/${offering}/students`}>
                  <Button variant="secondary" className="min-h-9 px-3">
                    الطلاب ودفتر الدرجات
                  </Button>
                </Link>
                <Link to="/announcements/new">
                  <Button variant="secondary" className="min-h-9 px-3">
                    إعلان
                  </Button>
                </Link>
                <Link to="/live/new">
                  <Button variant="secondary" className="min-h-9 px-3">
                    جلسة بث
                  </Button>
                </Link>
                <Link to={`/lectures/new?offering=${offering}`}>
                  <Button variant="secondary" className="min-h-9 px-3">
                    <Plus size={16} aria-hidden /> محاضرة
                  </Button>
                </Link>
                <Link to={`/assignments/new?offering=${offering}`}>
                  <Button variant="secondary" className="min-h-9 px-3">
                    <Plus size={16} aria-hidden /> واجب
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {liveNow && (
            <div className="mt-4">
              <LiveBanner title={liveNow.title} />
            </div>
          )}

          <div className="mt-4">
            <WithSide side={side}>
              {tab === "lectures" && staff && lecs.length > 1 && !ordering && (
                <div className="mb-2 flex justify-end">
                  <Button
                    variant="secondary"
                    className="min-h-9 px-3"
                    onClick={() => setOrdering(true)}
                  >
                    <ArrowUpDown size={16} aria-hidden /> ترتيب المحاضرات
                  </Button>
                </div>
              )}
              {tab === "lectures" && ordering && (
                <LectureOrder
                  offering={offering}
                  // The syllabus order, first lecture on top (the list below shows the latest first).
                  lectures={lecs.slice().reverse()}
                  onDone={() => setOrdering(false)}
                />
              )}
              {tab === "lectures" && !ordering && (
                <Card className="divide-y divide-border-soft">
                  {lecs.map((l) => (
                    <Link
                      key={l.public_id}
                      to={`/lectures/${l.public_id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                    >
                      <span className="w-8 text-center font-mono text-sm text-text-muted">
                        {String(l.order ?? 0).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-text">{l.title_ar}</span>
                        <span className="text-xs text-text-muted">
                          {l.resources
                            .map((r) =>
                              r.kind === "video"
                                ? "فيديو"
                                : r.kind === "file"
                                  ? (r.file?.name ?? "ملف")
                                  : "رابط",
                            )
                            .join(" · ") || "بلا موارد"}
                          {l.type === "lab" ? " · عملي" : ""}
                          {staff && l.is_published && l.views_count != null
                            ? ` · ${l.views_count ? `فتحها ${count(l.views_count, N.student)}` : "لم يفتحها أحد بعد"}`
                            : ""}
                        </span>
                      </span>
                      {staff &&
                        (l.is_published ? (
                          <StatusBadge status="approved" label="منشورة" />
                        ) : (
                          <StatusBadge status="draft" label="مسودة" />
                        ))}
                    </Link>
                  ))}
                  {!lecs.length && (
                    <EmptyState icon={<FileText size={24} aria-hidden />} title="لا محاضرات بعد" />
                  )}
                </Card>
              )}

              {tab === "work" && (
                <div className="space-y-4">
                  <Card className="divide-y divide-border-soft">
                    {work.map((a) => {
                      const state = taskState(a);
                      return (
                        <Link
                          key={a.public_id}
                          to={`/assignments/${a.public_id}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-text">
                              {a.title}
                            </span>
                            <span className="text-xs text-text-muted">
                              {when(a.due_at)} · {count(Number(a.max_grade), N.mark)}
                            </span>
                          </span>
                          {staff ? (
                            <StatusBadge
                              status={a.status}
                              label={
                                a.status === "draft"
                                  ? "مسودة"
                                  : a.status === "closed"
                                    ? "مغلق"
                                    : "منشور"
                              }
                            />
                          ) : state === "graded" ? (
                            <b className="text-sm text-success-strong" dir="ltr">
                              {Number(a.mine!.score).toLocaleString("ar-u-nu-latn")}/
                              {Number(a.max_grade).toLocaleString("ar-u-nu-latn")}
                            </b>
                          ) : state === "submitted" ? (
                            <StatusBadge status="pending" label="سُلِّم" />
                          ) : (
                            <span
                              className={`text-xs font-semibold ${state === "late" ? "text-danger-strong" : "text-warning-strong"}`}
                            >
                              {dueLabel(a.due_at)}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                    {!work.length && (
                      <p className="px-4 py-4 text-sm text-text-muted">لا واجبات.</p>
                    )}
                  </Card>
                  {(exams.data ?? []).length > 0 && (
                    <>
                      <SectionLabel>الاختبارات</SectionLabel>
                      <Card className="divide-y divide-border-soft">
                        {exams.data!.map((e) => (
                          <Link
                            key={e.public_id}
                            to={`/exams/${e.public_id}`}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-text">
                                {e.title}
                              </span>
                              <span className="text-xs text-text-muted">
                                {when(e.opens_at)} · {count(e.duration_minutes, N.minute)} ·{" "}
                                {count(e.questions_count, N.question)}
                              </span>
                            </span>
                          </Link>
                        ))}
                      </Card>
                    </>
                  )}
                </div>
              )}

              {tab === "news" && (
                <div className="space-y-3">
                  {(news.data ?? []).map((n) => (
                    <Card key={n.public_id} className="p-4">
                      <p className="text-xs text-text-muted">
                        {n.author} · {when(n.created_at)}
                      </p>
                      <p className="mt-1 font-semibold text-text">{n.title}</p>
                      <div
                        className="mt-1 text-sm leading-7 text-text"
                        dangerouslySetInnerHTML={{ __html: n.body }}
                      />
                    </Card>
                  ))}
                  {!news.data?.length && (
                    <Card className="p-4 text-sm text-text-muted">لا إعلانات لهذه المادة.</Card>
                  )}
                </div>
              )}

              {tab === "grades" && !staff && (
                <Card className="p-4">
                  <p className="text-3xl font-bold text-text">
                    {possible
                      ? `${Math.round((100 * earned) / possible).toLocaleString("ar-u-nu-latn")}٪`
                      : "—"}
                  </p>
                  <p className="text-sm text-text-muted">
                    {earned.toLocaleString("ar-u-nu-latn")} من{" "}
                    {possible.toLocaleString("ar-u-nu-latn")} — أعمال الفصل المصححة
                  </p>
                  <div className="mt-4 divide-y divide-border-soft">
                    {graded.map((a) => (
                      <div key={a.public_id} className="flex justify-between py-2.5 text-sm">
                        <span>{a.title}</span>
                        <b dir="ltr">
                          {Number(a.mine!.score).toLocaleString("ar-u-nu-latn")} /{" "}
                          {Number(a.max_grade).toLocaleString("ar-u-nu-latn")}
                        </b>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-text-muted">
                    النتيجة النهائية تُعلن في صفحة النتائج بعد اعتمادها.
                  </p>
                </Card>
              )}
            </WithSide>
          </div>
        </>
      )}
    </PortalShell>
  );
}
