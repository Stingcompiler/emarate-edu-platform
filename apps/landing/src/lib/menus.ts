import { type MenuItem, menu, pages } from "./api";
import { type Lang, href, pick, t } from "./i18n";

export type NavLink = { label: string; href: string; external: boolean; active: boolean };
export type NavEntry = NavLink & { children: NavLink[] };

/** Sections this site builds; links to anything else are hidden, never a 404. */
const SECTIONS = new Set([
  "",
  "about",
  "departments",
  "programs",
  "admissions",
  "news",
  "events",
  "announcements",
  "calendar",
  "regulations",
  "contact",
]);
/** Sections whose sub-pages come from the data (a programme, a news item …). */
const COLLECTIONS = ["departments/", "programs/", "news/", "events/", "announcements/"];

/** The code's own navigation: used until the menus are saved, or when the API is down. */
const FALLBACK: [string, string][] = [
  ["about", "/about"],
  ["departments", "/departments"],
  ["programs", "/programs"],
  ["admission", "/admissions"],
  ["news", "/news"],
  ["contact", "/contact"],
];

async function builtPath(): Promise<(path: string) => boolean> {
  const published = new Set((await pages()).map((p) => `p/${p.slug}`));
  return (path) =>
    SECTIONS.has(path) || published.has(path) || COLLECTIONS.some((c) => path.startsWith(c));
}

/** The header or footer as the site shows it: localised, with unbuilt pages removed. */
export async function navigation(
  lang: Lang,
  key: "header" | "footer",
  current: string,
): Promise<NavEntry[]> {
  let items: MenuItem[] = await menu(key);
  if (!items.length)
    items = FALLBACK.map(([k, url], i) => ({
      id: -i,
      label_ar: t("ar", k as "about"),
      label_en: t("en", k as "about"),
      url,
      order: i,
      children: [],
    }));
  const built = await builtPath();
  const link = (l: { label_ar: string; label_en: string; url: string }): NavLink | null => {
    const label = pick(lang, l.label_ar, l.label_en);
    if (l.url.startsWith("https://")) return { label, href: l.url, external: true, active: false };
    const path = l.url.replace(/^\/+|\/+$/g, "");
    if (!built(path)) return null;
    const to = href(lang, path ? `${path}/` : "");
    const active = path ? current.startsWith(to) : current === to;
    return { label, href: to, external: false, active };
  };
  const out: NavEntry[] = [];
  for (const item of items) {
    const children = item.children.map(link).filter((l): l is NavLink => l !== null);
    if (item.children.length) {
      if (!children.length) continue; // nothing in the group is published yet
      if (children.length === 1 && key === "header") {
        // A one-link group is just a link, not a dropdown.
        out.push({
          ...children[0]!,
          label: pick(lang, item.label_ar, item.label_en),
          children: [],
        });
        continue;
      }
      out.push({
        label: pick(lang, item.label_ar, item.label_en),
        href: "",
        external: false,
        active: children.some((c) => c.active),
        children,
      });
    } else {
      const self = link(item);
      if (self) out.push({ ...self, children: [] });
    }
  }
  return out;
}
