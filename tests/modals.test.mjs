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
  Object.assign(plugin.settings, { sourceFolders: ["inbox", "notes", "a", "other"] }, settings);
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

test("edit dialog can insert an image from the vault", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  app.vault.files.set("attachments/pic.png", "image-bytes");
  seedDeck(app, "deck", basicCards("c", 1));
  await commands["open-manager"].callback();
  const manager = lastModal();
  const card = (await plugin.getCards())[0];
  buttonByLabel(manager.contentEl, `Edit ${card.question}`).onclick();
  const edit = lastModal();
  edit.inputs.question.value = "Before image";
  const insert = edit.contentEl.querySelector(".pdl-insert-image");
  assert.ok(insert, "image button rendered");
  insert.onclick({ preventDefault() {}, stopPropagation() {} });
  const picker = lastModal();
  assert.match(textOf(picker.contentEl), /pic\.png/);
  picker.contentEl.querySelector(".pdl-image-item").onclick();
  assert.match(edit.inputs.question.value, /Before image\n\n!\[\[attachments\/pic\.png\]\]/);
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
  assert.ok(stub.notices.some(note => note.includes("No flashcards found")));
});

test("batch modal creates decks for all notes in a folder", async () => {
  const { app, commands, lastModal, plugin } = await boot({ "inbox/src.md": "# Source", "inbox/second.md": "# Second" });
  plugin.generateWithAI = async () => [{ type: "basic", question: "What?", answer: "That." }];
  const create = commands["create-deck-active-note"];
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/src.md");
  create.checkCallback(false);
  lastModal().contentEl.querySelector(".pdl-batch-open").onclick();
  const batch = lastModal();
  assert.match(textOf(batch.contentEl), /Create decks from a folder/);
  const folder = batch.contentEl.querySelector(".pdl-batch-folder");
  folder.value = "inbox";
  folder.onchange();
  const checkboxes = batch.contentEl.querySelectorAll(".pdl-batch-note input");
  assert.equal(checkboxes.length, 2, "both notes in the folder are listed");
  assert.equal(checkboxes.every(input => input.checked), true);
  await batch.contentEl.querySelector(".pdl-batch-generate").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 2, "one linked deck created per note");
  assert.deepEqual([...new Set(cards.map(card => card.sourcePath))].sort(), ["inbox/second.md", "inbox/src.md"]);
});

test("import supports tab and double-colon delimiters", async () => {
  const { commands, lastModal, plugin } = await boot();
  const openImport = async () => {
    await commands["import-export"].callback();
    const modal = lastModal();
    buttonByText(modal.contentEl, "Import Cards").onclick();
    return modal;
  };

  const tabModal = await openImport();
  const delimiter = tabModal.contentEl.querySelector(".pdl-import-delimiter");
  assert.ok(delimiter, "delimiter selector rendered");
  delimiter.value = "tab";
  tabModal.contentEl.querySelectorAll("textarea")[0].value = "Tab question\tTab answer\nSecond\tAnswer";
  await tabModal.contentEl.querySelectorAll(".mod-cta")[0].onclick();
  let cards = await plugin.getCards();
  assert.equal(cards.length, 2);

  const colonModal = await openImport();
  colonModal.contentEl.querySelector(".pdl-import-delimiter").value = "double-colon";
  colonModal.contentEl.querySelectorAll("textarea")[0].value = "Colon question::Colon answer";
  await colonModal.contentEl.querySelectorAll(".mod-cta")[0].onclick();
  cards = await plugin.getCards();
  assert.equal(cards.length, 3);
});

