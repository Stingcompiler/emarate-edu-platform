import { expect, it } from "vitest";

import { siteLinkFor, siteUrl } from "./site";

it("a site path never repeats the language (/ar//ar/ was a 404)", () => {
  const url = siteUrl("/ar/contact/");
  expect(url).toMatch(/\/ar\/contact\/$/);
  expect(url).not.toContain("/ar//");
  expect(url.match(/\/ar\//g)).toHaveLength(1);
});

// «العودة إلى موقع الكلية» from the installed app leaves for the phone's browser (owner,
// 2026-11-11): a new window alone stayed in a sheet over the app on phones.
const SITE = "https://ecst.stingdev.pro/ar/contact/?from=portal";
const IPHONE_17 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPHONE_16 =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPAD =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const app = (userAgent: string, touchPoints = 5) => ({ standalone: true, userAgent, touchPoints });

it("in a browser tab, a site link is an ordinary link", () => {
  expect(siteLinkFor(SITE, { standalone: false, userAgent: IPHONE_17, touchPoints: 5 })).toEqual({
    href: SITE,
  });
});

it("from the installed app on iOS 17+, a site link opens the Safari app", () => {
  expect(siteLinkFor(SITE, app(IPHONE_17))).toEqual({ href: `x-safari-${SITE}` });
  expect(siteLinkFor(SITE, app(IPAD))).toEqual({ href: `x-safari-${SITE}` });
});

it("on older iOS, which lacks that address, it keeps a new window", () => {
  expect(siteLinkFor(SITE, app(IPHONE_16))).toEqual({
    href: SITE,
    target: "_blank",
    rel: "noopener noreferrer",
  });
});

it("on Android, the system's browser is asked for, with the page itself as the fallback", () => {
  const { href, target } = siteLinkFor(SITE, app(ANDROID));
  expect(target).toBeUndefined();
  expect(href).toMatch(/^intent:\/\/ecst\.stingdev\.pro\/ar\/contact\/\?from=portal#Intent;/);
  expect(href).toContain(";scheme=https;action=android.intent.action.VIEW;");
  expect(href).toContain(`S.browser_fallback_url=${encodeURIComponent(SITE)};end`);
});

it("on a computer, the installed app opens a browser window (a Mac without touch is no iPad)", () => {
  expect(siteLinkFor(SITE, app(MAC, 0))).toEqual({
    href: SITE,
    target: "_blank",
    rel: "noopener noreferrer",
  });
});
