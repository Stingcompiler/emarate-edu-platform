import { useQuery } from "@tanstack/react-query";
import { FileText, Image, Link2, Newspaper, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import {
  FilterBar,
  Button,
  Card,
  Chip,
  SectionLabel,
  SideFigures,
  SideNote,
  StatusBadge,
  WithSide,
} from "../../components/ui";
import { api } from "../../lib/api";
import { when } from "../../lib/format";
import { ALL, Pager, useLocalPages } from "../../components/Pager";

const LABEL: Record<string, string> = { draft: "مسودة", published: "منشور", archived: "مؤرشف" };

/** Boards: SiteManagerHome (phone), DesktopSiteCMS page list (desktop). */
export function SiteHome() {
  const [tab, setTab] = useState<"pages" | "news">("pages");
  const pages = useQuery({
    queryKey: ["site", "pages"],
    queryFn: async () =>
      (await api.GET("/api/v1/content/pages", { params: { query: ALL } })).data?.results ?? [],
  });
  const news = useQuery({
    queryKey: ["site", "news"],
    queryFn: async () =>
      (await api.GET("/api/v1/content/news", { params: { query: ALL } })).data?.results ?? [],
  });
  const drafts = [...(pages.data ?? []), ...(news.data ?? [])].filter(
    (x) => x.status !== "published",
  ).length;
  const pagedPages = useLocalPages(pages.data ?? []);
  const pagedNews = useLocalPages(news.data ?? []);
  return (
    <PortalShell
      title="محتوى الموقع"
      subtitle={drafts ? `${drafts.toLocaleString("ar")} غير منشور` : "كل المحتوى منشور"}
    >
      <div className="grid grid-cols-3 gap-2">
        {[
          { to: "/site/media", icon: Image, label: "الوسائط والقوائم" },
          { to: "/site/redirects", icon: Link2, label: "التحويلات" },
          { to: "/announcements/new", icon: Newspaper, label: "إعلان عام" },
        ].map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to}>
            <Card className="flex flex-col items-center gap-1.5 px-2 py-3 text-center hover:bg-surface-alt">
              <Icon size={20} className="text-primary" aria-hidden />
              <span className="text-xs text-text">{label}</span>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-5">
        <WithSide
          side={
            <>
              <SideFigures
                title={tab === "pages" ? "الصفحات" : "الأخبار"}
                rows={[
                  [
                    "منشورة",
                    ((tab === "pages" ? pages : news).data ?? []).filter(
                      (x) => x.status === "published",
                    ).length,
                  ],
                  [
                    "غير منشورة",
                    ((tab === "pages" ? pages : news).data ?? []).filter(
                      (x) => x.status !== "published",
                    ).length,
                  ],
                ]}
              />
              <SideNote title="الصفحات الرسمية">
                صفحات الكلية الرسمية (عن الكلية، كلمة العميد، الرسوم، الخصوصية…) موجودة مسوداتٍ فيها
                إرشادات الكتابة. استبدل الإرشاد بالنص المعتمد ثم انشر؛ يظهر رابطها في قوائم الموقع
                تلقائيًا.
              </SideNote>
            </>
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
      </div>
    </PortalShell>
  );
}