test("import selection opens a prefilled review dialog before saving", async () => {
  const { app, plugin, lastModal } = await boot();
  const file = app.vault.getAbstractFileByPath("inbox/src.md");
  await plugin.importSelectedText(file, "Alpha::First\nBeta::Second");

  const modal = lastModal();
  const textarea = modal.contentEl.querySelectorAll("textarea")[0];
  assert.equal(textarea.value, "Alpha::First\nBeta::Second", "selection is prefilled");
  assert.equal(modal.contentEl.querySelector(".pdl-import-target").value, "inbox/src.md", "target note is preselected");
  assert.match(textOf(modal.contentEl), /2 cards ready/);

  await modal.contentEl.querySelector(".pdl-edit-footer .mod-cta").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 2);
  assert.equal(cards.every(card => card.sourcePath === "inbox/src.md"), true);
  assert.deepEqual(cards.map(card => card.question).sort(), ["Alpha", "Beta"]);
});

test("invalid selection still opens the import dialog without an early notice", async () => {
  const { app, plugin, lastModal } = await boot();
  const file = app.vault.getAbstractFileByPath("inbox/src.md");
  stub.notices.length = 0;
  await plugin.importSelectedText(file, "plain prose with no delimiters");
  const modal = lastModal();
  assert.equal(modal.contentEl.querySelectorAll("textarea")[0].value, "plain prose with no delimiters");
  assert.equal(stub.notices.length, 0, "no notice before the user presses Import");
  assert.match(textOf(modal.contentEl), /0 cards ready/);

  await modal.contentEl.querySelector(".pdl-edit-footer .mod-cta").onclick();
  assert.ok(stub.notices.some(note => note.includes("No flashcards found")));
  assert.equal((await plugin.getCards()).length, 0);
});

test("folder pickers only list configured source folders", async () => {
  const { commands, lastModal } = await boot({
    "inbox/src.md": "# Source",
    "_agent/secret.md": "# Agent",
    "notes/outside.md": "# Outside"
  }, { sourceFolders: ["inbox"], excludedFolders: ["_agent"] });

  await commands["import-export"].callback();
  const importModal = lastModal();
  buttonByText(importModal.contentEl, "Import Cards").onclick();
  const targetValues = importModal.contentEl.querySelector(".pdl-import-target").querySelectorAll("option").map(option => option.attrs.value);
  assert.deepEqual(targetValues, ["", "inbox/src.md"]);

  await commands["batch-from-folder"].callback();
  const batch = lastModal();
  const folderValues = batch.contentEl.querySelector(".pdl-batch-folder").querySelectorAll("option").map(option => option.attrs.value);
  assert.equal(folderValues.includes("inbox"), true);
  assert.equal(folderValues.some(value => value.startsWith("_agent") || value.startsWith("notes")), false);
});

test("risk 10: import into a note without a deck creates a linked deck", async () => {
  const { commands, lastModal, plugin } = await boot();
  await commands["import-export"].callback();
  const modal = lastModal();
  buttonByText(modal.contentEl, "Import Cards").onclick();
  modal.contentEl.querySelector(".pdl-import-target").value = "inbox/src.md";
  modal.contentEl.querySelectorAll("textarea")[0].value = "Alpha,Beta";
  await modal.contentEl.querySelector(".pdl-edit-footer .mod-cta").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].sourcePath, "inbox/src.md");
});

test("risk 11: changing the target note before Import uses the latest selection", async () => {
  const { app, commands, lastModal, plugin } = await boot({ "inbox/a.md": "# A", "inbox/b.md": "# B" });
  await commands["import-export"].callback();
  const modal = lastModal();
  buttonByText(modal.contentEl, "Import Cards").onclick();
  const target = modal.contentEl.querySelector(".pdl-import-target");
  target.value = "inbox/a.md";
  modal.contentEl.querySelectorAll("textarea")[0].value = "Alpha,Beta";
  target.value = "inbox/b.md";
  await modal.contentEl.querySelector(".pdl-edit-footer .mod-cta").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].sourcePath, "inbox/b.md");
});

