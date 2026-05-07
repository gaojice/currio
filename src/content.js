// Content script — DOM scanning, currency recognition, inline rendering
(() => {
  const CONVERTED_CLASS = "currio-converted";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT"]);
  const DEBOUNCE_MS = 300;
  const THROTTLE_MS = 500;

  // Match amounts with up to 6 decimal places (covers crypto, fractional pricing)
  const NUM_RE = /\d+(?:,\d{3})*(?:\.\d{1,6})?/;
  const SYMBOL_PREFIX_RE = /([$€£¥₩])\s*(\d+(?:,\d{3})*(?:\.\d{1,6})?)\b/g;
  const SYMBOL_SUFFIX_RE = /\b(\d+(?:,\d{3})*(?:\.\d{1,6})?)\s*([$€£¥₩])/g;
  const CODE_RE = /\b(USD|EUR|GBP|JPY|CNY|TWD|KRW|AUD|CAD|HKD|SGD)\s*(\d+(?:,\d{3})*(?:\.\d{1,6})?)\b/gi;
  const CODE_SUFFIX_RE = /\b(\d+(?:,\d{3})*(?:\.\d{1,6})?)\s*(USD|EUR|GBP|JPY|CNY|TWD|KRW|AUD|CAD|HKD|SGD)\b/gi;

  const processedNodes = new WeakSet();
  let rates = null;
  let settings = null;
  let scanScheduled = false;
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

    if (!settings.autoEnabled) return;
    if (isBlacklisted()) return;
    if (!document.body) return;

    scanDocument(document.body);
    startObserver();
  }

  function isBlacklisted() {
    const host = location.hostname.replace(/^www\./, "");
    return (settings.blacklist || []).some(b => host.includes(b));
  }

  // ---- DOM Scanning ----
  function scanDocument(root) {
    if (!rates) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (processedNodes.has(node)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`.${CONVERTED_CLASS}`)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const mutations = [];
    let node;
    while ((node = walker.nextNode())) {
      const replacements = processTextNode(node);
      if (replacements.length) {
        mutations.push({ node, replacements });
        processedNodes.add(node);
      }
    }

    // Apply mutations in batch
    for (const { node, replacements } of mutations) {
      applyReplacements(node, replacements);
    }
  }

  // ---- Currency Recognition ----
  function processTextNode(node) {
    const text = node.textContent;
    const matches = [];

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
        location.hostname
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
    const usdValue = amount / rates[sourceCurrency];
    return Math.round(usdValue * rates[settings.targetCurrency] * 100) / 100;
  }

  // ---- Rendering ----
  function applyReplacements(textNode, replacements) {
    const parent = textNode.parentElement;
    if (!parent) return;

    const sorted = [...replacements].sort((a, b) => b.offset - a.offset);

    for (const r of sorted) {
      textNode.splitText(r.offset + r.length);
      const afterNode = textNode.splitText(r.offset);

      // Inline annotation span after the original text
      const span = document.createElement("span");
      span.className = CONVERTED_CLASS;
      span.textContent = ` (≈ ${CurrioUtils.formatAmount(r.convertedAmount, settings.targetCurrency)})`;

      if (isSourceAmbiguous(r)) {
        span.classList.add("currio-ambiguous");
        span.title = "假定源货币为 USD";
      }

      afterNode.after(span);
    }
  }

  function isSourceAmbiguous(r) {
    return (
      r.sourceCurrency === "USD" &&
      CurrioUtils.CURRENCY_SYMBOL_MAP["$"]?.includes(r.sourceCurrency) &&
      CurrioUtils.LOCALE_CURRENCY[document.documentElement.lang] !== "USD"
    );
  }

  // ---- MutationObserver ----
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      if (scanScheduled) return;

      const now = Date.now();
      if (now - lastScanTime < THROTTLE_MS) {
        // Still in throttle window — schedule deferred
        scanScheduled = true;
        setTimeout(() => {
          scanScheduled = false;
          lastScanTime = Date.now();
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && !SKIP_TAGS.has(node.tagName)) {
                scanDocument(node);
              }
            }
          }
        }, THROTTLE_MS - (now - lastScanTime));
        return;
      }

      scanScheduled = true;
      setTimeout(() => {
        scanScheduled = false;
        lastScanTime = Date.now();
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !SKIP_TAGS.has(node.tagName)) {
              scanDocument(node);
            }
          }
        }
      }, DEBOUNCE_MS);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ---- Listen for updates from background ----
  chrome.runtime.onMessage.addListener(msg => {
    switch (msg.type) {
      case "RATES_UPDATED":
        rates = msg.rates;
        refreshExisting();
        break;
      case "SETTINGS_UPDATED":
        settings = { ...settings, ...msg.settings };
        if (!settings.autoEnabled || isBlacklisted()) break;
        refreshExisting();
        break;
    }
  });

  function refreshExisting() {
    document.querySelectorAll(`.${CONVERTED_CLASS}`).forEach(span => {
      span.remove();
    });
    processedNodes = new WeakSet();
    scanDocument(document.body);
  }

  // Start
  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
