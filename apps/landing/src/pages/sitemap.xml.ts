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
  const body = paths
    .map(
      (path) =>
        `<url><loc>${url("ar", path)}</loc>${LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${url(l, path)}"/>`).join("")}</url>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
