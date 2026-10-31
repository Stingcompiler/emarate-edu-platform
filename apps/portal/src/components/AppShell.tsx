import { ChevronDown, ChevronRight, LogOut, type LucideIcon, Menu } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";

import { useSiteLogo } from "../lib/site";
import { SignOutButton, useSignOutAction } from "./SignOutButton";
import { PageSearch } from "./PageSearch";
import { ThemeRow, ThemeToggle } from "./ThemeToggle";

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
  /** Large screens only (the sidebar): a phone keeps its tabs short, e.g. a student's five. */
  desktopOnly?: boolean;
  /** A heading the sidebar shows above the first item of each group (long admin menus). */
  group?: string;
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
 *   bottom tab bar docked to the edge once there are two or more destinations.
 * - **Desktop (≥ lg):** navy Sidebar on the right (264px, full height, mockups 2026-10-29)
 *   + white TopBar with the page search + PageHeader + content up to 1280px.
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
  const internal = nav.filter((item) => !item.external && !item.desktopOnly);
  const compact = useScrolledPast(40);
  const showTabs = internal.length >= 2;

  return (
    <div className="min-h-dvh bg-bg-subtle lg:flex">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 font-semibold text-primary shadow focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        تخطَّ إلى المحتوى
      </a>

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
        {/* Pinned to the edge; the toggle's own wrapper would otherwise sit on the title
            (owner, 2026-10-31: the mode icon covered «الإعدادات»). */}
        <div className="absolute bottom-0.5 end-2">
          <ThemeToggle className="text-text-muted hover:bg-surface-alt" />
        </div>
      </div>
      <header className="px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] lg:hidden">
        <div className="flex min-h-10 items-center justify-between gap-3">
          {back ? (
            <NavLink
              to={back.to}
              className="-ms-2 inline-flex min-h-11 items-center gap-1 px-2 text-[15px] text-primary"
            >
              <ChevronRight size={20} aria-hidden className="ltr:rotate-180" />
              {back.label}
            </NavLink>
          ) : (
            <p className="text-xs font-semibold text-text-muted">{eyebrow}</p>
          )}
          <div className="-me-2 flex items-center">
            <SignOutButton className="text-text-muted hover:bg-surface-alt hover:text-text" />
            <ThemeToggle className="text-text-muted hover:bg-surface-alt" />
          </div>
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="text-[28px] font-bold leading-tight text-text">{title}</h1>
          {titleAction}
        </div>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </header>

      {/* Desktop sidebar (mockups 2026-10-29): navy, the full height of the screen, the college
          mark at its top. First in DOM, so it sits on the right in RTL; stays while the page
          scrolls (owner, 2026-09-29). */}
      <aside className="hidden w-66 shrink-0 flex-col bg-header text-text-inverse lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Brand />
        <nav
          aria-label="التنقل الرئيسي"
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4"
        >
          <SidebarItems nav={nav} />
          <div className="mt-auto border-t border-white/10 pt-3">
            <ThemeRow onDark className={`${sidebarItem} w-full text-navy-100`} />
          </div>
        </nav>
      </aside>

      <div className="lg:flex lg:min-w-0 lg:flex-1 lg:flex-col">
        {/* Desktop top bar: who is signed in, a search over their pages, the bell and the
            account. White, so the page reads as one surface beside the navy sidebar. */}
        <header className="sticky top-0 z-30 hidden h-16 shrink-0 items-center gap-4 border-b border-border-soft bg-surface/95 px-8 backdrop-blur lg:flex">
          <span className="truncate text-sm text-text-muted">{eyebrow}</span>
          <div className="ms-auto flex flex-1 items-center justify-end gap-2">
            <PageSearch nav={nav} />
            {actions}
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className={`min-w-0 flex-1 focus:outline-none px-4 pb-5 pt-3 lg:px-8 lg:py-6 ${showTabs ? "pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6" : ""}`}
        >
          <div className="mx-auto max-w-[1280px]">
            <div className="mb-5 hidden items-end justify-between gap-4 lg:flex">
              <div>
                {/* Large screens get the way back too (review 2026-09-29): a detail page
                    otherwise leaves no trace of where it sits. */}
                {back && (
                  <NavLink
                    to={back.to}
                    className="mb-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ChevronRight size={16} aria-hidden className="ltr:rotate-180" />
                    {back.label}
                  </NavLink>
                )}
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
  const logo = useSiteLogo();
  return (
    <div className="flex items-center gap-3 px-5 pb-5 pt-6">
      <img
        src={logo}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-lg bg-white object-contain"
      />
      <span className="min-w-0">
        <span className="block text-base font-bold">بوابة الكلية</span>
        <span className="block text-xs leading-snug text-navy-200">
          كلية الإمارات للعلوم والتكنولوجيا
        </span>
      </span>
    </div>
  );
}

/**
 * The sidebar's destinations. Roles with long menus (the admin has 45) get their groups folded:
 * only the group of the page being shown is open, the others open on a tap, so the list reads
 * as a handful of headings instead of a wall (design review B10).
 */
