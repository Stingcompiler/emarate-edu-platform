import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the critical flows (docs/05 §11): sign-in, taking an exam, applying.
 * Starts its own API (:8001, fresh demo data), portal (:5174) and public site (:4322) — ports
 * overridable, see below;
 * `pnpm dev` is untouched.
 * Locally it drives the installed Google Chrome; CI installs Playwright's Chromium.
 */
const CI = !!process.env.CI;
// Ports can move (E2E_API_PORT, E2E_PORTAL_PORT, E2E_SITE_PORT) when another project on the
// machine already uses the defaults. Set here so the servers and the tests agree.
const API_PORT = (process.env.E2E_API_PORT ??= "8001");
const PORTAL_PORT = (process.env.E2E_PORTAL_PORT ??= "5174");
const SITE_PORT = (process.env.E2E_SITE_PORT ??= "4322");
process.env.E2E_SITE_URL = `http://localhost:${SITE_PORT}`;
const API = `http://127.0.0.1:${API_PORT}`;
const PORTAL = `http://localhost:${PORTAL_PORT}`;

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false, // one shared demo database
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI
    ? [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]]
    : "list",
  use: {
    baseURL: PORTAL,
    locale: "ar",
    timezoneId: "Africa/Khartoum",
    trace: "retain-on-failure",
    ...(CI ? {} : { channel: "chrome" }),
  },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: "bash e2e/serve-api.sh",
      cwd: "..",
      url: `${API}/api/public/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
    },
    {
      // The public site (Astro) reads its content from the same test API.
      command: `pnpm --filter @ecst/landing exec astro dev --port ${SITE_PORT} --ignore-lock`,
      cwd: "..",
      url: `http://localhost:${SITE_PORT}/ar/`,
      env: {
        PUBLIC_API_URL: API,
        PUBLIC_PORTAL_URL: PORTAL,
        ECST_E2E: "1",
      },
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
    },
    {
      command: `pnpm --filter @ecst/portal exec vite --port ${PORTAL_PORT} --strictPort`,
      cwd: "..",
      url: PORTAL,
      env: { ECST_API_ORIGIN: API },
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
    },
  ],
});
