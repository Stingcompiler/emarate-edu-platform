import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

/** The public website (links back from the portal's sign-in and visitor screens). */
export const SITE_URL: string =
  import.meta.env.VITE_SITE_URL ??
  (import.meta.env.DEV ? "http://localhost:4321/ar/" : "https://ecst.edu.sd/ar/");

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
