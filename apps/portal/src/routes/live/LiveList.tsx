import type { Schemas } from "@ecst/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Radio } from "lucide-react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  EmptyState,
  Notice,
  SectionLabel,
  SideFigures,
  SideNote,
  StatusBadge,
  WithSide,
  problemMessage,
} from "../../components/ui";
import { api, ok, openAfter } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { DAY_LABELS } from "../../lib/format";
import { ALL } from "../../components/Pager";

type Session = Schemas["LiveSession"];
const time = new Intl.DateTimeFormat("ar-u-nu-latn", { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("ar-u-nu-latn", { weekday: "long" });
const PROVIDER: Record<string, string> = {
  teams: "Teams",
  meet: "Meet",
  zoom: "Zoom",
  other: "رابط",
};

/** Boards: StudentLive (phone), DesktopDeptLive (desktop). Links open in the provider's app. */
export function LiveList() {
  const me = useMe();
  const staff = !me.data?.student;
  const sessions = useQuery({
    queryKey: ["live"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/live-sessions", { params: { query: ALL } }))?.results ?? [],
  });
  const join = useMutation({
    mutationFn: (id: string) =>
      openAfter(async () => {
        const { data, error } = await api.GET("/api/v1/live-sessions/{public_id}/join", {
          params: { path: { public_id: id } },
        });
        if (!data) throw error;
        return data.url;
      }),
  });
  const now = Date.now();
  const rows = (sessions.data ?? []).filter((s) => new Date(s.ends_at).getTime() > now - 3_600_000);
  const live = rows.filter(
    (s) =>
      s.status !== "cancelled" &&
      new Date(s.starts_at).getTime() <= now &&
      new Date(s.ends_at).getTime() > now,
  );
  const upcoming = rows.filter((s) => !live.includes(s));
  const groups = new Map<string, Session[]>();
  for (const s of upcoming) {
    const g =
      new Date(s.starts_at).getTime() > now
        ? new Date(s.starts_at).toDateString() === new Date().toDateString()
          ? "today"
          : "week"
        : "today";
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }

  return (
    <PortalShell
      title="البث المباشر"
      subtitle="الروابط تُفتح في تطبيق المزوّد ولا تظهر إلا للمسجلين"
      titleAction={
        staff ? (
          <Link to="/live/new">
            <Button className="min-h-9 px-3">
              <Plus size={16} aria-hidden />
              جلسة
            </Button>
          </Link>
        ) : undefined
      }
    >
      <WithSide
        side={
          <>
            <SideFigures
              rows={[
                ["جارٍ الآن", live.length],
                ["قادمة", rows.length - live.length],
              ]}
            />
            <SideNote title="الانضمام">
              يُفتح الرابط في تطبيق المزوّد (Teams أو Zoom أو Meet). لا يظهر الرابط إلا للمسجلين في
              المادة أو البرنامج، ويُسجَّل انضمامك.
            </SideNote>
          </>
        }
      >
        {join.isError && <Notice>{problemMessage(join.error)}</Notice>}
        {!rows.length && !sessions.isPending && (
          <Card>
            <EmptyState icon={<Radio size={24} aria-hidden />} title="لا جلسات قادمة" />
          </Card>
        )}
        {live.map((s) => (
          <Card key={s.public_id} className="mb-4 border-accent-200 bg-accent-soft p-4">
            <p className="text-xs font-semibold text-accent">● جارٍ الآن</p>
            <p className="mt-1 text-lg font-bold text-text">
              {s.course_name ? `${s.course_name} — ` : ""}
              {s.title}
            </p>
            <p className="text-sm text-text-muted">
              {s.host_name} · {PROVIDER[s.provider]} · بدأ {time.format(new Date(s.starts_at))}
            </p>
            <Button
              className="mt-3 w-full bg-accent hover:bg-accent-hover sm:w-auto"
              onClick={() => join.mutate(s.public_id)}
            >
              انضمام
            </Button>
          </Card>
        ))}
        {[...groups.entries()].map(([g, list]) => (
          <section key={g}>
            <SectionLabel>{g === "today" ? DAY_LABELS.today : "القادمة"}</SectionLabel>
            <Card className="divide-y divide-border-soft">
              {list.map((s) => (
                <div key={s.public_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-16 shrink-0 text-center">
                    <span className="block text-sm font-bold text-text">
                      {time.format(new Date(s.starts_at))}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {day.format(new Date(s.starts_at))}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text">
                      {s.course_code ? `${s.course_code} · ` : ""}
                      {s.title}
                    </span>
                    <span className="text-xs text-text-muted">
                      {PROVIDER[s.provider]} · {s.host_name}
                      {s.program_name ? ` · ${s.program_name} — المستوى ${s.level}` : ""}
                    </span>
                  </span>
                  {s.status === "cancelled" ? (
                    <StatusBadge status="rejected" label="ملغاة" />
                  ) : (
                    <Button
                      variant="secondary"
                      className="min-h-9 px-3"
                      onClick={() => join.mutate(s.public_id)}
                    >
                      الرابط
                    </Button>
                  )}
                </div>
              ))}
            </Card>
          </section>
        ))}
      </WithSide>
    </PortalShell>
  );
}
