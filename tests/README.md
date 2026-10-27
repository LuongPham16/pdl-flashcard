# Test suite

Behaviour tests for PDL Flashcard. They load the **built bundle** (`dist/main.js`)
with a small Obsidian stub, so the esbuild output is what gets exercised — the same
file Obsidian loads.

```bash
npm run build          # dist/main.js must be current
npm test               # one process per file (Node's default isolation)
npm run test:inproc    # all files in one process (Node 22+, sandbox friendly)
```

## Files

| File | Covers |
| --- | --- |
| `plugin.test.mjs` | Bundle exports, onload wiring, core scheduler/storage/render smoke tests |
| `scheduler.test.mjs` | Grade curves, interval cap, review log/streak, leech, suspend/bury |
| `storage.test.mjs` | Deck parsing, append/update/delete, filename sanitising, card normalisation |
| `ai.test.mjs` | Prompt assembly, OpenAI/Gemini/Claude payloads, JSON parsing, truncation |
| `view.test.mjs` | Dashboard stats/search/heatmap, session selection, grading, requeue, undo, keyboard |
| `formatting.test.mjs` | Command/config detection, code blocks, cloze rendering, TTS |
| `lifecycle.test.mjs` | Settings migration, command availability, code-block preview, backups |
| `modals.test.mjs` | Manager, statistics, import/export, studio, selection, custom study |

## Helpers

- `helpers/harness.js` — fake DOM (`El`), fake vault/app, bundle loader, `createView`.
- `helpers/obsidian-stub.js` — the slice of the Obsidian API the plugin touches.
  `Modal.open()` awaits `onOpen` and records instances in `openedModals`; network
  calls are gated through the mutable `requestUrlState`.
