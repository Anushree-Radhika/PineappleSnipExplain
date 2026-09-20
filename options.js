document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('apiKey');
  const status = document.getElementById('status');

  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
  if (geminiApiKey) input.value = geminiApiKey;

  document.getElementById('save').addEventListener('click', async () => {
    const key = input.value.trim();
    await chrome.storage.local.set({ geminiApiKey: key });
    status.textContent = 'Saved! You can close this tab and start snipping.';
    setTimeout(() => (status.textContent = ''), 3000);
  });
});
