(() => {
  let overlay, box, startX, startY, selecting = false;
  let customModeEnabled = false; // whether the "Ask a question" box is offered at all
  let pendingPanel = null;       // panel waiting for the screenshot to be taken

  // The popup re-injects this file on every "Start Snip". Make sure only the newest
  // copy listens, so messages are never handled twice (or by a dead copy).
  if (window.__snipExplainHandler) {
    try { chrome.runtime.onMessage.removeListener(window.__snipExplainHandler); } catch (e) { /* old context is gone */ }
  }
  window.__snipExplainHandler = handleMessage;
  chrome.runtime.onMessage.addListener(handleMessage);

  function handleMessage(msg) {
    if (msg.type === 'START_SELECTION') {
      customModeEnabled = !!msg.customMode;
      startSelectionMode();
    } else if (msg.type === 'CAPTURE_DONE' && pendingPanel) {
      pendingPanel.reveal();
    }
  }

  // ------------------------------------------------------------------
  // Snip selection overlay
  // ------------------------------------------------------------------

  function startSelectionMode() {
    if (overlay) return;

    overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: 2147483647,
      cursor: 'crosshair', background: 'rgba(0,0,0,0.15)'
    });

    box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed', border: '2px solid #e0a800',
      background: 'rgba(245,197,24,0.25)', display: 'none',
      zIndex: 2147483647,
      pointerEvents: 'none' // box never intercepts the mouse -- avoids a stuck-drag bug
    });

    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(box);

    overlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') cleanup();
  }

  function onMouseDown(e) {
    selecting = true;
    startX = e.clientX;
    startY = e.clientY;
    box.style.left = startX + 'px';
    box.style.top = startY + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
    box.style.display = 'block';

    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!selecting) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }

  // Resolves after the page has repainted (so the overlay is really gone) -- with a safety timeout.
  function nextPaint() {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 150);
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
    });
  }

  async function onMouseUp() {
    selecting = false;
    const rectCss = box.getBoundingClientRect();

    if (rectCss.width < 10 || rectCss.height < 10) {
      cleanup();
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = {
      left: Math.round(rectCss.left * dpr),
      top: Math.round(rectCss.top * dpr),
      width: Math.round(rectCss.width * dpr),
      height: Math.round(rectCss.height * dpr)
    };

    cleanup();
    const panelPromise = createPanel(rectCss); // created hidden -- it must not appear in the screenshot
    await nextPaint();
    const panel = await panelPromise;
    pendingPanel = panel;
    panel.setLoading();

    chrome.runtime.sendMessage({ type: 'CAPTURE_SELECTION', rect }, (response) => {
      if (chrome.runtime.lastError) {
        panel.setError(chrome.runtime.lastError.message);
        return;
      }
      if (response?.error) {
        panel.setError(response.error);
      } else {
        panel.setAnswer(response.text, response.messages, response.usageCount, response.usageLimit);
      }
    });
  }

  function cleanup() {
    document.removeEventListener('keydown', onKeyDown);
    if (overlay) { overlay.remove(); overlay = null; }
    if (box) { box.remove(); box = null; }
  }

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------

  const MARGIN = 8;              // keep the panel at least this far from the screen edges
  const MIN_W = 280;
  const MIN_H = 160;
  const PREFS_KEY = 'panelPrefs';
  const DEFAULT_PREFS = { fontSize: 13, pinned: false, width: null, height: null, left: null, top: null };

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function loadPrefs() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(PREFS_KEY, (res) => resolve({ ...DEFAULT_PREFS, ...((res && res[PREFS_KEY]) || {}) }));
      } catch (e) {
        resolve({ ...DEFAULT_PREFS });
      }
    });
  }

  function savePrefs(prefs) {
    try { chrome.storage.local.set({ [PREFS_KEY]: prefs }); } catch (e) { /* ignore */ }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* fall through to the old way */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.documentElement.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Tiny markdown renderer -- builds DOM nodes only (never innerHTML), so it is safe.
  // Handles: headings, **bold**, *italic*, `code`, code blocks, bullet/numbered lists
  // (with indent), > quotes, --- rules, | tables |, and $inline math$ (shown as clean text).
  // ------------------------------------------------------------------

  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', 'n': 'ⁿ' };
  const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  const MATH_MAP = [
    [/\\times/g, '×'], [/\\cdot/g, '·'], [/\\leq?\b/g, '≤'], [/\\geq?\b/g, '≥'],
    [/\\neq?\b/g, '≠'], [/\\infty/g, '∞'], [/\\(?:to|rightarrow)\b/g, '→'], [/\\leftarrow/g, '←'],
    [/\\approx/g, '≈'], [/\\pm/g, '±'], [/\\log/g, 'log'], [/\\sum/g, 'Σ'], [/\\in\b/g, '∈'],
    [/\\sqrt\{([^}]*)\}/g, '√($1)'], [/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)'],
    [/\\(?:text|mathrm|mathbf)\{([^}]*)\}/g, '$1'], [/\\(?:left|right)/g, ''], [/\\[,; ]/g, ' ']
  ];

  function mapChars(str, map) {
    let out = '';
    for (const ch of str) {
      if (!(ch in map)) return null;
      out += map[ch];
    }
    return out;
  }

  function cleanMath(s) {
    for (const [re, rep] of MATH_MAP) s = s.replace(re, rep);
    s = s.replace(/\^\{?([0-9n+-]+)\}?/g, (m, g) => mapChars(g, SUP) ?? m);
    s = s.replace(/_\{?([0-9]+)\}?/g, (m, g) => mapChars(g, SUB) ?? m);
    return s.replace(/[{}]/g, '').trim();
  }

  const INLINE_SRC =
    '(`[^`\\n]+`)' +                       // 1: `code`
    '|(\\$\\$[^$]+\\$\\$)' +               // 2: $$math$$
    '|(\\$(?!\\s)[^$\\n]*[^$\\s]\\$)' +    // 3: $math$  (not "$5 and $10")
    '|(\\*\\*[^*\\n]+?\\*\\*)' +           // 4: **bold**
    '|(\\*(?!\\s)[^*\\n]+?\\*)';           // 5: *italic*

  function renderInline(parent, text) {
    const re = new RegExp(INLINE_SRC, 'g'); // fresh regex each call: this function is recursive
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const tok = m[0];
      let el;
      if (m[1]) {
        el = h('code', null, tok.slice(1, -1));
      } else if (m[2]) {
        el = h('span', 'math', cleanMath(tok.slice(2, -2)));
      } else if (m[3]) {
        el = h('span', 'math', cleanMath(tok.slice(1, -1)));
      } else if (m[4]) {
        el = h('strong');
        renderInline(el, tok.slice(2, -2));
      } else {
        el = h('em');
        renderInline(el, tok.slice(1, -1));
      }
      parent.appendChild(el);
      last = m.index + tok.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  const isTableRow = (s) => /^\s*\|.*\|\s*$/.test(s);
  const isTableSep = (s) => isTableRow(s) && /^[\s|:-]+$/.test(s) && s.includes('-');

  function splitRow(row) {
    let s = row.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map((c) => c.trim());
  }

  function buildTable(rows) {
    const wrap = h('div', 'tablewrap');
    const table = h('table');
    const thead = h('thead');
    const headRow = h('tr');
    splitRow(rows[0]).forEach((c) => { const th = h('th'); renderInline(th, c); headRow.appendChild(th); });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = h('tbody');
    rows.slice(2).forEach((r) => {
      const tr = h('tr');
      splitRow(r).forEach((c) => { const td = h('td'); renderInline(td, c); tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderMarkdown(container, md) {
    container.textContent = '';
    const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    let para = [];
    let i = 0;

    const flushPara = () => {
      if (!para.length) return;
      const p = h('div', 'p');
      renderInline(p, para.join('\n'));
      container.appendChild(p);
      para = [];
    };

    while (i < lines.length) {
      const line = lines[i];

      // fenced code block
      if (/^\s*```/.test(line)) {
        flushPara();
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // closing fence
        const pre = h('pre');
        pre.appendChild(h('code', null, buf.join('\n')));
        container.appendChild(pre);
        continue;
      }

      // blank line
      if (/^\s*$/.test(line)) { flushPara(); i++; continue; }

      // heading
      const hm = line.match(/^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/);
      if (hm) {
        flushPara();
        const el = h('div', 'h h' + Math.min(hm[1].length, 4));
        renderInline(el, hm[2]);
        container.appendChild(el);
        i++;
        continue;
      }

      // horizontal rule
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); container.appendChild(h('hr')); i++; continue; }

      // table
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushPara();
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) { rows.push(lines[i]); i++; }
        container.appendChild(buildTable(rows));
        continue;
      }

      // blockquote
      if (/^\s*>/.test(line)) {
        flushPara();
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        const q = h('div', 'quote');
        renderInline(q, buf.join('\n'));
        container.appendChild(q);
        continue;
      }

      // list item (bullet or numbered), with simple indent levels
      const lm = line.match(/^(\s*)([-*•+]|\d+[.)])\s+(.*)$/);
      if (lm) {
        flushPara();
        const indent = Math.min(3, Math.floor(lm[1].replace(/\t/g, '    ').length / 3));
        const item = h('div', 'li');
        item.style.marginLeft = indent * 16 + 'px';
        item.appendChild(h('span', 'mark', /\d/.test(lm[2]) ? lm[2] : (indent % 2 ? '◦' : '•')));
        const txt = h('span', 'txt');
        renderInline(txt, lm[3]);
        item.appendChild(txt);
        container.appendChild(item);
        i++;
        continue;
      }

      para.push(line);
      i++;
    }
    flushPara();
  }

  // ------------------------------------------------------------------
  // Result panel
  //
  // Lives in a shadow root, so the website's own CSS can't break it.
  //   * drag it by the header, resize it from the bottom-right corner
  //   * A- / A+ text size, pin (remember position), copy, minimize, close
  //   * footer with the ask box is pinned to the bottom and always visible
  //   * size, text size and (if pinned) position are remembered between snips
  // ------------------------------------------------------------------

  const PANEL_CSS = `
    .panel {
      position: fixed; top: 0; left: 0;
      display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;
      background: #fffbea; color: #3b2a00;
      border: 1px solid #ecd576; border-top: 4px solid #4a9a3f; border-radius: 10px;
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 8px 24px rgba(90,60,0,0.25);
    }
    button { font: inherit; }

    .header {
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
      padding: 7px 12px 5px 12px; flex: 0 0 auto;
      cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none;
    }
    .header.dragging { cursor: grabbing; }
    .title { font-size: 12px; font-weight: 700; color: #7a5b00; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tools { display: flex; gap: 2px; flex: 0 0 auto; }
    .tbtn {
      width: 26px; height: 24px; padding: 0; border: none; border-radius: 6px;
      background: transparent; color: #7a6520; cursor: pointer; font-size: 12px; font-weight: 700; line-height: 1;
    }
    .tbtn:hover { background: #f3e6a8; }
    .tbtn.on { background: #f5c518; color: #3b2a00; }

    .content { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 14px 10px; margin-right: 6px; font-size: 13px; }
    .answer { overflow-wrap: anywhere; }
    .you { font-weight: 700; margin: 12px 0 4px; padding-top: 8px; border-top: 1px dashed #ecd576; overflow-wrap: anywhere; }
    .thinking { margin-top: 10px; color: #7a6520; }

    .p { margin: 0 0 8px; white-space: pre-wrap; }
    .h { font-weight: 700; margin: 10px 0 6px; line-height: 1.3; }
    .h1 { font-size: 1.35em; } .h2 { font-size: 1.22em; } .h3 { font-size: 1.1em; } .h4 { font-size: 1em; }
    .li { display: flex; gap: 6px; margin: 2px 0; }
    .mark { flex: 0 0 auto; min-width: 1.1em; color: #7a5b00; font-weight: 600; }
    .txt { flex: 1 1 auto; min-width: 0; white-space: pre-wrap; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; background: #f6e9a8; border-radius: 4px; padding: 1px 4px; }
    pre { margin: 6px 0 10px; padding: 10px; background: #2b2410; color: #fdf3c0; border-radius: 8px; overflow-x: auto; font-size: 0.9em; line-height: 1.45; }
    pre code { background: none; padding: 0; color: inherit; font-size: 1em; white-space: pre; }
    .math { font-family: "Cambria Math", "STIX Two Math", Georgia, serif; font-style: italic; }
    .quote { border-left: 3px solid #e0a800; padding: 2px 10px; margin: 6px 0; color: #6b5a1a; white-space: pre-wrap; }
    hr { border: none; border-top: 1px solid #ecd576; margin: 10px 0; }
    .tablewrap { overflow-x: auto; margin: 6px 0 10px; }
    table { border-collapse: collapse; font-size: 0.95em; }
    th, td { border: 1px solid #ecd576; padding: 4px 8px; text-align: left; }
    th { background: #f6e9a8; }

    .footer { display: none; flex: 0 0 auto; padding: 8px 26px 10px 14px; border-top: 1px solid #ecd576; background: #fff3c4; }
    .footer-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .ask {
      display: none; padding: 5px 10px; font-size: 12px; border: 1px solid #ecd576;
      background: #fffbea; color: #7a5b00; border-radius: 6px; cursor: pointer;
    }
    .ask:hover { background: #fff8d6; }
    .quota { font-size: 11px; color: #7a6520; margin-left: auto; }
    .ask-row { display: none; gap: 6px; margin-top: 8px; }
    input {
      flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 8px; border-radius: 6px;
      border: 1px solid #ecd576; background: #fffbea; color: #3b2a00; font: inherit; font-size: 12px;
    }
    input:focus { outline: 2px solid #f5c518; }
    .send {
      flex: 0 0 auto; padding: 6px 14px; font-size: 12px; border: none; background: #f5c518;
      color: #3b2a00; font-weight: 600; border-radius: 6px; cursor: pointer;
    }
    .send:disabled { opacity: 0.6; cursor: default; }

    /* resize handles: 4 edges + 4 corners */
    .rz { position: absolute; z-index: 5; touch-action: none; }
    .rz-n  { top: 0;    left: 10px;  right: 10px;  height: 5px; cursor: ns-resize; }
    .rz-s  { bottom: 0; left: 10px;  right: 22px;  height: 5px; cursor: ns-resize; }
    .rz-w  { left: 0;   top: 10px;   bottom: 10px; width: 5px;  cursor: ew-resize; }
    .rz-e  { right: 0;  top: 10px;   bottom: 22px; width: 6px;  cursor: ew-resize; }
    .rz-n:hover, .rz-s:hover, .rz-w:hover, .rz-e:hover { background: rgba(245,197,24,0.6); }
    .rz-nw { top: 0;    left: 0;     width: 10px; height: 10px; cursor: nwse-resize; }
    .rz-ne { top: 0;    right: 0;    width: 10px; height: 10px; cursor: nesw-resize; }
    .rz-sw { bottom: 0; left: 0;     width: 10px; height: 10px; cursor: nesw-resize; }
    .rz-nw:hover, .rz-ne:hover, .rz-sw:hover { background: rgba(245,197,24,0.6); }
    .rz-se {
      bottom: 0; right: 0; width: 22px; height: 22px; cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 0 46%, #c9a227 46% 55%, transparent 55% 66%, #c9a227 66% 75%, transparent 75% 100%);
    }
    .rz-se:hover { background-color: rgba(245,197,24,0.35); }
  `;

  function adoptCss(root, css) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      const st = document.createElement('style');
      st.textContent = css;
      root.appendChild(st);
    }
  }

  async function createPanel(anchorRect) {
    const old = document.getElementById('__snip_explain_panel');
    if (old) old.remove();

    const prefs = await loadPrefs();

    // Host element: an empty, invisible anchor. Everything visible lives in its shadow root.
    // It stays hidden until the screenshot has been captured (see reveal()).
    const host = document.createElement('div');
    host.id = '__snip_explain_panel';
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; visibility: hidden;';
    const root = host.attachShadow({ mode: 'open' });
    adoptCss(root, PANEL_CSS);

    const panel = h('div', 'panel');

    // ---- header ----
    const header = h('div', 'header');
    const title = h('div', 'title', '🍍 Snip & Explain');
    const tools = h('div', 'tools');
    const mkBtn = (label, tip) => { const b = h('button', 'tbtn', label); b.type = 'button'; b.title = tip; return b; };
    const btnSmaller = mkBtn('A−', 'Smaller text');
    const btnLarger = mkBtn('A+', 'Larger text');
    const btnPin = mkBtn('📌', 'Pin: open here next time');
    const btnCopy = mkBtn('⧉', 'Copy the conversation');
    const btnMin = mkBtn('—', 'Minimize (or double-click the title)');
    const btnClose = mkBtn('✕', 'Close');
    tools.append(btnSmaller, btnLarger, btnPin, btnCopy, btnMin, btnClose);
    header.append(title, tools);

    // ---- scrolling content ----
    const content = h('div', 'content');
    const answerEl = h('div', 'answer', 'Reading and explaining…');
    content.appendChild(answerEl);

    // ---- pinned footer ----
    const footer = h('div', 'footer');
    const footerTop = h('div', 'footer-top');
    const toggleBtn = h('button', 'ask', '💬 Ask a question');
    toggleBtn.type = 'button';
    const quotaLine = h('div', 'quota');
    footerTop.append(toggleBtn, quotaLine);

    const askRow = h('div', 'ask-row');
    const input = h('input');
    input.type = 'text';
    input.placeholder = 'Ask about this…';
    const sendBtn = h('button', 'send', 'Send');
    sendBtn.type = 'button';
    askRow.append(input, sendBtn);
    footer.append(footerTop, askRow);

    // ---- resize handles: every edge and every corner ----
    const handles = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map((dir) => {
      const el = h('div', 'rz rz-' + dir);
      el.title = 'Drag to resize · double-click to reset';
      return [dir, el];
    });

    panel.append(header, content, footer, ...handles.map(([, el]) => el));
    root.appendChild(panel);
    document.documentElement.appendChild(host);

    // ---- state ----
    let answered = false;
    let collapsed = false;
    let userSized = false;
    let userPlaced = false;
    let savedHeight = '';
    let savedMaxHeight = '';
    let conversation = [];   // full Gemini-format message history for follow-ups
    const transcript = [];   // plain text of everything shown, for the copy button

    // ---- size ----
    const defaultWidth = () => Math.min(380, window.innerWidth - MARGIN * 2);
    const autoMaxHeight = () => Math.min(520, window.innerHeight - MARGIN * 2);

    function applyAutoSize() {
      userSized = false;
      panel.style.width = defaultWidth() + 'px';
      panel.style.height = '';
      panel.style.maxHeight = autoMaxHeight() + 'px';
    }

    if (prefs.width && prefs.height) {
      userSized = true;
      panel.style.width = clamp(prefs.width, MIN_W, window.innerWidth - MARGIN * 2) + 'px';
      panel.style.height = clamp(prefs.height, MIN_H, window.innerHeight - MARGIN * 2) + 'px';
      panel.style.maxHeight = 'none';
    } else {
      applyAutoSize();
    }
    content.style.fontSize = prefs.fontSize + 'px';

    // ---- keep the panel fully on screen ----
    function clampIntoView() {
      const r = panel.getBoundingClientRect();
      panel.style.top = clamp(r.top, MARGIN, window.innerHeight - r.height - MARGIN) + 'px';
      panel.style.left = clamp(r.left, MARGIN, window.innerWidth - r.width - MARGIN) + 'px';
    }

    // Prefer just below the snipped area; if it won't fit there, try above it; then clamp.
    function placeNearAnchor() {
      if (userPlaced) { clampIntoView(); return; } // pinned or dragged: never move it around
      const height = panel.getBoundingClientRect().height;
      const below = anchorRect.bottom + 8;
      let top = below;
      if (below + height > window.innerHeight - MARGIN) {
        const above = anchorRect.top - 8 - height;
        if (above >= MARGIN) top = above;
      }
      panel.style.top = top + 'px';
      panel.style.left = anchorRect.left + 'px';
      clampIntoView();
    }

    if (prefs.pinned && prefs.left != null && prefs.top != null) {
      userPlaced = true;
      panel.style.left = prefs.left + 'px';
      panel.style.top = prefs.top + 'px';
      clampIntoView();
    } else {
      placeNearAnchor();
    }

    const onWindowResize = () => {
      if (!host.isConnected) { window.removeEventListener('resize', onWindowResize); return; }
      clampIntoView();
    };
    window.addEventListener('resize', onWindowResize);

    // ---- remember settings ----
    function persist() {
      const r = panel.getBoundingClientRect();
      if (userSized && !collapsed) {
        prefs.width = Math.round(r.width);
        prefs.height = Math.round(r.height);
      }
      if (prefs.pinned) {
        prefs.left = Math.round(r.left);
        prefs.top = Math.round(r.top);
      }
      savePrefs(prefs);
    }

    // ---- drag by the header ----
    header.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      userPlaced = true;
      const r = panel.getBoundingClientRect();
      const offX = e.clientX - r.left;
      const offY = e.clientY - r.top;
      try { header.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      header.classList.add('dragging');

      const move = (ev) => {
        panel.style.left = clamp(ev.clientX - offX, 0, window.innerWidth - panel.offsetWidth) + 'px';
        panel.style.top = clamp(ev.clientY - offY, 0, window.innerHeight - panel.offsetHeight) + 'px';
      };
      const up = () => {
        header.classList.remove('dragging');
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerup', up);
        header.removeEventListener('pointercancel', up);
        persist();
      };
      header.addEventListener('pointermove', move);
      header.addEventListener('pointerup', up);
      header.addEventListener('pointercancel', up);
    });

    // ---- resize from any edge or corner ----
    function startResize(e, dir, el) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const r = panel.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      userSized = true;
      userPlaced = true;
      panel.style.maxHeight = 'none';

      const move = (ev) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        let left = r.left, top = r.top, width = r.width, height = r.height;
        if (dir.includes('e')) width = clamp(r.width + dx, MIN_W, window.innerWidth - r.left);
        if (dir.includes('s')) height = clamp(r.height + dy, MIN_H, window.innerHeight - r.top);
        if (dir.includes('w')) { width = clamp(r.width - dx, MIN_W, r.right); left = r.right - width; }
        if (dir.includes('n')) { height = clamp(r.height - dy, MIN_H, r.bottom); top = r.bottom - height; }
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.width = width + 'px';
        panel.style.height = height + 'px';
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        persist();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }

    function resetSize() {
      applyAutoSize();
      prefs.width = null;
      prefs.height = null;
      savePrefs(prefs);
      clampIntoView();
    }

    handles.forEach(([dir, el]) => {
      el.addEventListener('pointerdown', (e) => startResize(e, dir, el));
      el.addEventListener('dblclick', resetSize);
    });

    // ---- header buttons ----
    function setFont(px) {
      prefs.fontSize = clamp(px, 10, 22);
      content.style.fontSize = prefs.fontSize + 'px';
      savePrefs(prefs);
    }
    btnSmaller.addEventListener('click', () => setFont(prefs.fontSize - 1));
    btnLarger.addEventListener('click', () => setFont(prefs.fontSize + 1));

    function refreshPinButton() {
      btnPin.classList.toggle('on', !!prefs.pinned);
      btnPin.title = prefs.pinned ? 'Pinned: opens here next time (click to unpin)' : 'Pin: open here next time';
    }
    refreshPinButton();
    btnPin.addEventListener('click', () => {
      prefs.pinned = !prefs.pinned;
      refreshPinButton();
      persist();
    });

    btnCopy.addEventListener('click', async () => {
      const ok = await copyText(transcript.join('\n'));
      const before = btnCopy.textContent;
      btnCopy.textContent = ok ? '✓' : '!';
      setTimeout(() => { btnCopy.textContent = before; }, 1200);
    });

    function setCollapsed(value) {
      collapsed = value;
      if (value) {
        savedHeight = panel.style.height;
        savedMaxHeight = panel.style.maxHeight;
        panel.style.height = 'auto';
        panel.style.maxHeight = 'none';
      } else {
        panel.style.height = savedHeight;
        panel.style.maxHeight = savedMaxHeight;
      }
      content.style.display = value ? 'none' : '';
      footer.style.display = !value && answered ? 'block' : 'none';
      handles.forEach(([, el]) => { el.style.display = value ? 'none' : ''; });
      btnMin.textContent = value ? '▢' : '—';
      btnMin.title = value ? 'Expand' : 'Minimize (or double-click the title)';
      clampIntoView();
    }
    btnMin.addEventListener('click', () => setCollapsed(!collapsed));
    header.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) setCollapsed(!collapsed); });
    btnClose.addEventListener('click', () => host.remove());

    // ---- answers ----
    function setLoading() {
      answerEl.textContent = 'Reading and explaining…';
      answerEl.style.color = '';
    }

    function setError(message) {
      answerEl.textContent = 'Error: ' + message;
      answerEl.style.color = '#c0392b';
      reveal();
      placeNearAnchor();
    }

    function setAnswer(text, messages, usageCount, usageLimit) {
      renderMarkdown(answerEl, text);
      answerEl.style.color = '';
      conversation = messages || conversation;
      transcript.length = 0;
      transcript.push(text);
      answered = true;
      footer.style.display = collapsed ? 'none' : 'block';
      if (customModeEnabled) toggleBtn.style.display = 'inline-block';
      updateQuota(usageCount, usageLimit);
      reveal();
      placeNearAnchor();
    }

    function updateQuota(usageCount, usageLimit) {
      if (typeof usageCount !== 'number' || typeof usageLimit !== 'number') return;
      quotaLine.textContent = `~${usageCount}/${usageLimit} used today (estimate)`;
      quotaLine.style.color = usageCount >= usageLimit * 0.8 ? '#b8860b' : '#7a6520';
    }

    function appendExchange(question, answer, isError) {
      const q = h('div', 'you', 'You: ' + question);
      const a = h('div', 'answer');
      if (isError) {
        a.textContent = answer;
        a.style.color = '#c0392b';
      } else {
        renderMarkdown(a, answer);
      }
      content.append(q, a);
      transcript.push(`\nYou: ${question}\n${answer}`);
      content.scrollTo({ top: q.offsetTop - content.offsetTop - 4, behavior: 'smooth' });
      clampIntoView();
    }

    // ---- follow-up questions ----
    toggleBtn.addEventListener('click', () => {
      const open = askRow.style.display === 'none' || askRow.style.display === '';
      askRow.style.display = open ? 'flex' : 'none';
      if (open) input.focus();
      clampIntoView();
    });

    // Typing here must not trigger the website's own keyboard shortcuts.
    ['keydown', 'keyup', 'keypress'].forEach((type) => input.addEventListener(type, (e) => e.stopPropagation()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendFollowup();
      if (e.key === 'Escape') host.remove();
    });
    sendBtn.addEventListener('click', () => sendFollowup());

    function sendFollowup() {
      const question = input.value.trim();
      if (!question || sendBtn.disabled) return;
      input.value = '';
      sendBtn.disabled = true;

      // Gemini's expected shape: { role, parts: [{ text }] }
      const updatedMessages = [...conversation, { role: 'user', parts: [{ text: question }] }];
      const thinkingDiv = h('div', 'thinking', 'Thinking…');
      content.appendChild(thinkingDiv);
      content.scrollTop = content.scrollHeight;
      clampIntoView();

      chrome.runtime.sendMessage({ type: 'ASK_FOLLOWUP', messages: updatedMessages }, (response) => {
        sendBtn.disabled = false;
        thinkingDiv.remove();
        if (chrome.runtime.lastError) {
          appendExchange(question, 'Error: ' + chrome.runtime.lastError.message, true);
          return;
        }
        if (response?.error) {
          appendExchange(question, 'Error: ' + response.error, true);
          return;
        }
        conversation = response.messages;
        appendExchange(question, response.text, false);
        updateQuota(response.usageCount, response.usageLimit);
      });
    }

    // ---- visibility ----
    let revealed = false;
    function reveal() {
      if (revealed) return;
      revealed = true;
      host.style.visibility = 'visible';
    }
    setTimeout(reveal, 3000); // safety net if the "screenshot done" message never arrives

    return { setLoading, setError, setAnswer, reveal };
  }
})();