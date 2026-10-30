# Changelog

All notable changes to **PDL Flashcard** are recorded here.

## [1.0.2] - 2026-10-30

### Community submission fixes

- Removed the word "Obsidian" from the plugin description.
- Removed the default `Mod + Alt + K` hotkey; users can assign their own in
  *Settings → Hotkeys*.
- Removed `detachLeavesOfType` from `onunload` so Obsidian keeps the user's leaf position.
- Replaced settings `fetch()` calls with Obsidian's `requestUrl`, including a proper
  provider error message for 401/429/503 responses.
- Replaced bare timers with `window.setTimeout`, `window.clearTimeout` and
  `window.requestAnimationFrame` for pop-out window compatibility.
- Removed the remaining `:has()` selector and several unused variables.
- Rebuilt and re-released from the exact repository commit so the repository manifest,
  release manifest and `main.js` artifact match.

### Feature set included in 1.0.2

- Bilingual English / Vietnamese interface and tabbed Settings.
- AI drafting from a note, a highlighted passage or a whole folder; existing-tag-only
  policy; editable prompts and per-type counts.
- Basic, MCQ and cloze cards; cloze typing with click-to-reveal letter hints; centred,
  height-capped card images.
- Adaptive review with Again / Hard / Good / Easy, relearning, undo, suspend, bury,
  leech detection and custom study.
- Free system-voice Read aloud with voice/speed settings; cloze masking before reveal,
  full MCQ choices after reveal and Markdown cleanup.
- CSV/JSON import/export with auto/comma/semicolon/tab/space/`::`/pipe delimiters,
  target-note imports and selection review before saving.
- Dashboard heatmap with colour/shape pickers, deck library with direct page jump,
  statistics and card manager.
- Source-folder enforcement across pickers, menus and batch; Unicode NFC normalization.

### Quality

- **148 regression tests** pass.
- README, Vietnamese guide and contributor guide updated for 1.0.2.
