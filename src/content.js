// Content script — DOM scanning, currency recognition, inline rendering
(() => {
  const CONVERTED_CLASS = "currio-converted";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT"]);
  const DEBOUNCE_MS = 300;
  const THROTTLE_MS = 500;
  const hasSymbol = /[$€£¥₩￥]/;
  const hasCurrencyCue = /[$€£¥₩￥]|\b(?:USD|EUR|GBP|JPY|CNY|TWD|KRW|AUD|CAD|HKD|SGD)(?=\s|\d|$)/i;

  // Match amounts with up to 6 decimal places (covers crypto, fractional pricing)
  const SYMBOL_PREFIX_RE = /([$€£¥₩￥])\s*(\d+(?:,\d{3})*(?:\.\d{1,6})?)(?!\d)/g;
  const SYMBOL_SUFFIX_RE = /\b(\d+(?:,\d{3})*(?:\.\d{1,6})?)\s*([$€£¥₩￥元])/g;
  const MULTI_SYM_RE = /\b(NT\$|HK\$|AU\$|CA\$|S\$|US\$)\s*(\d+(?:,\d{3})*(?:\.\d{1,6})?)(?!\d)/g;
  const MULTI_SYM_MAP = { "NT$": "TWD", "HK$": "HKD", "AU$": "AUD", "CA$": "CAD", "S$": "SGD", "US$": "USD" };
  const CODE_RE = /\b(USD|EUR|GBP|JPY|CNY|TWD|KRW|AUD|CAD|HKD|SGD)\s*(\d+(?:,\d{3})*(?:\.\d{1,6})?)(?!\d)/gi;
  const CODE_SUFFIX_RE = /\b(\d+(?:,\d{3})*(?:\.\d{1,6})?)\s*(USD|EUR|GBP|JPY|CNY|TWD|KRW|AUD|CAD|HKD|SGD)\b/gi;

  let processedNodes = new WeakSet();
  let rates = null;
  let settings = null;
  let lastScanTime = 0;
  let observer = null;

  // ---- Init ----
  async function init() {
    try {
      const [settingsResp, ratesResp] = await Promise.all([
        chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
        chrome.runtime.sendMessage({ type: "GET_RATES" }),
      ]);
      settings = settingsResp;
      rates = ratesResp?.rates ?? null;
    } catch {
      return;
    }

    if (isBlacklisted()) return;
    if (!document.body) return;

    startObserver();
    scanDocument(document.body);
  }

  function isBlacklisted() {
    const host = location.hostname.replace(/^www\./, "");
    return (settings.blacklist || []).some(b => host.includes(b));
  }

  // ---- DOM Scanning ----
  function scanDocument(root) {
    if (!rates) return;
    scanStructuredPrices(root);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (processedNodes.has(node)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`.${CONVERTED_CLASS}`)) return NodeFilter.FILTER_REJECT;
        if (parent.hasAttribute?.("data-currio-converted")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const mutations = [];
    let node;
    while ((node = walker.nextNode())) {
      const replacements = processText(node.textContent, 0);
      if (replacements.length) {
        mutations.push({ node, replacements });
        processedNodes.add(node);
      } else if (replacements.length === 0 && hasSymbol.test(node.textContent)) {
        // Symbol alone — collect only contiguous price-related text nodes
        const priceText = collectPriceText(node);
        if (priceText) {
          const parentMatches = processText(priceText, 0);
          if (parentMatches.length) {
            mutations.push({ node: node.parentElement, replacements: parentMatches, isElementLevel: true });
            markDescendantTextNodes(node.parentElement);
            processedNodes.add(node.parentElement);
          }
        }
      }
    }

    for (const { node, replacements, isElementLevel } of mutations) {
      if (isElementLevel) {
        applyElementLevelReplacement(node, replacements);
      } else {
        applyReplacements(node, replacements);
      }
    }
  }

  function scanStructuredPrices(root) {
    if (root.nodeType !== Node.ELEMENT_NODE) return;

    const candidates = [];
    if (root.matches?.(".a-price")) candidates.push(root);
    candidates.push(...root.querySelectorAll(".a-price"));

    for (const el of candidates) {
      if (el.hasAttribute("data-currio-converted")) continue;
      if (el.closest(`.${CONVERTED_CLASS}`)) continue;

      const match = parseStructuredPrice(el);
      if (!match) continue;

      el.setAttribute("data-currio-converted", CurrioUtils.formatAmount(match.convertedAmount, settings.targetCurrency));
      if (isSourceAmbiguous(match)) {
        el.setAttribute("data-currio-ambiguous", "true");
        el.setAttribute("data-currio-tip", (chrome.i18n?.getMessage("sourceAssumedUSD") || "假定源货币为 USD"));
      }
      markDescendantTextNodes(el);
    }
  }

  function collectPriceText(startTextNode) {
    // Collect contiguous text: the symbol node + immediately following numeric-only nodes
    const numOnly = /^[\d,.]*$/;
    let text = startTextNode.textContent;
    let sibling = startTextNode.parentElement?.nextSibling;
    while (sibling) {
      const t = (sibling.textContent || "").trim();
      if (!t) { sibling = sibling.nextSibling; continue; } // skip whitespace nodes
      if (numOnly.test(t)) {
        text += t;
        sibling = sibling.nextSibling;
      } else {
        break;
      }
    }
    return text.length > 1 ? text : null; // must have symbol + at least 1 digit
  }

  function markDescendantTextNodes(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      processedNodes.add(n);
    }
  }

  function applyElementLevelReplacement(ancestor, replacements) {
    if (replacements.length === 1) {
      const r = replacements[0];
      // Find the last numeric-only sibling in the price chain
      let target = ancestor;
      let sib = ancestor.nextElementSibling;
      while (sib) {
        const t = sib.textContent.trim();
        if (t && /^[\d,.]*$/.test(t)) {
          target = sib;
          sib = sib.nextElementSibling;
        } else {
          break;
        }
      }

      // If price extends into text-node siblings (e.g. <i>¥</i>35.09), use parent
      // so ::after renders after the full price, not between symbol and digits
      if (target === ancestor) {
        let ns = ancestor.nextSibling;
        while (ns) {
          const t = (ns.textContent || "").trim();
          if (/^[\d,.]*$/.test(t)) { target = ancestor.parentElement; break; }
          if (t) break;
          ns = ns.nextSibling;
        }
      }

      target.setAttribute("data-currio-converted", CurrioUtils.formatAmount(r.convertedAmount, settings.targetCurrency));
      if (isSourceAmbiguous(r)) {
        target.setAttribute("data-currio-ambiguous", "true");
        target.setAttribute("data-currio-tip", (chrome.i18n?.getMessage("sourceAssumedUSD") || "假定源货币为 USD"));
      }
      return;
    }

    // Multi-match fallback: insert spans
    const sorted = [...replacements].sort((a, b) => b.offset - a.offset);
    for (const r of sorted) {
      const endNode = textNodeAtOffset(ancestor, r.offset + r.length);
      if (!endNode || endNode.nextElementSibling?.classList?.contains(CONVERTED_CLASS)) continue;

      const span = document.createElement("span");
      span.className = CONVERTED_CLASS;
      span.textContent = CurrioUtils.formatAmount(r.convertedAmount, settings.targetCurrency);
      if (isSourceAmbiguous(r)) {
        span.classList.add("currio-ambiguous");
        span.setAttribute("data-tip", (chrome.i18n?.getMessage("sourceAssumedUSD") || "假定源货币为 USD"));
      }
      endNode.after(span);
    }
  }

  function textNodeAtOffset(el, targetOffset) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, pos = 0;
    while ((n = w.nextNode())) {
      const len = n.textContent.length;
      if (pos + len >= targetOffset) return n;
      pos += len;
    }
    return null;
  }

  // ---- Currency Recognition ----
  function parseStructuredPrice(el) {
    const symbol = firstText(el.querySelectorAll(".a-price-symbol"));
    const whole = firstText(el.querySelectorAll(".a-price-whole"));
    const fraction = firstText(el.querySelectorAll(".a-price-fraction"));
    if (!symbol || !whole) return parsePriceFromHiddenText(el);

    const sourceCurrency = currencyFromSymbolOrCode(symbol);
    if (!sourceCurrency) return parsePriceFromHiddenText(el);

    const rawAmount = parseStructuredAmount(whole, fraction);
    if (rawAmount === null) return parsePriceFromHiddenText(el);

    const converted = convert(rawAmount, sourceCurrency);
    if (converted === null) return parsePriceFromHiddenText(el);

    return {
      offset: 0,
      length: el.textContent.length,
      sourceCurrency,
      sourceAmount: rawAmount,
      convertedAmount: converted,
    };
  }

  function parsePriceFromHiddenText(el) {
    const text = firstText(el.querySelectorAll(".a-offscreen, .aok-offscreen")) || normalizeText(el.textContent);
    const matches = processText(text, 0);
    return matches[0] || null;
  }

  function firstText(nodes) {
    for (const node of nodes) {
      const text = normalizeText(node.textContent);
      if (text) return text;
    }
    return "";
  }

  function normalizeText(text) {
    return (text || "").replace(/\u00a0/g, " ").trim();
  }

  function currencyFromSymbolOrCode(raw) {
    const text = normalizeText(raw).toUpperCase();
    if (/^(USD|EUR|GBP|JPY|CNY|TWD|KRW|AUD|CAD|HKD|SGD)$/.test(text)) return text;
    if (MULTI_SYM_MAP[text]) return MULTI_SYM_MAP[text];
    return CurrioUtils.inferSourceCurrency(
      raw.trim(),
      document.documentElement.lang,
      location.hostname,
      navigator.language
    );
  }

  function parseStructuredAmount(whole, fraction) {
    const wholePart = normalizeText(whole).replace(/[^\d,]/g, "");
    if (!wholePart) return null;

    const fractionPart = normalizeText(fraction).replace(/\D/g, "");
    const amountText = fractionPart ? `${wholePart}.${fractionPart}` : wholePart;
    return parseNumber(amountText);
  }

  function processText(text, offset) {
    const matches = [];

    // Pattern 0: Multi-char symbols  NT$690, HK$100 etc.
    for (const m of text.matchAll(MULTI_SYM_RE)) {
      const rawAmount = parseNumber(m[2]);
      if (rawAmount === null) continue;
      const currency = MULTI_SYM_MAP[m[1]];
      const converted = convert(rawAmount, currency);
      if (converted === null) continue;
      matches.push({ offset: m.index, length: m[0].length, sourceCurrency: currency, sourceAmount: rawAmount, convertedAmount: converted });
    }

    // Pattern 1: Symbol prefix  $100
    for (const m of text.matchAll(SYMBOL_PREFIX_RE)) {
      const rawAmount = parseNumber(m[2]);
      if (rawAmount === null) continue;
      matches.push(createMatch(m[1], null, rawAmount, m.index, m[0].length));
    }

    // Pattern 2: Symbol suffix  100$
    for (const m of text.matchAll(SYMBOL_SUFFIX_RE)) {
      const rawAmount = parseNumber(m[1]);
      if (rawAmount === null) continue;
      matches.push(createMatch(null, m[2], rawAmount, m.index, m[0].length));
    }

    // Pattern 3: Code prefix  USD 100
    for (const m of text.matchAll(CODE_RE)) {
      const rawAmount = parseNumber(m[2]);
      if (rawAmount === null) continue;
      matches.push(createMatch(null, m[1].toUpperCase(), rawAmount, m.index, m[0].length));
    }

    // Pattern 4: Code suffix  100 USD
    for (const m of text.matchAll(CODE_SUFFIX_RE)) {
      const rawAmount = parseNumber(m[1]);
      if (rawAmount === null) continue;
      matches.push(createMatch(null, m[2].toUpperCase(), rawAmount, m.index, m[0].length));
    }

    // Deduplicate overlapping matches (keep longest)
    return deduplicateMatches(matches);
  }

  function createMatch(symPrefix, symOrCode, amount, offset, length) {
    let sourceCurrency;

    if (symOrCode && symOrCode.length === 3) {
      // 3-letter code — explicit source
      sourceCurrency = symOrCode;
    } else {
      const symbol = symPrefix || symOrCode;
      sourceCurrency = CurrioUtils.inferSourceCurrency(
        symbol,
        document.documentElement.lang,
        location.hostname,
        navigator.language
      );
    }

    const converted = convert(amount, sourceCurrency);
    if (converted === null) return null;

    return {
      offset,
      length,
      sourceCurrency,
      sourceAmount: amount,
      convertedAmount: converted,
    };
  }

  function deduplicateMatches(matches) {
    return matches
      .filter(Boolean)
      .sort((a, b) => a.offset - b.offset)
      .filter((m, i, arr) => {
        if (i === 0) return true;
        return m.offset >= arr[i - 1].offset + arr[i - 1].length;
      });
  }

  function parseNumber(str) {
    const cleaned = str.replace(/,/g, "");
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) return null;
    return num;
  }

  // ---- Conversion ----
  function convert(amount, sourceCurrency) {
    if (!rates || !rates[sourceCurrency] || !rates[settings.targetCurrency]) return null;
    if (sourceCurrency === settings.targetCurrency) return null;
    const usdValue = amount / rates[sourceCurrency];
    return Math.round(usdValue * rates[settings.targetCurrency] * 100) / 100;
  }

  // ---- Rendering ----
  function applyReplacements(textNode, replacements) {
    const parent = textNode.parentElement;
    if (!parent || parent.textContent.length > 200) return;

    // Use data-attribute on parent + CSS ::after (React-proof)
    // Only set if the parent contains exactly one price (single text node)
    const childTextNodes = [...parent.childNodes].filter(n => n.nodeType === Node.TEXT_NODE);
    if (childTextNodes.length === 1 && replacements.length === 1) {
      const r = replacements[0];
      parent.setAttribute("data-currio-converted", CurrioUtils.formatAmount(r.convertedAmount, settings.targetCurrency));
      if (isSourceAmbiguous(r)) {
        parent.setAttribute("data-currio-ambiguous", "true");
        parent.setAttribute("data-currio-tip", (chrome.i18n?.getMessage("sourceAssumedUSD") || "假定源货币为 USD"));
      }
      return;
    }

    // Fallback: splitText + span for multi-price text nodes
    const sorted = [...replacements].sort((a, b) => b.offset - a.offset);
    for (const r of sorted) {
      textNode.splitText(r.offset + r.length);
      const afterNode = textNode.splitText(r.offset);
      if (afterNode.nextElementSibling?.classList?.contains(CONVERTED_CLASS)) continue;

      const span = document.createElement("span");
      span.className = CONVERTED_CLASS;
      span.textContent = CurrioUtils.formatAmount(r.convertedAmount, settings.targetCurrency);
      if (isSourceAmbiguous(r)) {
        span.classList.add("currio-ambiguous");
        span.setAttribute("data-tip", (chrome.i18n?.getMessage("sourceAssumedUSD") || "假定源货币为 USD"));
      }
      afterNode.after(span);
    }
  }

  function isSourceAmbiguous(r) {
    if (r.sourceCurrency !== "USD") return false;
    const localeCurrency = CurrioUtils.LOCALE_CURRENCY[document.documentElement.lang];
    // No locale hint at all → $ could be anything, mark as ambiguous
    if (!localeCurrency) return true;
    // Locale uses a different $ currency (e.g. en-CA → CAD)? Then ambiguous.
    // But in practice this rarely fires because source inference picks up the
    // locale currency first (source would be CAD, not USD).
    const dollarCurrencies = CurrioUtils.CURRENCY_SYMBOL_MAP["$"];
    if (dollarCurrencies.includes(localeCurrency) && localeCurrency !== "USD") return true;
    // Locale currency doesn't use $ at all (e.g. zh-CN → CNY, fr-FR → EUR)
    // → $ is clearly USD, not ambiguous
    return false;
  }

  // ---- MutationObserver ----
  function startObserver() {
    if (observer) return;
    let pendingNodes = [];
    const seenNodes = new WeakSet();
    let scanTimer = null;

    observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === "attributes") {
          // React removed our data attribute — re-scan element or its parent
          if (!m.target.hasAttribute("data-currio-converted")) {
            let el = m.target;
            while (el && !document.contains(el)) el = el.parentElement;
            if (el) {
              const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              let n;
              while ((n = w.nextNode())) processedNodes.delete(n);
              scanDocument(el);
            }
          }
          continue;
        } else if (m.type === "characterData") {
          if (!hasCurrencyCue.test(m.target.textContent)) continue;
          processedNodes.delete(m.target);
          const parent = m.target.parentElement;
          if (parent && !SKIP_TAGS.has(parent.tagName) && !parent.closest(`.${CONVERTED_CLASS}`)) {
            if (!seenNodes.has(parent)) {
              seenNodes.add(parent);
              pendingNodes.push(parent);
            }
          }
        } else {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !SKIP_TAGS.has(node.tagName)) {
              if (!seenNodes.has(node)) {
                seenNodes.add(node);
                pendingNodes.push(node);
              }
            }
          }
        }
      }

      if (pendingNodes.length === 0) return;

      // Reset debounce timer on each new mutation — only scan after settling
      clearTimeout(scanTimer);
      const now = Date.now();
      const delay = (now - lastScanTime < THROTTLE_MS)
        ? Math.max(THROTTLE_MS - (now - lastScanTime), DEBOUNCE_MS)
        : DEBOUNCE_MS;

      scanTimer = setTimeout(() => {
        lastScanTime = Date.now();
        const nodes = pendingNodes;
        pendingNodes = [];
        for (const node of nodes) {
          seenNodes.delete(node);
          if (document.contains(node)) {
            scanDocument(node);
          }
        }
      }, delay);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-currio-converted"],
    });

  }

  // ---- Listen for updates from background ----
  chrome.runtime.onMessage.addListener(msg => {
    switch (msg.type) {
      case "RATES_UPDATED":
        rates = msg.rates;
        refreshExisting();
        break;
      case "RESCAN":
        refreshExisting();
        break;
      case "SETTINGS_UPDATED":
        if (msg.settings?.targetCurrency && msg.settings.targetCurrency !== settings?.targetCurrency) {
          location.reload();
        } else {
          settings = { ...settings, ...msg.settings };
          if (isBlacklisted()) {
            clearExisting();
            break;
          }
          refreshExisting();
        }
        break;
    }
  });

  function clearExisting() {
    // Clear data-attribute annotations
    document.querySelectorAll("[data-currio-converted]").forEach(el => {
      el.removeAttribute("data-currio-converted");
      el.removeAttribute("data-currio-ambiguous");
      el.removeAttribute("data-currio-tip");
    });
    // Clear span annotations
    document.querySelectorAll(`.${CONVERTED_CLASS}`).forEach(span => span.remove());
    processedNodes = new WeakSet();
  }

  function refreshExisting() {
    clearExisting();
    scanDocument(document.body);
  }

  // Start
  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
