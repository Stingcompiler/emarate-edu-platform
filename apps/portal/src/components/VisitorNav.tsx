import { useQuery } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, NavLink } from "react-router";

import { api } from "../lib/api";
import { isStandalone } from "../lib/push";
import { SITE_URL, siteUrl, useSiteLogo } from "../lib/site";
import { useHideOnScroll } from "../lib/useHideOnScroll";

/** The college site's main sections: a visitor applying or tracking keeps the site's navigation.
 *  The third item is an official page: linked only once the site manager publishes it (it led
 *  to «الصفحة غير موجودة» before; owner, 2026-11-01). */
const SITE_LINKS: [string, string, string?][] = [
  ["الرئيسية", "/ar/"],
  ["البرامج", "/ar/programs/"],
  ["القبول", "/ar/admissions/"],
  ["الرسوم والمنح", "/ar/admissions/fees/", "admissions/fees"],
  ["تواصل", "/ar/contact/"],
];

function useSiteLinks(): [string, string][] {
  const published = useQuery({
    queryKey: ["public", "pages"],
    queryFn: async () => (await api.GET("/api/public/pages")).data ?? [],
    staleTime: 60 * 60_000,
    retry: false,
    meta: { silent: true },
  });
  // Published *and* built: a page of sample text or guidance only is not on the site.
  const paths = new Set(
    (published.data ?? []).filter((p) => p.has_content !== false).map((p) => p.path),
  );
  return SITE_LINKS.filter(([, , page]) => !page || paths.has(page)).map(([label, path]) => [
    label,
    path,
  ]);
}

/** The site's header, kept on the portal's public pages (apply, track, sign-in…): sticky, hidden while scrolling down. */
export function VisitorNav() {
  const hidden = useHideOnScroll();
  const [open, setOpen] = useState(false);
  const logo = useSiteLogo();
  const links = useSiteLinks();
  // The installed app is the portal only (owner, 2026-10-30): no site navigation inside it.
  if (isStandalone()) return null;
  const away = hidden && !open;
  return (
    <header
      className={`sticky top-0 z-30 border-b border-border-soft bg-surface/95 backdrop-blur transition-transform print:hidden duration-200 focus-within:translate-y-0 motion-reduce:transition-none ${
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
          {links.map(([label, path]) => (
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
          {links.map(([label, path]) => (
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
