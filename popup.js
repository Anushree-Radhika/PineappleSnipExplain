const customToggle = document.getElementById('customToggle');
const startBtn = document.getElementById('startBtn');
const status = document.getElementById('status');
const usageText = document.getElementById('usageText');
const usageBarFill = document.getElementById('usageBarFill');

async function refreshUsage() {
  const usage = await chrome.runtime.sendMessage({ type: 'GET_USAGE' });
  const count = usage?.count ?? 0;
  const limit = usage?.limit ?? 1000;
  const pct = Math.min(100, Math.round((count / limit) * 100));

  usageText.textContent = `~${count}/${limit} requests used today`;
  usageBarFill.style.width = pct + '%';
  usageBarFill.style.background = pct >= 80 ? '#f5c518' : '#4a9a3f';
}

// Restore toggle state, check for a key, and load the live usage count.
chrome.storage.local.get(['customMode', 'geminiApiKey'], ({ customMode, geminiApiKey }) => {
  customToggle.checked = !!customMode;
  if (!geminiApiKey) {
    status.textContent = 'Add your Gemini API key in Settings first.';
  }
});
refreshUsage();

customToggle.addEventListener('change', () => {
  chrome.storage.local.set({ customMode: customToggle.checked });
});

startBtn.addEventListener('click', async () => {
  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
  if (!geminiApiKey) {
    status.textContent = 'Add your Gemini API key in Settings first.';
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await chrome.tabs.sendMessage(tab.id, {
      type: 'START_SELECTION',
      customMode: customToggle.checked
    });
    window.close();
  } catch (err) {
    status.textContent = 'Cannot run on this page (try a normal http/https tab).';
  }
});

document.getElementById('optionsLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});