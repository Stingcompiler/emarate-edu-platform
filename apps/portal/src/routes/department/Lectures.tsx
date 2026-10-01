import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router";

import { DepartmentSwitch } from "../../components/DepartmentSwitch";
import { PortalShell } from "../../components/PortalShell";
import {
  Card,
  CodeTile,
  FilterBar,
  SectionLabel,
  StatusBadge,
  WithSide,
  splitCode,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm, useDepartment, useOfferings } from "../../lib/department";
import { when, count, N } from "../../lib/format";
import { useLectures } from "../../lib/learning";
import { can } from "../../lib/nav";
import { Bars, Kpi, num } from "../../lib/reports";
import { useConfirm } from "../../components/Confirm";

/**
 * «المحاضرات»: the department's lectures by course with publish state. The manager and
 * supervisor add, edit and publish lectures in every course of the department; delete is
 * manager-only (owner 2026-09-29: full control of the department). Large screens add figures, a
 * search, the upload trend and each course's published share beside the list (board
 * DesktopDeptLectures, review 2026-09-29 PR 7) — additions only (docs/02 D20).
 */
export function DepartmentLectures() {
  const confirm = useConfirm();
  const me = useMe();
  const client = useQueryClient();
  const { id, department } = useDepartment();
  const term = useCurrentTerm();
  const offerings = useOfferings(id, term.data?.id);
  const lectures = useLectures("all");
  const remove = useMutation({
    mutationFn: async (publicId: string) => {
      const { error, response } = await api.DELETE("/api/v1/lectures/{public_id}", {
        params: { path: { public_id: publicId } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["lectures"] }),
  });
  const canDelete = can(me.data, "learning.delete");
  const canManage = can(me.data, "learning.manage");
  const publish = useMutation({
    mutationFn: async ({ publicId, on }: { publicId: string; on: boolean }) => {
      const path = { params: { path: { public_id: publicId } } };
      const { error, response } = on
        ? await api.POST("/api/v1/lectures/{public_id}/publish", path)
        : await api.POST("/api/v1/lectures/{public_id}/unpublish", path);
      if (!response.ok) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["lectures"] }),
  });
  const total = (lectures.data ?? []).filter((l) =>
    (offerings.data ?? []).some((o) => o.id === l.offering),
  );
  // Added for large screens (board DesktopDeptLectures; the page's own flow is unchanged):
  // figures, a search, the 8-week upload trend and each course's published share.
  const [q, setQ] = useState("");
  const [course, setCourse] = useState<number | "all">("all");
  const now = Date.now();
  const DAY = 86_400_000;
  const published = total.filter((l) => l.is_published);
  const withKind = (kind: string) =>
    published.filter((l) => l.resources.some((r) => r.kind === kind)).length;
  const recent = published.filter(
    (l) => l.published_at && now - new Date(l.published_at).getTime() < 30 * DAY,
  ).length;
  const latest = published
    .map((l) => l.published_at ?? "")
    .sort()
    .at(-1);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * DAY;
    return published.filter((l) => {
      const at = l.published_at ? new Date(l.published_at).getTime() : 0;
      return at > end - 7 * DAY && at <= end;
    }).length;
  });
  const coverage = (offerings.data ?? [])
    .map((o) => {
      const mine = total.filter((l) => l.offering === o.id);
      return {
        id: o.id,
        name: o.course_detail.name_ar,
        done: mine.filter((l) => l.is_published).length,
        all: mine.length,
      };
    })
    .sort((a, b) => a.done - b.done);
  const shown = (offerings.data ?? []).filter((o) => course === "all" || o.id === course);
  const matches = (title: string) => !q.trim() || title.includes(q.trim());
  return (
    <PortalShell
      title={`المحاضرات · ${num(total.length)}`}
      subtitle={`${department?.name_ar ?? ""} · ${num(total.filter((l) => l.is_published).length)} منشورة`}
      back={{ label: "لوحة القسم", to: "/department" }}
    >
      <DepartmentSwitch />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi value={published.length} label="محاضرة منشورة" note={`+${num(recent)} في 30 يومًا`} />
        <Kpi
          value={withKind("video")}
          label="بفيديو"
          note={
            published.length
              ? `${num(Math.round((100 * withKind("video")) / published.length))}٪`
              : undefined
          }
        />
        <Kpi
          value={withKind("file")}
          label="بملفات"
          note={
            published.length
              ? `${num(Math.round((100 * withKind("file")) / published.length))}٪`
              : undefined
          }
        />
        <Kpi value={total.length - published.length} label="مسودة" />
        {/* The fifth tile takes the whole row on phones instead of sitting alone in half. */}
        <div className="col-span-2 lg:col-span-1">
          <Kpi value={latest ? when(latest) : "—"} label="آخر رفع" />
        </div>
      </div>
      <FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث بعنوان المحاضرة"
            aria-label="بحث بعنوان المحاضرة"
            className="block min-h-10 w-full rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-sm"
          />
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value === "all" ? "all" : Number(e.target.value))}
            aria-label="المادة"
            className="min-h-10 rounded-full border border-border-soft bg-surface px-3 text-sm"
          >
            <option value="all">كل المواد</option>
            {(offerings.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.course_detail.code} · {o.course_detail.name_ar}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>
      <WithSide
        side={
          <>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-text">اتجاه الرفع — 8 أسابيع</h2>
              <Bars
                values={weeks}
                labels={weeks.map((_, i) => num(i + 1))}
                caption="محاضرات منشورة كل أسبوع · الأخير = هذا الأسبوع"
              />
            </Card>
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold text-text">حسب المادة — المنشور</h2>
              <ul className="divide-y divide-border-soft text-sm">
                {coverage.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-2">
                    <span
                      className={`min-w-0 flex-1 truncate ${c.done === 0 ? "text-danger-strong" : "text-text"}`}
                    >
                      {c.name}
                    </span>
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-alt">
                      <span
                        className="motion-grow block h-full rounded-full bg-primary"
                        style={{ width: c.all ? `${(100 * c.done) / c.all}%` : "0%" }}
                      />
                    </span>
                    <b className="w-10 text-end text-xs">
                      {num(c.done)}/{num(c.all)}
                    </b>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        }
      >
        <div className="grid gap-4 2xl:grid-cols-2">
          {shown.map((o) => {
            const mine = (lectures.data ?? [])
              .filter((l) => l.offering === o.id && matches(l.title_ar))
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            if (q.trim() && !mine.length) return null;
            const [top, bottom] = splitCode(o.course_detail.code);
            return (
              <section key={o.id}>
                <div className="flex items-center gap-2">
                  <SectionLabel>
                    <Link
                      to={`/courses/${o.id}`}
                      className="inline-flex items-center gap-2 hover:text-primary"
                    >
                      <CodeTile top={top} bottom={bottom} /> {o.course_detail.name_ar} ·{" "}
                      {num(mine.filter((l) => l.is_published).length)}/{num(mine.length)}
                    </Link>
                  </SectionLabel>
                  {canManage && (
                    <Link
                      to={`/lectures/new?offering=${o.id}`}
                      className="ms-auto inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:bg-surface-alt"
                    >
                      <Plus size={15} aria-hidden />
                      محاضرة
                    </Link>
                  )}
                </div>
                <Card className="divide-y divide-border-soft">
                  {mine.map((l) => (
                    <div key={l.public_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <Link
                        to={`/lectures/${l.public_id}`}
                        className="min-w-0 flex-1 hover:text-primary"
                      >
                        <b className="block truncate">{l.title_ar}</b>
                        <span className="text-xs text-text-muted">
                          {l.resources.length
                            ? `${count(l.resources.length, N.resource)}`
                            : "بلا موارد"}
                          {l.published_at ? ` · ${when(l.published_at)}` : ""}
                          {l.is_published && l.views_count != null
                            ? ` · ${l.views_count ? `فتحها ${count(l.views_count, N.student)}` : "لم يفتحها أحد بعد"}`
                            : ""}
                        </span>
                      </Link>
                      <StatusBadge
                        status={l.is_published ? "published" : "draft"}
                        label={l.is_published ? "منشورة" : "مسودة"}
                      />
                      {canManage && (
                        <>
                          <button
                            type="button"
                            aria-label={l.is_published ? "إلغاء نشر المحاضرة" : "نشر المحاضرة"}
                            title={l.is_published ? "إلغاء النشر" : "نشر"}
                            onClick={() =>
                              publish.mutate({ publicId: l.public_id, on: !l.is_published })
                            }
                            className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-surface-alt hover:text-primary"
                          >
                            {l.is_published ? (
                              <EyeOff size={15} aria-hidden />
                            ) : (
                              <Eye size={15} aria-hidden />
                            )}
                          </button>
                          <Link
                            to={`/lectures/${l.public_id}/edit`}
                            aria-label="تعديل المحاضرة"
                            className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-surface-alt hover:text-primary"
                          >
                            <Pencil size={15} aria-hidden />
                          </Link>
                        </>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          aria-label="حذف المحاضرة"
                          onClick={async () =>
                            (await confirm({
                              title: `حذف «${l.title_ar}»؟`,
                              body: "تختفي المحاضرة وموادها من صفحة المادة عند الطلاب.",
                              confirm: "حذف المحاضرة",
                            })) && remove.mutate(l.public_id)
                          }
                          className="grid size-8 place-items-center text-danger-strong"
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                  {!mine.length && <p className="px-4 py-3 text-sm text-text-muted">لا محاضرات.</p>}
                </Card>
              </section>
            );
          })}
        </div>
      </WithSide>
    </PortalShell>
  );
}
