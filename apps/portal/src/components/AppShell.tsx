import { ChevronRight, type LucideIcon, Menu } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { NavLink } from "react-router";
import { ThemeToggle } from "./ThemeToggle";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Opens outside the portal (e.g. API docs); rendered as a plain link. */
  external?: boolean;
  /** Unread count shown as a badge (hidden when 0). */
  badge?: number;
  /** Match only the exact path (default) or also nested paths. */
  end?: boolean;
  /** One-word label for the phone tab bar when `label` is too long to fit. */
  short?: string;
};

type AppShellProps = {
  /** Page title: large title on phones, PageHeader on desktop. */
  title: string;
  subtitle?: string;
  /** Small line above the phone title (context, e.g. the college). */
  eyebrow?: string;
  nav: NavItem[];
  /** Right side of the desktop top bar (bell, account). */
  actions?: ReactNode;
  /** Phone: a small link above the title (e.g. "‹ الرئيسية"). */
  back?: { label: string; to: string };
  /** Action next to the title (e.g. "تحديد الكل مقروءًا"). */
  titleAction?: ReactNode;
  children: ReactNode;
};

/**
 * Portal shell — one component, two layouts (docs/06 §9, skill responsive-page):
 *
 * - **Phone / tablet (< lg):** NavigationBar with a large title on the page
 *   background (collapses to a glass bar on scroll, docs/09); one column; a
 *   floating bottom tab bar once there are two or more destinations.
 * - **Desktop (≥ lg):** navy TopBar + Sidebar on the right (264px) + PageHeader
 *   + content up to 1280px.
 *
 * Same children render in both; only the chrome around them changes.
 */