test("risk 12: JSON import ignores the delimiter picker", async () => {
  const { commands, lastModal, plugin } = await boot();
  await commands["import-export"].callback();
  const modal = lastModal();
  buttonByText(modal.contentEl, "Import Cards").onclick();
  modal.contentEl.querySelector(".pdl-import-delimiter").value = "tab";
  modal.contentEl.querySelectorAll("textarea")[0].value = '{"cards":[{"question":"Q","answer":"A"}]}';
  await modal.contentEl.querySelector(".pdl-edit-footer .mod-cta").onclick();
  assert.equal((await plugin.getCards()).length, 1);
});

test("risk 13: standalone imports with the same name create suffixes, not overwrites", async () => {
  const { commands, lastModal, plugin } = await boot();
  for (let run = 0; run < 2; run++) {
    await commands["import-export"].callback();
    const modal = lastModal();
    buttonByText(modal.contentEl, "Import Cards").onclick();
    modal.contentEl.querySelectorAll("textarea")[0].value = "Alpha,Beta";
    await modal.contentEl.querySelector(".pdl-edit-footer .mod-cta").onclick();
  }
  const cards = await plugin.getCards();
  assert.equal(cards.length, 2);
  assert.equal(new Set(cards.map(card => card.file.path)).size, 2);
});

test("risk 14: a selection with the wrong delimiter can be fixed before Import", async () => {
  const { app, plugin, lastModal } = await boot();
  const file = app.vault.getAbstractFileByPath("inbox/src.md");
  await plugin.importSelectedText(file, "Alpha Beta");
  const modal = lastModal();
  assert.match(textOf(modal.contentEl), /0 cards ready/);
  modal.contentEl.querySelector(".pdl-import-delimiter").value = "space";
  await modal.contentEl.querySelector(".pdl-edit-footer .mod-cta").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].question, "Alpha");
});

test("risk 15: a selection import appends to an existing linked deck", async () => {
  const { app, plugin, lastModal } = await boot();
  seedDeck(app, "linked", [{ id: "old", question: "Old", answer: "A" }], "inbox/src.md");
  const file = app.vault.getAbstractFileByPath("inbox/src.md");
  await plugin.importSelectedText(file, "New::Answer");
  await tick();
  const modal = lastModal();
  await modal.contentEl.querySelector(".pdl-edit-footer .mod-cta").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 2);
  assert.equal(cards.every(card => card.file.path === `${OUTPUT}/linked.md`), true);
});

test("risk 16: batch generation only touches selected notes", async () => {
  const { app, commands, lastModal, plugin } = await boot({
    "inbox/a.md": "# A", "inbox/b.md": "# B", "inbox/c.md": "# C"
  });
  plugin.generateWithAI = async () => [{ type: "basic", question: "Q", answer: "A" }];
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/a.md");
  commands["create-deck-active-note"].checkCallback(false);
  lastModal().contentEl.querySelector(".pdl-batch-open").onclick();
  const batch = lastModal();
  const folder = batch.contentEl.querySelector(".pdl-batch-folder");
  folder.value = "inbox";
  folder.onchange();
  const checks = batch.contentEl.querySelectorAll(".pdl-batch-note input");
  assert.equal(checks.length, 3);
  checks[0].checked = false;
  checks[0].onchange();
  await batch.contentEl.querySelector(".pdl-batch-generate").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 2);
  assert.equal(cards.some(card => card.sourcePath === "inbox/a.md"), false);
});

test("risk 17: batch generation appends to an existing deck instead of duplicating it", async () => {
  const { app, commands, lastModal, plugin } = await boot({ "inbox/a.md": "# A", "inbox/b.md": "# B" });
  seedDeck(app, "linked-a", [{ id: "old", question: "Old", answer: "A" }], "inbox/a.md");
  plugin.generateWithAI = async () => [{ type: "basic", question: "Q", answer: "A" }];
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/a.md");
  commands["create-deck-active-note"].checkCallback(false);
  lastModal().contentEl.querySelector(".pdl-batch-open").onclick();
  const batch = lastModal();
  const folder = batch.contentEl.querySelector(".pdl-batch-folder");
  folder.value = "inbox";
  folder.onchange();
  await batch.contentEl.querySelector(".pdl-batch-generate").onclick();
  const cards = await plugin.getCards();
  assert.equal(cards.length, 3, "existing card kept and one appended per note");
  assert.equal(new Set(cards.map(card => card.file.path)).size, 2);
});

