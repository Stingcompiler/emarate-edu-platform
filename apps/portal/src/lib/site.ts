/** The public website (links back from the portal's sign-in and visitor screens). */
export const SITE_URL: string =
  import.meta.env.VITE_SITE_URL ??
  (import.meta.env.DEV ? "http://localhost:4321/ar/" : "https://ecst.edu.sd/ar/");
