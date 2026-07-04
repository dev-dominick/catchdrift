import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "local-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "local-mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
