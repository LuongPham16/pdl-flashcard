# Changelog

All notable changes to **PDL Flashcard** are recorded here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
versioning follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-28

First public release. The version restarts at 1.0.0 for the open-source launch;
the 2.x entries below are the private development history.

### Added

- **A 98-test feature suite** covering spaced repetition, deck storage, AI provider
  payloads, the dashboard/review view, formatting, plugin lifecycle and every dialog.
  Tests run against the built bundle, so the shipped `main.js` is what gets exercised.
- `npm run test:inproc` for environments that block the test runner's per-file child
  processes (Node 22+).
- `tests/README.md` with the coverage map and helper documentation.

### Changed

- **Repository restructured into a real plugin project.** The ~2,850-line `main.js`
  was split into focused ES modules under `src/`, bundled with esbuild, and covered by
  a Node test suite that runs against the built bundle. Behaviour is unchanged; this is
  a pure refactor plus tooling (build, deploy, version sync, CI).
  - New `dist/` build output; Obsidian still loads a single `main.js`.
  - `npm run dev` / `build` / `build:prod` / `test` / `typecheck` / `deploy`.
  - `versions.json` for the community plugin registry.

### Fixed

- Missing imports that made the card manager, statistics, studio, selection and settings
  dialogs fail to open.
- Multi-line code blocks crashed the fallback formatter (`codeHtml` was undefined).
- `leechThreshold: 0` did not actually disable leech detection.
- `DeleteFlashcardModal` was not exported, so deleting from the manager could not work.

## [2.9.0] - 2026-10-13

### Added

- **Undo the last grade** — ↺ button in the review bar and `Ctrl/Cmd+Z`. Rolls back the
  schedule entry, the review log, the streak list and the card re-queued by that grade.
  Keeps 30 steps.
- **Re-show forgotten cards in the same session** — a card graded "Again" is queued once
  more at the end of the session (Anki-style relearning), limited per card (default 2).
- **Suspend / Bury** — per-card controls in the review header and a suspend toggle in the
  card manager; suspended and buried cards leave every queue and the due counts.
- **Leech detection** — auto-suspend a card after N lapses (default 8) with a hint to
  rewrite it.
- **Maximum interval** setting (default 36500 days).
- **Rendering through Obsidian's MarkdownRenderer** — questions, answers and explanations
  now support images, `![[embeds]]`, LaTeX (`$…$`, `$$…$$`) and wikilinks. Cloze blanks
  and highlights still render correctly.
- Settings → *Review behaviour* for the new controls.

### Fixed

- Card text containing images, maths or embeds used to show as raw text.
- Cloze markers could be lost when the text went through a Markdown render.
- The "generate from selection" dialog no longer stretches to the full viewport height
  (caused by `min-height: 100%` inherited from the dashboard class).
- The Studio "Source note" row no longer squeezes its description into the icon box.

## [2.8.0] - 2026-10-12

### Added

- **Generate flashcards from a highlighted passage** — select text, right-click →
  *"Tạo flashcard AI từ đoạn bôi đen"*. The dialog shows the excerpt, card counts and
  whether the note already has a deck.
- Only the excerpt is sent to the model, with an instruction to stay inside it.
- Notes without a deck get a new deck; notes that already have one get the new cards
  appended (existing cards, `card_count` and hand-written prose preserved).
- `Generate flashcards from selected text` command (visible only when text is selected).

### Fixed

- Card normalisation is shared by every path (manual, AI, import, append), so incomplete
  cards are no longer written to disk and malformed multiple-choice cards degrade to
  basic instead of disappearing on import.
- Saving no longer creates an empty deck note.

## [2.7.1]

- Auto-backup of `data.json` into `backups/` (last 30 kept).
- Reverse cards, live preview in the card editor, inline code styling, review card
  redesign, AI output normalisation and prompt format rules.

## [1.0.0] - 2024

- Initial release: spaced repetition, AI generation (OpenAI, Gemini, DeepSeek, Claude),
  basic / multiple-choice / cloze cards, custom study, streak and dashboard.
