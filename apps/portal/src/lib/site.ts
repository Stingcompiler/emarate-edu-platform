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
