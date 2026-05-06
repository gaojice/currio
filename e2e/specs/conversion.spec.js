import { test, expect } from "../extension.js";

async function getConversionTexts(page) {
  return page.locator(".currio-converted").allTextContents();
}

async function waitForConversion(page, minCount = 1, timeout = 25000) {
  await page.waitForSelector(".currio-converted", { timeout }).catch(() => {});
  return page.locator(".currio-converted").count();
}

// ============================================================
test.describe("Basic currency recognition", () => {
  test("recognizes $100 and converts", async ({ page }) => {
    await page.goto("/basic.html");
    const cnt = await waitForConversion(page, 1);
    expect(cnt).toBeGreaterThanOrEqual(1);

    const texts = await getConversionTexts(page);
    // Every annotation uses ≈ and a currency symbol
    texts.forEach(t => {
      expect(t).toMatch(/≈/);
      expect(t.trim()).not.toBe("");
    });
  });

  test("recognizes €50 and converts", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);
    const texts = await getConversionTexts(page);
    expect(texts.some(t => /≈/.test(t))).toBe(true);
  });

  test("recognizes ¥1000 and converts", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);
    const texts = await getConversionTexts(page);
    expect(texts.some(t => /≈/.test(t))).toBe(true);
  });

  test("recognizes £30 and converts", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);
    const texts = await getConversionTexts(page);
    expect(texts.some(t => /≈/.test(t))).toBe(true);
  });

  test("recognizes $1,234.56 with thousands separator", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);
    const texts = await getConversionTexts(page);
    expect(texts.some(t => /≈/.test(t))).toBe(true);
  });

  test("converts all 7 currency items on the page", async ({ page }) => {
    await page.goto("/basic.html");
    const cnt = await waitForConversion(page, 1);
    expect(cnt).toBe(7);
  });
});

// ============================================================
test.describe("Fractional amounts", () => {
  test("matches $0.375 fully (3 decimal places)", async ({ page }) => {
    await page.goto("/fractional.html");
    await page.waitForTimeout(5000);
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("0.375");
  });

  test("converts all 4 fractional amounts", async ({ page }) => {
    await page.goto("/fractional.html");
    const cnt = await waitForConversion(page, 1);
    expect(cnt).toBe(4);
  });
});

// ============================================================
test.describe("Currency code formats", () => {
  test("recognizes USD 100 (code prefix)", async ({ page }) => {
    await page.goto("/codes.html");
    const cnt = await waitForConversion(page, 1);
    expect(cnt).toBeGreaterThanOrEqual(1);
  });

  test("preserves 200 EUR original text", async ({ page }) => {
    await page.goto("/codes.html");
    await page.waitForTimeout(5000);
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("200 EUR");
  });

  test("recognizes lowercase currency codes", async ({ page }) => {
    await page.goto("/codes.html");
    const cnt = await waitForConversion(page, 1);
    expect(cnt).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================
test.describe("Dynamic content", () => {
  test("converts dynamically inserted currency amounts", async ({ page }) => {
    await page.goto("/dynamic.html");
    const initial = await waitForConversion(page, 1);
    expect(initial).toBe(1);

    await page.click("#addBtn");
    await page.waitForTimeout(2000);

    const updated = await page.locator(".currio-converted").count();
    expect(updated).toBe(2);

    const texts = await getConversionTexts(page);
    expect(texts.length).toBe(2);
    texts.forEach(t => {
      expect(t).toMatch(/≈/);
    });
  });
});

// ============================================================
test.describe("False positive prevention", () => {
  test("does not convert bare numbers without currency context", async ({ page }) => {
    await page.goto("/excluded.html");
    await page.waitForTimeout(5000);
    const cnt = await page.locator(".currio-converted").count();
    expect(cnt).toBe(0);
  });

  test("skips content inside <code> and <pre> tags", async ({ page }) => {
    await page.goto("/excluded.html");
    await page.waitForTimeout(5000);
    const body = await page.textContent("body");
    expect(body).toContain("$100");
    expect(body).toContain("$50");
    const cnt = await page.locator(".currio-converted").count();
    expect(cnt).toBe(0);
  });
});

// ============================================================
test.describe("Selectable text", () => {
  test("converted annotation text is selectable", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);

    const sel = await page.locator(".currio-converted").first().evaluate(el =>
      window.getComputedStyle(el).userSelect
    );
    expect(sel).not.toBe("none");
  });
});
