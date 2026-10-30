import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";

import { PortalShell } from "../../components/PortalShell";
import { Avatar, Card, EmptyState, ListStatus, Switch } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { initials } from "../../lib/reports";

const DEGREE: Record<string, string> = {
  phd: "دكتوراه",
  master: "ماجستير",
  higher_diploma: "دبلوم عالٍ",
  bachelor: "بكالوريوس",
  diploma: "دبلوم",
  other: "أخرى",
};

/**
 * «الكوادر» as academic affairs reviews them (owner, 2026-10-30): the members who appear on
 * the site, with what they entered. Published as entered; a photo or a degree can be hidden
 * from the site here (the member still sees it, marked as hidden).
 */
export function StaffProfiles() {
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: async () => ok(await api.GET("/api/v1/staff-profiles")) ?? [],
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["staff-profiles"] });
  const photo = useMutation({
    mutationFn: async ({ id, hidden }: { id: string; hidden: boolean }) => {
      const { error, response } = await api.PATCH("/api/v1/staff-profiles/{public_id}/photo", {
        params: { path: { public_id: id } },
        body: { hidden },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => void refresh(),
  });
  const degree = useMutation({
    mutationFn: async ({ id, hidden }: { id: number; hidden: boolean }) => {
      const { error, response } = await api.PATCH("/api/v1/qualifications/{id}/visibility", {
        params: { path: { id } },
        body: { hidden },
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => void refresh(),
  });
  const rows = list.data ?? [];
  return (
    <PortalShell title="الكوادر على موقع الكلية" subtitle="ما يظهر للزوار — بموافقة كل عضو">
      {!rows.length && list.isSuccess ? (
        <Card>
          <EmptyState
            icon={<UsersRound size={24} aria-hidden />}
            title="لم يفعّل أحد ظهوره في الموقع بعد"
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((m) => (
            <Card key={m.public_id} className="divide-y divide-border-soft">
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar text={initials(m.full_name_ar)} size="xl" photo={m.photo} />
                <span className="min-w-0 flex-1">
                  <b className="block text-text">{m.full_name_ar}</b>
                  <span className="text-xs text-text-muted">
                    {m.academic_title_ar || "بلا لقب"}
                    {m.research_interests ? ` · ${m.research_interests}` : ""}
                  </span>
                </span>
              </div>
              {m.photo && m.public_photo && (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-text">الصورة في الموقع</span>
                  <Switch
                    checked={!m.public_photo_hidden}
                    label={`صورة ${m.full_name_ar} في الموقع`}
                    disabled={photo.isPending}
                    onChange={(show) => photo.mutate({ id: m.public_id, hidden: !show })}
                  />
                </div>
              )}
              {m.qualifications.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span
                    className={`min-w-0 ${q.hidden ? "text-text-muted line-through" : "text-text"}`}
                  >
                    {DEGREE[q.degree] ?? q.degree} في {q.field} — {q.institution}
                    {q.year ? ` · ${q.year}` : ""}
                  </span>
                  <Switch
                    checked={!q.hidden}
                    label={`إظهار ${DEGREE[q.degree] ?? q.degree} في ${q.field}`}
                    disabled={degree.isPending}
                    onChange={(show) => degree.mutate({ id: q.id, hidden: !show })}
                  />
                </div>
              ))}
              {!m.qualifications.length && (
                <p className="px-4 py-2.5 text-xs text-text-muted">لم يُضف مؤهلات.</p>
              )}
            </Card>
          ))}
          <ListStatus
            hasItems={rows.length > 0}
            loading={list.isLoading}
            failed={list.isError}
            onRetry={() => void list.refetch()}
            empty=""
          />
        </div>
      )}
    </PortalShell>
  );
}
