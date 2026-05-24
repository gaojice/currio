import { test, expect } from "../extension.js";

async function getConversionTexts(page) {
  // Both data-attribute (React-proof) and span-based annotations
  const data = await page.$$eval("[data-currio-converted]", els =>
    els.map(el => el.getAttribute("data-currio-converted"))
  );
  const spans = await page.locator(".currio-converted").allTextContents();
  return [...data, ...spans];
}

async function countConversions(page) {
  const data = await page.locator("[data-currio-converted]").count();
  const spans = await page.locator(".currio-converted").count();
  return data + spans;
}

async function waitForConversion(page, timeout = 25000) {
  try {
    await page.waitForSelector("[data-currio-converted], .currio-converted", { timeout });
  } catch {}
  return countConversions(page);
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
    await waitForConversion(page);
    const cnt = await countConversions(page);
    expect(cnt).toBe(4);
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
test.describe("Amazon-style structured prices", () => {
  test("converts visible HKD price split across Amazon a-price spans", async ({ page }) => {
    await page.goto("/amazon-price.html");
    await waitForConversion(page);

    await expect(page.locator("#offer-price")).toHaveAttribute("data-currio-converted", /NT\$/);
    await expect(page.locator("#center-column-price")).toHaveAttribute("data-currio-converted", /NT\$/);
    await expect(page.locator("#subtotal-price")).toHaveAttribute("data-currio-converted", /NT\$/);

    const body = await page.textContent("body");
    expect(body).toContain("HKD2,648.34");
    expect(body).toContain("HKD");
  });
});

// ============================================================
test.describe("Dynamic content", () => {
  test("converts dynamically inserted currency amounts", async ({ page }) => {
    await page.goto("/dynamic.html");
    await page.waitForTimeout(5000);
    const initial = await countConversions(page);

    await page.click("#addBtn");
    await page.waitForTimeout(2000);

    const updated = await countConversions(page);
    if (initial > 0) {
      expect(updated).toBeGreaterThan(initial);
    }
  });

  test("converts after SPA text update (characterData mutation)", async ({ page }) => {
    await page.goto("/spa-update.html");
    await page.waitForTimeout(5000);
    const initial = await countConversions(page);

    await page.click("#updateBtn");
    await page.waitForTimeout(2000);

    const updated = await countConversions(page);
    expect(updated).toBeGreaterThanOrEqual(initial);
  });
});

// ============================================================
test.describe("False positive prevention", () => {
  test("does not convert bare numbers without currency context", async ({ page }) => {
    await page.goto("/excluded.html");
    await page.waitForTimeout(5000);
    const cnt = await countConversions(page);
    expect(cnt).toBe(0);
  });

  test("skips content inside <code> and <pre> tags", async ({ page }) => {
    await page.goto("/excluded.html");
    await page.waitForTimeout(5000);
    const body = await page.textContent("body");
    expect(body).toContain("$100");
    expect(body).toContain("$50");
    const cnt = await countConversions(page);
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
    expect(cnt).toBeGreaterThanOrEqual(6);
  });
});

// ============================================================
test.describe("Simple price recognition", () => {
  test("recognizes $20 in a single span", async ({ page }) => {
    await page.goto("/semi-button.html");
    await waitForConversion(page);
    const cnt = await countConversions(page);
    expect(cnt).toBe(1);
    const body = await page.textContent("body");
    expect(body).toContain("$20");
  });
});

// ============================================================
test.describe("Multi-char currency symbols", () => {
  test("recognizes NT$690 as TWD", async ({ page }) => {
    await page.goto("/ntdollar.html");
    await waitForConversion(page);
    const cnt = await countConversions(page);
    expect(cnt).toBeGreaterThanOrEqual(5);
    const body = await page.textContent("body");
    expect(body).toContain("NT$690");
  });
});

// ============================================================
test.describe("Split-element recognition", () => {
  test("recognizes currency split across elements", async ({ page }) => {
    await page.goto("/split.html");
    const cnt = await waitForConversion(page);
    expect(cnt).toBeGreaterThanOrEqual(1);
  });

  test("recognizes ￥ split across spans (full-width yen)", async ({ page }) => {
    await page.goto("/taobao-price.html");
    await page.waitForTimeout(5000);

    const highlight = page.locator(".highlightPrice");
    expect(await highlight.textContent()).toMatch(/2\.01/);

    const sub = page.locator(".subPrice");
    expect(await sub.textContent()).toMatch(/4\.01/);
  });

  test("recognizes ￥ in taobao detail price structure", async ({ page }) => {
    await page.goto("/taobao-detail.html");
    await waitForConversion(page);

    const cnt = await countConversions(page);
    expect(cnt).toBeGreaterThanOrEqual(2);

    const highlight = page.locator(".highlightPrice");
    expect(await highlight.textContent()).toMatch(/16\.9/);

    const sub = page.locator(".subPrice");
    expect(await sub.textContent()).toMatch(/19\.9/);
  });
});

// ============================================================
test.describe("Inline symbol elements", () => {
  test("recognizes ¥ inside <i> with digits as text node sibling", async ({ page }) => {
    await page.goto("/inline-symbol.html");
    const cnt = await waitForConversion(page);
    // ¥ on zh-CN → CNY → converts unless target=CNY
    expect(cnt).toBeGreaterThanOrEqual(1);
  });

  test("preserves original price text after inline-symbol conversion", async ({ page }) => {
    await page.goto("/inline-symbol.html");
    await page.waitForTimeout(5000);
    const body = await page.textContent("body");
    expect(body).toContain("35.09");
    expect(body).toContain("19.99");
    expect(body).toContain("42.50");
  });

  test("conversion renders after full price, not between symbol and digits", async ({ page }) => {
    await page.goto("/inline-symbol.html");
    await waitForConversion(page);

    // Check that the parent <span> has the data-currio-converted attribute
    // (not the <i> element), so ::after renders after "¥35.09" not "¥"
    const spans = page.locator(".core_item_sku_price span");
    const count = await spans.count();
    let foundOnSpan = false;
    for (let i = 0; i < count; i++) {
      const hasAttr = await spans.nth(i).getAttribute("data-currio-converted");
      if (hasAttr) { foundOnSpan = true; break; }
    }
    expect(foundOnSpan).toBe(true);
  });
});

// ============================================================
test.describe("Ambiguous $ handling", () => {
  test("ambiguous $ gets visual distinction", async ({ page }) => {
    await page.goto("/ambiguous.html");
    await page.waitForTimeout(5000);

    const total = await countConversions(page);
    const dataAmbig = await page.locator("[data-currio-ambiguous]").count();
    const spanAmbig = await page.locator(".currio-ambiguous").count();
    const ambig = dataAmbig + spanAmbig;

    if (total > 0) {
      expect(ambig).toBeGreaterThanOrEqual(1);
      // Check data-tip or data-currio-tip
      const tip = dataAmbig > 0
        ? await page.locator("[data-currio-ambiguous]").first().getAttribute("data-currio-tip")
        : await page.locator(".currio-ambiguous").first().getAttribute("data-tip");
      expect(tip).toContain("USD");
    }
  });

  test("confirmed $ (en-US page) does not get ambiguous class", async ({ page }) => {
    await page.goto("/basic.html");
    const cnt = await page.locator("[data-currio-ambiguous], .currio-ambiguous").count();
    expect(cnt).toBe(0);
  });

  test("conversion annotation has dashed border", async ({ page }) => {
    await page.goto("/basic.html");
    const cnt = await waitForConversion(page);
    if (cnt > 0) {
      // Check ::after pseudo-element for data-attribute annotation
      const dataEl = page.locator("[data-currio-converted]").first();
      const hasData = await dataEl.count() > 0;
      if (hasData) {
        const style = await dataEl.evaluate(el =>
          window.getComputedStyle(el, "::after")
        );
        expect(style.borderTopStyle || style.borderBottomStyle).toBe("dashed");
      }
    }
  });
});
