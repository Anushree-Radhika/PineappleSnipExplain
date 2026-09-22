# Snip & Explain

Snip & Explain is a practical browser extension for turning screenshots into explanations. It combines browser-based screen selection, image capture, Google Gemini AI analysis, and a floating conversation panel to deliver an intuitive visual Q&A experience.

Its core value is speed and simplicity: select a region, ask the AI to explain it, and continue the conversation in context without leaving the page.
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


## How the extension is structured

### Manifest and permissions

The project uses a Manifest V3 Chrome extension setup.

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


## License

This repository has no license. But i would really want people to use it and tell me what improvements i can make.Build with problem solving mentality.
