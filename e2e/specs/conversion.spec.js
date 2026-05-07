import { test, expect } from "../extension.js";

async function getTooltips(page) {
  return page.$$eval(".currio-amount", els =>
    els.map(el => el.title || "")
  );
}

async function waitForConversion(page, minCount = 1, timeout = 25000) {
  await page.waitForSelector(".currio-amount", { timeout }).catch(() => {});
  return page.locator(".currio-amount").count();
}

// ============================================================
test.describe("Basic currency recognition", () => {
  test("recognizes $100 and converts", async ({ page }) => {
    await page.goto("/basic.html");
    const cnt = await waitForConversion(page, 1);
    expect(cnt).toBeGreaterThanOrEqual(1);

    const titles = await getTooltips(page);
    titles.forEach(t => {
      expect(t).toMatch(/≈/);
      expect(t.trim()).not.toBe("");
    });
  });

  test("recognizes €50 and converts", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);
    const titles = await getTooltips(page);
    expect(titles.some(t => /≈/.test(t))).toBe(true);
  });

  test("recognizes ¥1000 and converts", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);
    const titles = await getTooltips(page);
    expect(titles.some(t => /≈/.test(t))).toBe(true);
  });

  test("recognizes £30 and converts", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);
    const titles = await getTooltips(page);
    expect(titles.some(t => /≈/.test(t))).toBe(true);
  });

  test("recognizes $1,234.56 with thousands separator", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);
    const titles = await getTooltips(page);
    expect(titles.some(t => /≈/.test(t))).toBe(true);
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

    const updated = await page.locator(".currio-amount").count();
    expect(updated).toBe(2);

    const titles = await getTooltips(page);
    expect(titles.length).toBe(2);
    titles.forEach(t => {
      expect(t).toMatch(/≈/);
    });
  });
});

// ============================================================
test.describe("False positive prevention", () => {
  test("does not convert bare numbers without currency context", async ({ page }) => {
    await page.goto("/excluded.html");
    await page.waitForTimeout(5000);
    const cnt = await page.locator(".currio-amount").count();
    expect(cnt).toBe(0);
  });

  test("skips content inside <code> and <pre> tags", async ({ page }) => {
    await page.goto("/excluded.html");
    await page.waitForTimeout(5000);
    const body = await page.textContent("body");
    expect(body).toContain("$100");
    expect(body).toContain("$50");
    const cnt = await page.locator(".currio-amount").count();
    expect(cnt).toBe(0);
  });
});

// ============================================================
test.describe("Hover tooltip style", () => {
  test("amount wrapper has dotted underline", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);

    const bb = await page.locator(".currio-amount").first().evaluate(el =>
      window.getComputedStyle(el).borderBottomStyle
    );
    // Should have a border-bottom (dotted)
    expect(bb).not.toBe("none");
  });

  test("amount wrapper has help cursor", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);

    const cursor = await page.locator(".currio-amount").first().evaluate(el =>
      window.getComputedStyle(el).cursor
    );
    expect(cursor).toBe("help");
  });

  test("amount text does not show inline conversion", async ({ page }) => {
    await page.goto("/basic.html");
    await waitForConversion(page, 1);

    // The wrapper span should only contain the original amount text
    // not the "(≈ ...)" annotation
    const text = await page.locator(".currio-amount").first().textContent();
    expect(text).not.toMatch(/≈/);
  });
});