export function SidebarItems({ nav }: { nav: NavItem[] }) {
  const { pathname } = useLocation();
  // The group of the page being shown (a detail page counts: /system/users/12 is «المستخدمون»).
  const currentGroup = nav.find(
    (item) =>
      !!item.group &&
      !item.external &&
      (pathname === item.to || (item.to !== "/" && pathname.startsWith(`${item.to}/`))),
  )?.group;
  const [open, setOpen] = useState<Set<string>>(new Set(currentGroup ? [currentGroup] : []));
  // Going to a page in another group opens that group too (the others stay as the person left them).
  useEffect(() => {
    if (currentGroup)
      setOpen((prev) => (prev.has(currentGroup) ? prev : new Set(prev).add(currentGroup)));
  }, [currentGroup]);
  const segments: { group?: string; items: NavItem[] }[] = [];
  for (const item of nav) {
    const last = segments[segments.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else segments.push({ group: item.group, items: [item] });
  }
  return (
    <>
      {segments.map((segment, i) =>
        segment.group ? (
          <details
            key={segment.group + i}
            open={open.has(segment.group)}
            onToggle={(event) => {
              const isOpen = (event.currentTarget as HTMLDetailsElement).open;
              setOpen((prev) => {
                const next = new Set(prev);
                if (isOpen) next.add(segment.group!);
                else next.delete(segment.group!);
                return next;
              });
            }}
            className={`group ${i ? "mt-1 border-t border-white/10 pt-1" : ""}`}
          >
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-md px-3 text-xs font-semibold text-navy-300 hover:bg-white/10 hover:text-white">
              {segment.group}
              <ChevronDown
                size={14}
                className="transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="mt-0.5 flex flex-col gap-0.5">
              {segment.items.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </div>
          </details>
        ) : (
          segment.items.map((item) => <SidebarLink key={item.to} item={item} />)
        ),
      )}
    </>
  );
}

const sidebarItem =
  "flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm transition-colors duration-150";
/** A sidebar row that is not the current page, on the navy sidebar. */
const sidebarIdle = "text-navy-100 hover:bg-white/10 hover:text-white";

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  if (item.external) {
    return (
      <a
        href={item.to}
        target="_blank"
        rel="noreferrer"
        className={`${sidebarItem} ${sidebarIdle}`}
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
        `${sidebarItem} ${isActive ? "bg-primary-500 font-semibold text-white" : sidebarIdle}`
      }
    >
      {({ isActive }) => (
        <>
          <NavIcon icon={Icon} active={isActive} size={20} />
          {item.label}
          <Badge count={item.badge} className="ms-auto" />
        </>
      )}
    </NavLink>
  );
}

/**
 * A navigation icon: the current page's is filled and a little bolder, the others outlined
 * (docs/09: «where am I» at a glance, not by colour alone). Used by the phone tabs, the «المزيد»
 * sheet and the desktop sidebar, so every role reads it the same way.
 */
function NavIcon({
  icon: Icon,
  active,
  size,
  className,
}: {
  icon: LucideIcon;
  active: boolean;
  size: number;
  className?: string;
}) {
  return (
    <Icon
      size={size}
      strokeWidth={active ? 2.25 : 1.75}
      fill={active ? "currentColor" : "none"}
      fillOpacity={active ? 0.25 : undefined}
      aria-hidden
      className={className}
    />
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
  const signOutAction = useSignOutAction();
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // The sheet is a dialog (docs/06 a11y): focus goes in, stays in, Esc closes, and focus
  // returns to «المزيد».
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab" || !sheet.current) return;
      const links = sheet.current.querySelectorAll<HTMLElement>("a, button");
      const first = links[0];
      const last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener.current?.focus?.();
    };
  }, [open]);
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
          <nav
            ref={sheet}
            className="motion-sheet absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-3xl bg-surface pt-3 shadow-lg"
          >
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
                    {({ isActive }) => (
                      <>
                        <NavIcon
                          icon={Icon}
                          active={isActive}
                          size={22}
                          className={`shrink-0 ${isActive ? "" : "opacity-70"}`}
                        />
                        {item.label}
                        <Badge count={item.badge} className="ms-auto" />
                      </>
                    )}
                  </NavLink>
                );
              })}
              <div className="mt-1 border-t border-border-soft pt-1">
                <ThemeRow
                  iconSize={22}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] text-text hover:bg-surface-alt"
                />
                <button
                  type="button"
                  onClick={signOutAction}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] text-text hover:bg-surface-alt"
                >
                  <LogOut
                    size={22}
                    strokeWidth={1.75}
                    aria-hidden
                    className="shrink-0 opacity-70 rtl:-scale-x-100"
                  />
                  تسجيل الخروج
                </button>
              </div>
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
    // Docked to the bottom edge, full width (owner, 2026-10-30: more room than a floating bar,
    // and the place phone apps keep their tabs); the home-indicator area stays below the tabs.
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-10 flex items-stretch justify-around border-t border-border-soft bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {items.slice(0, 5).map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? true}
            className={({ isActive }) =>
              `relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                isActive ? "font-semibold text-primary" : "text-text-muted"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <NavIcon icon={Icon} active={isActive} size={24} />
                <span className="max-w-full truncate whitespace-nowrap">
                  {item.short ?? item.label}
                </span>
                <Badge count={item.badge} className="absolute -top-1 start-9" />
              </>
            )}
          </NavLink>
        );
      })}
      {more && (
        <button
          type="button"
          onClick={more.onClick}
          className="relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-text-muted"
        >
          <Menu size={24} strokeWidth={1.75} aria-hidden />
          <span className="whitespace-nowrap">المزيد</span>
          <Badge count={more.badge} className="absolute -top-1 start-9" />
        </button>
      )}
    </nav>
  );
}
