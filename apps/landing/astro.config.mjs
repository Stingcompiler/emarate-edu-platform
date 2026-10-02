import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Static site (SSG): pages are rebuilt from /api/public/* whenever the site
// team publishes (docs/02 D9, Phase 9).
export default defineConfig({
  // The site's own address (canonical, share and sitemap links). A copy on another domain — the
  // demo at ecst.stingdev.pro — sets SITE_URL at build time.
  site: process.env.SITE_URL || "https://ecst.edu.sd",
  output: "static",
  vite: { plugins: [tailwindcss()] },
  // The end-to-end runs screenshot the dev server: no Astro toolbar over the pages.
  devToolbar: { enabled: !process.env.ECST_E2E },
});
