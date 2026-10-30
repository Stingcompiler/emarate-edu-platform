import { Menu, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, NavLink } from "react-router";

import { isStandalone } from "../lib/push";
import { SITE_URL, siteUrl, useSiteLogo } from "../lib/site";
import { useHideOnScroll } from "../lib/useHideOnScroll";

/** The college site's main sections: a visitor applying or tracking keeps the site's navigation. */
const SITE_LINKS: [string, string][] = [
  ["الرئيسية", "/ar/"],
  ["البرامج", "/ar/programs/"],
  ["القبول", "/ar/admissions/"],
  ["الرسوم والمنح", "/ar/admissions/fees/"],
  ["تواصل", "/ar/contact/"],
];

/** The site's header, kept on the portal's public pages (apply, track, sign-in…): sticky, hidden while scrolling down. */
export function VisitorNav() {
  const hidden = useHideOnScroll();
  const [open, setOpen] = useState(false);
  const logo = useSiteLogo();
  // The installed app is the portal only (owner, 2026-10-30): no site navigation inside it.
  if (isStandalone()) return null;
  const away = hidden && !open;
  return (
    <header
      className={`sticky top-0 z-30 border-b border-border-soft bg-surface/95 backdrop-blur transition-transform duration-200 focus-within:translate-y-0 motion-reduce:transition-none ${
        away ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-4 px-4 lg:px-8">
        {/* Visitors came from the college's site: its name takes them back (review 🟢). */}
        <a
          href={SITE_URL}
          {...siteLink()}
          className="flex min-w-0 items-center gap-2 hover:opacity-80"
        >
          <img src={logo} alt="" width={32} height={32} className="size-8 object-contain" />
          <span className="truncate text-sm font-bold text-text sm:hidden">كلية الإمارات</span>
          <span className="hidden truncate text-sm font-bold text-text sm:inline">
            كلية الإمارات للعلوم والتكنولوجيا
          </span>
        </a>
        <nav aria-label="موقع الكلية" className="ms-auto hidden items-center gap-1 lg:flex">
          {SITE_LINKS.map(([label, path]) => (
            <a
              key={path}
              href={siteUrl(path)}
              {...siteLink()}
              className="rounded-md px-3 py-2 text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
            >
              {label}
            </a>
          ))}
          <Link
            to="/login"
            className="rounded-md px-3 py-2 text-sm font-semibold text-text-muted hover:bg-surface-alt hover:text-text"
          >
            دخول المنصة
          </Link>
        </nav>
        <span className="ms-auto flex shrink-0 items-center gap-1 lg:ms-2">
          <VisitorLink to="/apply">التقديم</VisitorLink>
          <VisitorLink to="/track">متابعة طلبي</VisitorLink>
          <button
            type="button"
            aria-label={open ? "إغلاق القائمة" : "القائمة"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="grid size-11 place-items-center rounded-md text-text hover:bg-surface-alt lg:hidden"
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </span>
      </div>
      {open && (
        <nav
          aria-label="موقع الكلية"
          className="border-t border-border-soft bg-surface px-4 pb-4 pt-2 lg:hidden"
        >
          {SITE_LINKS.map(([label, path]) => (
            <a
              key={path}
              href={siteUrl(path)}
              {...siteLink()}
              className="flex min-h-12 items-center rounded-lg px-3 text-[15px] text-text hover:bg-surface-alt"
            >
              {label}
            </a>
          ))}
          <Link
            to="/login"
            className="flex min-h-12 items-center rounded-lg px-3 text-[15px] text-text hover:bg-surface-alt"
          >
            دخول المنصة
          </Link>
        </nav>
      )}
    </header>
  );
}

function VisitorLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-md px-2.5 py-2 text-sm font-semibold ${
          isActive ? "bg-primary-soft text-primary-700" : "text-primary hover:bg-surface-alt"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * A link to the college's site: from the installed app it opens in the browser, not inside the
 * app (owner, 2026-10-30); in a browser tab it stays an ordinary link.
 */
export const siteLink = () =>
  isStandalone() ? { target: "_blank", rel: "noopener noreferrer" } : {};
