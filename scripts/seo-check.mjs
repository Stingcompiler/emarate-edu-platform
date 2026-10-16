#!/usr/bin/env node
// Launch check for the public site (docs/runbook.md, «قائمة الإطلاق لمحركات البحث»).
//
//   pnpm --filter @ecst/landing build     # on the server, with the real data and no SITE_NOINDEX
//   pnpm seo:check                        # reads apps/landing/dist
//
// It fails (exit 1, one line per problem) when the built site would still hurt the college in
// search results: pages or robots.txt hiding it, sample «(مثال)» text, a missing or badly
// sized title/description, no canonical/hreflang, no social image, broken JSON-LD. A demo
// build is *expected* to fail it; `--allow-noindex` skips only the hiding checks.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The same marks the site hides from visitors (apps/landing/src/lib/sample.mjs): anything still
// on a built page after the hiding is real content that merely looks like a sample.
const SAMPLE =
  /\(\s*مثال\s*\)|\(\s*example\s*\)|\(\s*نص تجريبي\s*\)|نص تجريبي للعرض فقط|مسودة أنشأها النظام/i;

const tag = (html, pattern) => pattern.exec(html)?.[1];
const metaContent = (html, attr, name) =>
  tag(html, new RegExp(`<meta[^>]*\\b${attr}="${name}"[^>]*\\bcontent="([^"]*)"`, "i")) ??
  tag(html, new RegExp(`<meta[^>]*\\bcontent="([^"]*)"[^>]*\\b${attr}="${name}"`, "i"));

/** Problems found in one built page (empty when it is fine). */
export function checkPage(html, { allowNoindex = false } = {}) {
  const problems = [];
  const robots = metaContent(html, "name", "robots");
  if (!allowNoindex && robots && /noindex/i.test(robots)) {
    problems.push(`hidden from search (robots meta "${robots}")`);
  }
  if (!/<html[^>]*\blang="(ar|en)"/i.test(html)) problems.push("no lang on <html>");
  const title = tag(html, /<title>([\s\S]*?)<\/title>/i)?.trim();
  if (!title) problems.push("no <title>");
  else if (title.length < 10 || title.length > 70) {
    problems.push(`title is ${title.length} characters (want 10–70)`);
  }
  const description = metaContent(html, "name", "description");
  if (!description) problems.push("no meta description");
  else if (description.length < 70 || description.length > 170) {
    problems.push(`description is ${description.length} characters (want 70–170)`);
  }
  const canonical = tag(html, /<link[^>]*\brel="canonical"[^>]*\bhref="([^"]*)"/i);
  if (!canonical) problems.push("no canonical link");
  else if (!/^https:\/\//.test(canonical))
    problems.push(`canonical is not absolute https: ${canonical}`);
  for (const lang of ["ar", "en", "x-default"]) {
    if (!new RegExp(`<link[^>]*\\bhreflang="${lang}"`, "i").test(html)) {
      problems.push(`no hreflang="${lang}"`);
    }
  }
  const h1 = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1 !== 1) problems.push(`${h1} <h1> elements (want 1)`);
  if (!metaContent(html, "property", "og:image")) problems.push("no og:image");
  if (!metaContent(html, "property", "og:title")) problems.push("no og:title");
  for (const m of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      JSON.parse(m[1]);
    } catch {
      problems.push("JSON-LD does not parse");
    }
  }
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  const sample = SAMPLE.exec(body.replace(/<[^>]+>/g, " "))?.[0] ?? SAMPLE.exec(html)?.[0];
  if (sample) problems.push(`sample text left on the page: «${sample}»`);
  return problems;
}

/** Problems in robots.txt. */
export function checkRobots(text, { allowNoindex = false } = {}) {
  const problems = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (!allowNoindex && lines.some((l) => /^disallow:\s*\/\s*$/i.test(l))) {
    problems.push("robots.txt disallows the whole site");
  }
  if (!lines.some((l) => /^sitemap:\s*https:\/\//i.test(l))) {
    problems.push("robots.txt names no sitemap");
  }
  return problems;
}

/** Problems in sitemap.xml. */
export function checkSitemap(xml) {
  const problems = [];
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  if (!locs.length) return ["sitemap has no <loc> entries"];
  const bad = locs.filter((l) => !/^https:\/\//.test(l));
  if (bad.length)
    problems.push(`${bad.length} sitemap URLs are not absolute https (e.g. ${bad[0]})`);
  const hosts = new Set(locs.map((l) => new URL(l).host));
  if (hosts.size > 1) problems.push(`sitemap mixes hosts: ${[...hosts].join(", ")}`);
  const demo = locs.filter((l) => /localhost|127\.0\.0\.1|stingdev\.pro/.test(l));
  if (demo.length) problems.push(`sitemap points at a test address (e.g. ${demo[0]})`);
  return problems;
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith(".html") && entry.name !== "404.html") out.push(full);
  }
  return out;
}

/** Every problem in a built site folder, as «file: problem» lines. */
export async function checkDist(dir, options = {}) {
  const found = [];
  const files = await htmlFiles(dir);
  if (!files.length) return [`${dir}: no built pages (run the site build first)`];
  for (const file of files) {
    const html = await readFile(file, "utf8");
    // The root page only sends visitors to /ar/ (a meta refresh): nothing to rank.
    if (/<meta[^>]*http-equiv="refresh"/i.test(html)) continue;
    for (const p of checkPage(html, options)) found.push(`${path.relative(dir, file)}: ${p}`);
  }
  const read = (name) => readFile(path.join(dir, name), "utf8").catch(() => null);
  const robots = await read("robots.txt");
  if (robots === null) found.push("robots.txt: missing");
  else for (const p of checkRobots(robots, options)) found.push(`robots.txt: ${p}`);
  const sitemap = await read("sitemap.xml");
  if (sitemap === null) found.push("sitemap.xml: missing");
  else for (const p of checkSitemap(sitemap)) found.push(`sitemap.xml: ${p}`);
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--")) ?? "apps/landing/dist";
  const problems = await checkDist(dir, { allowNoindex: args.includes("--allow-noindex") });
  if (problems.length) {
    console.error(problems.join("\n"));
    console.error(`\n${problems.length} search-readiness problem(s) in ${dir}`);
    process.exit(1);
  }
  console.log(`Search-readiness check passed for ${dir}`);
}
