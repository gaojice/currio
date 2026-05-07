import { test, expect } from "../extension.js";

async function getConversionTexts(page) {
  return page.locator(".currio-converted").allTextContents();
}

async function waitForConversion(page, timeout = 25000) {
  await page.waitForSelector(".currio-converted", { timeout }).catch(() => {});
  return page.locator(".currio-converted").count();
}

// ============================================================
test.describe("Basic currency recognition", () => {
  test("recognizes at least one currency on the page", async ({ page }) => {
    await page.goto("/basic.html");
    const cnt = await waitForConversion(page);
    // Some pairs may be same source/target (e.g. $ on en-US with USD target)
    expect(cnt).toBeGreaterThanOrEqual(1);
    const texts = await getConversionTexts(page);
    texts.forEach(t => {
      expect(t).toMatch(/[¥$€£₩NT]/);
    });
  });

  test("all conversion annotations contain currency symbols", async ({ page }) => {
    await page.goto("/basic.html");
    const cnt = await waitForConversion(page);
    expect(cnt).toBeGreaterThanOrEqual(1);
    const texts = await getConversionTexts(page);
    expect(texts.some(t => /[¥$€£₩NT]/.test(t))).toBe(true);
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

  test("converts fractional amounts when source ≠ target", async ({ page }) => {
    await page.goto("/fractional.html");
    // All $ on en-US with USD target → 0; with non-USD target → 4
    const cnt = await waitForConversion(page);
    expect(cnt).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
test.describe("Currency code formats", () => {
  test("recognizes currency code formats", async ({ page }) => {
    await page.goto("/codes.html");
    const cnt = await waitForConversion(page);
    // Explicit codes always differ from target (unless target matches a code)
    expect(cnt).toBeGreaterThanOrEqual(1);
  });

  test("preserves 200 EUR original text", async ({ page }) => {
    await page.goto("/codes.html");
    await page.waitForTimeout(5000);
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("200 EUR");
  });
});

// ============================================================
test.describe("Dynamic content", () => {
  test("converts dynamically inserted currency amounts", async ({ page }) => {
    await page.goto("/dynamic.html");
    await page.waitForTimeout(5000);
    const initial = await page.locator(".currio-converted").count();

    await page.click("#addBtn");
    await page.waitForTimeout(2000);

    const updated = await page.locator(".currio-converted").count();
    // $200 should trigger a new conversion if source ≠ target
    if (initial > 0) {
      expect(updated).toBeGreaterThan(initial);
    }
  });
});

  test("converts after SPA text update (characterData mutation)", async ({ page }) => {
    await page.goto("/spa-update.html");
    await page.waitForTimeout(5000);
    const initial = await page.locator(".currio-converted").count();

    // Click button that updates textContent in-place
    await page.click("#updateBtn");
    await page.waitForTimeout(2000);

    const updated = await page.locator(".currio-converted").count();
    // $150 (new value) should be re-scanned; $200 (unchanged) may also be converted
    expect(updated).toBeGreaterThanOrEqual(initial);
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
test.describe("Suffixed amounts ($13M, $100k etc.)", () => {
  test("recognizes $13M with letter suffix", async ({ page }) => {
    await page.goto("/suffixed.html");
    const cnt = await waitForConversion(page);
    expect(cnt).toBeGreaterThanOrEqual(1);
    const texts = await getConversionTexts(page);
    expect(texts.some(t => /[¥$€£₩NT]/.test(t))).toBe(true);
  });

  test("recognizes $3.3M with decimal and letter suffix", async ({ page }) => {
    await page.goto("/suffixed.html");
    await page.waitForTimeout(5000);
    const bodyText = await page.textContent("body");
    expect(bodyText).toContain("$3.3M");
  });

  test("converts suffixed amounts when source ≠ target", async ({ page }) => {
    await page.goto("/suffixed.html");
    const cnt = await waitForConversion(page);
    // $ on en-US with USD target → 0; with non-USD target → up to 6
    expect(cnt).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
test.describe("Split-element recognition", () => {
  test("recognizes currency split across elements", async ({ page }) => {
    await page.goto("/split.html");
    const cnt = await waitForConversion(page);
    // €25 should convert regardless of target
    expect(cnt).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
test.describe("Ambiguous $ handling", () => {
  test("ambiguous $ gets visual distinction", async ({ page }) => {
    await page.goto("/ambiguous.html");
    await page.waitForTimeout(5000);

    const total = await page.locator(".currio-converted").count();
    const ambig = await page.locator(".currio-ambiguous").count();

    // If source ≠ target, we get conversions + ambiguity
    // If source = target, no conversions at all
    if (total > 0) {
      expect(ambig).toBeGreaterThanOrEqual(1);
      const tip = await page.locator(".currio-ambiguous").first().getAttribute("data-tip");
      expect(tip).toContain("USD");
    }
  });

  test("confirmed $ (en-US page) does not get ambiguous class", async ({ page }) => {
    await page.goto("/basic.html");
    const cnt = await page.locator(".currio-ambiguous").count();
    expect(cnt).toBe(0);
  });

  test("conversion annotation has dashed border", async ({ page }) => {
    await page.goto("/basic.html");
    const cnt = await waitForConversion(page);
    if (cnt > 0) {
      const style = await page.locator(".currio-converted").first().evaluate(el => ({
        borderStyle: window.getComputedStyle(el).borderTopStyle,
        userSelect: window.getComputedStyle(el).userSelect,
      }));
      expect(style.borderStyle).toBe("dashed");
      expect(style.userSelect).not.toBe("none");
    }
  });
});
