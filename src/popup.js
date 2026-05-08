// Popup settings UI — changes take effect immediately
const msg = (key, ...args) => chrome.i18n.getMessage(key, args);

const CURRENCIES = [
  ["AUD", "currency_aud"], ["CAD", "currency_cad"], ["CNY", "currency_cny"],
  ["EUR", "currency_eur"], ["GBP", "currency_gbp"], ["HKD", "currency_hkd"],
  ["JPY", "currency_jpy"], ["KRW", "currency_krw"], ["SGD", "currency_sgd"],
  ["TWD", "currency_twd"], ["USD", "currency_usd"],
];

function buildCurrencyOptions() {
  const $target = document.getElementById("targetCurrency");
  for (const [value, labelKey] of CURRENCIES) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = msg(labelKey);
    $target.appendChild(opt);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Render i18n labels
  document.getElementById("reportLink").href = "https://gitea.lan/gaojice/currio/issues/new";
  document.getElementById("donateLink").href = "https://gitea.lan/gaojice/currio";

  document.getElementById("targetCurrencyLabel").textContent = msg("targetCurrency");
  document.getElementById("currentSiteLabel").textContent = msg("currentSite");
  buildCurrencyOptions();

  const [settings, tabs] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
    chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []),
  ]);

  const tab = tabs[0];
  const hostname = tab ? new URL(tab.url).hostname.replace(/^www\./, "") : null;
  let blacklist = settings.blacklist || [];

  const $target = document.getElementById("targetCurrency");
  const $blacklist = document.getElementById("blacklist");
  const $domainName = document.getElementById("currentDomainName");
  const $toggleBtn = document.getElementById("toggleDomainBtn");
  const $blacklistSummary = document.getElementById("blacklistSummary");

  $blacklist.placeholder = msg("blacklistPlaceholder");
  $blacklistSummary.textContent = msg("blacklistCount", String(blacklist.length));

  $target.value = settings.targetCurrency || "TWD";
  $blacklist.value = blacklist.join("\n");

  if (hostname) {
    $domainName.textContent = hostname;
    updateToggleBtn();
  } else {
    document.getElementById("currentDomainBlock").style.display = "none";
  }

  function getCurrentBlacklist() {
    return $blacklist.value.split("\n").map(s => s.trim()).filter(Boolean);
  }

  function updateToggleBtn() {
    const list = getCurrentBlacklist();
    blacklist = list;
    const inList = list.some(b => hostname.includes(b));
    if (inList) {
      $toggleBtn.textContent = msg("removeFromBlacklist");
      $toggleBtn.className = "btn-small btn-remove";
      document.getElementById("currentDomainBlock").classList.add("blacklisted");
    } else {
      $toggleBtn.textContent = msg("addToBlacklist");
      $toggleBtn.className = "btn-small btn-add";
      document.getElementById("currentDomainBlock").classList.remove("blacklisted");
    }
  }

  // Force re-scan current page
  document.getElementById("rescanBtn").addEventListener("click", () => {
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "RESCAN" }).catch(() => {});
      window.close();
    }
  });

  $target.addEventListener("change", save);
  $blacklist.addEventListener("blur", () => {
    $blacklistSummary.textContent = msg("blacklistCount", String(getCurrentBlacklist().length));
    updateToggleBtn();
    save();
  });

  $toggleBtn.addEventListener("click", () => {
    let list = getCurrentBlacklist();
    const idx = list.findIndex(b => hostname.includes(b));
    if (idx >= 0) list.splice(idx, 1);
    else list.push(hostname);
    $blacklist.value = list.join("\n");
    $blacklistSummary.textContent = msg("blacklistCount", String(list.length));
    updateToggleBtn();
    save();
  });

  async function save() {
    blacklist = getCurrentBlacklist();
    const newSettings = {
      targetCurrency: $target.value,
      blacklist,
    };

    await chrome.runtime.sendMessage({ type: "SET_SETTINGS", settings: newSettings });

    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "SETTINGS_UPDATED",
        settings: newSettings,
      }).catch(() => {});
    }
  }
});
