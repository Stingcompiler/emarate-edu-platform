import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// The portal's origin, where the API, its images and the forms' endpoints live (same as
// src/lib/api.ts reads at build time).
const API = new URL(process.env.PUBLIC_API_URL ?? "http://127.0.0.1:8000").origin;

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
  // Content-Security-Policy (review 2026-11, R56): a <meta> on every page, with a hash of each
  // script and style the build emits, so nothing else runs — not even inside the rich text the
  // site team publishes. Images, the contact form and the 404 redirect lookup reach the API's
  // origin; the cards' «--i» and similar style attributes are allowed on their own.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        // The site's images come from the API's origin, or from Bunny's public zone once the
        // files live there (owner, 2026-11-16): any https address; an image runs no code.
        `img-src 'self' data: https: ${API}`,
        `connect-src 'self' ${API}`,
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        `form-action 'self' ${API}`,
      ],
      styleDirective: {
        resources: [
          { resource: "'self'", kind: "element" },
          { resource: "'unsafe-inline'", kind: "attribute" },
        ],
      },
    },
  },
});
