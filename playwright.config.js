import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e/specs",
  timeout: 30000,
  workers: 2,
  use: {
    browserName: "chromium",
    baseURL: "http://localhost:8787",
  },
  webServer: {
    command: "node e2e/server.js",
    port: 8787,
  },
});
