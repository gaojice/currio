// Background service worker — rates, caching, messaging

// Currency badge symbols and colors
const CURRENCY_BADGE = {
  USD: { text: "$",    color: "#059669" },
  TWD: { text: "NT$",  color: "#2563eb" },
  CNY: { text: "¥",    color: "#dc2626" },
  JPY: { text: "¥",    color: "#d97706" },
  EUR: { text: "€",    color: "#7c3aed" },
  GBP: { text: "£",    color: "#4f46e5" },
  KRW: { text: "₩",    color: "#0891b2" },
  AUD: { text: "AU$",  color: "#65a30d" },
  CAD: { text: "CA$",  color: "#9333ea" },
  HKD: { text: "HK$",  color: "#ea580c" },
  SGD: { text: "S$",   color: "#db2777" },
};

function updateBadge(currency) {
  const badge = CURRENCY_BADGE[currency] || { text: currency, color: "#6366f1" };
  chrome.action.setBadgeText({ text: badge.text });
  chrome.action.setBadgeBackgroundColor({ color: badge.color });
}

// Inlined from utils.js — importScripts path resolution varies across Chrome versions
const LOCALE_CURRENCY = {
  "zh-TW": "TWD", "zh-CN": "CNY", "zh-HK": "HKD", "zh-SG": "SGD",
  "en-US": "USD", "en-GB": "GBP", "en-CA": "CAD", "en-AU": "AUD",
  "en-SG": "SGD",
  "ja-JP": "JPY", "ko-KR": "KRW",
  "de-DE": "EUR", "fr-FR": "EUR",
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

const API_BASE = "https://api.exchangerate-api.com/v4/latest";
const CACHE_TTL_MS = 45 * 60 * 1000;
const RETRY_BACKOFF_MS = 2 * 60 * 60 * 1000;
const MAX_FAILURES = 3;

let failureCount = 0;
let nextFetchTimer = null;

// ---- Install ----
chrome.runtime.onInstalled.addListener(async () => {
  const { targetCurrency } = await chrome.storage.local.get("targetCurrency");
  if (!targetCurrency) {
    const detected = detectDefaultCurrency();
    await chrome.storage.local.set({
      targetCurrency: detected,
      autoEnabled: true,
      blacklist: [],
    });
  }
  updateBadge(targetCurrency || detected);
  scheduleNextFetch(0);
});

// ---- Message handler ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case "GET_RATES":
      getCachedRates().then(cache => sendResponse(cache || {}));
      return true;

    case "GET_SETTINGS":
      chrome.storage.local.get(["targetCurrency", "autoEnabled", "blacklist"])
        .then(s => sendResponse({
          targetCurrency: s.targetCurrency || "TWD",
          autoEnabled: s.autoEnabled !== false,
          blacklist: s.blacklist || [],
        }));
      return true;

    case "SET_SETTINGS":
      chrome.storage.local.set(msg.settings).then(() => {
        sendResponse({ ok: true });
        if (msg.settings.targetCurrency) updateBadge(msg.settings.targetCurrency);
        broadcastSettings(msg.settings);
      });
      return true;
  }
});

// ---- Broadcast ----
async function broadcastSettings(newSettings) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED", settings: newSettings })
      .catch(() => {});
  }
}

async function broadcastRates() {
  const { rateCache } = await chrome.storage.local.get("rateCache");
  if (!rateCache) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: "RATES_UPDATED", rates: rateCache.rates })
      .catch(() => {});
  }
}

// ---- Rate fetching ----
async function fetchRates() {
  try {
    const resp = await fetch(`${API_BASE}/USD`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    failureCount = 0;
    return { rates: data.rates, timestamp: Date.now() };
  } catch (err) {
    failureCount++;
    console.warn(`[Currio] Rate fetch failed (#${failureCount}):`, err.message);
    return null;
  }
}

async function getCachedRates() {
  const { rateCache } = await chrome.storage.local.get("rateCache");
  if (!rateCache) return await fetchFreshAndCache();
  if (Date.now() - rateCache.timestamp < CACHE_TTL_MS) return rateCache;
  const fresh = await fetchRates();
  if (fresh) {
    await chrome.storage.local.set({ rateCache: fresh });
    return fresh;
  }
  return rateCache;
}

async function fetchFreshAndCache() {
  const fresh = await fetchRates();
  if (fresh) {
    await chrome.storage.local.set({ rateCache: fresh });
    return fresh;
  }
  return null;
}

function scheduleNextFetch(delayMs) {
  clearTimeout(nextFetchTimer);
  const delay = failureCount >= MAX_FAILURES ? RETRY_BACKOFF_MS : CACHE_TTL_MS;
  nextFetchTimer = setTimeout(async () => {
    const fresh = await fetchRates();
    if (fresh) {
      await chrome.storage.local.set({ rateCache: fresh });
      broadcastRates();
    }
    scheduleNextFetch();
  }, delayMs || delay);
}
