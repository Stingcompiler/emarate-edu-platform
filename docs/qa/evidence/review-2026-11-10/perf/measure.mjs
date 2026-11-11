// Run from the repo root: node docs/qa/evidence/review-2026-11-10/perf/measure.mjs <url>…
// LCP and transfer size on the public demo, under docs/09's conditions: fast 3G (DevTools
// preset: 562.5 ms RTT, 1.47 Mbps down, 675 kbps up) and a 4× slower CPU; phone 390×844; cold.
import { chromium } from "@playwright/test";

const PAGES = process.argv.slice(2);
const RUNS = 3;
const browser = await chromium.launch();
const out = [];
for (const url of PAGES) {
  for (let run = 1; run <= RUNS; run++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "ar" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 562.5, downloadThroughput: (1.474 * 1024 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    let bytes = 0;
    cdp.on("Network.loadingFinished", (e) => (bytes += e.encodedDataLength));
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    const loaded = Date.now() - t0;
    const lcp = await page.evaluate(() => window.__lcp);
    const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
    out.push({ url, run, lcp_ms: Math.round(lcp), dcl_ms: Math.round(nav.dcl), load_ms: Math.round(nav.load), idle_ms: loaded, kb: Math.round(bytes / 1024) });
    await context.close();
  }
}
await browser.close();
console.log(JSON.stringify(out));
