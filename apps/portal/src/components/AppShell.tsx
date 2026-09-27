import { ChevronRight, type LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { NavLink } from "react-router";

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
      {/* Desktop top bar */}
      <header className="hidden h-14 shrink-0 items-center gap-4 bg-header px-6 text-text-inverse lg:flex">
        <Brand />
        <span className="text-xs text-navy-200">{eyebrow}</span>
        <div className="ms-auto flex items-center gap-2">{actions}</div>
      </header>

      {/* Phone NavigationBar (docs/09): large title that collapses into a glass bar */}
      <div
        aria-hidden={!compact}
        className={`fixed inset-x-0 top-0 z-20 flex h-[calc(2.75rem+env(safe-area-inset-top))] items-end justify-center border-b border-border-soft bg-surface/80 pb-2.5 backdrop-blur transition-opacity duration-150 lg:hidden ${
          compact ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <span className="text-[17px] font-semibold text-text">{title}</span>
      </div>
      <header className="px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] lg:hidden">
        {back ? (
          <NavLink
            to={back.to}
            className="inline-flex min-h-8 items-center gap-1 text-[15px] text-primary"
          >
            <ChevronRight size={20} aria-hidden className="ltr:rotate-180" />
            {back.label}
          </NavLink>
        ) : (
          eyebrow && <p className="text-xs font-semibold text-text-muted">{eyebrow}</p>
        )}
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-tight text-text">{title}</h1>
          {titleAction}
        </div>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </header>

      <div className="lg:flex lg:min-h-0 lg:flex-1">
        {/* Desktop sidebar — first in DOM, so it sits on the right in RTL */}
        <aside className="hidden w-66 shrink-0 border-e border-border-soft bg-surface px-3 py-4 lg:block">
          <nav aria-label="التنقل الرئيسي" className="flex flex-col gap-0.5">
            {nav.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </nav>
        </aside>

        <main
          className={`min-w-0 flex-1 px-4 pb-5 pt-3 lg:px-8 lg:py-6 ${showTabs ? "pb-28 lg:pb-6" : ""}`}
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
              `relative flex min-h-11 w-16 flex-col items-center justify-center gap-0.5 text-xs ${
                isActive ? "font-semibold text-primary" : "text-navy-300"
              }`
            }
          >
            <Icon size={24} strokeWidth={1.75} aria-hidden />
            {item.label}
            <Badge count={item.badge} className="absolute -top-1 start-9" />
          </NavLink>
        );
      })}
    </nav>
  );
}
