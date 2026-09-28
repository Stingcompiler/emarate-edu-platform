import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the critical flows (docs/05 §11): sign-in, taking an exam, applying.
 * Starts its own API (:8001, fresh demo data), portal (:5174) and public site (:4322);
 * `pnpm dev` is untouched.
 * Locally it drives the installed Google Chrome; CI installs Playwright's Chromium.
 */
const CI = !!process.env.CI;

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
    baseURL: "http://localhost:5174",
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
      url: "http://127.0.0.1:8001/api/public/health",
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
    },
    {
      // The public site (Astro) reads its content from the same test API.
      command: "pnpm --filter @ecst/landing exec astro dev --port 4322 --ignore-lock",
      cwd: "..",
      url: "http://localhost:4322/ar/",
      env: { PUBLIC_API_URL: "http://127.0.0.1:8001", PUBLIC_PORTAL_URL: "http://localhost:5174" },
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
    },
    {
      command: "pnpm --filter @ecst/portal exec vite --port 5174 --strictPort",
      cwd: "..",
      url: "http://localhost:5174",
      env: { ECST_API_ORIGIN: "http://127.0.0.1:8001" },
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
    },
  ],
});
