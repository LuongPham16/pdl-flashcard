# Changelog

All notable changes to **PDL Flashcard** are recorded here.

## [1.0.1] - 2026-10-30

### Added

- **Bilingual interface** — English and Tiếng Việt, switchable in Settings. Commands,
  dialogs, menus and notices update immediately.
- **Tabbed Settings** — General, AI and Feedback tabs.
- **Flashcard Studio** — manual drafting plus AI generation from a note or a highlighted
  passage, with editable per-type counts and reverse-card generation.
- **Batch from a folder** — choose all or selected notes in a configured source folder and
  create/append one linked deck per note, with per-note success/error status.
- **Target-note import** — import CSV/JSON cards into the deck of an existing note, or
  create a standalone deck.
- **Import delimiters** — auto-detect, comma, semicolon, tab, space, Anki `::` and pipe.
  A right-click **Import selection as flashcards…** opens the Import dialog prefilled with
  the selection and its note as target; validation only runs when Import is pressed.
- **Card images** — insert from the vault or upload, rendered as centred, height-capped
  blocks in questions, answers and explanations.
- **Cloze typing and letter hints** — type each missing term, or click individual masked
  letters to reveal hints at any position.
- **Read aloud (TTS)** — choose a system voice and 0.5×–2× speed. Cloze prompts speak
  masked blanks before reveal; MCQ reveals read every choice; Markdown is cleaned first.
- **Heatmap styling** — cycle colour palettes from the legend and cycle cell shapes
  (square, rounded, circle, diamond, hexagon).
- **Deck navigation** — first, previous, direct page-number jump, next and last.
- **Default cards per type** — Q&A / MCQ / cloze defaults for new AI drafts, plus an
  optional reverse-card default.
- **AI tag policy** — generated cards may only reuse tags already present on saved cards;
  unknown tags are dropped and no matching tag means no tags.
- **Current provider defaults** — OpenAI, Gemini, DeepSeek and Claude model fallbacks, plus
  fetching available models from the provider where supported.

### Changed

- Only notes inside **Source folders** are offered by Studio, batch, import target, menus
  and active-note commands. `excludedFolders` and the flashcard output folder are always
  excluded.
- The old *Cards per session* row is replaced by per-type card defaults; review sessions
  keep the previous default cap.
- English is the default UI language; Vietnamese is a first-class alternative.
- Decks per page is configurable (1–50, default 5).
- Cards, decks and AI output are normalized to Unicode **NFC** for consistent Vietnamese
  rendering.
- TTS and AI keys remain local to the vault; no plugin-operated cloud service is used.

### Fixed

- Vietnamese font rendering: decomposed accents, missing glyphs and incorrect serif fonts
  no longer break card text.
- Duplicate "correct answer" banner on basic and cloze cards.
- Long deck/source names truncate with tooltips instead of overflowing controls.
- Source button no longer collapses into a narrow grid cell in the review bar.
- MCQ result layout, checkbox alignment and reverse-card toggle alignment.
- Single-line `Front Back` / `Question Answer` imports are no longer mistaken for a header.
- Cloze TTS no longer speaks the hidden answer before reveal.
- Malformed or empty AI/card data is handled without crashing the session.

### Quality

- Regression suite expanded to **148 tests**, including AI tag filtering, import
  delimiters, target-note appends, batch isolation, source-folder filtering, TTS masking,
  image insertion, heatmap controls and review edge cases.
- README, Vietnamese user guide and contributor guide rewritten for 1.0.1.
