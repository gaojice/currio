// Popup settings UI — changes take effect immediately
document.addEventListener("DOMContentLoaded", async () => {
  const [settings, tabs] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
    chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []),
  ]);

  const tab = tabs[0];
  const hostname = tab ? new URL(tab.url).hostname.replace(/^www\./, "") : null;
  const blacklist = settings.blacklist || [];

  const $target = document.getElementById("targetCurrency");
  const $auto = document.getElementById("autoEnabled");
  const $blacklist = document.getElementById("blacklist");
  const $domainName = document.getElementById("currentDomainName");
  const $toggleBtn = document.getElementById("toggleDomainBtn");
  const $blacklistSummary = document.getElementById("blacklistSummary");

  // Dynamic i18n strings
  const msg = (key, ...args) => chrome.i18n.getMessage(key, args);
  $blacklist.placeholder = msg("blacklistPlaceholder");
  $blacklistSummary.textContent = msg("blacklistCount", String(blacklist.length));

  $target.value = settings.targetCurrency || "TWD";
  $auto.checked = settings.autoEnabled !== false;
  $blacklist.value = blacklist.join("\n");

  let isBlacklisted = hostname && blacklist.some(b => hostname.includes(b));

  if (hostname) {
    $domainName.textContent = hostname;
    updateToggleBtn();
  } else {
    document.getElementById("currentDomainBlock").style.display = "none";
  }

  function updateToggleBtn() {
    isBlacklisted = $blacklist.value.split("\n").map(s => s.trim()).filter(Boolean)
      .some(b => hostname.includes(b));
    if (isBlacklisted) {
      $toggleBtn.textContent = msg("removeFromBlacklist");
      $toggleBtn.className = "btn-small btn-remove";
      document.getElementById("currentDomainBlock").classList.add("blacklisted");
    } else {
      $toggleBtn.textContent = msg("addToBlacklist");
      $toggleBtn.className = "btn-small btn-add";
      document.getElementById("currentDomainBlock").classList.remove("blacklisted");
    }
  }

  // Auto-save on any change
  $target.addEventListener("change", save);
  $auto.addEventListener("change", save);
  $blacklist.addEventListener("blur", () => {
    $blacklistSummary.textContent = msg("blacklistCount", String(
      $blacklist.value.split("\n").map(s => s.trim()).filter(Boolean).length
    ));
    updateToggleBtn();
    save();
  });

  $toggleBtn.addEventListener("click", () => {
    let list = $blacklist.value.split("\n").map(s => s.trim()).filter(Boolean);
    const idx = list.findIndex(b => hostname.includes(b));
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(hostname);
    }
    $blacklist.value = list.join("\n");
    $blacklistSummary.textContent = msg("blacklistCount", String(list.length));
    updateToggleBtn();
    save();
  });

  async function save() {
    const newSettings = {
      targetCurrency: $target.value,
      autoEnabled: $auto.checked,
      blacklist: $blacklist.value.split("\n").map(s => s.trim()).filter(Boolean),
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
