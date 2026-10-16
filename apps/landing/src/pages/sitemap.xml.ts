import type { APIRoute } from "astro";

import { departments, news, pages, programs } from "../lib/api";
import { LANGS } from "../lib/i18n";

export const GET: APIRoute = async ({ site }) => {
  const [depts, progs, items, cms] = await Promise.all([
    departments(),
    programs(),
    news(),
    pages(),
  ]);
  const paths = [
    "",
    "about/",
    "departments/",
    "programs/",
    "admissions/",
    "announcements/",
    "events/",
    "calendar/",
    "regulations/",
    "news/",
    "contact/",
    ...depts.map((d) => `departments/${d.code}/`),
    ...progs.map((p) => `programs/${p.code}/`),
    ...items.map((n) => `news/${encodeURIComponent(n.slug)}/`),
    ...cms
      .filter((p) => p.path !== "about") // the about page is above
      .map((p) => `${p.path.split("/").map(encodeURIComponent).join("/")}/`),
  ];
  const url = (lang: string, path: string) => new URL(`/${lang}/${path}`, site).toString();
  // «Last modified» only where the API says when (a wrong date is worse than none): news by
  // its publishing date, CMS pages by their last edit; the home and the news list by the
  // newest of those.
  const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : undefined);
  const modified = new Map<string, string>();
  for (const n of items) {
    const d = day(n.publish_at);
    if (d) modified.set(`news/${encodeURIComponent(n.slug)}/`, d);
  }
  for (const p of cms) {
    const d = day(p.updated_at);
    if (d) modified.set(`${p.path.split("/").map(encodeURIComponent).join("/")}/`, d);
  }
  const newest = (keys: string[]) =>
    keys
      .map((k) => modified.get(k))
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
  const newsKeys = [...modified.keys()].filter((k) => k.startsWith("news/"));
  const latestNews = newest(newsKeys);
  const latestAny = newest([...modified.keys()]);
  if (latestNews) modified.set("news/", latestNews);
  if (latestAny) modified.set("", latestAny);
  const body = paths
    .map((path) => {
      const last = modified.get(path);
      return `<url><loc>${url("ar", path)}</loc>${last ? `<lastmod>${last}</lastmod>` : ""}${LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${url(l, path)}"/>`).join("")}</url>`;
    })
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
