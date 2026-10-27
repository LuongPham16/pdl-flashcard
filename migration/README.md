# Migration notes

## Splitting the monolith (done once, v2.9.0)

The plugin started life as a single 2,850-line `main.js` (built by hand, no source
modules). It was split into `src/` by `split-monolith.mjs`, which slices the old file
by line range and wraps each slice in an ES module.

This script is **historical**: its line numbers refer to the pre-split file and it will
not run against today's `src/`. It is kept so the split can be audited — every block in
`src/` maps 1:1 to a line range of the old file.

### How the split was chosen

| Module | Old lines | Content |
| --- | --- | --- |
| `constants.js` | 3–97 | `VIEW_TYPE`, `DAY`, prompt presets, `DEFAULTS` |
| `utils.js` | 99–227, 229–300, 302–351 | pure helpers, prose rendering, command detection |
| `formatting.js` | 353–375, 386–490 | code blocks, inline values, cloze parsing, TTS |
| `plugin.js` | 493–646, 648–653, 655–662 | `onload` wiring, menus, commands, lifecycle |
| `storage.js` | 664–847 | deck read/write, card CRUD |
| `ai.js` | 849–868, 871–967 | provider request layer |
| `review.js` | 969–1028 | grading, leech, suspend, bury |
| `view.js` | 1032–1586 | dashboard, review session, summary |
| `modals/*.js` | 1587–2661 | one file per dialog |
| `settings.js` | 2663–2847 | settings tab |

### Two things worth knowing

1. `formatRichCodeAware` was declared **twice** in the monolith (lines 377 and 439).
   The later declaration won at runtime, so only that one was carried over. The dead
   declaration was dropped.
2. The single file defined every plugin method inside one class. The split keeps them
   as separate `StorageMethods` / `ReviewMethods` / `AiMethods` classes and copies their
   prototypes onto the plugin in `src/plugin.js` via `applyMixin` (class methods are
   non-enumerable, so `Object.assign` would copy nothing).

### Verifying the split

`tests/plugin.test.mjs` runs against the **bundled** `dist/main.js`, not against the
modules, so it exercises the same artefact Obsidian loads. Behaviour parity was checked
against the old bundle before it was replaced (scheduler, storage, cloze rendering,
menu/command registration).
