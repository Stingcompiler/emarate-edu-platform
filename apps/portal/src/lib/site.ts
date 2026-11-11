import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

/** The public website (links back from the portal's sign-in and visitor screens). */
export const SITE_URL: string =
  import.meta.env.VITE_SITE_URL ??
  (import.meta.env.DEV ? "http://localhost:4321/ar/" : "https://ecst.edu.sd/ar/");

/**
 * A page of the public site from its path ("/ar/contact/"): resolved against the site's
 * origin, since SITE_URL already ends in the language ("…/ar/") — joining the two strings
 * gave "/ar//ar/contact/", a 404 (owner report 2026-10-30).
 */
export const siteUrl = (path: string): string => new URL(path, SITE_URL).href;

export type SiteLink = { href: string; target?: string; rel?: string };
type Device = { standalone: boolean; userAgent: string; touchPoints: number };

/**
 * A link to the college's site as an anchor's props. In a browser tab it is an ordinary link.
 * From the installed app it leaves for the phone's browser (owner, 2026-11-11: «زر العودة إلى
 * الكلية يقود الزائر مباشرة إلى المتصفح»): a plain `target="_blank"` stayed inside the app
 * there — iOS shows the page in a Safari sheet over the app, Android in a Chrome sheet.
 * - iOS 17 and later: `x-safari-https://…` opens the Safari app itself. Older iOS does not know
 *   the scheme, so it keeps the new window.
 * - Android: an `intent://` address asks the system for its browser; when nothing takes it,
 *   Chrome opens `browser_fallback_url`, as before.
 * - A computer: a new window of the browser (the installed app's window stays the portal).
 */
export function siteLinkFor(url: string, device: Device): SiteLink {
  if (!device.standalone) return { href: url };
  const away = { href: url, target: "_blank", rel: "noopener noreferrer" };
  const ua = device.userAgent;
  const target = new URL(url);
  if (!/^https?:$/.test(target.protocol)) return away;
  // iPadOS asks for the desktop site: a Mac with a touch screen is an iPad.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && device.touchPoints > 1)) {
    const major = Number(/ OS (\d+)_/.exec(ua)?.[1] ?? /Version\/(\d+)/.exec(ua)?.[1] ?? 0);
    return major >= 17 ? { href: `x-safari-${url}` } : away;
  }
  if (/Android/.test(ua)) {
    const scheme = target.protocol.slice(0, -1);
    const address = `${target.host}${target.pathname}${target.search}`;
    return {
      href:
        `intent://${address}#Intent;scheme=${scheme};action=android.intent.action.VIEW;` +
        `category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(url)};end`,
    };
  }
  return away;
}

/** `siteLinkFor` on this device. */
export const siteLink = (url: string): SiteLink =>
  siteLinkFor(url, {
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints ?? 0,
  });

/**
 * The college's current logo as the server cuts it for the app icon: available before
 * sign-in and before the settings load, so the loading screen shows the logo in use, not
 * the built-in mark (owner, 2026-10-30). The server falls back to the built-in one.
 */
export const LOGO_ICON = "/api/public/portal-icon/192.png";

/** The built-in mark, shown until the site settings name a logo (and while they load). */
export const DEFAULT_LOGO = "/favicon.svg";

/** The college's logo as set in the site settings (owner request 2026-10-09). */
export function useSiteLogo(): string {
  const site = useQuery({
    queryKey: ["public", "site"],
    // Revalidated, not the browser's minute-old copy: a logo just changed shows after a reload.
    queryFn: async () => (await api.GET("/api/public/site", { cache: "no-cache" })).data ?? null,
    staleTime: 60 * 60_000,
    retry: false,
    meta: { silent: true },
  });
  return site.data?.logo_url || DEFAULT_LOGO;
}
