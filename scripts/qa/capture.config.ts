import path from "node:path";

import { defineConfig } from "@playwright/test";

import base from "../../e2e/playwright.config";

/**
 * QA screen capture (docs/qa/QA-SYSTEM.md): the same servers and fresh demo data as `pnpm e2e`,
 * plus the prototype boards, so the UI auditor compares real pages with their boards from
 * image files instead of driving a browser turn by turn.
 *
 *   QA_CAPTURE=.scratch/qa/<id>/pages.json QA_OUT=.scratch/qa/<id>/ui \
 *     pnpm exec playwright test -c scripts/qa/capture.config.ts
 */
const ROOT = path.resolve(__dirname, "../..");
const servers = Array.isArray(base.webServer)
  ? base.webServer
  : base.webServer
    ? [base.webServer]
    : [];

export default defineConfig({
  ...base,
  testDir: "./capture",
  outputDir: path.join(ROOT, ".scratch/qa/test-results"),
  reporter: "list",
  projects: [
    ...(base.projects ?? []),
    { name: "wide", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    // The e2e config's servers run from the repository root whatever this file's folder is.
    ...servers.map((server) => ({ ...server, cwd: ROOT })),
    {
      command: "python3 scripts/boards.py serve",
      cwd: ROOT,
      url: "http://127.0.0.1:8799/",
      reuseExistingServer: true,
      timeout: 30_000,
      stdout: "ignore",
      stderr: "ignore",
    },
  ],
});
