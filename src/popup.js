// Popup settings UI
document.addEventListener("DOMContentLoaded", async () => {
  const [settings, tabs] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);

  const tab = tabs[0];
  const hostname = tab ? new URL(tab.url).hostname.replace(/^www\./, "") : null;
  const blacklist = settings.blacklist || [];
  const isBlacklisted = hostname && blacklist.some(b => hostname.includes(b));

  const $target = document.getElementById("targetCurrency");
  const $auto = document.getElementById("autoEnabled");
  const $blacklist = document.getElementById("blacklist");
  const $save = document.getElementById("saveBtn");
  const $status = document.getElementById("statusMsg");
  const $domainName = document.getElementById("currentDomainName");
  const $toggleBtn = document.getElementById("toggleDomainBtn");
  const $blacklistCount = document.getElementById("blacklistCount");
  const $domainBlock = document.getElementById("currentDomainBlock");

  // Populate form
  $target.value = settings.targetCurrency || "TWD";
  $auto.checked = settings.autoEnabled !== false;
  $blacklist.value = blacklist.join("\n");
  $blacklistCount.textContent = blacklist.length;

  // Current domain
  if (hostname) {
    $domainName.textContent = hostname;
    updateToggleBtn();
  } else {
    $domainBlock.style.display = "none";
  }

  function updateToggleBtn() {
    const inList = blacklist.some(b => hostname.includes(b));
    if (inList) {
      $toggleBtn.textContent = "移出黑名单";
      $toggleBtn.className = "btn-small btn-remove";
      $domainBlock.classList.add("blacklisted");
    } else {
      $toggleBtn.textContent = "加入黑名单";
      $toggleBtn.className = "btn-small btn-add";
      $domainBlock.classList.remove("blacklisted");
    }
  }

  // Toggle current domain in blacklist
  $toggleBtn.addEventListener("click", () => {
    let list = $blacklist.value
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    const idx = list.findIndex(b => hostname.includes(b));
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(hostname);
    }

    $blacklist.value = list.join("\n");
    $blacklistCount.textContent = list.length;
    updateToggleBtn();
    autoSave();
  });

  // Save
  $save.addEventListener("click", autoSave);

  async function autoSave() {
    const newSettings = {
      targetCurrency: $target.value,
      autoEnabled: $auto.checked,
      blacklist: $blacklist.value
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean),
    };

    await chrome.runtime.sendMessage({
      type: "SET_SETTINGS",
      settings: newSettings,
    });

    $status.textContent = "已保存";
    setTimeout(() => { $status.textContent = ""; }, 1500);
  }
});
