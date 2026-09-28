import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit and component tests (docs/05 §11): jsdom, Arabic locale as in the browser.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // Dates in tests are built from fixed instants; pin the zone the college uses.
    env: { TZ: "Africa/Khartoum" },
  },
});
