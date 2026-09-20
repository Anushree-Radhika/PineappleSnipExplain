# Snip & Explain

Snip & Explain is a Chrome extension that helps you understand any selected part of a webpage by turning it into a visual AI prompt. It lets you drag a rectangle around an area, capture that region as an image, and send it to Google Gemini for explanation. The extension then displays a clear, readable answer in a floating panel overlay on the page.

This project is built for people who want to quickly understand screenshots, UI elements, diagrams, code, or text-heavy regions without manually copying content into a separate AI tool.

---

## What the project does

The extension works like a lightweight visual assistant for your browser:

1. You click the extension icon.
2. You choose Start Snip.
3. You drag over any part of the page.
4. The selected region is captured as an image.
5. That image is sent to Gemini with a prompt asking it to read and explain the content.
6. The result appears in a floating panel next to the selected area.
7. You can ask follow-up questions to continue the explanation.

This makes it useful for understanding:

- screenshots of apps or websites
- code snippets and error messages
- dashboards, diagrams, and charts
- documentation sections
- UI elements or workflows you want explained visually

---

## Main features

### 1. Drag-selection screenshot tool

The extension overlays a selection box on top of the current page. This lets users choose any area visually instead of needing to capture the entire page or manually copy text.

### 2. Google Gemini integration

The extension sends the cropped image to Gemini using the user's own API key. The current model constant is:

```js
const GEMINI_MODEL = "gemini-3.5-flash-lite";
```

This allows the extension to explain the image content using a lightweight Gemini model optimized for quick response times.

### 3. Explain captured content in plain language

The prompt sent to Gemini is designed to read text, code, diagrams, charts, and other UI content from the screenshot and turn it into a concise but clear explanation.

The response is shown in the result panel without needing to leave the current page.

### 4. Follow-up conversations

Once an answer is displayed, the user can ask additional questions about the same image. The extension keeps the chat history and sends it back to Gemini, so the model can answer in context.

Examples:

- "Explain this in simpler terms"
- "What does this error mean?"
- "Summarize this workflow step by step"
- "What are the important parts of this chart?"

### 5. Floating result panel with controls

The result panel is built into the web page and includes several controls for a smoother workflow:

- drag to move the panel
- resize by dragging the corner
- double-click the resize corner to reset it
- change text size with A− / A+
- pin the panel so it stays in place
- minimize the panel to save space
- copy the conversation to the clipboard
- close the panel

The panel also remembers the user’s preferred size, text size, and position between uses.

### 6. Rich response formatting

The extension does not simply dump raw Markdown. It renders formatted responses with:

- headings
- bold and italic text
- lists and numbered items
- tables
- code blocks
- block quotes
- horizontal rules
- inline math expressions

This makes AI explanations easier to read and scan.

### 7. Local usage tracking estimate

The extension tracks a rough daily count of successful Gemini calls made through the extension. This is shown in the popup and in the result panel.

The usage tracker:

- counts successful requests
- resets based on Pacific time
- is shown as a local estimate, not an official Google quota
- helps users stay aware of free-tier usage

### 8. Settings page for API key management

The project includes a dedicated options page where the user can save their Gemini API key. It also includes instructions for creating one from Google AI Studio.

### 9. BYOK model

The extension follows a BYOK (bring your own key) model:

- the user supplies their own Google AI Studio API key
- the key is stored locally in Chrome storage
- no shared backend is needed

This keeps the extension simple and user-controlled.

---

## How the extension is structured

### Manifest and permissions

The project uses a Manifest V3 Chrome extension setup:

- the extension has a popup UI
- it injects content scripts into pages
- it uses a background service worker to handle requests
- it stores local data in Chrome storage
- it calls the Google Generative Language API

The manifest also defines the action icon and the options page.

### Files in the project

- manifest.json
  - extension metadata and permissions

- background.js
  - handles API calls, usage tracking, selection processing, and follow-up AI requests

- content.js
  - injects the snipping overlay and result panel
  - renders answers in the page
  - manages conversation follow-ups and UI behavior

- popup.js
  - handles the popup UI and Start Snip flow
  - loads usage data
  - validates whether the API key exists

- popup.html
  - the toolbar popup UI

- options.html
  - the settings page for the API key

- options.js
  - saves and restores the Gemini API key

- README.md
  - project overview and usage instructions

---

## How it works internally

### 1. User starts a snip

The popup opens and calls script injection on the current page. Once injected, the page gets an overlay that allows the user to drag-select a portion of the screen.

### 2. Screenshot is captured

When the user releases the selection area, the extension calculates the bounding box and captures the visible tab image. It then crops to the exact selected rectangle.

### 3. The crop is sent to Gemini

The selected image is bundled into a Gemini content request with a prompt such as:

> Read whatever text, code, or diagram is in this image and explain it clearly and concisely, as if to someone seeing it for the first time.

### 4. Result is displayed in-page

The response is returned to the content script, which creates or updates the floating panel on the page. It also stores the conversation so follow-up questions can be asked.

### 5. Usage and state are stored locally

The extension saves:

- the Gemini key
- the custom mode toggle state
- the panel preferences
- the daily usage counter

This makes it lightweight and independent of a custom backend.

---

## Setup and installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd snip-and-explain-tracked
```

### 2. Get a Gemini API key

Open Google AI Studio and generate a Gemini API key:

https://aistudio.google.com/apikey

### 3. Load the extension in Chrome

1. Open Chrome.
2. Go to chrome://extensions.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select this project folder.

### 4. Save the API key

Open the extension popup, click Settings (API key), and paste your key into the input field. Save it.

### 5. Start using the extension

- click the extension icon
- choose Start Snip
- drag to select the area to inspect
- wait for the answer panel
- ask follow-up questions if needed

---

## Typical use cases

### Reading UI or product screenshots

If a page contains a complex interface, the extension can explain what the screen is doing and what the main elements mean.

### Explaining code from a screenshot

Users can snip a code block and ask for a summary, explanation, or identification of bugs or logic flow.

### Understanding charts and diagrams

The extension is useful for reading architecture diagrams, analytics visuals, and product mockups in a simpler, natural-language format.

### Troubleshooting errors

If a user captures a screenshot of an error screen, the extension can help interpret the issue and explain how it likely works.

### Documentation help

Useful when reading documentation snapshots or screenshots from a UI tutorial that is hard to read on a small screen.

---

## Privacy and security notes

This project keeps things intentionally simple:

- the API key is stored in Chrome local storage
- the image is sent directly to Gemini from the browser
- there is no custom backend server in this repo
- usage is tracked locally on the user's machine

Users should still be careful with sensitive screenshots, since any image sent to Gemini will be processed by the model using the provided API key.

---

## Limitations

While the extension is very useful, it does have some practical limits:

- it relies on the browser being allowed to inject scripts into the page
- it only works on pages where Chrome allows extension scripts
- API usage is dependent on the user's Gemini key and quota
- the usage tracker is a local estimate, not Google’s official count
- very large or complex screenshots may produce broad or less precise explanations depending on the model and image quality

---

## Summary

Snip & Explain is a practical browser extension for turning screenshots into explanations. It combines browser-based screen selection, image capture, Google Gemini AI analysis, and a floating conversation panel to deliver an intuitive visual Q&A experience.

Its core value is speed and simplicity: select a region, ask the AI to explain it, and continue the conversation in context without leaving the page.

---

## License

This repository does not currently appear to include a dedicated license file, so the project should be treated as source code for local or personal use unless the project owner adds a specific license later.
