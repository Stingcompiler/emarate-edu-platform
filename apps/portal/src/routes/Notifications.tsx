import type { Schemas } from "@ecst/api";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Award, BellOff, BookOpen, Briefcase, Megaphone, UserCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { PortalShell, useUnreadCount } from "../components/PortalShell";
import { Button, Card, Chip, EmptyState, SideFigures, SideNote, WithSide } from "../components/ui";
import { api } from "../lib/api";
import { DAY_LABELS, type DayGroup, dayGroup, when } from "../lib/format";
import { isBuiltPath } from "../lib/links";

type Item = Schemas["InboxItem"];
type Filter = "all" | "unread" | "course" | "college" | "results";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "unread", label: "غير مقروء" },
  { key: "course", label: "المواد" },
  { key: "college", label: "الكلية" },
  { key: "results", label: "النتائج" },
];

const CATEGORY = {
  course: { icon: BookOpen, className: "bg-primary-soft text-primary-700" },
  college: { icon: Megaphone, className: "bg-info-soft text-info-strong" },
  results: { icon: Award, className: "bg-success-soft text-success-strong" },
  account: { icon: UserCheck, className: "bg-neutral-soft text-neutral-strong" },
  hr: { icon: Briefcase, className: "bg-warning-soft text-warning-strong" },
} as const;

/**
 * Board: StudentNotifications / TeacherNotifications / AdminNotifications (phone).
 * Desktop: no board — the same list in the desktop shell, one readable column
 * (docs/06 §9).
 */
export function Notifications() {
  const [filter, setFilter] = useState<Filter>("all");
  const client = useQueryClient();
  const navigate = useNavigate();
  const unread = useUnreadCount();

  const list = useInfiniteQuery({
    queryKey: ["notifications", "list", filter],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const query: Record<string, string | number | boolean> = { page: pageParam };
      if (filter === "unread") query.read_at__isnull = true;
      else if (filter !== "all") query.notification__category = filter;
      const { data } = await api.GET("/api/v1/notifications", { params: { query } });
      if (!data) throw new Error("load failed");
      return data;
    },
    getNextPageParam: (last, pages) => (last.next ? pages.length + 1 : undefined),
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await api.POST("/api/v1/notifications/{id}/read", { params: { path: { id } } });
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await api.POST("/api/v1/notifications/read-all");
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = list.data?.pages.flatMap((page) => page.results) ?? [];
  const groups = groupByDay(items);
  const unreadCount = unread.data?.count ?? 0;

  function open(item: Item) {
    if (!item.read_at) markRead.mutate(item.id);
    const url = item.action_url;
    if (url.startsWith("https://")) window.open(url, "_blank", "noopener");
    else if (url && isBuiltPath(url)) navigate(url);
  }

  const markAllButton = (
    <button
      type="button"
      onClick={() => markAll.mutate()}
      disabled={!unreadCount || markAll.isPending}
      className="min-h-11 text-sm font-semibold text-primary disabled:opacity-50"
    >
      تحديد الكل مقروءًا
    </button>
  );

  return (
    <PortalShell title="الإشعارات" titleAction={markAllButton}>
      <WithSide
        side={
          <>
            <SideFigures rows={[["غير مقروءة", unreadCount.toLocaleString("ar")]]} />
            <SideNote title="تصلك بالطريقة التي تختارها">
              لكل فئة قنواتها: داخل التطبيق، وعلى الهاتف، وبالبريد.{" "}
              <Link to="/settings" className="font-semibold text-primary">
                الإعدادات
              </Link>
            </SideNote>
          </>
        }
      >
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
          role="toolbar"
          aria-label="تصفية"
        >
          {FILTERS.map(({ key, label }) => (
            <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
              {label}
              {key === "unread" && unreadCount > 0 && (
                <span>{unreadCount.toLocaleString("ar")}</span>
              )}
            </Chip>
          ))}
        </div>

        {list.isPending ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState icon={<BellOff size={24} aria-hidden />} title="لا إشعارات هنا">
            {filter === "unread" ? "قرأت كل شيء." : "ستظهر هنا إشعارات موادك والكلية والنتائج."}
          </EmptyState>
        ) : (
          groups.map(([group, rows]) => (
            <section key={group} aria-labelledby={`g-${group}`}>
              <h2
                id={`g-${group}`}
                className="mb-2 mt-5 px-1 text-xs font-semibold text-text-muted"
              >
                {DAY_LABELS[group]}
              </h2>
              <Card className="motion-stagger divide-y divide-border-soft overflow-hidden">
                {rows.map((item) => (
                  <NotificationRow key={item.id} item={item} onOpen={() => open(item)} />
                ))}
              </Card>
            </section>
          ))
        )}

        {list.hasNextPage && (
          <div className="mt-4 text-center">
            <Button
              variant="secondary"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? "جارٍ التحميل…" : "عرض الأقدم"}
            </Button>
          </div>
        )}
      </WithSide>
    </PortalShell>
  );
}

function NotificationRow({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const style = CATEGORY[item.category as keyof typeof CATEGORY] ?? CATEGORY.college;
  const Icon = style.icon;
  const unread = !item.read_at;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors hover:bg-surface-alt"
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${style.className}`}>
        <Icon size={18} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span
            className={`text-sm leading-snug text-text ${unread ? "font-bold" : "font-medium"}`}
          >
            {item.priority === "urgent" && (
              <span className="me-1.5 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger-strong">
                عاجل
              </span>
            )}
            {item.title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
            {when(item.created_at)}
            {unread && <span className="size-2 rounded-full bg-primary" aria-label="غير مقروء" />}
          </span>
        </span>
        {item.body && (
          <span className="mt-0.5 line-clamp-2 block text-sm leading-relaxed text-text-muted">
            {item.body}
          </span>
        )}
        {item.sender && <span className="mt-1 block text-xs text-text-muted">{item.sender}</span>}
      </span>
    </button>
  );
}

function groupByDay(items: Item[]): [DayGroup, Item[]][] {
  const order: DayGroup[] = ["today", "yesterday", "week", "older"];
  const map = new Map<DayGroup, Item[]>();
  for (const item of items) {
    const group = dayGroup(item.created_at);
    map.set(group, [...(map.get(group) ?? []), item]);
  }
  return order.filter((g) => map.has(g)).map((g) => [g, map.get(g)!]);
}

function ListSkeleton() {
  return (
    <Card className="mt-5 divide-y divide-border-soft">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 px-4 py-4" aria-hidden>
          <div className="size-10 animate-pulse rounded-full bg-surface-alt" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-alt" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-alt" />
          </div>
        </div>
      ))}
    </Card>
  );
}
