import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);

/**
 * E2E テスト（U1-TEST-3）。本番用にビルドしたアプリに対して動かす。
 * CI では Chromium と WebKit（iOS Safari に近いもの）の両方で動かす。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "ja-JP",
    trace: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Pixel 7"] } },
    ...(process.env.E2E_WEBKIT === "0"
      ? []
      : [{ name: "webkit", use: { ...devices["iPhone 15"] } }]),
  ],
  webServer: {
    command: `node scripts/start-standalone.mjs`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
    timeout: 60_000,
  },
});
