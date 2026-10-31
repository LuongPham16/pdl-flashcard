# PDL Flashcard

**AI-assisted flashcards inside [Obsidian](https://obsidian.md).** Turn a note — or a
highlighted passage — into editable flashcard decks, then review them with adaptive
spaced repetition.

> **Version 1.0.6** · requires Obsidian **1.13.0+** · desktop and mobile · submitted to
> the Obsidian community plugin directory.

## Highlights

- **Draft cards with AI** from a whole note, a highlighted excerpt, or a folder of notes.
- **Review with spaced repetition** — Again / Hard / Good / Easy, relearning, undo,
  suspend, bury, leech detection and custom study.
- **Three card types** — basic Q&A, four-choice MCQ and cloze deletion.
- **Type-the-answer cloze** with optional click-to-reveal letter hints.
- **Images** in questions, answers and explanations, rendered as centred blocks.
- **Read aloud (TTS)** using free system voices, with voice and speed settings.
- **Bilingual interface** — English and Tiếng Việt.
- **Local-first data** — decks are Markdown notes; review state lives in the vault.

## Quick start

1. Install the plugin (see [Install](#install)).
2. Open **Settings → PDL Flashcard → AI**, choose a provider and paste an API key.
3. Open **Settings → PDL Flashcard → General** and confirm **Source folders** and
   **Flashcard folder**.
4. Open a note and run **PDL Flashcard: Create flashcards from active note**, or use
   the brain icon in the ribbon. Assign your own hotkey in *Settings → Hotkeys* if
   you want one.
5. Draft or generate cards in **Flashcard Studio**, then save the deck.
6. Open the dashboard and start **Quick Review**.

## Creating cards

### With AI from one note

Open a source note and run **Create flashcards from active note**. The Studio lets you:

- choose Q&A / MCQ / cloze counts;
- choose a prompt preset;
- create reverse cards;
- edit every draft card before saving.

Only notes inside **Source folders** are offered.

### With AI from a highlighted passage

Select text in a note, right-click and choose **Create AI flashcards from selection**.
Only the excerpt is sent to the provider.

### With AI from a folder

Open **Flashcard Studio → Create decks from a folder**, or run
**PDL Flashcard: Create decks from a folder**:

1. Pick a folder from the configured source folders.
2. Keep **Select all notes**, or tick individual notes.
3. Set counts / prompt, then **Generate**.

Each note gets its own linked deck. Existing decks are appended to; one failed note does
not stop the rest of the batch.

### Manually

**Flashcard Studio** supports writing basic, MCQ and cloze cards by hand, with the same
editor and live preview.

### Images

In the card editor or Studio, press **Image** next to Question / Answer / Explanation:

- choose a vault image or upload one from the computer;
- the image is inserted as its own block, not inline with text;
- rendered images are centred, capped in height and keep their aspect ratio.

### Import

**Import & Export → Import Cards** accepts pasted text or external files:

- Text: CSV, TSV, TXT, JSON
- Files: `.csv`, `.tsv`, `.txt`, `.json`, `.md`, `.xlsx` / `.xlsm`
- Three standard templates: **Basic Q&A**, **Multiple choice**, **Cloze**
- The template adapts its columns to the card type and its separator to the chosen
  delimiter (comma, semicolon, tab, pipe, `::`, space).

Delimited formats:

| Option | Example |
| --- | --- |
| Auto-detect | `::`, tab, comma, semicolon or pipe |
| Comma | `Question,Answer,Type,Explanation` |
| Semicolon | `Question;Answer` |
| Tab | `Question<TAB>Answer` |
| Space | `Question Answer` |
| Double colon | `Question::Answer` |
| Pipe | `Question\|Answer` |

You can save into a **standalone deck** or into the deck of an **existing note**. The
dialog previews how many cards were recognised before you press Import.

A right-click **Import selection as flashcards…** action opens the same dialog prefilled
with the selection, with the current note preselected. Format errors are only reported
when you actually press **Import Cards**.

## Card types

- **Basic** — prompt → answer.
- **Multiple choice** — prompt, four options, one correct answer.
- **Cloze** — `{{c1::word}}` or `==word==`. The review shows an input for each blank;
  click individual masked letters for hints, then check the answer.

## Reviewing

- **Again / Hard / Good / Easy** with per-grade interval growth.
- Forgotten cards can return once more in the same session (configurable).
- **Undo** a grade with `Ctrl/Cmd+Z` or the undo button — schedule, log and streak roll back.
- **Suspend** removes a card from every queue; **Bury** hides it until tomorrow.
- **Leech detection** auto-suspends a card after repeated lapses.
- **Custom study** by deck, tag or lapsed cards; keyboard-first controls.
- **Read aloud** from the card header. Cloze prompts speak masked blanks before reveal;
  MCQ reveals read every choice and the correct answer.

## Dashboard and tracking

- Due / today / mature counts, streak and a 26-week activity heatmap.
- Click the *Less … More* legend to change heatmap colours; click the small shape icon to
  change cells between rounded rectangle, rounded square and heart.
- Deck library with configurable page size and first / previous / page-jump / next / last
  navigation.
- Statistics for retention, rating distribution, workload and hardest cards.
- Card manager with search, type filter, edit, suspend and delete.

## AI providers

| Provider | Notes |
| --- | --- |
| OpenAI | Chat Completions, JSON mode |
| Gemini | `generateContent`, JSON response mode |
| DeepSeek | OpenAI-compatible endpoint |
| Claude | Anthropic Messages API |
| Custom | Any OpenAI-compatible chat endpoint |

- API keys are stored in the plugin's `data.json` inside your vault (plain text).
- Model lists are fetched from the provider where supported; otherwise a known list is
  used.
- Prompt presets support `{basicCount}`, `{mcqCount}` and `{clozeCount}`.
- **Tags:** AI may only reuse tags already present on your saved cards. Invented tags are
  discarded; a card with no matching tag is saved without tags.
- Content is truncated to 50,000 characters per request.

### AI troubleshooting

- **401** — API key missing, expired or wrong for the selected provider.
- **429** — rate limit or quota; wait, reduce counts, or use another provider.
- **503** — provider overloaded; retry later or switch models.
- Batch runs report a per-note status; failed notes do not stop the remaining notes.

## Read aloud (TTS)

- Free: it uses the system speech engine through `speechSynthesis`; the plugin does not
  call a paid TTS API.
- Choose **Auto** (match card language) or a specific system voice, and set speed
  0.5×–2× in **Settings → General → Read aloud (TTS)**.
- **Refresh voices** after installing a speech pack.
- Mixed English/Vietnamese cards use one voice for the whole card (Auto picks Vietnamese
  when Vietnamese characters are present). A sentence-level mixed-voice mode is not yet
  implemented.

## Settings

**General**

- Language (English / Tiếng Việt), decks per page (1–5, max 5 per page)
- Flashcard folder, source folders, excluded folders
- Default Q&A / MCQ / cloze counts and reverse-card default
- Read-aloud voice and speed
- Relearning, leech threshold, interval cap
- Heatmap palette and cell shape

**AI**

- Provider, API key, test connection
- Model and endpoint
- Prompt presets
- Fetch available models

**Feedback**

- Feedback form / email link.

## Commands and menus

- `PDL Flashcard: Open learning dashboard`
- `PDL Flashcard: Start quick review`
- `PDL Flashcard: Custom study session`
- `PDL Flashcard: Create flashcards from a note`
- `PDL Flashcard: Create decks from a folder`
- `PDL Flashcard: Create flashcards from active note`
- `PDL Flashcard: Open or create flashcards for active note`
- `PDL Flashcard: Generate flashcards from selected text`
- `PDL Flashcard: Import or export flashcards`
- `PDL Flashcard: Open flashcard manager`
- `PDL Flashcard: Open statistics dashboard`

File and editor context menus expose **Open or create flashcards**, **Create AI flashcards
from selection** and **Import selection as flashcards…** on eligible source notes.

## Install

### From a release

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Copy them into `<vault>/.obsidian/plugins/pdl-flashcard/`.
3. Enable **PDL Flashcard** in *Settings → Community plugins*.

### From source

```bash
git clone https://github.com/LuongPham16/pdl-flashcard.git
cd pdl-flashcard
npm install
npm run build:prod
```

Copy `dist/main.js`, `dist/styles.css` and `dist/manifest.json` into the plugin folder.

## Data and privacy

- Decks are normal Markdown notes in the flashcard folder, linked to their source note.
- Study state, settings and API keys live in `<plugin>/data.json`.
- The plugin sends card content only to the provider you configure, and only when you
  request generation.
- Automatic backups are written to `<plugin>/backups/` (last 30 kept).
- Treat vault backups and `data.json` as sensitive because they may contain API keys.

## Development

```bash
npm install
npm run dev          # watch build
npm run build        # development build
npm run build:prod   # minified production build
npm run test:inproc  # tests in one process (works in restricted sandboxes)
npm test             # Node test runner
npm run typecheck    # tsc --noEmit over src/
npm run deploy       # build + copy using .deploy.json
```

The test suite runs against the **built bundle**, so rebuild after changing `src/` or
`styles.css`. Current suite: **156 tests**.

### Project layout

```
src/
  index.js              bundle entry
  plugin.js             commands, menus, lifecycle
  constants.js          defaults, prompts, VIEW_TYPE
  utils.js              text normalization and safe JSON helpers
  formatting.js         Markdown rendering, cloze parsing, TTS
  storage.js            deck read/write and card CRUD
  review.js             grading, leech, suspend, bury
  ai.js                 provider request layer and tag policy
  import-parse.js       shared JSON/CSV/TSV/:: parser
  settings.js           tabbed settings UI
  view.js               dashboard, review session, heatmap, pager
  modals/               Studio, batch, edit, import/export, manager, settings dialogs
scripts/                build, version sync, deploy
tests/                  Node test suites and Obsidian stub
```

## Known limitations

- Not in the community plugin registry yet.
- AI generation needs a valid provider key and available quota.
- Vietnamese TTS depends on a compatible SAPI voice being installed and visible to
  Obsidian/Electron.
- Mixed-language TTS uses one voice per card.
- Mobile TTS availability depends on the platform WebView.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and focused pull requests are welcome.

## License

[MIT](LICENSE)
