import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Opens outside the portal (e.g. API docs); rendered as a plain link. */
  external?: boolean;
};

type AppShellProps = {
  /** Page title: large title on phones, PageHeader on desktop. */
  title: string;
  subtitle?: string;
  /** Small line above the phone title (context, e.g. the college). */
  eyebrow?: string;
  nav: NavItem[];
  children: ReactNode;
};

/**
 * Portal shell — one component, two layouts (docs/06 §9, skill responsive-page):
 *
 * - **Phone / tablet (< lg):** navy header with a large title; content in one
 *   column; a floating bottom tab bar once there are two or more destinations.
 * - **Desktop (≥ lg):** navy TopBar + Sidebar on the right (264px) + PageHeader
 *   + content up to 1280px.
 *
 * Same children render in both; only the chrome around them changes.
 */
export function AppShell({ title, subtitle, eyebrow, nav, children }: AppShellProps) {
  const internal = nav.filter((item) => !item.external);
  const showTabs = internal.length >= 2;

  return (
    <div className="min-h-dvh bg-bg-subtle lg:flex lg:flex-col">
      {/* Desktop top bar */}
      <header className="hidden h-14 shrink-0 items-center gap-4 bg-header px-6 text-text-inverse lg:flex">
        <Brand />
        <span className="text-xs text-navy-200">{eyebrow}</span>
      </header>

      {/* Phone large-title header */}
      <header className="bg-header px-4 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-text-inverse lg:hidden">
        {eyebrow && <p className="text-xs font-semibold text-primary-200">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-navy-200">{subtitle}</p>}
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
          className={`min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-6 ${showTabs ? "pb-28 lg:pb-6" : ""}`}
        >
          <div className="mx-auto max-w-[1280px]">
            <div className="mb-5 hidden lg:block">
              <h1 className="text-2xl font-bold text-text">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
            </div>
            {children}
          </div>
        </main>
      </div>

      {showTabs && <BottomTabs items={internal} />}
    </div>
  );
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
      end
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
    </NavLink>
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
            end
            className={({ isActive }) =>
              `flex min-h-11 w-16 flex-col items-center justify-center gap-0.5 text-xs ${
                isActive ? "font-semibold text-primary" : "text-navy-300"
              }`
            }
          >
            <Icon size={24} strokeWidth={1.75} aria-hidden />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
