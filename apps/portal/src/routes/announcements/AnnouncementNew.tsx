import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Field,
  Notice,
  SectionLabel,
  TextArea,
  problemMessage,
} from "../../components/ui";
import { api } from "../../lib/api";
import { hasRole, useMe } from "../../lib/auth";
import { can } from "../../lib/nav";

type Option = {
  key: string;
  label: string;
  scope: "college" | "department" | "program" | "offering";
  scope_id: number | null;
  audience: "public" | "all_internal" | "students" | "staff";
};

/** Boards: TeacherAnnouncement, SiteManagerAnnouncementNew (phone); desktop derived.
 *  The server re-checks every scope/audience (docs/03 §7 «إعلانات»). */
export function AnnouncementNew() {
  const me = useMe();
  const navigate = useNavigate();
  const courses = useQuery({
    queryKey: ["me", "courses"],
    queryFn: async () => (await api.GET("/api/v1/me/courses")).data ?? [],
  });
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await api.GET("/api/v1/departments")).data?.results ?? [],
    enabled: can(me.data, "learning.manage"),
  });
  const options = useMemo<Option[]>(() => {
    const list: Option[] = [];
    if (can(me.data, "content.manage")) {
      list.push({
        key: "public",
        label: "الجميع — يظهر على الموقع العام",
        scope: "college",
        scope_id: null,
        audience: "public",
      });
      list.push({
        key: "internal",
        label: "كل مستخدمي البوابة",
        scope: "college",
        scope_id: null,
        audience: "all_internal",
      });
    }
    if (hasRole(me.data, "head_registrar", "system_admin"))
      list.push({
        key: "students",
        label: "كل طلاب الكلية",
        scope: "college",
        scope_id: null,
        audience: "students",
      });
    if (hasRole(me.data, "academic_affairs", "system_admin"))
      list.push({
        key: "staff",
        label: "كل الأساتذة والمعيدين",
        scope: "college",
        scope_id: null,
        audience: "staff",
      });
    const scope = me.data?.capabilities?.["learning.manage"];
    for (const d of departments.data ?? []) {
      if (scope?.everything || scope?.departments.includes(d.id))
        list.push({
          key: `d${d.id}`,
          label: `قسم ${d.name_ar} — الجميع`,
          scope: "department",
          scope_id: d.id,
          audience: "all_internal",
        });
    }
    for (const c of courses.data ?? []) {
      // A TA announces to a course only when the teacher allowed it (docs/03 §3.9).
      if (c.my_role === "teacher" || (c.my_role === "ta" && c.ta_can_notify))
        list.push({
          key: `o${c.offering_id}`,
          label: `طلاب ${c.code} — ${c.name_ar}`,
          scope: "offering",
          scope_id: c.offering_id,
          audience: "students",
        });
    }
    return list;
  }, [me.data, departments.data, courses.data]);
  const [picked, setPicked] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const option = options.find((o) => o.key === picked) ?? options[0];
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const html = body
        .split(/\n{2,}/)
        .map(
          (p) =>
            `<p>${p.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!).replace(/\n/g, "<br>")}</p>`,
        )
        .join("");
      const { data, error } = await api.POST("/api/v1/announcements", {
        body: {
          scope: option!.scope,
          scope_id: option!.scope_id,
          audience: option!.audience,
          title,
          body: html,
        } as never,
      });
      if (!data) throw error;
      if (publish)
        await api.POST("/api/v1/announcements/{public_id}/publish", {
          params: { path: { public_id: data.public_id } },
        });
    },
    onSuccess: () => navigate("/announcements"),
  });
  return (
    <PortalShell title="إعلان جديد" back={{ label: "الإعلانات", to: "/announcements" }}>
      <div className="max-w-2xl">
        <SectionLabel>إلى</SectionLabel>
        {courses.isSuccess && !options.length && (
          <Notice>لا يمكنك نشر إعلانات الآن. اطلب من أستاذ المادة السماح للمعيد بالإعلان.</Notice>
        )}
        <Card className="divide-y divide-border-soft">
          {options.map((o) => (
            <label
              key={o.key}
              className="flex min-h-12 cursor-pointer items-center gap-3 px-4 text-sm text-text"
            >
              <input
                type="radio"
                name="scope"
                className="size-5 accent-[var(--color-primary)]"
                checked={(option?.key ?? "") === o.key}
                onChange={() => setPicked(o.key)}
              />
              {o.label}
            </label>
          ))}
        </Card>
        <SectionLabel>الإعلان</SectionLabel>
        <Card>
          <Field label="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextArea label="النص" value={body} onChange={(e) => setBody(e.target.value)} />
        </Card>
        {save.isError && (
          <div className="mt-3">
            <Notice>{problemMessage(save.error)}</Notice>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            disabled={!option || !title || save.isPending}
            onClick={() => save.mutate(false)}
          >
            حفظ مسودة
          </Button>
          <Button
            className="flex-1"
            disabled={!option || !title || !body || save.isPending}
            onClick={() => save.mutate(true)}
          >
            نشر الإعلان
          </Button>
        </div>
      </div>
    </PortalShell>
  );
}
