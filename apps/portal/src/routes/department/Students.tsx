import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { DepartmentSwitch } from "../../components/DepartmentSwitch";
import { PortalShell } from "../../components/PortalShell";
import {
  Avatar,
  Button,
  Card,
  Chip,
  FilterBar,
  Notice,
  problemMessage,
  StatusBadge,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { isWide } from "../../lib/media";
import { useMe } from "../../lib/auth";
import { useDepartment } from "../../lib/department";
import { can } from "../../lib/nav";
import { levelSemester, semester } from "../../lib/format";
import { initials, num } from "../../lib/reports";
import { Pager } from "../../components/Pager";
import { useConfirm } from "../../components/Confirm";
import { StudentForm } from "../../components/StudentForm";

const STATUS: Record<string, string> = {
  active: "منتظم",
  suspended: "موقوف",
  graduated: "متخرج",
  withdrawn: "منسحب",
};

/**
 * Department students: search, level and status filters (§4.15 «طلاب القسم»); phone cards,
 * desktop table. The manager and supervisor add and correct records of their department;
 * the manager deletes one added by mistake (owner 2026-09-29).
 */
export function DepartmentStudents() {
  const confirm = useConfirm();
  const me = useMe();
  const client = useQueryClient();
  const { id, department } = useDepartment();
  const canManage = can(me.data, "students.manage");
  const canDelete = can(me.data, "students.delete");
  // The side panel: a record's details, its edit form, or the new-student form.
  const [mode, setMode] = useState<"view" | "edit" | "new">("view");
  const panel = useRef<HTMLElement>(null);
  const open = (next: "edit" | "new") => {
    setMode(next);
    // Phones show the panel under the list; bring it into view.
    requestAnimationFrame(() => panel.current?.scrollIntoView({ block: "start" }));
  };
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<number | undefined>();
  const [status, setStatus] = useState<string>("active");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["students", id, search, level, status, page],
    enabled: !!id,
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/students", {
          params: {
            query: {
              department: id,
              search: search || undefined,
              level,
              status: (status || undefined) as never,
              page,
            },
          },
        }),
      ) ?? null,
  });
  const rows = list.data?.results ?? [];
  // Large screens open the first student in the side panel rather than leaving it empty.
  const s = rows.find((r) => r.public_id === picked) ?? (isWide() ? rows[0] : undefined);
  const refresh = () => client.invalidateQueries({ queryKey: ["students"] });
  const remove = useMutation({
    mutationFn: async (publicId: string) => {
      const { error, response } = await api.DELETE("/api/v1/students/{public_id}", {
        params: { path: { public_id: publicId } },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => {
      setPicked(null);
      refresh();
    },
  });
  return (
    <PortalShell
      title={`طلاب القسم · ${num(list.data?.count ?? 0)}`}
      subtitle={department?.name_ar}
      back={{ label: "لوحة القسم", to: "/department" }}
      titleAction={
        canManage ? (
          <Button className="min-h-10 px-3" onClick={() => open("new")}>
            <Plus size={16} aria-hidden />
            طالب
          </Button>
        ) : undefined
      }
    >
      <DepartmentSwitch />
      <FilterBar>
        {/* Search on its own line, then the levels, then the statuses; the «+ طالب» action
            sits with the title (it was lost among the chips on phones). */}
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="بحث بالاسم أو الرقم الجامعي"
          aria-label="بحث بالاسم أو الرقم الجامعي"
          className="min-h-10 w-full rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {[undefined, 1, 2, 3, 4].map((l) => (
            <Chip
              key={l ?? 0}
              active={level === l}
              onClick={() => {
                setLevel(l);
                setPage(1);
              }}
            >
              {l ? `م${num(l)}` : "كل المستويات"}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {["", "active", "suspended", "graduated", "withdrawn"].map((k) => (
            <Chip
              key={k || "all"}
              active={status === k}
              onClick={() => {
                setStatus(k);
                setPage(1);
              }}
            >
              {k ? STATUS[k] : "كل الحالات"}
            </Chip>
          ))}
        </div>
      </FilterBar>
      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div>
          <Card className="divide-y divide-border-soft">
            {rows.map((r) => (
              <button
                key={r.public_id}
                type="button"
                onClick={() => {
                  setPicked(r.public_id);
                  setMode("view");
                }}
                className={`flex w-full items-center gap-[var(--d-gap)] px-[var(--d-pad)] py-[var(--d-row)] text-start hover:bg-surface-alt ${s?.public_id === r.public_id ? "lg:bg-primary-soft/40" : ""}`}
              >
                <Avatar text={initials(r.full_name_ar)} size="md" tone="primary" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{r.full_name_ar}</b>
                  <span className="text-xs text-text-muted">
                    <bdi className="num">{r.university_number}</bdi> · {r.program_name} ·{" "}
                    {levelSemester(r.level, r.semester)}
                  </span>
                </span>
                <StatusBadge
                  status={
                    r.status === "active"
                      ? "approved"
                      : r.status === "suspended"
                        ? "rejected"
                        : "closed"
                  }
                  label={STATUS[r.status] ?? r.status}
                />
              </button>
            ))}
            {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا طلاب مطابقون.</p>}
          </Card>
          <Pager page={page} count={list.data?.count ?? 0} onPage={setPage} />
        </div>
        <aside ref={panel} className="mt-6 scroll-mt-20 lg:sticky lg:top-20 lg:mt-0">
          {mode === "new" && id ? (
            <StudentForm
              department={id}
              onCancel={() => setMode("view")}
              onSaved={(saved) => {
                setPicked(saved.public_id);
                setSearch(saved.full_name_ar);
                setStatus("");
                setLevel(undefined);
                setPage(1);
                setMode("view");
                refresh();
              }}
            />
          ) : s && mode === "edit" && id ? (
            <StudentForm
              department={id}
              student={s}
              onCancel={() => setMode("view")}
              onSaved={() => {
                setMode("view");
                refresh();
              }}
            />
          ) : s ? (
            <Card className="space-y-2 p-4 text-sm">
              <b className="block text-base text-text">{s.full_name_ar}</b>
              {s.full_name_en && (
                <p dir="ltr" className="text-end text-xs text-text-muted">
                  {s.full_name_en}
                </p>
              )}
              {[
                [
                  "الرقم الجامعي",
                  <bdi key="n" className="num">
                    {s.university_number}
                  </bdi>,
                ],
                ["البرنامج", s.program_name],
                ["المستوى", num(s.level)],
                ["الفصل الدراسي", semester(s.level, s.semester)],
                ["الحالة", STATUS[s.status] ?? s.status],
                ["البريد", s.email ? <bdi key="e">{s.email}</bdi> : "—"],
                ["الهاتف", s.phone_e164 ? <bdi key="p">{s.phone_e164}</bdi> : "—"],
                ["الحساب", s.has_account ? "مفعّل" : "لم يسجّل بعد"],
              ].map(([k, v]) => (
                <p key={String(k)} className="flex justify-between gap-3">
                  <span className="text-text-muted">{k}</span>
                  <span className="min-w-0 break-words font-medium">{v}</span>
                </p>
              ))}
              {(canManage || canDelete) && (
                <div className="flex flex-wrap gap-2 border-t border-border-soft pt-3">
                  {canManage && (
                    <Button
                      variant="secondary"
                      className="min-h-9 px-3"
                      onClick={() => open("edit")}
                    >
                      <Pencil size={15} aria-hidden />
                      تعديل
                    </Button>
                  )}
                  {canDelete && !s.has_account && (
                    <Button
                      variant="secondary"
                      className="min-h-9 px-3 text-danger-strong"
                      disabled={remove.isPending}
                      onClick={async () =>
                        (await confirm({
                          title: `حذف سجل «${s.full_name_ar}»؟`,
                          body: "يُحذف السجل نهائيًا. يصلح لسجل أُضيف خطأً فقط.",
                          confirm: "حذف السجل",
                        })) && remove.mutate(s.public_id)
                      }
                    >
                      <Trash2 size={15} aria-hidden />
                      حذف
                    </Button>
                  )}
                </div>
              )}
              {remove.isError && <Notice>{problemMessage(remove.error)}</Notice>}
            </Card>
          ) : (
            <Card className="p-4 text-sm text-text-muted">
              اختر طالبًا لعرض بياناته{canManage ? "، أو أضف طالبًا جديدًا." : "."}
            </Card>
          )}
        </aside>
      </div>
    </PortalShell>
  );
}
