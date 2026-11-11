import { expect, test } from "@playwright/test";

// The installed web app follows the logo in the site settings (owner, 2026-10-17): its manifest,
// home-screen icon and tab icon are served by the API from the current logo, and the portal's
// built-in icons stand in until a logo is set.
test("the web app manifest, tab icon and home-screen icon are served from the logo endpoint", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.id).toBe("/?source=pwa");
  const sources: string[] = manifest.icons.map((icon: { src: string }) => icon.src);
  expect(sources).toHaveLength(3);
  for (const src of sources) expect(src).toMatch(/^\/api\/public\/portal-icon\/[\w-]+\.png$/);

  const tab = await page.locator('link[rel="icon"]').getAttribute("href");
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(tab).toBe("/api/public/portal-icon/192.png");
  expect(touch).toBe("/api/public/portal-icon/apple-touch.png");

  // Every one of them comes back as a PNG (a redirect to the built-in icon while no logo is set).
  for (const src of [...sources, tab!, touch!]) {
    const response = await request.get(src);
    expect(response.status(), src).toBe(200);
    expect(response.headers()["content-type"], src).toContain("image/png");
  }
});

// «العودة إلى موقع الكلية» from the installed app leaves for the phone's browser (owner,
// 2026-11-11): the app's display mode and the phone are stood in for before the page loads.
for (const [phone, userAgent, expected] of [
  [
    "iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    /^x-safari-https?:\/\//,
  ],
  [
    "Android",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
    /^intent:\/\/.+#Intent;.*S\.browser_fallback_url=.+;end$/,
  ],
] as const) {
  test(`from the installed app on ${phone}, the way back to the site opens the browser`, async ({
    page,
  }) => {
    await page.addInitScript((ua) => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query.includes("display-mode: standalone")
          ? ({ ...real(query), matches: true, media: query } as MediaQueryList)
          : real(query);
      Object.defineProperty(navigator, "userAgent", { get: () => ua });
    }, userAgent);
    await page.goto("/login");
    const back = page.getByRole("link", { name: "العودة إلى موقع الكلية" });
    await expect(back).toHaveAttribute("href", expected);
  });
}
