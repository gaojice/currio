// Background service worker — exchange rates, caching, messaging
importScripts("utils.js");

const API_BASE = "https://api.exchangerate-api.com/v4/latest";
const CACHE_TTL_MS = 45 * 60 * 1000; // 45 min
const RETRY_BACKOFF_MS = 2 * 60 * 60 * 1000; // 2h after consecutive failures
const MAX_FAILURES = 3;

let failureCount = 0;
let nextFetchTimer = null;

// ---- Install ----
chrome.runtime.onInstalled.addListener(async () => {
  const { targetCurrency } = await chrome.storage.local.get("targetCurrency");
  if (!targetCurrency) {
    const detected = CurrioUtils.detectDefaultCurrency();
    await chrome.storage.local.set({
      targetCurrency: detected,
      displayMode: "inline",
      autoEnabled: true,
      blacklist: [],
    });
  }
  scheduleNextFetch(0);
});

// ---- Message handler ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case "GET_RATES":
      getCachedRates().then(cache => sendResponse(cache || {}));
      return true;

    case "GET_SETTINGS":
      chrome.storage.local.get(["targetCurrency", "displayMode", "autoEnabled", "blacklist"])
        .then(s => sendResponse(s));
      return true;

    case "SET_SETTINGS":
      chrome.storage.local.set(msg.settings).then(() => {
        sendResponse({ ok: true });
        broadcastSettings(msg.settings);
      });
      return true;
  }
});

// ---- Broadcast to all content scripts ----
async function broadcastSettings(newSettings) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_UPDATED", settings: newSettings })
      .catch(() => {}); // tab may not have content script loaded
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
    return {
      rates: data.rates,
      timestamp: Date.now(),
    };
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
  // TTL expired — try refresh, fall back to stale
  const fresh = await fetchRates();
  if (fresh) {
    await chrome.storage.local.set({ rateCache: fresh });
    return fresh;
  }
  return rateCache; // stale but usable
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
