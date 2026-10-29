/**
 * Behaviour tests for the built bundle.
 *
 * These run against dist/main.js (not the source modules) so they also prove the
 * esbuild bundle wires everything together correctly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, loadBundle, makePlugin, createApp, El } from "./helpers/harness.js";

installDom();

const { PluginClass, stub } = loadBundle();

test("bundle exports the plugin class", () => {
  assert.equal(typeof PluginClass, "function");
  assert.ok(PluginClass.prototype.onload, "onload exists");
  assert.ok(PluginClass.prototype.rate, "scheduler mixin is wired");
  assert.ok(PluginClass.prototype.getCards, "storage mixin is wired");
  assert.ok(PluginClass.prototype.requestAICards, "ai mixin is wired");
});

test("onload registers the view, commands and menus", async () => {
  const plugin = makePlugin(PluginClass, stub);
  typeof plugin.registerView;
  const commands = [];
  const events = [];
  plugin.registerView = () => {};
  plugin.addCommand = cmd => commands.push(cmd.id);
  plugin.addSettingTab = () => {};
  plugin.addRibbonIcon = () => {};
  plugin.registerEvent = h => events.push(h);
  plugin.registerMarkdownCodeBlockProcessor = () => {};
  plugin.ensureOutputFolder = async () => {};
  plugin.autoBackup = async () => {};
  await plugin.onload();
  for (const id of ["open", "quick-review", "custom-study", "import-export", "create-deck", "batch-from-folder", "create-deck-active-note", "open-or-create-active-note", "ai-from-selection", "open-manager", "open-statistics"]) {
    assert.ok(commands.includes(id), `command ${id} registered`);
  }
  assert.equal(events.length, 2, "file-menu and editor-menu handlers registered");
});

test("scheduler: interval growth, lapses and max cap", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const card = { id: "c1", question: "Q", answer: "A" };
  await plugin.rate(card, 3);
  const first = plugin.settings.schedule.c1;
  assert.equal(first.reps, 1);
  assert.equal(first.lapses, 0);
  assert.ok(first.interval > 0);
  await plugin.rate(card, 4);
  assert.ok(plugin.settings.schedule.c1.interval > first.interval, "Easy grows the interval");
  await plugin.rate(card, 1);
  assert.equal(plugin.settings.schedule.c1.lapses, 1);
  assert.equal(plugin.settings.schedule.c1.interval, 10 / 1440, "Again resets to a 10 minute step");
  assert.equal(plugin.settings.reviews.length, 3);
});

test("scheduler: leech auto-suspend at the threshold", async () => {
  const plugin = makePlugin(PluginClass, stub, { settings: { leechThreshold: 2 } });
  const card = { id: "leech", question: "bad card", answer: "x" };
  await plugin.rate(card, 1);
  assert.equal(plugin.settings.schedule.leech.suspended, false);
  await plugin.rate(card, 1);
  assert.equal(plugin.settings.schedule.leech.suspended, true, "suspended at threshold");
  assert.equal(plugin.isCardAvailable(card), false);
});

test("suspend and bury keep cards out of the queue", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const card = { id: "s1", question: "Q", answer: "A" };
  assert.equal(plugin.isCardAvailable(card), true);
  await plugin.setSuspended(card, true);
  assert.equal(plugin.isCardAvailable(card), false);
  await plugin.setSuspended(card, false);
  assert.equal(plugin.isCardAvailable(card), true);
  await plugin.buryCard(card);
  assert.equal(plugin.isCardAvailable(card), false);
  const until = plugin.settings.schedule.s1.buriedUntil;
  assert.equal(plugin.isCardAvailable(card, until + 1), true);
});

test("storage: create deck, read it back, append more cards", async () => {
  const plugin = makePlugin(PluginClass, stub);
  plugin.ensureOutputFolder = async () => {};
  const source = { path: "inbox/note.md", basename: "note" };
  const created = await plugin.createDeck(source, [
    { type: "basic", question: "Q1", answer: "A1" },
    { type: "cloze", question: "The {{c1::mitochondria}} is the powerhouse", answer: "" }
  ], "manual");
  const raw = plugin.app.vault.files.get(created.path);
  assert.match(raw, /```pdl-flashcards/);
  assert.match(raw, /card_count: 2/);
  assert.match(raw, /source_path: "inbox\/note.md"/);

  const cards = await plugin.getCards();
  assert.equal(cards.length, 2);
  assert.equal(cards[1].type, "cloze");
  assert.equal(cards[1].answer, "mitochondria", "cloze answer derived from the statement");

  const deckFile = await plugin.findDeckFileForSource("inbox/note.md");
  assert.ok(deckFile, "deck found by source path");
  const result = await plugin.appendCardsToDeck(deckFile, [
    { type: "basic", question: "Q3", answer: "A3" },
    { type: "basic", question: "", answer: "dropped" },
    { type: "multiple-choice", question: "Q4", answer: "B", choices: ["A", "B"] }
  ]);
  assert.equal(result.added, 2, "invalid drafts are skipped, malformed MCQ degrades to basic");
  const after = JSON.parse(plugin.app.vault.files.get(created.path).match(/```pdl-flashcards\s*\n([\s\S]*?)\n```/)[1]);
  assert.equal(after.cards.length, 4);
  assert.match(plugin.app.vault.files.get(created.path), /card_count: 4/);
});

test("storage: createDeck refuses an empty deck", async () => {
  const plugin = makePlugin(PluginClass, stub);
  plugin.ensureOutputFolder = async () => {};
  await assert.rejects(
    () => plugin.createDeck({ path: "a/n.md", basename: "n" }, [{ type: "basic", question: "", answer: "" }], "manual"),
    /No complete flashcards/
  );
});

test("rendering: markdown, images, cloze blanks and highlights", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const ViewClass = (() => {
    let captured = null;
    plugin.registerView = (type, factory) => { captured = factory({}).constructor; };
    plugin.addCommand = () => {}; plugin.addSettingTab = () => {};
    plugin.addRibbonIcon = () => {}; plugin.registerEvent = () => {};
    plugin.registerDomEvent = () => {}; plugin.registerMarkdownCodeBlockProcessor = () => {};
    plugin.ensureOutputFolder = async () => {}; plugin.autoBackup = async () => {};
    return { get: () => captured };
  })();
  await plugin.onload();
  const View = ViewClass.get();
  const view = new View({}, plugin);

  const box = new El("div");
  await view.renderCardText(box, "Look ![[diagram.png]] and $E=mc^2$", { sourcePath: "notes/a.md" });
  assert.match(box.innerHTML, /diagram\.png/, "image embed reaches the renderer");
  assert.match(box.innerHTML, /\$E=mc\^2\$/, "LaTeX reaches the renderer");
  assert.ok(stub.renderedCalls.some(c => c.sourcePath === "notes/a.md"), "source path forwarded");

  const clozeBox = new El("div");
  await view.renderCardText(clozeBox, "The {{c1::mitochondria}} is the powerhouse", { inline: true, cloze: true });
  assert.match(clozeBox.innerHTML, /pdl-cloze-blank/, "blank rendered");
  assert.ok(!/mitochondria/.test(clozeBox.innerHTML), "term hidden before reveal");
  assert.ok(!/PDLCLOZE|PDLBLANK/.test(clozeBox.innerHTML), "no placeholder tokens leak");

  const revealedBox = new El("div");
  await view.renderCardText(revealedBox, "The {{c1::mitochondria}} is the powerhouse", { inline: true, cloze: true, revealed: true });
  assert.match(revealedBox.innerHTML, /<mark class="pdl-cloze-target">mitochondria<\/mark>/);
});
