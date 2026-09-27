import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = process.env.ECST_API_ORIGIN ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
