import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The live tests call the Snap API with the same .env.local the app reads.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    // `npm test` runs "offline" (no key, no network); `npm run test:live` runs "live" against the Snap API.
    projects: [
      { extends: true, test: { name: "offline", include: ["tests/*.test.ts"] } },
      { extends: true, test: { name: "live", include: ["tests/live/**/*.test.ts"] } },
    ],
  },
});
