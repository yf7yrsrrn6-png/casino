import { defineConfig, devices } from "@playwright/test";

/**
 * Браузерні E2E-тести Loops Trd: npm run e2e:ui
 * Стенд (БД + Hardhat + next build/start) піднімає global-setup.ts.
 * PW_CHROMIUM_PATH — шлях до вже встановленого Chromium (якщо браузери Playwright не завантажено).
 */
export default defineConfig({
  testDir: "./ui",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./ui/global-setup.ts",
  use: {
    baseURL: "http://localhost:3200",
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
});
