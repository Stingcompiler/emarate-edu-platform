import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Static site (SSG): pages are rebuilt from /api/public/* whenever the site
// team publishes (docs/02 D9, Phase 9).
export default defineConfig({
  site: "https://ecst.edu.sd",
  output: "static",
  vite: { plugins: [tailwindcss()] },
  // The end-to-end runs screenshot the dev server: no Astro toolbar over the pages.
  devToolbar: { enabled: !process.env.ECST_E2E },
});
