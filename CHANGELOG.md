# Changelog

All notable changes to **PDL Flashcard** are recorded here.

## [1.0.6] - 2026-10-31

### Added

- **Import from external files** — CSV, TSV, TXT, JSON, Markdown (`md`) and Excel
  (`xlsx` / `xlsm`). The picker lists the supported types and reads the first worksheet.
- **Three standard import templates** — Basic Q&A, Multiple choice and Cloze. Each
  template has only the columns for that card type and adapts its separator to the
  selected delimiter.
- **Markdown import** — Markdown tables, fenced `pdl-flashcards` / JSON / CSV / TSV
  blocks, and plain delimited lines.
- Excel imports use the first worksheet and support MCQ choice columns.
- **Heatmap shapes** are now exactly three: rounded rectangle, rounded square and heart
  (SVG mask). Old square/rounded/circle/diamond/hexagon values migrate automatically.

### Changed

- **Default prompt** is now **“Default (Any Subject & Audience)”**. It adapts to the
  note’s subject, terminology and audience instead of assuming DevOps or software work.
- The old built-in **Technical & DevOps** prompt was removed; saved copies of that
  built-in prompt are cleaned up on load, custom prompts are kept.
- **Decks per page** is capped at **5** (1–5, default 5).
- Settings refresh uses `update()` / a shared renderer compatible with Obsidian 1.13+.

### Fixed

- MCQ no longer shows the correct answer twice (banner plus answer section).
- Cloze `Check answer` and `Reveal answer` buttons are equal width/height.
- Removed the redundant “Say it aloud…” hint before reveal.
- Removed default hotkey and `onunload` leaf detaching.
- Replaced static inline styles with classes / `setCssStyles` / `setCssProps`.
- Replaced unsafe `innerHTML` writes with `sanitizeHTMLToDom` / `MarkdownRenderer`.
- Settings headings use `Setting.setHeading()`.
- Removed unnecessary regex escapes, the joined zero-width character class and
  partial-support `clip-path`; heart uses an SVG mask.
- Removed `fetch()` from settings in favour of `requestUrl`; API errors surface properly.
- Timers use `window.setTimeout` / `window.clearTimeout` / `window.requestAnimationFrame`.

### Quality

- **156 regression tests** pass, including real XLSX workbook parsing, Markdown tables,
  delimiter-aware templates, source-folder filtering, tag policy and review edge cases.
- Requires Obsidian **1.13.0+**.
- Repository manifest, release manifest and build artifact are generated from the same
  commit.
