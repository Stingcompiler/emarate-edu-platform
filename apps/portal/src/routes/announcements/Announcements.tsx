import type { Schemas } from "@ecst/api";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Pin, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  SideFigures,
  SideNote,
  StatusBadge,
  WithSide,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { when } from "../../lib/format";

type Item = Schemas["Announcement"];
const SCOPES = [
  { key: "", label: "الكل" },
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
    queryFn: async () => (await api.GET("/api/v1/announcements")).data?.results ?? [],
  });
  const items = (feed.data ?? []).filter((a) => !scope || a.scope === scope);
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
                (feed.data ?? []).filter((a) => !s.key || a.scope === s.key).length,
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
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          {SCOPES.map((s) => (
            <Chip key={s.key} active={scope === s.key} onClick={() => setScope(s.key)}>
              {s.label}
            </Chip>
          ))}
        </div>
        {!items.length ? (
          <Card className="mt-4">
            <EmptyState icon={<Megaphone size={24} aria-hidden />} title="لا إعلانات" />
          </Card>
        ) : (
          <div className="motion-stagger mt-4 grid items-start gap-3 xl:grid-cols-2">
            {items.map((a) => (
              <AnnouncementCard key={a.public_id} item={a} />
            ))}
          </div>
        )}
      </WithSide>
    </PortalShell>
  );
}

function AnnouncementCard({ item }: { item: Item }) {
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
      </div>
    </Card>
  );
}
