# Contributing to PDL Flashcard

Thanks for helping improve the plugin. This project is plain JavaScript bundled for
Obsidian; small, focused pull requests are easiest to review.

## Getting set up

```bash
npm install
npm run build
npm test
```

Requires Node 18+ (developed on Node 24). `npm run deploy` copies the build into the
vault configured in `.deploy.json` or `OBSIDIAN_VAULT` / `OBSIDIAN_PLUGIN_DIR`.

## Before opening a pull request

1. Run `npm run build` after changing `src/` or `styles.css`. The tests run against
   `dist/main.js`, not the source modules.
2. Run `npm test`. In restricted sandboxes where per-file child processes are blocked,
   use `npm run test:inproc`.
3. Run `npm run typecheck` (`tsc --noEmit` over the JavaScript source).
4. Keep the change focused: one feature or fix per PR. Update `CHANGELOG.md` when the
   user-visible behaviour changes.

## Architecture

- `src/index.js` is the only bundle entry. esbuild emits CommonJS with
  `module.exports = PDLFlashcardPlugin`.
- `src/plugin.js` owns the `Plugin` subclass: lifecycle, commands, menus, view
  registration, source-folder policy and settings normalization.
- `storage.js`, `review.js` and `ai.js` export classes whose methods are applied to the
  plugin prototype by `applyMixin`. Put methods that need `this.settings` / `this.app`
  there; pure helpers belong in `utils.js` or `import-parse.js`.
- `view.js` and `modals/` receive the plugin instance and call its methods. They must not
  own persisted data.
- Deck data lives in the `pdl-flashcards` JSON block inside a Markdown note. Any change
  to the stored card shape needs a migration in `onload`.
- Source notes must pass `isConfiguredSource()`: Markdown, inside a configured source
  folder, and not inside an excluded/output folder. Use it for every new picker or menu.
- AI-generated tags must be filtered against tags already present on saved cards. Never
  let the model introduce a new tag.

## Code style

- 2-space indentation, double quotes, semicolons.
- No TypeScript-only syntax in `src/`; it must remain valid in the esbuild bundle.
- Comments explain *why*, not *what*.
- No new runtime dependency unless it is small, maintained and bundleable. The plugin
  must load without network access.

## Tests

- Tests use Node's built-in test runner and an Obsidian stub in `tests/helpers/`.
- Cover data-integrity paths: importing, appending to an existing deck, batch failure
  isolation, source-folder filtering, TTS masking and AI tag filtering.
- Add a regression test for every bug fix.

## Releasing

1. Update `CHANGELOG.md` and the README if behaviour or setup changed.
2. Run `npm version patch|minor|major`; the `version` script syncs `manifest.json` and
   `versions.json`.
3. Run `npm run build:prod && npm test`.
4. Push `master` and the version tag. The GitHub Actions release workflow builds and
   attaches `main.js`, `manifest.json` and `styles.css` as individual assets.

## Community registry

The layout follows the
[official submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin):

- `manifest.json` at the repository root with a valid `minAppVersion`;
- `versions.json` mapping plugin versions to minimum app versions;
- a release tag matching `manifest.json`, with the three build files as individual assets;
- MIT license, README and repository name matching the plugin id (`pdl-flashcard`).
