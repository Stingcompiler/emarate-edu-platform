/**
 * Build-time reads of /api/public/* (docs/02 §6). If the API is unreachable
 * (e.g. CI without a backend) pages build with empty sections instead of
 * failing. Production builds set LANDING_STRICT=1 so an API outage fails the
 * deploy instead of publishing an empty site. A 404 is never an error.
 */
const STRICT = import.meta.env.LANDING_STRICT === "1";
// Build-time only (never shipped to the browser): lets the build skip the API's read throttle.
const BUILD_HEADERS: Record<string, string> = import.meta.env.SITE_BUILD_TOKEN
  ? { "X-Site-Build": import.meta.env.SITE_BUILD_TOKEN }
  : {};
export const API = (import.meta.env.PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const PORTAL = (import.meta.env.PUBLIC_PORTAL_URL ?? "http://localhost:5173").replace(
  /\/$/,
  "",
);

const cache = new Map<string, Promise<unknown>>();

// A build reads dozens of pages at once; the dev API (runserver) drops connections when
// flooded, so at most a few requests run together and a transient failure is retried.
const MAX_PARALLEL = 6;
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

class Transient extends Error {}
async function fetchJson(path: string, attempts = 3): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await limited(() =>
        fetch(`${API}/api/public/${path}`, {
          headers: { "Accept-Language": "ar", ...BUILD_HEADERS },
        }),
      );
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      throw r.status === 429 || r.status >= 500
        ? new Transient(`HTTP ${r.status}`)
        : new Error(`HTTP ${r.status}`);
    } catch (error) {
      const transient = error instanceof Transient || error instanceof TypeError; // network
      if (!transient || attempt >= attempts) throw error;
      await new Promise((wait) => setTimeout(wait, 300 * attempt));
    }
  }
}

export function get<T>(path: string, fallback: T): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetchJson(path).catch((error) => {
        if (STRICT) throw new Error(`[landing] /api/public/${path} failed: ${error}`);
        console.warn(`[landing] /api/public/${path} unavailable (${error}); building without it`);
        cache.delete(path); // `astro dev` keeps running: try again on the next request
        return null;
      }),
    );
  }
  return cache.get(path)!.then((data) => (data ?? fallback) as T);
}

export type Site = {
  name_ar: string;
  name_en: string;
  tagline: string;
  email: string;
  phone: string;
  whatsapp_e164: string;
  address: string;
  social: Record<string, string>;
  seo: { description?: string };
  // Trust signals the college sets (review 2026-09-30); all optional — nothing shows unset.
  founded_year?: number | null;
  licence_ar?: string;
  licence_en?: string;
  licence_url?: string;
  figures?: { value: string; label_ar: string; label_en?: string }[];
  office_hours_ar?: string;
  office_hours_en?: string;
  map_url?: string;
  hero_image_url?: string | null;
  hero_image_alt_ar?: string;
  share_image_url?: string | null;
};
export type Intake = {
  id: number;
  accepting: boolean;
  cycle: string;
  opens_at: string;
  closes_at: string;
  seats_left: number | null;
};
/** An open intake as the application wizard sees it (documents per programme). */
export type PublicIntake = {
  id: number;
  program_code: string;
  program_name: string;
  required_documents: { key: string; label: string; required: boolean }[];
};
export type Program = {
  code: string;
  name_ar: string;
  name_en: string;
  degree: string;
  degree_label: string;
  department_code: string;
  department_name: string;
  department_name_en: string;
  duration_terms: number;
  levels_count: number;
  /** The college's stated total to graduate; null until it is entered (never a course sum). */
  credit_hours: number | null;
  intake: Intake | null;
};
export type ProgramDetail = Program & {
  description_ar: string;
  description_en: string;
  requirements_ar: string;
  required_documents: { key: string; label: string; required: boolean }[];
  plan: {
    level: number;
    courses: { code: string; name_ar: string; name_en: string; credit_hours: number }[];
  }[];
};
export type Department = {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  description: string;
  manager: string | null;
  teachers: number;
  students: number;
  programs: Program[];
};
export type News = {
  slug: string;
  title: string;
  summary: string;
  body: string;
  cover_url: string | null;
  publish_at: string | null;
  created_at?: string;
};
export type Event = {
  slug: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location: string;
  cover_url?: string | null;
  registration_url: string;
};
export type Announcement = {
  public_id: string;
  title: string;
  body: string;
  publish_at: string | null;
  is_featured: boolean;
  is_pinned?: boolean;
};
export type Block = {
  type: "heading" | "paragraph" | "note" | "html" | "image" | "cta" | "list";
  text?: string;
  html?: string;
  url?: string;
  alt?: string;
  items?: string[];
};
export type Page = {
  slug: string;
  title_ar: string;
  title_en: string;
  blocks: Block[];
  seo: { description?: string };
  updated_at: string;
};
/** A page's own description for search results and share cards: its SEO text, else its
 *  first paragraph (≤ 160 characters). */
export function describe(page: Page): string | undefined {
  if (page.seo?.description) return page.seo.description;
  const text = page.blocks.find((b) => b.type === "paragraph" && b.text?.trim())?.text?.trim();
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}
export type Stats = { students: number; teachers: number; programs: number; departments: number };

export const site = () =>
  get<Site>("site", {
    name_ar: "كلية الإمارات للعلوم والتقنية",
    name_en: "Emirates College of Science and Technology",
    tagline: "",
    email: "",
    phone: "",
    whatsapp_e164: "",
    address: "",
    social: {},
    seo: {},
  });
export const programs = () => get<Program[]>("programs", []);
export const intakes = () => get<PublicIntake[]>("intakes", []);
export const departments = () => get<Department[]>("departments", []);
export const news = () => get<News[]>("news", []);
export const events = () => get<Event[]>("events", []);
/** Ended events, newest first: their pages stay online (docs/07 §1). */
export const pastEvents = () => get<Event[]>("events?past=1", []);
export const announcements = () => get<Announcement[]>("announcements", []);
export type Regulation = {
  public_id: string;
  title: string;
  body: string;
  category: string;
  category_label: string;
  version: string;
  effective_from: string | null;
  published_at: string | null;
  has_file: boolean;
};
export const regulations = () => get<Regulation[]>("regulations", []);
export type Calendar = {
  terms: {
    name_ar: string;
    name_en: string;
    starts_on: string;
    ends_on: string;
    is_current: boolean;
  }[];
  admission: { name: string; opens_at: string; closes_at: string } | null;
};
export const calendar = () => get<Calendar>("calendar", { terms: [], admission: null });
/** Published CMS pages. `path` is where the site serves each one: the college's official
 *  pages at their own path (about/dean, privacy …), any other page under p/. */
export type PageRef = {
  slug: string;
  path: string;
  title_ar: string;
  title_en: string;
  updated_at: string;
};
export const pages = () => get<PageRef[]>("pages", []);
/** One published page by slug (official slugs keep their "/"). */
export const page = (slug: string) =>
  get<Page | null>(`pages/${slug.split("/").map(encodeURIComponent).join("/")}`, null);
export const stats = () =>
  get<Stats>("stats", { students: 0, teachers: 0, programs: 0, departments: 0 });
export type MenuLink = { id: number; label_ar: string; label_en: string; url: string };
export type MenuItem = MenuLink & { order: number; children: MenuLink[] };
/** The header and footer the site manager edits (portal → محتوى الموقع → القوائم). */
export const menu = (key: "header" | "footer") =>
  get<{ key: string; items: MenuItem[] } | null>(`menus/${key}`, null).then((m) => m?.items ?? []);
