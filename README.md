# Snip & Explain (BYOK + usage tracker)

Same as the plain BYOK version, plus a live, self-tracked daily usage
counter shown in both the toolbar popup and the result panel.

## What the tracker actually is

It's a **local estimate**, not Google's real count. It only increments
when a call made *through this extension* succeeds, and resets when the
date changes in **Pacific time** (matching when Google's own daily quota
resets). If you test the same key elsewhere (curl, another script,
AI Studio's own playground), those calls won't show up here.

For the real, authoritative number, check:
- aistudio.google.com/rate-limit
- Google Cloud Console → APIs & Services → Generative Language API → Quotas

The default estimated limit is 450/day, matching `gemini-3.5-flash-lite`'s
free-tier daily cap as of writing. Change `ESTIMATED_DAILY_LIMIT` in
`background.js` if that number changes or you switch models.

## Where the tracker shows up

- **Popup**: a bar + "~X/450 requests used today", refreshed every time
  you open the popup. Turns green past 80%.
- **Result panel**: a small "~X/450 used today (estimate)" line under
  each answer, updated after every capture and every follow-up.

## Everything else

Identical to the plain BYOK version — same overlay, same follow-up
panel, same options page for the API key. See that version's README for
installation steps; they're the same here.

## Result panel controls

- **Move**: drag the title bar (mouse, pen or touch).
- **Resize**: drag the corner grip at the bottom-right; double-click it to reset to auto size.
- **A− / A+**: change the text size.
- **📌 Pin**: the panel reopens at the spot you left it. Without the pin it opens next to your snip.
- **⧉ Copy**: copies the whole conversation as text.
- **— Minimize**: collapses to just the title bar (double-click the title works too).
- Size and text size are remembered between snips automatically.
- Answers are formatted: headings, bold/italic, lists, tables, code blocks and simple maths.