test("risk 18: one failed note does not stop the rest of the batch", async () => {
  const { app, commands, lastModal, plugin } = await boot({ "inbox/a.md": "# A", "inbox/b.md": "# B" });
  plugin.generateWithAI = async file => {
    if (file.path.includes("inbox/a.md")) throw new Error("API down");
    return [{ type: "basic", question: "Q", answer: "A" }];
  };
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/a.md");
  commands["create-deck-active-note"].checkCallback(false);
  lastModal().contentEl.querySelector(".pdl-batch-open").onclick();
  const batch = lastModal();
  const folder = batch.contentEl.querySelector(".pdl-batch-folder");
  folder.value = "inbox";
  folder.onchange();
  await batch.contentEl.querySelector(".pdl-batch-generate").onclick();
  assert.equal((await plugin.getCards()).length, 1);
  assert.match(textOf(batch.contentEl), /1 done · 1 failed/);
  assert.match(textOf(batch.contentEl), /API down/);
});

test("import can append into the deck of a selected note", async () => {
  const { app, commands, lastModal, plugin } = await boot();
  seedDeck(app, "linked", [{ id: "old", question: "Old Q", answer: "Old A" }], "inbox/src.md");
  await commands["import-export"].callback();
  const modal = lastModal();
  buttonByText(modal.contentEl, "Import Cards").onclick();
  const target = modal.contentEl.querySelector(".pdl-import-target");
  assert.ok(target, "target note selector rendered");
  target.value = "inbox/src.md";
  target.onchange();
  assert.match(textOf(modal.contentEl), /inbox\/src\.md/);
  modal.contentEl.querySelectorAll("textarea")[0].value = 'Question,Answer\n"New question","New answer"';
  await modal.contentEl.querySelectorAll(".mod-cta")[0].onclick();

  const cards = await plugin.getCards();
  assert.equal(cards.length, 2, "existing card kept and imported card appended");
  assert.equal(cards.every(card => card.sourcePath === "inbox/src.md"), true);
  assert.equal(cards.every(card => card.file.path === `${OUTPUT}/linked.md`), true, "no duplicate standalone deck");
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

test("studio prefills configured card counts and the reverse-card default", async () => {
  const { app, commands, lastModal } = await boot({ "inbox/src.md": "# Source" }, {
    defaultBasicCount: 7,
    defaultMcqCount: 2,
    defaultClozeCount: 1,
    defaultReverseCards: true
  });
  const create = commands["create-deck-active-note"];
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/src.md");
  create.checkCallback(false);
  const modal = lastModal();
  const numbers = modal.contentEl.querySelectorAll("input").filter(input => input.attrs.type === "number");
  assert.deepEqual(numbers.map(input => input.value), ["7", "2", "1"]);
  const checkbox = modal.contentEl.querySelectorAll("input").find(input => input.attrs.type === "checkbox");
  assert.equal(checkbox.checked, true, "reverse default is prefilled");
});

test("the reverse-card toggle keeps its checkbox and text together", async () => {
  const { app, commands, lastModal } = await boot();
  const create = commands["create-deck-active-note"];
  app.workspace.activeFile = app.vault.getAbstractFileByPath("inbox/src.md");
  create.checkCallback(false);
  const toggle = lastModal().contentEl.querySelector(".pdl-reverse-toggle");
  assert.ok(toggle, "reverse toggle wrapper rendered");
  const checkbox = toggle.querySelector("input");
  assert.ok(checkbox, "checkbox is inside the same wrapper");
  assert.equal(checkbox.attrs.type, "checkbox");
  assert.match(textOf(toggle), /Create reverse cards/);
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
