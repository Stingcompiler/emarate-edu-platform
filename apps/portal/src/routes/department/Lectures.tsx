import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { Card, CodeTile, SectionLabel, StatusBadge, splitCode } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useCurrentTerm, useDepartment, useOfferings } from "../../lib/department";
import { when } from "../../lib/format";
import { useLectures } from "../../lib/learning";
import { can } from "../../lib/nav";
import { num } from "../../lib/reports";

/** «المحاضرات»: the department's lectures by course with publish state; delete is manager-only. */
export function DepartmentLectures() {
  const me = useMe();
  const client = useQueryClient();
  const { id, department } = useDepartment();
  const term = useCurrentTerm();
  const offerings = useOfferings(id, term.data?.id);
  const lectures = useLectures();
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
  const total = (lectures.data ?? []).filter((l) =>
    (offerings.data ?? []).some((o) => o.id === l.offering),
  );
  return (
    <PortalShell
      title={`المحاضرات · ${num(total.length)}`}
      subtitle={`${department?.name_ar ?? ""} · ${num(total.filter((l) => l.is_published).length)} منشورة`}
      back={{ label: "لوحة القسم", to: "/department" }}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {(offerings.data ?? []).map((o) => {
          const mine = (lectures.data ?? [])
            .filter((l) => l.offering === o.id)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          const [top, bottom] = splitCode(o.course_detail.code);
          return (
            <section key={o.id}>
              <SectionLabel>
                <span className="inline-flex items-center gap-2">
                  <CodeTile top={top} bottom={bottom} /> {o.course_detail.name_ar} ·{" "}
                  {num(mine.filter((l) => l.is_published).length)}/{num(mine.length)}
                </span>
              </SectionLabel>
              <Card className="divide-y divide-border-soft">
                {mine.map((l) => (
                  <div key={l.public_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Link
                      to={`/lectures/${l.public_id}`}
                      className="min-w-0 flex-1 hover:text-primary"
                    >
                      <b className="block truncate">{l.title_ar}</b>
                      <span className="text-xs text-text-muted">
                        {l.resources.length ? `${num(l.resources.length)} موارد` : "بلا موارد"}
                        {l.published_at ? ` · ${when(l.published_at)}` : ""}
                      </span>
                    </Link>
                    <StatusBadge
                      status={l.is_published ? "published" : "draft"}
                      label={l.is_published ? "منشورة" : "مسودة"}
                    />
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
