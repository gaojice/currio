// Popup settings UI
document.addEventListener("DOMContentLoaded", async () => {
  const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });

  const $target = document.getElementById("targetCurrency");
  const $auto = document.getElementById("autoEnabled");
  const $blacklist = document.getElementById("blacklist");
  const $save = document.getElementById("saveBtn");
  const $status = document.getElementById("statusMsg");

  $target.value = settings.targetCurrency || "TWD";
  $auto.checked = settings.autoEnabled !== false;
  $blacklist.value = (settings.blacklist || []).join("\n");

  $save.addEventListener("click", async () => {
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
  });
});
