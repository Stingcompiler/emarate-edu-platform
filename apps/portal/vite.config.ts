import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { type Plugin, defineConfig } from "vite";

const API = process.env.ECST_API_ORIGIN ?? "http://127.0.0.1:8000";

/**
 * Content-Security-Policy (review 2026-11, R56), as a <meta> in the built index.html: scripts
 * from the portal itself and, inline, only the theme script whose hash is computed here — so
 * nothing injected into a page runs. Embeds only from YouTube (nocookie) and Bunny Stream,
 * the lecture players (LecturePlayer.tsx). Images and media from any https address: uploads
 * may sit on a storage CDN (MEDIA_BACKEND=bunny), and they cannot run code. Build only: the
 * dev server's hot reload injects inline scripts of its own.
 */
function contentSecurityPolicy(): Plugin {
  const hash = (code: string) => `'sha256-${createHash("sha256").update(code).digest("base64")}'`;
  return {
    name: "ecst-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${inline.map((m) => hash(m[1])).join(" ")}`.trim(),
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: https:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "frame-src https://www.youtube-nocookie.com https://iframe.mediadelivery.net",
          "worker-src 'self'",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; ");
        return html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development: the portal talks to Django through this
    // proxy, so cookies and CSRF behave exactly as in production.
    proxy: {
      "/api": API,
      "/admin": API,
      "/static": API,
    },
  },
});
