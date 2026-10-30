# Changelog

All notable changes to **PDL Flashcard** are recorded here.

## [1.0.3] - 2026-10-31

### Community review fixes

- **Static styles removed**: replaced `element.style.*` assignments with CSS classes or
  Obsidian's `setCssStyles` in image picker, source picker, connection status, model
  fields and reading-font setup.
- **Unsafe innerHTML removed**: card rendering now appends
  `sanitizeHTMLToDom(...)` fragments; Studio previews use `MarkdownRenderer.render`.
- **Settings headings** now use `new Setting(containerEl).setName(...).setHeading()`
  instead of manually creating `h3` elements.
- Removed the default `Mod + Alt + K` hotkey; users can assign their own.
- Removed `detachLeavesOfType` from `onunload`.
- Settings `fetch()` calls now use Obsidian `requestUrl` with provider error messages.
- Bare timers now use `window.setTimeout`, `window.clearTimeout` and
  `window.requestAnimationFrame`.
- Removed the remaining `:has()` selector and several unused variables.
- Removed the word "Obsidian" from the manifest description and set a valid `authorUrl`.
- Rebuilt and re-released from the exact repository commit so the repository manifest,
  release manifest and `main.js` artifact match.

### Included feature set

- Bilingual English / Vietnamese UI and tabbed Settings.
- AI drafting from a note, highlighted passage or folder; existing-tag-only policy.
- Basic, MCQ and cloze cards; cloze letter hints; centred card images.
- Adaptive review, relearning, undo, suspend, bury, leech detection, custom study.
- Free system-voice Read aloud with voice/speed settings.
- CSV/JSON import/export with all delimiters, target-note imports and selection review.
- Heatmap colour/shape controls, direct page navigation, statistics and manager.
- Source-folder enforcement and Unicode NFC normalization.

### Quality

- **148 regression tests** pass.
- README, Vietnamese guide and contributor guide updated for 1.0.3.
