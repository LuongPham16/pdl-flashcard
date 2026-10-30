# Changelog

All notable changes to **PDL Flashcard** are recorded here.

## [1.0.4] - 2026-10-31

### Community review fixes

- Replaced every remaining static/dynamic inline style with CSS classes or Obsidian's
  `setCssStyles` / `setCssProps`:
  image picker, source picker, connection status, model fields, reading font,
  progress bar and statistics charts.
- Removed unsafe `innerHTML` writes:
  - card fallbacks and cloze restoration use `sanitizeHTMLToDom`;
  - Studio previews use `MarkdownRenderer.render`.
- Settings section headings use `new Setting(containerEl).setName(...).setHeading()`.
- Removed the default `Mod + Alt + K` hotkey; users can assign their own.
- Removed `detachLeavesOfType` from `onunload`.
- Settings model/connection requests use Obsidian `requestUrl` with readable provider
  errors.
- Replaced bare timers with `window.setTimeout`, `window.clearTimeout` and
  `window.requestAnimationFrame`.
- Removed `:has()` and several unused variables.
- Removed the word "Obsidian" from the manifest description; set a valid `authorUrl`.
- Release, repository manifest and `main.js` are rebuilt from the same commit.

### Feature set

Bilingual UI, AI drafting from notes/selections/folders, existing-tag-only policy,
basic/MCQ/cloze cards with letter hints, centred images, adaptive review, free TTS,
import/export with all delimiters, target-note imports, batch folder creation, heatmap
styles, direct page navigation, statistics and card manager.

### Quality

- **148 regression tests** pass.
- README, Vietnamese guide and contributor guide updated for 1.0.4.
