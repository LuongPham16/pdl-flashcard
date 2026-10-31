# Changelog

All notable changes to **PDL Flashcard** are recorded here.

## [1.0.5] - 2026-10-31

### Community review fixes

- Raised `minAppVersion` to **1.13.0**; the plugin uses the `Plugin.settings` field typed
  in Obsidian 1.13.0, which clears the `no-unsupported-api` error.
- Removed all static/dynamic inline styles; the UI now uses CSS classes,
  `setCssStyles` and `setCssProps`.
- Removed unsafe `innerHTML` writes; card fallbacks/cloze rendering use
  `sanitizeHTMLToDom`, Studio previews use `MarkdownRenderer.render`.
- Settings headings use `Setting.setHeading()`.
- Removed the default `Mod + Alt + K` hotkey and the `onunload` leaf detach.
- Settings model/connection requests use `requestUrl`.
- Timers use `window.setTimeout`, `window.clearTimeout` and
  `window.requestAnimationFrame`.
- Removed `:has()`, unused variables and the word "Obsidian" from the description.
- Set a valid `authorUrl`; repository manifest, release manifest and build artifact are
  generated from the same commit.

### Feature set

Bilingual UI, AI drafting from notes/selections/folders, existing-tag-only policy,
basic/MCQ/cloze cards with letter hints, centred images, adaptive review, free TTS,
import/export with all delimiters, target-note imports, batch folder creation, heatmap
styles, direct page navigation, statistics and card manager.

### Quality

- **148 regression tests** pass.
- Requires Obsidian **1.13.0+**.
