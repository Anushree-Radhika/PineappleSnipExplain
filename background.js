// const GEMINI_MODEL = "gemini-3.5-flash-lite";

// // Rough estimate of the free-tier daily cap for this model. This is NOT
// // authoritative -- Google's real limit is whatever your AI Studio dashboard
// // shows. This is just a local heads-up counter for the extension's own UI.
// const ESTIMATED_DAILY_LIMIT = 450;

// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//   if (msg.type === 'CAPTURE_SELECTION') {
//     handleCapture(msg.rect, sender.tab.windowId)
//       .then(sendResponse)
//       .catch((err) => sendResponse({ error: err.message }));
//     return true;
//   }
//   if (msg.type === 'ASK_FOLLOWUP') {
//     handleFollowup(msg.messages)
//       .then(sendResponse)
//       .catch((err) => sendResponse({ error: err.message }));
//     return true;
//   }
//   if (msg.type === 'GET_USAGE') {
//     getUsage().then(sendResponse);
//     return true;
//   }
// });

// async function getApiKey() {
//   const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
//   return geminiApiKey;
// }

// function getPacificDateString() {
//   return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
// }

// async function getUsage() {
//   const { usageDate, usageCount = 0 } = await chrome.storage.local.get(['usageDate', 'usageCount']);
//   const today = getPacificDateString();
//   if (usageDate !== today) {
//     return { count: 0, limit: ESTIMATED_DAILY_LIMIT };
//   }
//   return { count: usageCount, limit: ESTIMATED_DAILY_LIMIT };
// }

// // Called only after a Gemini call actually succeeds -- failed/blocked
// // requests shouldn't count against the user's own displayed estimate.
// async function trackUsage() {
//   const { usageDate, usageCount = 0 } = await chrome.storage.local.get(['usageDate', 'usageCount']);
//   const today = getPacificDateString();

//   let newCount;
//   if (usageDate !== today) {
//     newCount = 1;
//     await chrome.storage.local.set({ usageDate: today, usageCount: newCount });
//   } else {
//     newCount = usageCount + 1;
//     await chrome.storage.local.set({ usageCount: newCount });
//   }
//   return newCount;
// }

// async function callGemini(contents) {
//   const apiKey = await getApiKey();
//   if (!apiKey) {
//     return { error: 'No Gemini API key set yet. Open the extension\'s Settings page (right-click the icon → Options) and add your free key.' };
//   }

//   const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
//   const res = await fetch(url, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ contents })
//   });

//   const data = await res.json();
//   if (!res.ok) {
//     if (res.status === 429) {
//       return { error: 'Rate limit reached on the free tier. Try again in a bit, or tomorrow if you\'ve hit the daily cap.' };
//     }
//     return { error: data?.error?.message || `Gemini error: ${res.status}` };
//   }

//   const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response generated.';
//   const usageCount = await trackUsage();
//   return { text, usageCount, usageLimit: ESTIMATED_DAILY_LIMIT };
// }

// async function handleCapture(rect, windowId) {
//   const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
//   const base64Png = await cropImage(dataUrl, rect);

//   const contents = [{
//     role: 'user',
//     parts: [
//       { text: 'Read whatever text, code, or diagram is in this image and explain it clearly and concisely, as if to someone seeing it for the first time.' },
//       { inline_data: { mime_type: 'image/png', data: base64Png } }
//     ]
//   }];

//   const result = await callGemini(contents);
//   if (result.error) return result;

//   const messages = [...contents, { role: 'model', parts: [{ text: result.text }] }];
//   return { text: result.text, messages, usageCount: result.usageCount, usageLimit: result.usageLimit };
// }

// async function handleFollowup(messages) {
//   const result = await callGemini(messages);
//   if (result.error) return result;
//   const updated = [...messages, { role: 'model', parts: [{ text: result.text }] }];
//   return { text: result.text, messages: updated, usageCount: result.usageCount, usageLimit: result.usageLimit };
// }

// async function cropImage(dataUrl, rect) {
//   const res = await fetch(dataUrl);
//   const blob = await res.blob();
//   const bitmap = await createImageBitmap(blob);

