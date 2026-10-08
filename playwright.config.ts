import { defineConfig, devices } from "@playwright/test";

// Browser regression tests, run against the production build served by `vite preview`:
//   npm run build && npm run e2e
// They are hermetic: every request to the title service, Google, Wikidata and YouTube is answered by the test
// itself (e2e/support.ts), so they need no network and no account. In CI the browser comes from
// `npx playwright install --with-deps chromium`; on a machine that already has one, point PW_CHROMIUM at it.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: "http://localhost:4173", colorScheme: "dark", launchOptions: executablePath ? { executablePath, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } }
  ],
  webServer: { command: "npm run preview -- --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI, timeout: 60_000 }
});
