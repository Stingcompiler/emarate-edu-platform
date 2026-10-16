import assert from "node:assert/strict";
import { test } from "node:test";

import { checkPage, checkRobots, checkSitemap } from "./seo-check.mjs";

const good = `<!doctype html><html lang="ar" dir="rtl"><head>
<title>بكالوريوس تقنية المعلومات — كلية الإمارات للعلوم والتكنولوجيا</title>
<meta name="description" content="برنامج بكالوريوس تقنية المعلومات: ثماني فصول دراسية ومعامل حاسوب، وشروط القبول والرسوم وخطوات التقديم الإلكتروني.">
<link rel="canonical" href="https://college.example/ar/programs/BIT/">
<link rel="alternate" hreflang="ar" href="https://college.example/ar/programs/BIT/">
<link rel="alternate" hreflang="en" href="https://college.example/en/programs/BIT/">
<link rel="alternate" hreflang="x-default" href="https://college.example/ar/programs/BIT/">
<meta property="og:title" content="BIT"><meta property="og:image" content="https://college.example/x.jpg">
<script type="application/ld+json">{"@type":"Course"}</script>
</head><body><h1>بكالوريوس تقنية المعلومات</h1></body></html>`;

test("a finished page passes", () => {
  assert.deepEqual(checkPage(good), []);
});

test("a page hidden from search, or still carrying sample text, fails", () => {
  const hidden = good.replace("<title>", '<meta name="robots" content="noindex, nofollow"><title>');
  assert.match(checkPage(hidden).join("\n"), /hidden from search/);
  assert.deepEqual(checkPage(hidden, { allowNoindex: true }), []);
  const sample = good.replace("برنامج بكالوريوس", "(مثال) برنامج بكالوريوس");
  assert.match(checkPage(sample).join("\n"), /sample text/);
});

test("missing or badly sized basics are reported", () => {
  const bad = good
    .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="قصير">')
    .replace(/<link rel="canonical"[^>]*>/, "")
    .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, "")
    .replace(/<meta property="og:image"[^>]*>/, "")
    .replace("<h1>", "<h1>a</h1><h1>")
    .replace('{"@type":"Course"}', "{oops");
  const text = checkPage(bad).join("\n");
  for (const expected of [
    /description is 4 characters/,
    /no canonical/,
    /x-default/,
    /no og:image/,
    /2 <h1>/,
    /JSON-LD does not parse/,
  ]) {
    assert.match(text, expected);
  }
});

test("robots.txt must let the site be indexed and name its sitemap", () => {
  assert.match(checkRobots("User-agent: *\nDisallow: /\n").join("\n"), /disallows the whole site/);
  assert.deepEqual(
    checkRobots("User-agent: *\nAllow: /\n\nSitemap: https://college.example/sitemap.xml\n"),
    [],
  );
  assert.deepEqual(checkRobots("User-agent: *\nDisallow: /\n", { allowNoindex: true }), [
    "robots.txt names no sitemap",
  ]);
});

test("the sitemap must hold absolute https addresses of one real host", () => {
  const url = (loc) => `<url><loc>${loc}</loc></url>`;
  assert.deepEqual(checkSitemap(`<urlset>${url("https://college.example/ar/")}</urlset>`), []);
  assert.match(
    checkSitemap(`<urlset>${url("http://college.example/ar/")}</urlset>`).join(),
    /not absolute https/,
  );
  assert.match(
    checkSitemap(`<urlset>${url("https://ecst.stingdev.pro/ar/")}</urlset>`).join(),
    /test address/,
  );
  assert.deepEqual(checkSitemap("<urlset></urlset>"), ["sitemap has no <loc> entries"]);
});

test("the root redirect page is not judged as a page to rank", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { checkDist } = await import("./seo-check.mjs");
  const dir = await mkdtemp(join(tmpdir(), "seo-"));
  await writeFile(
    join(dir, "index.html"),
    '<html lang="ar"><head><meta http-equiv="refresh" content="0; url=/ar/"></head></html>',
  );
  await mkdir(join(dir, "ar"));
  await writeFile(join(dir, "ar", "index.html"), good);
  await writeFile(
    join(dir, "robots.txt"),
    "User-agent: *\nAllow: /\nSitemap: https://college.example/sitemap.xml\n",
  );
  await writeFile(
    join(dir, "sitemap.xml"),
    "<urlset><url><loc>https://college.example/ar/</loc></url></urlset>",
  );
  assert.deepEqual(await checkDist(dir), []);
});
