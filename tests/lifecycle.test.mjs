/**
 * Plugin lifecycle: settings migration/deep-merge, command availability, the
 * deck code-block renderer, backups and "open or create for note".
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  El, installDom, loadBundle, makePlugin, createApp, textOf
} from "./helpers/harness.js";

installDom();

const { PluginClass, stub } = loadBundle();

async function boot({ saved = null, files = { "inbox/a.md": "# A" }, backup = false } = {}) {
  const app = createApp(files);
  const plugin = makePlugin(PluginClass, stub, { app });
  plugin._data = saved;
  const commands = [];
  const events = [];
  const processors = [];
  const tabs = [];
  plugin.registerView = () => {};
  plugin.addSettingTab = tab => tabs.push(tab);
  plugin.addRibbonIcon = () => {};
  plugin.registerEvent = handler => events.push(handler);
  plugin.registerMarkdownCodeBlockProcessor = (language, handler) => processors.push({ language, handler });
  plugin.addCommand = command => commands.push(command);
  plugin.ensureOutputFolder = async () => {};
  if (!backup) plugin.autoBackup = async () => {};
  await plugin.onload();
  return { app, plugin, commands, events, processors, tabs };
}

test("onload migrates old settings and deep-merges the AI block", async () => {
  const { plugin } = await boot({
    saved: {
      outputFolder: "Custom folder",
      ai: { provider: "deepseek", apiKey: "sk-legacy", endpoint: "https://legacy.test/chat", model: "legacy-model" }
    }
  });
  assert.equal(plugin.settings.schemaVersion, 3, "schema upgraded");
  assert.equal(plugin.settings.outputFolder, "Custom folder", "user folder kept");
  assert.deepEqual(plugin.settings.schedule, {});
  assert.deepEqual(plugin.settings.reviews, []);
  assert.equal(plugin.settings.ai.provider, "deepseek");
  assert.equal(plugin.settings.ai.apiKeys.openai, "sk-legacy", "legacy key copied into the provider map");
  assert.equal(plugin.settings.ai.endpoints.openai, "https://api.openai.com/v1/chat/completions", "default endpoint map kept");
  assert.equal(plugin.settings.ai.models.openai, "gpt-4o-mini", "default model map kept");
  assert.equal(plugin.settings.ai.endpoints.deepseek, "https://api.deepseek.com/chat/completions", "defaults preserved");
  assert.equal(plugin.settings.ai.apiKeys.gemini, "");
});

test("onload defaults to English and five decks per page", async () => {
  const { plugin } = await boot();
  assert.equal(plugin.settings.language, "en");
  assert.equal(plugin.settings.decksPerPage, 5);
});

test("the settings tab renders and wires the language and page-size controls", async () => {
  const { tabs, plugin } = await boot();
  assert.equal(tabs.length, 1);
  stub.Setting.instances.length = 0;
  assert.doesNotThrow(() => tabs[0].display());

  const language = stub.Setting.instances.find(setting => setting.controls.some(control => control.kind === "dropdown"));
  assert.ok(language?.onChange, "language dropdown has a change handler");
  await language.onChange("vi");
  assert.equal(plugin.settings.language, "vi");
  assert.equal(plugin.settings.decksPerPage, 5);

  const pageSize = stub.Setting.instances.find(setting => setting.controls.some(control => control.kind === "slider" && control.api.setLimits));
  assert.ok(pageSize?.onChange, "deck page-size slider has a change handler");
  await pageSize.onChange(12);
  assert.equal(plugin.settings.decksPerPage, 12);
});

test("onload upgrades built-in prompts with the formatting rules but leaves custom prompts alone", async () => {
  const { plugin } = await boot({
    saved: {
      schemaVersion: 3,
      aiPrompts: [
        { id: "default", name: "Default", template: "Old default prompt." },
        { id: "mine", name: "Mine", template: "Only my words." }
      ]
    }
  });
  const [builtIn, custom] = plugin.settings.aiPrompts;
  assert.match(builtIn.template, /Old default prompt\./);
  assert.match(builtIn.template, /Output formatting rules/, "formatting rules appended");
  assert.equal(custom.template, "Only my words.", "custom prompt untouched");
});

test("onload does not append the formatting rules twice", async () => {
  const template = "Prompt.\n\nOutput formatting rules (important):\n- be nice";
  const { plugin } = await boot({
    saved: { schemaVersion: 3, aiPrompts: [{ id: "default", name: "Default", template }] }
  });
  assert.equal(plugin.settings.aiPrompts[0].template, template);
  assert.equal((plugin.settings.aiPrompts[0].template.match(/Output formatting rules/g) || []).length, 1);
});

test("onload registers every user-facing command and both context menus", async () => {
  const { commands, events, processors } = await boot();
  const ids = commands.map(command => command.id);
  for (const id of ["open", "quick-review", "custom-study", "import-export", "create-deck", "create-deck-active-note", "open-or-create-active-note", "ai-from-selection", "open-manager", "open-statistics"]) {
    assert.ok(ids.includes(id), `command ${id}`);
  }
  assert.equal(events.length, 2, "file menu + editor menu");
  assert.deepEqual(processors.map(item => item.language), ["pdl-flashcards"]);
});

test("command availability follows the active note's location", async () => {
  const { app, commands, plugin } = await boot();
  stub.openedModals.length = 0;
  const create = commands.find(command => command.id === "create-deck-active-note");

  app.workspace.activeFile = { path: "inbox/a.md", extension: "md", basename: "a" };
  assert.equal(create.checkCallback(true), true);
  assert.equal(stub.openedModals.length, 0, "checking does not open a dialog");
  create.checkCallback(false);
  assert.equal(stub.openedModals.length, 1, "running it opens the studio");

  app.workspace.activeFile = { path: `${plugin.settings.outputFolder}/deck.md`, extension: "md" };
  assert.equal(create.checkCallback(true), false, "deck notes are not sources");

  app.workspace.activeFile = { path: "inbox/photo.png", extension: "png" };
  assert.equal(create.checkCallback(true), false, "non-markdown files are not sources");
});

test("isEligibleSource accepts markdown outside the output folder only", async () => {
  const { plugin } = await boot();
  assert.equal(plugin.isEligibleSource({ path: "inbox/a.md", extension: "md" }), true);
  assert.equal(plugin.isEligibleSource({ path: "06 - Flashcards/deck.md", extension: "md" }), false);
  assert.equal(plugin.isEligibleSource({ path: "06 - Flashcards/sub/deck.md", extension: "md" }), false);
  assert.equal(plugin.isEligibleSource({ path: "inbox/a.png", extension: "png" }), false);
  assert.equal(plugin.isEligibleSource(null), false);
});

test("deck code blocks render a preview or an error", async () => {
  const { processors } = await boot();
  const { handler } = processors[0];

  const valid = new El("div");
  handler(JSON.stringify({ title: "My deck", cards: [{}, {}], sourcePath: "inbox/a.md" }), valid);
  assert.match(textOf(valid), /My deck/);
  assert.match(textOf(valid), /2 questions · source: inbox\/a.md/);
  assert.ok(valid.querySelector(".pdl-deck-preview button"), "open button rendered");

  const invalid = new El("div");
  handler("{ nope", invalid);
  assert.match(textOf(invalid), /Invalid flashcard data/);
});

test("autoBackup writes today's snapshot and keeps only 30 files", async () => {
  const { plugin } = await boot({ backup: true });
  const store = new Map();
  const removed = [];
  const backupDir = "pdl-flashcard/backups";
  for (let i = 1; i <= 31; i++) {
    store.set(`${backupDir}/data-2024-01-${String(i).padStart(2, "0")}.json`, "{}");
  }
  plugin.app.vault.adapter = {
    async exists(path) { return store.has(path) || path === backupDir; },
    async mkdir() {},
    async write(path, content) { store.set(path, content); },
    async remove(path) { removed.push(path); store.delete(path); },
    async list(dir) {
      return { files: [...store.keys()].filter(path => path.startsWith(`${dir}/`)), folders: [] };
    }
  };
  await plugin.autoBackup();
  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  assert.equal(store.size, 30, "oldest snapshots pruned");
  assert.ok(store.has(`${backupDir}/data-${stamp}.json`), "today's snapshot written");
  assert.equal(removed.length, 2);
  assert.ok(!store.has(`${backupDir}/data-2024-01-01.json`), "oldest removed first");
});

test("openOrCreateForNote opens the studio when a note has no deck", async () => {
  const { app, plugin } = await boot();
  stub.openedModals.length = 0;
  const file = app.vault.getAbstractFileByPath("inbox/a.md");
  await plugin.openOrCreateForNote(file);
  const modal = stub.openedModals.at(-1);
  assert.ok(modal, "studio opened");
  assert.equal(modal.sourcePath, "inbox/a.md");
});

test("openOrCreateForNote starts a session with the cards linked to the note", async () => {
  const { app, plugin } = await boot();
  app.vault.files.set("06 - Flashcards/a deck.md", `\`\`\`pdl-flashcards\n${JSON.stringify({
    sourcePath: "inbox/a.md",
    cards: [
      { id: "one", question: "Q1", answer: "A1" },
      { id: "two", question: "Q2", answer: "A2" },
      { id: "other", question: "Q3", answer: "A3" }
    ]
  })}\n\`\`\``);
  const started = [];
  plugin.getView = () => ({ cards: [], async refresh() { this.cards = await plugin.getCards(); }, startSession(pool) { started.push(pool); } });
  const file = app.vault.getAbstractFileByPath("inbox/a.md");
  await plugin.openOrCreateForNote(file);
  assert.equal(started.length, 1);
  assert.equal(started[0].length, 3, "all cards from the linked deck are used");
});

test("openOrCreateForNote rejects deck notes and missing files", async () => {
  const { plugin } = await boot();
  stub.notices.length = 0;
  await plugin.openOrCreateForNote({ path: "06 - Flashcards/deck.md", extension: "md" });
  assert.ok(stub.notices.some(note => note.includes("Markdown source note")));
});

test("activateView creates the view leaf when none exists", async () => {
  const { app, plugin } = await boot();
  await plugin.activateView();
  assert.equal(app._viewStates.length, 1);
  assert.equal(app._viewStates[0].type, "pdl-flashcard-view");
  assert.equal(app._viewStates[0].active, true);
});
