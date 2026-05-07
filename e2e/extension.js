import { test as base, chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { MOCK_RATES } from "./mock-rates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(__dirname, "..");

export const test = base.extend({
  context: async ({}, use) => {
    // Fresh user data dir for each test to ensure clean extension state
    const userDataDir = path.resolve(__dirname, `.test-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
        "--window-size=200,150",
      ],
      headless: false,
    });

    // Mock exchange rate API at context level
    await context.route("**/api.exchangerate-api.com/**", route => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: "success",
          base_code: "USD",
          rates: MOCK_RATES,
        }),
      });
    });

    // Wait for extension to initialize
    await new Promise(r => setTimeout(r, 3000));

    await use(context);
    await context.close();

    // Cleanup
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

export const { expect } = base;