//   const canvas = new OffscreenCanvas(rect.width, rect.height);
//   const ctx = canvas.getContext('2d');
//   ctx.drawImage(
//     bitmap,
//     rect.left, rect.top, rect.width, rect.height,
//     0, 0, rect.width, rect.height
//   );

//   const outBlob = await canvas.convertToBlob({ type: 'image/png' });
//   return await blobToBase64(outBlob);
// }

// function blobToBase64(blob) {
//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();
//     reader.onloadend = () => resolve(reader.result.split(',')[1]);
//     reader.onerror = reject;
//     reader.readAsDataURL(blob);
//   });
// }


const GEMINI_MODEL = "gemini-3.5-flash-lite";

// Rough estimate of the free-tier daily cap for this model. This is NOT
// authoritative -- Google's real limit is whatever your AI Studio dashboard
// shows. This is just a local heads-up counter for the extension's own UI.
const ESTIMATED_DAILY_LIMIT = 450;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CAPTURE_SELECTION') {
    handleCapture(msg.rect, sender.tab.windowId, sender.tab.id)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'ASK_FOLLOWUP') {
    handleFollowup(msg.messages)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'GET_USAGE') {
    getUsage().then(sendResponse);
    return true;
  }
});

async function getApiKey() {
  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
  return geminiApiKey;
}

// Google resets daily quota at midnight Pacific time, not local midnight,
// so the tracker's "day" has to follow that, or the count will drift.
function getPacificDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

async function getUsage() {
  const { usageDate, usageCount = 0 } = await chrome.storage.local.get(['usageDate', 'usageCount']);
  const today = getPacificDateString();
  if (usageDate !== today) {
    return { count: 0, limit: ESTIMATED_DAILY_LIMIT };
  }
  return { count: usageCount, limit: ESTIMATED_DAILY_LIMIT };
}

// Called only after a Gemini call actually succeeds -- failed/blocked
// requests shouldn't count against the user's own displayed estimate.
async function trackUsage() {
  const { usageDate, usageCount = 0 } = await chrome.storage.local.get(['usageDate', 'usageCount']);
  const today = getPacificDateString();

  let newCount;
  if (usageDate !== today) {
    newCount = 1;
    await chrome.storage.local.set({ usageDate: today, usageCount: newCount });
  } else {
    newCount = usageCount + 1;
    await chrome.storage.local.set({ usageCount: newCount });
  }
  return newCount;
}

async function callGemini(contents) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: 'No Gemini API key set yet. Open the extension\'s Settings page (right-click the icon → Options) and add your free key.' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents })
  });

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 429) {
      return { error: 'Rate limit reached on the free tier. Try again in a bit, or tomorrow if you\'ve hit the daily cap.' };
    }
    return { error: data?.error?.message || `Gemini error: ${res.status}` };
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response generated.';
  const usageCount = await trackUsage();
  return { text, usageCount, usageLimit: ESTIMATED_DAILY_LIMIT };
}

async function handleCapture(rect, windowId, tabId) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  // Screenshot is taken: the page can now show its result panel without it ending up in the picture.
  chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_DONE' }).catch(() => {});
  const base64Png = await cropImage(dataUrl, rect);

  const contents = [{
    role: 'user',
    parts: [
      { text: 'Read whatever text, code, or diagram is in this image and explain it clearly and concisely, as if to someone seeing it for the first time.' },
      { inline_data: { mime_type: 'image/png', data: base64Png } }
    ]
  }];

  const result = await callGemini(contents);
  if (result.error) return result;

  const messages = [...contents, { role: 'model', parts: [{ text: result.text }] }];
  return { text: result.text, messages, usageCount: result.usageCount, usageLimit: result.usageLimit };
}

async function handleFollowup(messages) {
  const result = await callGemini(messages);
  if (result.error) return result;
  const updated = [...messages, { role: 'model', parts: [{ text: result.text }] }];
  return { text: result.text, messages: updated, usageCount: result.usageCount, usageLimit: result.usageLimit };
}

async function cropImage(dataUrl, rect) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(rect.width, rect.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    bitmap,
    rect.left, rect.top, rect.width, rect.height,
    0, 0, rect.width, rect.height
  );

  const outBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToBase64(outBlob);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}