export function AppShell({
  title,
  subtitle,
  eyebrow,
  nav,
  actions,
  back,
  titleAction,
  children,
}: AppShellProps) {
  const internal = nav.filter((item) => !item.external);
  const compact = useScrolledPast(40);
  const showTabs = internal.length >= 2;

  return (
    <div className="min-h-dvh bg-bg-subtle lg:flex lg:flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 font-semibold text-primary shadow focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        تخطَّ إلى المحتوى
      </a>
      {/* Desktop top bar */}
      {/* Stays in place while the page scrolls (owner, 2026-09-29): the bar and the sidebar. */}
      <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-4 bg-header px-6 text-text-inverse lg:flex">
        <Brand />
        <span className="text-xs text-navy-200">{eyebrow}</span>
        <div className="ms-auto flex items-center gap-2">{actions}</div>
      </header>

      {/* Phone NavigationBar (docs/09): large title that collapses into a glass bar */}
      <div
        aria-hidden={!compact}
        // Hidden until scrolled: its toggle must not be reachable by keyboard meanwhile.
        inert={!compact}
        className={`fixed inset-x-0 top-0 z-20 flex h-[calc(2.75rem+env(safe-area-inset-top))] items-end justify-center border-b border-border-soft bg-surface/80 pb-2.5 backdrop-blur transition-opacity duration-150 lg:hidden ${
          compact ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <span className="text-[17px] font-semibold text-text">{title}</span>
        <ThemeToggle className="absolute bottom-0.5 end-2 text-text-muted hover:bg-surface-alt" />
      </div>
      <header className="px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] lg:hidden">
        <div className="flex min-h-10 items-center justify-between gap-3">
          {back ? (
            <NavLink
              to={back.to}
              className="inline-flex min-h-8 items-center gap-1 text-[15px] text-primary"
            >
              <ChevronRight size={20} aria-hidden className="ltr:rotate-180" />
              {back.label}
            </NavLink>
          ) : (
            <p className="text-xs font-semibold text-text-muted">{eyebrow}</p>
          )}
          <ThemeToggle className="-me-2 text-text-muted hover:bg-surface-alt" />
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-tight text-text">{title}</h1>
          {titleAction}
        </div>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </header>

      <div className="lg:flex lg:min-h-0 lg:flex-1">
        {/* Desktop sidebar — first in DOM, so it sits on the right in RTL */}
        <aside className="hidden w-66 shrink-0 border-e border-border-soft bg-surface px-3 py-4 lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:self-start lg:overflow-y-auto">
          <nav aria-label="التنقل الرئيسي" className="flex flex-col gap-0.5">
            {nav.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </nav>
        </aside>

        <main
          id="main"
          tabIndex={-1}
          className={`min-w-0 flex-1 focus:outline-none px-4 pb-5 pt-3 lg:px-8 lg:py-6 ${showTabs ? "pb-28 lg:pb-6" : ""}`}
        >
          <div className="mx-auto max-w-[1280px]">
            <div className="mb-5 hidden items-end justify-between gap-4 lg:flex">
              <div>
                <h1 className="text-2xl font-bold text-text">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
              </div>
              {titleAction}
            </div>
            {children}
          </div>
        </main>
      </div>

      {showTabs && <BottomTabs items={internal} />}
    </div>
  );
}

/** True once the page is scrolled past ``offset`` px (collapses the phone title). */
function useScrolledPast(offset: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > offset);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [offset]);
  return past;
}

function Brand() {
  return (
    <span className="flex items-center gap-2.5 text-sm font-bold">
      <img src="/favicon.svg" alt="" width={30} height={30} className="rounded-md bg-white" />
      بوابة الكلية
    </span>
  );
}

const sidebarItem =
  "flex items-center gap-3 rounded-md px-3.5 py-2.5 text-sm transition-colors duration-150";

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  if (item.external) {
    return (
      <a
        href={item.to}
        target="_blank"
        rel="noreferrer"
        className={`${sidebarItem} text-text-muted hover:bg-surface-alt hover:text-text`}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden />
        {item.label}
      </a>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.end ?? true}
      className={({ isActive }) =>
        `${sidebarItem} ${
          isActive
            ? "bg-primary-soft font-semibold text-primary-700"
            : "text-text-muted hover:bg-surface-alt hover:text-text"
        }`
      }
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden />
      {item.label}
      <Badge count={item.badge} className="ms-auto" />
    </NavLink>
  );
}

export function Badge({ count, className = "" }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={`min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-bold leading-5 text-white ${className}`}
    >
      <span className="sr-only">غير مقروء: </span>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function BottomTabs({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const overflow = items.length > 5;
  const tabs = overflow ? items.slice(0, 4) : items;
  const rest = overflow ? items.slice(4) : [];
  const restBadge = rest.reduce((sum, item) => sum + (item.badge ?? 0), 0);
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="المزيد"
        >
          <button
            type="button"
            aria-label="إغلاق"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-3xl bg-surface pt-3 shadow-lg">
            <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
            {/* Admin roles have many destinations: the list scrolls inside the sheet. */}
            <div className="overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {rest.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end ?? true}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] hover:bg-surface-alt ${
                        isActive ? "bg-primary-soft font-semibold text-primary-700" : "text-text"
                      }`
                    }
                  >
                    <Icon
                      size={22}
                      strokeWidth={1.75}
                      aria-hidden
                      className="shrink-0 opacity-70"
                    />
                    {item.label}
                    <Badge count={item.badge} className="ms-auto" />
                  </NavLink>
                );
              })}
            </div>
          </nav>
        </div>
      )}
      <MainTabs
        items={tabs}
        more={overflow ? { onClick: () => setOpen(true), badge: restBadge } : undefined}
      />
    </>
  );
}

function MainTabs({
  items,
  more,
}: {
  items: NavItem[];
  more?: { onClick: () => void; badge: number };
}) {
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-3 bottom-[max(0.875rem,env(safe-area-inset-bottom))] z-10 flex h-16 items-center justify-around rounded-3xl border border-border-soft bg-surface/95 px-1.5 shadow-md backdrop-blur lg:hidden"
    >
      {items.slice(0, 5).map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? true}
            className={({ isActive }) =>
              `relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                isActive ? "font-semibold text-primary" : "text-text-muted"
              }`
            }
          >
            <Icon size={24} strokeWidth={1.75} aria-hidden />
            <span className="max-w-full truncate whitespace-nowrap">
              {item.short ?? item.label}
            </span>
            <Badge count={item.badge} className="absolute -top-1 start-9" />
          </NavLink>
        );
      })}
      {more && (
        <button
          type="button"
          onClick={more.onClick}
          className="relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-text-muted"
        >
          <Menu size={24} strokeWidth={1.75} aria-hidden />
          <span className="whitespace-nowrap">المزيد</span>
          <Badge count={more.badge} className="absolute -top-1 start-9" />
        </button>
      )}
    </nav>
  );
}
