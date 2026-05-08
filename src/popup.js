// Popup settings UI — changes take effect immediately
const msg = (key, ...args) => chrome.i18n.getMessage(key, args);

const CURRENCIES = [
  { group: "currencyGroupAsia", items: [
    ["TWD", "currency_twd"], ["CNY", "currency_cny"], ["JPY", "currency_jpy"],
    ["KRW", "currency_krw"], ["HKD", "currency_hkd"], ["SGD", "currency_sgd"],
  ]},
  { group: "currencyGroupOther", items: [
    ["USD", "currency_usd"], ["EUR", "currency_eur"], ["GBP", "currency_gbp"],
    ["AUD", "currency_aud"], ["CAD", "currency_cad"],
  ]},
];

function buildCurrencyOptions() {
  const $target = document.getElementById("targetCurrency");
  for (const g of CURRENCIES) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = msg(g.group);
    for (const [value, labelKey] of g.items) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = msg(labelKey);
      optgroup.appendChild(opt);
    }
    $target.appendChild(optgroup);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Render i18n labels
  document.getElementById("targetCurrencyLabel").textContent = msg("targetCurrency");
  document.getElementById("autoEnabledLabel").textContent = msg("autoEnabled");
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
  const $auto = document.getElementById("autoEnabled");
  const $blacklist = document.getElementById("blacklist");
  const $domainName = document.getElementById("currentDomainName");
  const $toggleBtn = document.getElementById("toggleDomainBtn");
  const $blacklistSummary = document.getElementById("blacklistSummary");

  $blacklist.placeholder = msg("blacklistPlaceholder");
  $blacklistSummary.textContent = msg("blacklistCount", String(blacklist.length));

  $target.value = settings.targetCurrency || "TWD";
  $auto.checked = settings.autoEnabled !== false;
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
  $auto.addEventListener("change", save);
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
      autoEnabled: $auto.checked,
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
