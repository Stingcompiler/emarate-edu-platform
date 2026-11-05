import type { Schemas } from "@ecst/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  FilterBar,
  Button,
  Card,
  Chip,
  EmptyState,
  Notice,
  problemMessage,
  SideFigures,
  SideNote,
  StatusBadge,
  WithSide,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { hasRole, useMe } from "../../lib/auth";
import { useConfirm } from "../../components/Confirm";
import { when } from "../../lib/format";
import { ALL, Pager, useLocalPages } from "../../components/Pager";

type Item = Schemas["Announcement"];
const SCOPES = [
  { key: "", label: "الكل" },
  { key: "mine", label: "إعلاناتي" },
  { key: "offering", label: "موادي" },
  { key: "department", label: "القسم" },
  { key: "college", label: "الكلية" },
];

/** Board: StudentAnnouncements (phone). Desktop: derived — the feed beside counts and who-sees-what. */
export function Announcements() {
  const me = useMe();
  const [scope, setScope] = useState("");
  const feed = useQuery({
    queryKey: ["announcements"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/announcements", { params: { query: ALL } }))?.results ?? [],
  });
  // «إعلاناتي»: what one wrote stays here, to read again or ask to delete (owner, 2026-11-05).
  const items = (feed.data ?? []).filter(
    (a) => !scope || (scope === "mine" ? a.mine : a.scope === scope),
  );
  const paged = useLocalPages(items, scope);
  const author = !me.data?.student;
  return (
    <PortalShell
      title="الإعلانات"
      titleAction={
        author ? (
          <Link to="/announcements/new">
            <Button className="min-h-9 px-3">
              <Plus size={16} aria-hidden />
              إعلان
            </Button>
          </Link>
        ) : undefined
      }
    >
      <WithSide
        side={
          <>
            <SideFigures
              title="حسب النطاق"
              rows={SCOPES.map((s) => [
                s.label,
                (feed.data ?? []).filter(
                  (a) => !s.key || (s.key === "mine" ? a.mine : a.scope === s.key),
                ).length,
              ])}
            />
            <SideNote title="من يرى الإعلان؟">
              {author
                ? "إعلان المادة يصل طلابها، وإعلان القسم طلابه وأساتذته، وإعلان الكلية الجميع — في البوابة وعلى الهاتف."
                : "تصلك إعلانات موادك وقسمك والكلية هنا وعلى هاتفك إن فعّلت الإشعارات."}
            </SideNote>
          </>
        }
      >
        <FilterBar>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
            {SCOPES.map((s) => (
              <Chip key={s.key} active={scope === s.key} onClick={() => setScope(s.key)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </FilterBar>
        {!items.length ? (
          <Card className="mt-4">
            <EmptyState icon={<Megaphone size={24} aria-hidden />} title="لا إعلانات" />
          </Card>
        ) : (
          <div className="motion-stagger mt-4 grid items-start gap-3 xl:grid-cols-2">
            {paged.shown.map((a) => (
              <AnnouncementCard key={a.public_id} item={a} />
            ))}
          </div>
        )}
        <Pager page={paged.page} count={paged.count} onPage={paged.setPage} />
      </WithSide>
    </PortalShell>
  );
}

function AnnouncementCard({ item }: { item: Item }) {
  const me = useMe();
  const confirm = useConfirm();
  const client = useQueryClient();
  // The system admin and the site manager delete at once; anyone else asks, and the system
  // admin or supervisor decides (owner, 2026-11-05).
  const atOnce = hasRole(me.data, "system_admin", "site_manager");
  const remove = useMutation({
    mutationFn: async (reason: string) => {
      const { error, response } = await api.DELETE("/api/v1/announcements/{public_id}", {
        params: { path: { public_id: item.public_id } },
        body: { reason } as never,
      });
      if (!response.ok) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["announcements"] }),
  });
  const label = { college: "الكلية", department: "القسم", program: "البرنامج", offering: "المادة" }[
    item.scope ?? "college"
  ];
  return (
    <Card className="overflow-hidden">
      {item.cover_url && <img src={item.cover_url} alt="" className="h-36 w-full object-cover" />}
      <div className="p-4">
        <p className="flex items-center gap-2 text-xs text-text-muted">
          {item.is_pinned && <Pin size={14} aria-label="مثبّت" className="text-accent" />}
          <span>{label}</span>
          {item.status !== "published" && (
            <StatusBadge
              status={item.status ?? "draft"}
              label={item.status === "archived" ? "مؤرشف" : "مسودة"}
            />
          )}
        </p>
        <h2 className="mt-1 text-[17px] font-bold text-text">{item.title}</h2>
        {/* The server sanitizes announcement HTML (nh3 allow-list). */}
        <div
          className="prose-sm mt-2 text-sm leading-relaxed text-text [&_a]:text-primary"
          dangerouslySetInnerHTML={{ __html: item.body }}
        />
        <p className="mt-2 text-xs text-text-muted">
          {item.author} · {when(item.publish_at ?? item.created_at)}
        </p>
        {(item.mine || atOnce) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-soft pt-3">
            {item.deletion_pending ? (
              <StatusBadge status="pending" label="طلب الحذف بانتظار الموافقة" />
            ) : (
              <Button
                variant="ghost"
                className="min-h-10 px-2 text-sm text-danger-strong"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: atOnce ? `حذف «${item.title}»؟` : `طلب حذف «${item.title}»؟`,
                      body: atOnce
                        ? "يُحذف الإعلان نهائيًا من البوابة والموقع."
                        : "يبقى الإعلان كما هو حتى يوافق مدير النظام أو مشرف النظام على حذفه، ويصلك إشعار بالقرار.",
                      confirm: atOnce ? "حذف" : "إرسال الطلب",
                      tone: atOnce ? "danger" : "primary",
                    })
                  )
                    remove.mutate("");
                }}
              >
                <Trash2 size={16} aria-hidden />
                {atOnce ? "حذف" : "طلب حذف"}
              </Button>
            )}
            {remove.isError && <Notice>{problemMessage(remove.error)}</Notice>}
          </div>
        )}
      </div>
    </Card>
  );
}
