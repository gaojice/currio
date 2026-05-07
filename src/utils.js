// Shared currency utilities — loaded as plain script for content & background
var CurrioUtils = (() => {
  const CURRENCY_SYMBOL_MAP = {
    "$": ["USD", "CAD", "AUD", "HKD", "SGD", "TWD"],
    "€": ["EUR"],
    "£": ["GBP"],
    "¥": ["JPY", "CNY"],
    "￥": ["CNY"],  // full-width yen (Chinese)
    "元": ["CNY"],  // Chinese yuan character
    "₩": ["KRW"],
  };

  const CURRENCY_INFO = {
    USD: { symbol: "$", name: "US Dollar" },
    EUR: { symbol: "€", name: "Euro" },
    GBP: { symbol: "£", name: "British Pound" },
    JPY: { symbol: "¥", name: "Japanese Yen" },
    CNY: { symbol: "¥", name: "Chinese Yuan" },
    TWD: { symbol: "NT$", name: "Taiwan Dollar" },
    KRW: { symbol: "₩", name: "South Korean Won" },
    AUD: { symbol: "A$", name: "Australian Dollar" },
    CAD: { symbol: "C$", name: "Canadian Dollar" },
    HKD: { symbol: "HK$", name: "Hong Kong Dollar" },
    SGD: { symbol: "S$", name: "Singapore Dollar" },
  };

  const LOCALE_CURRENCY = {
    "zh-TW": "TWD", "zh-CN": "CNY", "zh-HK": "HKD", "zh-SG": "SGD",
    "en-US": "USD", "en-GB": "GBP", "en-CA": "CAD", "en-AU": "AUD",
    "en-SG": "SGD",
    "ja-JP": "JPY", "ko-KR": "KRW",
    "de-DE": "EUR", "fr-FR": "EUR",
  };

  // Top-level domain → default source currency for ambiguous $ symbol
  const TLD_CURRENCY = {
    "ca": "CAD", "au": "AUD", "hk": "HKD", "sg": "SGD",
    "us": "USD", "nz": "NZD",
  };

  function detectDefaultCurrency() {
    const langs = navigator.languages || [navigator.language];
    for (const lang of langs) {
      if (LOCALE_CURRENCY[lang]) return LOCALE_CURRENCY[lang];
      const base = lang.split("-")[0];
      if (base === "ja") return "JPY";
      if (base === "ko") return "KRW";
    }
    return "USD";
  }

  // Default fallback for ambiguous symbols
  const SYMBOL_DEFAULT = { "$": "USD", "¥": "JPY" };

  function inferSourceCurrency(symbol, pageLang, hostname) {
    const candidates = CURRENCY_SYMBOL_MAP[symbol];
    if (!candidates) return null;
    if (candidates.length === 1) return candidates[0];

    // Multi-candidate symbols ($, ¥) — try page locale first
    if (pageLang && LOCALE_CURRENCY[pageLang] && candidates.includes(LOCALE_CURRENCY[pageLang])) {
      return LOCALE_CURRENCY[pageLang];
    }

    // Try TLD
    const tld = hostname.split(".").pop().toLowerCase();
    if (TLD_CURRENCY[tld] && candidates.includes(TLD_CURRENCY[tld])) {
      return TLD_CURRENCY[tld];
    }

    // Fallback with sensible per-symbol default (annotated in UI if ambiguous)
    return SYMBOL_DEFAULT[symbol] || candidates[0];
  }

  function formatAmount(amount, currency) {
    const info = CURRENCY_INFO[currency];
    const sym = info ? info.symbol : currency;
    if (Number.isInteger(amount)) return `${sym}${amount.toLocaleString()}`;
    return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return {
    CURRENCY_SYMBOL_MAP,
    CURRENCY_INFO,
    LOCALE_CURRENCY,
    detectDefaultCurrency,
    inferSourceCurrency,
    formatAmount,
  };
})();
