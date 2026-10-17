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
