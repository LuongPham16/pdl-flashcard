# Changelog

All notable changes to **PDL Flashcard** are recorded here.

## [1.1.2] - 2026-11-08

### Security

- Daily backups no longer copy API keys; older backup files are scrubbed once on load.
- CSV export neutralises spreadsheet formulas, so a card starting with =, +, -, @, tab or CR cannot run in Excel or Sheets.

### Docs

- README gains a privacy and security section (what is stored, what is sent to the provider).

## [1.1.1] - 2026-11-08

### Fixed

- Settings tab no longer creates a raw h3; the PDL section heading uses the Setting heading API, which the plugin review requires.
- Debounce timers use window.setTimeout / window.clearTimeout for popout-window compatibility.

## [1.1.0] - 2026-11-08

### Changed

- **AI keys are kept per provider.** The AI tab now shows one key field for OpenAI,
  Gemini, DeepSeek, Claude and a custom endpoint at once; the active provider is
  marked. Switching providers no longer asks you to paste a key again.
- Gemini's default model is now `gemini-3.6-flash`; installs still on the previous
  default are moved over on load.

## [1.0.9] - 2026-11-03

### Added

- **Custom Study filter builder** — searchable multi-deck picker, tag, card type,
  status, rating, limit and order.
- Select any combination of decks, with select-all/clear actions and a 200-row
  visible cap backed by search for large libraries.

### Changed

- Removed Custom Study presets, rating-match scope and added-date filters.
- Review and summary views use a plain white background.
- Deck selection is emphasised and the picker opens on demand instead of showing
  a long checkbox wall.

### Fixed

- Progress bar could stretch into a giant blue overlay across the view and sidebar.
- Obsidian review: replaced `navigator.platform` with the Platform API and replaced
  direct heading elements with `Setting(...).setHeading()`.
- Ribbon icon is constrained to 32×32 with an 18×18 SVG so it cannot expand the
  sidebar.

### Quality

- **173 regression tests** pass.
- Requires Obsidian **1.13.0+**.

## [1.0.8] - 2026-11-02

### Added

- **Learning core** — configurable learning steps, cards per session, daily new/review
  limits, and a resumable session banner.
- **Bulk card manager** — select cards, add/remove tags, move decks, suspend, delete, find
  duplicate questions, and create empty decks.
- **Deck tools** — merge decks and archive/restore decks from the manager.
- **Custom study by rating** — latest or any Again/Hard/Good/Easy rating.
- **MD and XLSX import** with file-type hints; XLSX/TXT/Markdown export in addition to
  CSV/JSON.
- **Empty Source folders default** — read every folder until the user narrows the list.
- **Dedicated Study tab** for review schedule and learning behaviour.
- **Telegram feedback** — @luongpd contact card, GitHub Issues and copyable support info.

### Changed

- Import templates now enforce their selected card type even when the `Type` column is
  blank; invalid MCQ imports are rejected instead of becoming Q&A.
- Statistics deck table uses clearer labels, explanations and mature counts.
- 90-day activity chart aggregates into 7-day columns; all ranges have an empty state.
- Card reading text uses a cleaner sans-serif stack; headings keep the editorial serif.
- Manager action tooltips are short labels.

### Fixed

- Cloze markers no longer make auto-detect choose the `::` delimiter.
- MCQ answer matching is case-insensitive.
- Archived/suspended cards are excluded consistently from ready/mature counts.
- Duplicate correct-answer display, unbalanced cloze buttons and redundant hints remain
  fixed from earlier releases.

### Quality

- **172 regression tests** pass.
- Requires Obsidian **1.13.0+**.

## [1.0.7] - 2026-11-01

### Added

- **Calendar-year heatmap** covering January 1 through December 31, with the year shown
  below and **← / →** navigation between years that have review data.
- **Day review history** — click a heatmap day to see reviews, unique cards, decks, active
  time and rating counts, with search and deck/rating filters.
- **Read-only card details** — click a card in the day history to see its question, choices,
  answer, explanation, tags, deck/source, review counts, last review, due date and interval.
- **Deck and tag filters** in the card manager, alongside the existing type filter.

### Changed

- Statistics **Deck Performance** and **Cards Needing Attention** are paginated instead of
  scrollable: 6 decks and 5 cards per page, with all decks and all lapsed cards included.
- The 30-day reviews KPI uses a lavender accent instead of black.
- Manager action tooltips are short (`Edit`, `Delete`, `Suspend`, `Unsuspend`).

### Fixed

- Heatmap days belong to their real month, so January 31 no longer appears under February.
- Cloze questions in the day history hide `{{c1::…}}` markers.
- The redundant pre-reveal hint and duplicate MCQ correct answer remain removed.

### Quality

- **158 regression tests** pass, including year navigation, day/month coverage, manager
  deck/tag filters and statistics pagination.
- Requires Obsidian **1.13.0+**.

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
