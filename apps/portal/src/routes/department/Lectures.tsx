import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router";

import { DepartmentSwitch } from "../../components/DepartmentSwitch";
import { PortalShell } from "../../components/PortalShell";
import { Card, CodeTile, SectionLabel, StatusBadge, splitCode } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm, useDepartment, useOfferings } from "../../lib/department";
import { when, count, N } from "../../lib/format";
import { useLectures } from "../../lib/learning";
import { can } from "../../lib/nav";
import { num } from "../../lib/reports";

/**
 * «المحاضرات»: the department's lectures by course with publish state. The manager and
 * supervisor add, edit and publish lectures in every course of the department; delete is
 * manager-only (owner 2026-09-29: full control of the department).
 */
export function DepartmentLectures() {
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
  return (
    <PortalShell
      title={`المحاضرات · ${num(total.length)}`}
      subtitle={`${department?.name_ar ?? ""} · ${num(total.filter((l) => l.is_published).length)} منشورة`}
      back={{ label: "لوحة القسم", to: "/department" }}
    >
      <DepartmentSwitch />
      <div className="grid gap-4 lg:grid-cols-2">
        {(offerings.data ?? []).map((o) => {
          const mine = (lectures.data ?? [])
            .filter((l) => l.offering === o.id)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
                        onClick={() =>
                          window.confirm(`حذف «${l.title_ar}»؟`) && remove.mutate(l.public_id)
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
    </PortalShell>
  );
}
