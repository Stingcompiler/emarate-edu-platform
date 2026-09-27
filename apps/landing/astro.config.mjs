import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Static site (SSG): pages are rebuilt from /api/public/* whenever the site
// team publishes (docs/02 D9, Phase 9).
export default defineConfig({
  site: "https://ecst.edu.sd",
  output: "static",
  vite: { plugins: [tailwindcss()] },
});
