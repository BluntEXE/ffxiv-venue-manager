import { defineConfig, devices } from "@playwright/test"

// Smoke tests run against prod (xivvenuemanager.com) by default. Override
// with PLAYWRIGHT_BASE_URL to test a staging URL or a local dev server.
//
// Local runs use Brave (custom executablePath), CI uses bundled Chromium.
// Brave is treated as plain Chromium with a different binary, so the same
// config and selectors work in both environments.

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "https://xivvenuemanager.com"
const BRAVE_PATH = process.env.PLAYWRIGHT_BRAVE_PATH ?? "/usr/bin/brave"
const USE_BRAVE = process.env.PLAYWRIGHT_USE_BRAVE === "1"

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Network throttling stays off — the suite is checking that prod is up,
    // not how slow it loads.
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(USE_BRAVE ? { launchOptions: { executablePath: BRAVE_PATH } } : {}),
      },
    },
  ],
})
