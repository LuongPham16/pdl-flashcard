# PDL Flashcard

AI-assisted flashcards inside [Obsidian](https://obsidian.md). Turn notes — or just a
highlighted passage — into reviewable flashcard decks, then review them with adaptive
spaced repetition.

> **Status:** feature-complete for personal use; not yet submitted to the community
> plugin registry. See [Roadmap](#roadmap).

## Features

**Creating cards**

- **From a note** — pick a source note, let the AI draft cards, edit them, save the deck.
- **From a highlighted passage** — select text in any note, right-click →
  *"Tạo flashcard AI từ đoạn bôi đen"*. Only the excerpt is sent to the model.
- **Manually** — write Q&A, four-choice and cloze cards by hand in Flashcard Studio.
- Five providers: OpenAI, Gemini, DeepSeek, Claude and any OpenAI-compatible endpoint.
- Editable prompt presets with `{basicCount}` / `{mcqCount}` / `{clozeCount}` placeholders.

**Decks and cards**

- Card types: basic, multiple choice, cloze (`{{c1::word}}` or `==word==`).
- Decks are plain Markdown notes with a `pdl-flashcards` JSON block linked back to the
  source note, so they live in the vault and survive without the plugin.
- Adding cards to a note that already has a deck appends to that deck instead of
  creating a second one.
- Full Markdown in card content: images, `![[embeds]]`, LaTeX, wikilinks.

**Reviewing**

- Four grades (Again / Hard / Good / Easy) with its own interval growth curve.
- Forgotten cards are re-shown later in the same session (Anki-style relearning).
- **Undo** any grade with `Ctrl/Cmd+Z` or the ↺ button — schedule, review log, streak
  and the re-queued card are all rolled back.
- **Suspend** and **Bury** per card; suspended/buried cards leave every queue.
- **Leech detection**: a card failed N times is auto-suspended so you rewrite it.
- Custom study (cram / lapsed / by tag), keyboard-first review, TTS reading.

**Tracking**

- Dashboard with due/today/mature/streak, deck list, 26-week activity heatmap.
- Statistics: retention, rating distribution, workload per deck, hardest cards.
- Global card manager with search, type filter, edit, suspend, delete.
- CSV/JSON import and export; automatic `data.json` backups.

## Install

### From a release (recommended)

1. Download `main.js`, `styles.css` and `manifest.json` from the latest release.
2. Put them in `<vault>/.obsidian/plugins/pdl-flashcard/`.
3. Enable **PDL Flashcard** in *Settings → Community plugins*.

### Manual build

```bash
git clone <this-repo> pdl-flashcard
cd pdl-flashcard
npm install
npm run build
```

Then copy `dist/main.js`, `dist/styles.css` and `dist/manifest.json` into
`<vault>/.obsidian/plugins/pdl-flashcard/`.

## Development

```bash
npm install          # install dependencies
npm run dev          # rebuild on change (watch mode)
npm run build        # one-off development build
npm run build:prod   # minified production build
npm test             # run the test suite (Node test runner)
npm run typecheck    # tsc --noEmit over src/
npm run deploy       # build + copy into the vault from .deploy.json
```

`npm run deploy` reads `OBSIDIAN_VAULT` / `OBSIDIAN_PLUGIN_DIR` environment variables,
or a local `.deploy.json`:

```json
{ "vault": "C:\\Users\\you\\Notes", "pluginDir": "pdl-flashcard" }
```

After deploying, reload Obsidian (`Ctrl/Cmd+R`) to load the new build.

### Project layout

```
src/
  index.js              bundle entry (what esbuild compiles)
  plugin.js             Plugin subclass: commands, menus, lifecycle
  constants.js          VIEW_TYPE, DAY, prompt presets, DEFAULTS
  utils.js              pure helpers (text normalisation, command detection)
  formatting.js         card text rendering, code blocks, cloze parsing, TTS
  storage.js            deck read/write, card CRUD          (mixed into the plugin)
  review.js             grading, leech, suspend, bury        (mixed into the plugin)
  ai.js                 provider request layer               (mixed into the plugin)
  settings.js           settings tab
  view.js               ItemView: dashboard, review session, summary
  modals/               one file per dialog
scripts/                build, version sync, deploy
tests/                  Node test runner suites + Obsidian stub
```

The three "mixed into the plugin" modules are classes whose prototypes are applied to
`PDLFlashcardPlugin` by `applyMixin` in `src/plugin.js`. This keeps data, AI and
scheduling logic out of the entry point while still sharing `this.settings` / `this.app`.

## Data and privacy

- All study data lives in `<plugin>/data.json` inside your vault; decks live in the
  output folder as Markdown notes.
- API keys are stored in that `data.json` in plain text (Obsidian has no secret store).
- Card text is only sent to the provider you configure, and only when you press
  *Generate*.
- Automatic backups are written to `<plugin>/backups/` (last 30 kept).

## Roadmap

Planned, roughly in order:

- Export/import that includes the review schedule (survives a machine move).
- Bulk actions in the card manager (multi-select → suspend / tag / delete).
- Query syntax in the manager (`tag:`, `is:due`, `is:suspended`).
- Anki `.apkg` import.
- Multiple cloze deletions (`{{c2::…}}`) per card.
- Per-deck scheduling options (learning steps, daily new/review limits).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
