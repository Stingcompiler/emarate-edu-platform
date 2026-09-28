import type { APIRoute } from "astro";

import { news } from "../../../lib/api";
import { LANGS, type Lang, href } from "../../../lib/i18n";

// docs/07 §1: an RSS feed of the news, per language.
export const getStaticPaths = () => LANGS.map((lang) => ({ params: { lang } }));

const escape = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );

export const GET: APIRoute = async ({ params, site }) => {
  const lang = params.lang as Lang;
  const items = await news();
  const link = (path: string) => new URL(href(lang, path), site).toString();
  const title = lang === "ar" ? "أخبار كلية الإمارات للعلوم والتقنية" : "Emirates College news";
  const body = items
    .map(
      (n) =>
        `<item><title>${escape(n.title)}</title><link>${link(`news/${encodeURIComponent(n.slug)}/`)}</link><guid>${link(`news/${encodeURIComponent(n.slug)}/`)}</guid>${n.publish_at ? `<pubDate>${new Date(n.publish_at).toUTCString()}</pubDate>` : ""}<description>${escape(n.summary ?? "")}</description></item>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escape(title)}</title><link>${link("news/")}</link><description>${escape(title)}</description><language>${lang}</language>${body}</channel></rss>`,
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } },
  );
};
