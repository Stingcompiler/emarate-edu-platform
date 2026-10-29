import { useQuery } from "@tanstack/react-query";
import { FileCheck, FileText, Image, Link2, ListTodo, Newspaper, Plus, Zap } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Panel, QuickLinks } from "../../components/dashboard";
import { PortalShell } from "../../components/PortalShell";
import {
  FilterBar,
  Button,
  Card,
  Chip,
  SectionLabel,
  SideNote,
  StatusBadge,
  WithSide,
} from "../../components/ui";
import { api, ok } from "../../lib/api";
import { when } from "../../lib/format";
import { num } from "../../lib/reports";
import { Inbox, type InboxItem, inboxState } from "../homes/Inbox";
import { ALL, Pager, useLocalPages } from "../../components/Pager";

const LABEL: Record<string, string> = { draft: "مسودة", published: "منشور", archived: "مؤرشف" };

/** Boards: SiteManagerHome (phone), DesktopSiteCMS page list (desktop). */
export function SiteHome() {
  const [tab, setTab] = useState<"pages" | "news">("pages");
  const pages = useQuery({
    queryKey: ["site", "pages"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/content/pages", { params: { query: ALL } }))?.results ?? [],
  });
  const news = useQuery({
    queryKey: ["site", "news"],
    queryFn: async () =>
      ok(await api.GET("/api/v1/content/news", { params: { query: ALL } }))?.results ?? [],
  });
  const drafts = [...(pages.data ?? []), ...(news.data ?? [])].filter(
    (x) => x.status !== "published",
  ).length;
  const draftPages = (pages.data ?? []).filter((x) => x.status === "draft");
  const draftNews = (news.data ?? []).filter((x) => x.status === "draft");
  // «يحتاج إجراءك» (mockups 2026-10-29): drafts waiting for the approved text; the button opens
  // the first one.
  const inbox: InboxItem[] = [
    {
      n: draftPages.length,
      title: "صفحات تحتاج استكمالًا",
      meta: "مسودات فيها إرشاد الكتابة: ضع النص المعتمد ثم انشر",
      to: draftPages[0] ? `/site/pages/${draftPages[0].public_id}` : "/site",
      action: "أكمل الصفحة",
    },
    {
      n: draftNews.length,
      title: "أخبار في المسودة",
      meta: "لا تظهر على الموقع حتى تُنشر",
      to: draftNews[0] ? `/site/news/${draftNews[0].public_id}` : "/site",
      tone: "info",
      action: "راجع الخبر",
    },
  ];
  const ready = (list: { status?: string | null }[] | undefined) =>
    (list ?? []).filter((x) => x.status === "published").length;
  const pagedPages = useLocalPages(pages.data ?? []);
  const pagedNews = useLocalPages(news.data ?? []);
  return (
    <PortalShell
      title="محتوى الموقع"
      subtitle={drafts ? `${drafts.toLocaleString("ar-u-nu-latn")} غير منشور` : "كل المحتوى منشور"}
    >
      <div className="mb-6">
        <Inbox
          title="يحتاج إجراءك"
          icon={ListTodo}
          items={inbox}
          empty="كل المحتوى منشور."
          {...inboxState(pages, news)}
        />
      </div>
      <WithSide
        side={
          <div className="space-y-6">
            <Panel title="وصول سريع" icon={Zap}>
              <QuickLinks
                items={[
                  { to: "/site/media", icon: Image, label: "الوسائط والقوائم" },
                  { to: "/site/redirects", icon: Link2, label: "التحويلات" },
                  { to: "/announcements/new", icon: Newspaper, label: "إعلان عام" },
                ]}
              />
            </Panel>
            <Panel title="جاهزية المحتوى" icon={FileCheck}>
              {(
                [
                  [
                    "صفحات منشورة",
                    ready(pages.data),
                    (pages.data?.length ?? 0) - ready(pages.data),
                  ],
                  ["أخبار منشورة", ready(news.data), (news.data?.length ?? 0) - ready(news.data)],
                ] as const
              ).map(([label, done, left]) => (
                <p key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  {label}
                  <span className="text-text-muted">
                    <b className="text-text">{num(done)}</b> · غير منشور {num(left)}
                  </span>
                </p>
              ))}
            </Panel>
            <SideNote title="الصفحات الرسمية">
              صفحات الكلية الرسمية (عن الكلية، كلمة العميد، الرسوم، الخصوصية…) موجودة مسوداتٍ فيها
              إرشادات الكتابة. استبدل الإرشاد بالنص المعتمد ثم انشر؛ يظهر رابطها في قوائم الموقع
              تلقائيًا.
            </SideNote>
          </div>
        }
      >
        <FilterBar>
          <div className="flex items-center gap-2">
            <Chip active={tab === "pages"} onClick={() => setTab("pages")}>
              الصفحات
            </Chip>
            <Chip active={tab === "news"} onClick={() => setTab("news")}>
              الأخبار
            </Chip>
            <Link to={tab === "pages" ? "/site/pages/new" : "/site/news/new"} className="ms-auto">
              <Button className="min-h-9 px-3">
                <Plus size={16} aria-hidden />
                {tab === "pages" ? "صفحة" : "خبر"}
              </Button>
            </Link>
          </div>
        </FilterBar>
        <SectionLabel>{tab === "pages" ? "صفحات الموقع" : "الأخبار"}</SectionLabel>
        <Card className="divide-y divide-border-soft">
          {tab === "pages"
            ? pagedPages.shown.map((p) => (
                <Link
                  key={p.public_id}
                  to={`/site/pages/${p.public_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  <FileText size={18} className="text-text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">{p.title_ar}</span>
                    <span className="text-xs text-text-muted" dir="ltr">
                      /{p.path}/
                    </span>
                  </span>
                  <StatusBadge
                    status={p.status ?? "draft"}
                    label={LABEL[p.status ?? "draft"] ?? ""}
                  />
                </Link>
              ))
            : pagedNews.shown.map((n) => (
                <Link
                  key={n.public_id}
                  to={`/site/news/${n.public_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
                >
                  <Newspaper size={18} className="text-text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">{n.title}</span>
                    <span className="text-xs text-text-muted">{when(n.updated_at)}</span>
                  </span>
                  <StatusBadge
                    status={n.status ?? "draft"}
                    label={LABEL[n.status ?? "draft"] ?? ""}
                  />
                </Link>
              ))}
          {(tab === "pages" ? pages : news).isSuccess &&
            !(tab === "pages" ? pages : news).data?.length && (
              <p className="px-4 py-5 text-sm text-text-muted">
                {tab === "pages" ? "لا صفحات بعد." : "لا أخبار بعد. أضف أول خبر من زر «خبر»."}
              </p>
            )}
        </Card>
        {tab === "pages" ? (
          <Pager page={pagedPages.page} count={pagedPages.count} onPage={pagedPages.setPage} />
        ) : (
          <Pager page={pagedNews.page} count={pagedNews.count} onPage={pagedNews.setPage} />
        )}
      </WithSide>
    </PortalShell>
  );
}
