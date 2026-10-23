#!/usr/bin/env node
// What a visitor downloads to see a page's first screen (design review B6): the page and
// everything it loads on a phone, cold cache, counted by bytes on the wire. A budget is a
// warning, not a build failure: the weight depends on what the college uploads.
//
//   node scripts/page-weight.mjs https://college.example/ar/            # 500 KB budget
//   node scripts/page-weight.mjs https://college.example/ar/ --budget 400 --json
//
// Needs Chrome (the installed one, or Playwright's `chromium`).
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:/.test(a));
const flag = args.indexOf("--budget");
const budget = (flag >= 0 ? Number(args[flag + 1]) : 500) * 1024;
const asJson = args.includes("--json");
if (!url) {
  console.error("usage: page-weight.mjs <url> [--budget KB] [--json]");
  process.exit(2);
}

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  locale: "ar",
});
const page = await context.newPage();
const client = await context.newCDPSession(page);
await client.send("Network.enable");
await client.send("Network.setCacheDisabled", { cacheDisabled: true });
const sizes = new Map();
client.on("Network.responseReceived", ({ requestId, response, type }) => {
  sizes.set(requestId, { url: response.url, type, bytes: 0 });
});
client.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
  const entry = sizes.get(requestId);
  if (entry) entry.bytes = encodedDataLength;
});
await page.goto(url, { waitUntil: "networkidle" });
// Lazy images count when they come near the first screen, not the whole page.
await page.waitForTimeout(1500);
await browser.close();

const rows = [...sizes.values()].filter((r) => r.bytes > 0);
const byType = {};
for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + r.bytes;
const total = rows.reduce((n, r) => n + r.bytes, 0);
const biggest = [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 8);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
if (asJson) {
  console.log(JSON.stringify({ url, total, budget, byType, biggest }, null, 2));
} else {
  console.log(
    `${url}\n  total ${kb(total)} (budget ${kb(budget)}) ${total <= budget ? "OK" : "OVER"}`,
  );
  for (const [type, bytes] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(12)} ${kb(bytes)}`);
  }
  console.log("  largest:");
  for (const r of biggest) console.log(`    ${kb(r.bytes).padStart(8)}  ${r.url.slice(0, 110)}`);
}
process.exit(total <= budget ? 0 : 1);
