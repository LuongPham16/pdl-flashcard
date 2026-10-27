# Contributing to PDL Flashcard

## Getting set up

```bash
npm install
npm run build
npm test
```

Requires Node 18+ (developed on Node 24). Run `npm run deploy` once `.deploy.json` is
configured to test inside Obsidian.

## Before opening a pull request

1. `npm test` — the suite runs against the **built bundle**, so run
   `npm run build` first if you changed `src/`. On Node 22+ `npm run test:inproc`
   runs all suites in one process, which also works in sandboxes that block the
   test runner's per-file child processes.
2. `npm run typecheck` — `tsc --noEmit` over `src/`. The code is plain JavaScript with
   `allowJs`, so this checks syntax and whatever JSDoc types are present.
3. Keep the change focused. One feature or fix per PR.

## Architecture in one minute

- `src/index.js` is the only entry point; esbuild bundles it to `dist/main.js` as
  CommonJS with `module.exports = PDLFlashcardPlugin` (Obsidian's expectation).
- `src/plugin.js` holds the `Plugin` subclass and nothing else: onload wiring,
  commands, menu items, view registration.
- `storage.js`, `review.js` and `ai.js` export classes whose methods are copied onto
  the plugin prototype. Add a method there when it needs `this.settings` / `this.app`;
  add it to `utils.js` when it is a pure function.
- The view (`view.js`) and modals never own data — they take the plugin instance and
  call its methods.
- Deck data lives in the note itself (`pdl-flashcards` JSON block). Anything that
  changes the stored card shape needs a migration path in `onload`.

## Code style

- 2-space indent, double quotes, semicolons, no TypeScript-only syntax in `src/`
  (it must stay valid in the esbuild bundle).
- Comments explain *why*, not *what*.
- No new dependency unless it is small, maintained, and bundled — the plugin must load
  without network access.

## Releasing

1. Update `CHANGELOG.md`.
2. `npm version patch|minor|major` — the `version` script syncs `manifest.json` and
   `versions.json`.
3. `npm run build:prod && npm test`.
4. Create a GitHub release tagged with the version, and attach the three build
   artifacts from `dist/`: `main.js`, `manifest.json`, `styles.css`.

## Submitting to the community plugin registry

This repo is laid out to satisfy the
[official requirements](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin):

- `manifest.json` at the root with a valid `minAppVersion`.
- `versions.json` mapping plugin versions to minimum app versions.
- A release whose tag matches `manifest.json` and contains `main.js`, `manifest.json`,
  `styles.css` as individual assets (not a zip).
- MIT license, README, and a repository name matching the plugin id (`pdl-flashcard`).
