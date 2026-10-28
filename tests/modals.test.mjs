/**
 * User-facing dialogs: manager, statistics, import/export, studio, selection and
 * custom study. Dialogs are opened through the real commands so the whole wiring
 * (command → modal → plugin data layer) is covered.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  installDom, loadBundle, makePlugin, createApp, textOf
} from "./helpers/harness.js";

installDom();

const { PluginClass, stub } = loadBundle();
const OUTPUT = "06 - Flashcards";
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

function seedDeck(app, name, cards, sourcePath = "inbox/src.md") {
  app.vault.files.set(`${OUTPUT}/${name}.md`, `\`\`\`pdl-flashcards\n${JSON.stringify({ title: name, sourcePath, cards }, null, 2)}\n\`\`\``);
}

async function boot(files = { "inbox/src.md": "# Source" }, settings = {}) {
  const app = createApp(files);
  const plugin = makePlugin(PluginClass, stub, { app });
  const commands = {};
  plugin.registerView = () => {};
  plugin.addSettingTab = () => {};
  plugin.addRibbonIcon = () => {};
  plugin.registerEvent = () => {};
  plugin.registerDomEvent = () => {};
  plugin.registerMarkdownCodeBlockProcessor = () => {};
  plugin.addCommand = command => { commands[command.id] = command; };
  plugin.ensureOutputFolder = async () => {};
  plugin.autoBackup = async () => {};
  await plugin.onload();
  Object.assign(plugin.settings, settings);
  plugin.applyLanguage?.();
  stub.openedModals.length = 0;
  return { app, plugin, commands, lastModal: () => stub.openedModals.at(-1) };
}

const buttonByText = (root, text) => root.querySelectorAll("button").find(button => textOf(button).includes(text));
const buttonByLabel = (root, label) => root.querySelectorAll("button").find(button => String(button.attrs["aria-label"] || "").includes(label));

const basicCards = (prefix, count) => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}${index}`,
  type: "basic",
  question: `${prefix} question ${index}`,
  answer: `answer ${index}`,
  tags: ["tag" + (index % 2)]
}));

test("manager lists cards, searches, filters and paginates", async () => {
  const { app, commands, lastModal } = await boot();
  seedDeck(app, "big", basicCards("card", 30));
  await commands["open-manager"].callback();
  const modal = lastModal();
  assert.equal(modal.cards.length, 30);
  assert.equal(modal.contentEl.querySelectorAll(".pdl-manager-row").length, 26, "25 rows + header");
  assert.match(textOf(modal.contentEl), /Page 1 of 2/);

  modal.query = "question 7";
  modal.renderResults();
  assert.equal(modal.getFiltered().length, 1);
  assert.equal(modal.contentEl.querySelectorAll(".pdl-manager-row").length, 2, "one result + header");

  modal.query = "";
  modal.type = "cloze";
  modal.renderResults();
  assert.match(textOf(modal.contentEl), /No matching flashcards/);
});

test("manager suspend button toggles availability and reloads the row", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  seedDeck(app, "deck", basicCards("c", 2));
  await commands["open-manager"].callback();
  const modal = lastModal();
  const card = (await plugin.getCards()).find(item => item.id === "c0");
  const suspend = buttonByLabel(modal.contentEl, `Suspend ${card.question}`);
  assert.ok(suspend, "suspend action rendered");
  await suspend.onclick();
  assert.equal(plugin.settings.schedule.c0.suspended, true);
  assert.match(textOf(modal.contentEl), /SUSPENDED/);

  const unsuspend = buttonByLabel(modal.contentEl, `Unsuspend ${card.question}`);
  await unsuspend.onclick();
  assert.equal(plugin.settings.schedule.c0.suspended, false);
});

test("manager delete and edit actions open their dialogs", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  seedDeck(app, "deck", basicCards("c", 1));
  await commands["open-manager"].callback();
  const modal = lastModal();
  const card = (await plugin.getCards())[0];
  buttonByLabel(modal.contentEl, `Edit ${card.question}`).onclick();
  assert.ok(lastModal().values, "edit dialog opened with values");
  assert.equal(lastModal().values.question, card.question);

  buttonByLabel(modal.contentEl, `Delete ${card.question}`).onclick();
  assert.match(textOf(lastModal().contentEl), /Delete this flashcard\?/);
});

test("statistics computes KPIs from cards, schedules and reviews", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  seedDeck(app, "deck", [
    { id: "due", question: "Due", answer: "A" },
    { id: "mature", question: "Mature", answer: "A" },
    { id: "lapsed", question: "Lapsed", answer: "A" }
  ]);
  plugin.settings.schedule = {
    mature: { interval: 30, due: Date.now() + 86400000 },
    lapsed: { interval: 2, due: 0, lapses: 4, reps: 5, suspended: false }
  };
  plugin.settings.reviews = [
    { cardId: "mature", grade: 3, at: Date.now() },
    { cardId: "lapsed", grade: 1, at: Date.now() },
    { cardId: "unknown", grade: 4, at: Date.now() }
  ];
  await commands["open-statistics"].callback();
  const modal = lastModal();
  const data = modal.getData();
  assert.equal(data.due, 2, "card without schedule + past-due lapsed card");
  assert.equal(data.newCards, 1);
  assert.equal(data.mature, 1);
  assert.equal(data.retention, 50, "one of two known recent reviews was Hard or better");
  assert.equal(data.recent.length, 2, "reviews for missing cards ignored");
  assert.equal(data.difficult[0].card.id, "lapsed");
  assert.match(textOf(modal.contentEl), /Statistics Dashboard/);
  assert.match(textOf(modal.contentEl), /50%/);
});

test("statistics range buttons re-render the activity window", async () => {
  const { commands, lastModal } = await boot();
  await commands["open-statistics"].callback();
  const modal = lastModal();
  assert.equal(modal.range, 30);
  buttonByText(modal.contentEl, "14D").onclick();
  assert.equal(modal.range, 14);
  assert.equal(modal.getData().days.length, 14);
});

test("statistics edit button opens the card editor", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  seedDeck(app, "deck", [{ id: "bad", question: "Hard card", answer: "A" }]);
  plugin.settings.schedule = { bad: { interval: 1, due: 0, lapses: 3, reps: 3 } };
  await commands["open-statistics"].callback();
  const modal = lastModal();
  buttonByLabel(modal.contentEl, "Edit Hard card").onclick();
  assert.equal(lastModal().values.question, "Hard card");
});

test("export writes a CSV with escaped quotes and the chosen deck scope", async () => {
  const { app, commands, lastModal } = await boot();
  seedDeck(app, "alpha", [{ id: "a", question: 'Say "hi", please', answer: "Line 1", type: "basic", explanation: 'An "explanation"', tags: ["x", "y"] }]);
  seedDeck(app, "beta", [{ id: "b", question: "Beta", answer: "B" }], "inbox/b.md");
  await commands["import-export"].callback();
  const modal = lastModal();
  const [format, deck] = modal.contentEl.querySelectorAll("select");
  format.value = "csv";
  deck.value = "all";
  let download = null;
  modal.downloadFile = (name, text, mime) => { download = { name, text, mime }; };

  buttonByText(modal.contentEl, "Download Export File").onclick();
  assert.equal(download.name, "pdl-flashcards-export.csv");
  assert.equal(download.mime, "text/csv");
  assert.match(download.text, /^Question,Answer,Type,Explanation,Tags,DeckTitle\n/);
  assert.match(download.text, /"Say ""hi"", please"/, "quotes doubled");
  assert.equal((download.text.match(/\n/g) || []).length, 3, "header + two cards");

  deck.value = `${OUTPUT}/beta.md`;
  buttonByText(modal.contentEl, "Download Export File").onclick();
  assert.equal((download.text.match(/\n/g) || []).length, 2, "header + one card");
});

test("import parses CSV and creates a deck note", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  await commands["import-export"].callback();
  const modal = lastModal();
  buttonByText(modal.contentEl, "Import Cards").onclick();
  modal.contentEl.querySelectorAll("textarea")[0].value = 'Question,Answer,Type,Explanation,Tags\n"What is 2+2?","4",basic,"math","math"\n"What is 3+3?","6",basic,"",""\n';
  await modal.contentEl.querySelectorAll(".mod-cta")[0].onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 2);
  assert.equal(cards[0].question, "What is 2+2?");
  assert.deepEqual(cards[0].tags, ["math"]);
  assert.match(cards[0].file.path, /Imported Deck\.md$/);
  const raw = app.vault.files.get(cards[0].file.path);
  assert.match(raw, /generated_by: import/);
});

test("import parses JSON payloads and reports unusable data", async () => {
  const { commands, lastModal, plugin } = await boot();
  await commands["import-export"].callback();
  const modal = lastModal();
  buttonByText(modal.contentEl, "Import Cards").onclick();
  modal.contentEl.querySelectorAll("textarea")[0].value = JSON.stringify({ cards: [
    { type: "basic", question: "JSON Q", answer: "JSON A", tags: ["json"] },
    { type: "cloze", question: "The {{c1::cell}} is small", answer: "" }
  ] });
  await modal.contentEl.querySelectorAll(".mod-cta")[0].onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 2);
  assert.equal(cards[1].answer, "cell");

  stub.notices.length = 0;
  await commands["import-export"].callback();
  const second = lastModal();
  buttonByText(second.contentEl, "Import Cards").onclick();
  second.contentEl.querySelectorAll("textarea")[0].value = "justonecolumn";
  await second.contentEl.querySelectorAll(".mod-cta")[0].onclick();
  assert.ok(stub.notices.some(note => note.includes("No valid cards")));
});

test("studio saves valid cards and skips incomplete ones", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  const create = commands["create-deck-active-note"];
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/src.md");
  create.checkCallback(false);
  const modal = lastModal();
  modal.cards = [
    { type: "basic", question: "Valid Q", answer: "Valid A", explanation: "", tags: ["t"], choices: ["", "", "", ""] },
    { type: "basic", question: "Only question", answer: "", explanation: "", tags: [], choices: ["", "", "", ""] }
  ];
  modal.render();
  await buttonByText(modal.contentEl, "Save to").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 1, "incomplete card skipped");
  assert.equal(cards[0].question, "Valid Q");
  const raw = app.vault.files.get(cards[0].file.path);
  assert.match(raw, /generated_by: manual-or-ai-reviewed/);
});

test("studio refuses a broken multiple-choice card", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  stub.notices.length = 0;
  const create = commands["create-deck-active-note"];
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/src.md");
  create.checkCallback(false);
  const modal = lastModal();
  modal.cards = [{
    type: "multiple-choice",
    question: "Broken?",
    answer: "A",
    choices: ["A", "B", "", ""],
    explanation: "",
    tags: []
  }];
  modal.render();
  await buttonByText(modal.contentEl, "Save to").onclick();
  assert.ok(stub.notices.some(note => note.includes("exactly four choices")));
  assert.equal((await plugin.getCards()).length, 0);
});

test("studio appends to the deck already linked to the source note", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  seedDeck(app, "existing", [{ id: "old", type: "basic", question: "Old", answer: "A" }], "inbox/src.md");
  const create = commands["create-deck-active-note"];
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/src.md");
  create.checkCallback(false);
  const modal = lastModal();
  modal.cards = [{ type: "basic", question: "New one", answer: "A", explanation: "", tags: [], choices: ["", "", "", ""] }];
  modal.render();
  await buttonByText(modal.contentEl, "Save").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 2);
  assert.equal(cards.filter(card => card.question === "New one").length, 1);
  assert.equal(app.vault.files.has(`${OUTPUT}/existing.md`), true, "no duplicate deck created");
});

test("studio truncates a long deck name in the save button and keeps a tooltip", async () => {
  const { app, commands, lastModal } = await boot();
  const longName = "A very long deck name that should never widen the footer";
  const create = commands["create-deck-active-note"];
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/src.md");
  create.checkCallback(false);
  const modal = lastModal();
  modal.deckScanStarted = true;
  modal.targetDeckFile = { path: `${OUTPUT}/${longName}.md`, basename: longName };
  modal.render();

  const save = buttonByText(modal.contentEl, "Add to");
  assert.ok(save, "append button rendered");
  assert.match(textOf(save), /…$/, "deck name truncated");
  assert.ok(textOf(save).length <= "Add to ".length + 28, "button stays compact");
  assert.equal(save.attrs.title, `Add to ${longName}`, "full name kept in the tooltip");
});

test("dialogs follow the selected language", async () => {
  const { app, commands, lastModal } = await boot({ "inbox/src.md": "# Source" }, { language: "vi" });
  seedDeck(app, "deck", basicCards("c", 1));
  await commands["open-manager"].callback();
  assert.match(textOf(lastModal().contentEl), /Quản lý flashcard/);
  await commands["open-statistics"].callback();
  assert.match(textOf(lastModal().contentEl), /Bảng thống kê/);
});

test("selection dialog detects an existing deck and reports a new one otherwise", async () => {
  const { app, commands, lastModal } = await boot();
  seedDeck(app, "linked", [{ id: "l", question: "Q", answer: "A" }], "inbox/src.md");
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/src.md");
  app.workspace.activeEditor = { editor: { getSelection: () => "  The selected passage.  " } };
  const command = commands["ai-from-selection"];
  assert.equal(command.checkCallback(true), true);
  command.checkCallback(false);
  await tick();
  const modal = lastModal();
  assert.equal(modal.selectedText, "The selected passage.");
  assert.equal(modal.targetDeckFile.path, `${OUTPUT}/linked.md`);
  assert.match(textOf(modal.contentEl), /already has the deck "linked"/);
  assert.match(textOf(modal.contentEl), /21 characters selected/);

  app.vault.files.delete(`${OUTPUT}/linked.md`);
  command.checkCallback(false);
  await tick();
  assert.match(textOf(lastModal().contentEl), /a new deck will be created/);
});

test("selection dialog hands the excerpt to the studio without auto-running AI", async () => {
  const { app, commands, lastModal } = await boot();
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/src.md");
  app.workspace.activeEditor = { editor: { getSelection: () => "Short excerpt" } };
  commands["ai-from-selection"].checkCallback(false);
  await tick();
  const selection = lastModal();

  const original = window.setTimeout;
  const scheduled = [];
  window.setTimeout = (fn, ms) => { scheduled.push(ms); return 0; };
  try {
    buttonByText(selection.contentEl, "Generate flashcards").onclick();
  } finally {
    window.setTimeout = original;
  }
  const studio = lastModal();
  assert.notEqual(studio, selection);
  assert.equal(studio.selectedText, "Short excerpt");
  assert.deepEqual(scheduled, [150, 300], "deck scan and auto-generation are deferred");
});

test("custom study filters by lapses, tag and deck then starts a cram session", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  seedDeck(app, "deck", [
    { id: "a", question: "A", answer: "A", tags: ["ops"] },
    { id: "b", question: "B", answer: "B", tags: ["dev"] },
    { id: "c", question: "C", answer: "C", tags: ["ops"] }
  ]);
  plugin.settings.schedule = { a: { interval: 1, lapses: 2, due: 0 } };
  const started = [];
  plugin.getView = () => ({ startSession(pool, forceAll) { started.push({ pool, forceAll }); } });

  await commands["custom-study"].callback();
  await tick();
  const modal = lastModal();
  assert.equal(modal.cards.length, 3);

  modal.mode = "lapsed";
  modal.render();
  buttonByText(modal.contentEl, "Start Custom Session").onclick();
  assert.deepEqual(started.at(-1).pool.map(card => card.id), ["a"]);
  assert.equal(started.at(-1).forceAll, true);

  await commands["custom-study"].callback();
  await tick();
  const byTag = lastModal();
  byTag.mode = "by_tag";
  byTag.render();
  byTag.selectedTag = "ops";
  buttonByText(byTag.contentEl, "Start Custom Session").onclick();
  assert.deepEqual(started.at(-1).pool.map(card => card.id), ["a", "c"]);

  await commands["custom-study"].callback();
  await tick();
  const byDeck = lastModal();
  byDeck.selectedDeckPath = `${OUTPUT}/deck.md`;
  buttonByText(byDeck.contentEl, "Start Custom Session").onclick();
  assert.equal(started.at(-1).pool.length, 3);
});

test("custom study reports when the criteria match nothing", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  seedDeck(app, "deck", [{ id: "a", question: "A", answer: "A", tags: ["x"] }]);
  const started = [];
  plugin.getView = () => ({ startSession(pool) { started.push(pool); } });
  stub.notices.length = 0;
  await commands["custom-study"].callback();
  await tick();
  const modal = lastModal();
  modal.mode = "by_tag";
  modal.render();
  modal.selectedTag = "absent";
  buttonByText(modal.contentEl, "Start Custom Session").onclick();
  assert.equal(started.length, 0);
  assert.ok(stub.notices.some(note => note.includes("No cards match")));
});
