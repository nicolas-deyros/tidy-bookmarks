document.getElementById('open-manager').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('manager/manager.html') });
  window.close();
});
