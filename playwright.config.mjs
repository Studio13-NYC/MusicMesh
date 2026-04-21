import { defineConfig } from "@playwright/test";

const deployed = process.env.MUSICMESH_E2E === "deployed";
const baseURL = deployed
  ? process.env.MUSICMESH_BASE_URL || "https://musicmesh.s13.nyc"
  : "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "tests/playwright",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: deployed ? 1 : 0,
  workers: 1,
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: deployed
    ? undefined
    : [
        {
          command: "npm run dev:api",
          url: "http://127.0.0.1:43101/api/health",
          reuseExistingServer: true,
          timeout: 60_000
        },
        {
          command: "npm run preview:e2e",
          url: "http://127.0.0.1:4173",
          reuseExistingServer: true,
          timeout: 60_000
        }
      ]
});
