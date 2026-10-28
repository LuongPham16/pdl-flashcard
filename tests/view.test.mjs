/**
 * Dashboard, review session, grading/undo and keyboard flows of the main view.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  El, installDom, loadBundle, makePlugin, createApp, createView, textOf
} from "./helpers/harness.js";

installDom();

const { PluginClass, stub } = loadBundle();
const DAY = 86400000;

const fileFor = path => ({
  path,
  basename: path.split("/").pop().replace(/\.md$/, ""),
  parent: { name: "Flashcards" }
});

function cardObj(id, extra = {}) {
  return {
    id,
    type: "basic",
    question: `Question ${id}`,
    answer: `Answer ${id}`,
    file: fileFor("06 - Flashcards/deck.md"),
    sourceFile: null,
    sourcePath: "inbox/src.md",
    deckTitle: "Deck",
    tags: [],
    ...extra
  };
}

function seedDeck(app, path, cards, sourcePath = "inbox/src.md") {
  app.vault.files.set(path, `\`\`\`pdl-flashcards\n${JSON.stringify({ sourcePath, title: "Deck", cards }, null, 2)}\n\`\`\``);
}

function dayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function makeView(settings = {}, files = {}) {
  const app = createApp({ "inbox/src.md": "# Source", ...files });
  const plugin = makePlugin(PluginClass, stub, { app });
  const view = await createView(plugin, settings);
  return { app, plugin, view };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test("view reports its Obsidian identity", async () => {
  const { view } = await makeView();
  assert.equal(view.getViewType(), "pdl-flashcard-view");
  assert.equal(view.getDisplayText(), "PDL Flashcard");
  assert.equal(view.getIcon(), "brain-circuit");
});

test("dashboard lists decks and the search box filters them", async () => {
  const { app, view } = await makeView({}, {
    "inbox/src.md": "# Source"
  });
  seedDeck(app, "06 - Flashcards/alpha.md", [
    { id: "a", question: "Alpha question", answer: "A" },
    { id: "b", question: "Another alpha", answer: "B" }
  ]);
  seedDeck(app, "06 - Flashcards/beta.md", [{ id: "c", question: "Beta question", answer: "C" }]);
  await view.refresh();
  assert.equal(view.cards.length, 3);
  assert.equal(view.containerEl.querySelectorAll(".pdl-topic-row").length, 2, "one row per deck");

  const input = view.containerEl.querySelectorAll("input").find(el => el.attrs.type === "search");
  assert.ok(input, "search input rendered");
  input.value = "beta";
  input.oninput();
  assert.deepEqual(view.filtered.map(card => card.id), ["c"]);
  assert.equal(view.containerEl.querySelectorAll(".pdl-topic-row").length, 1);

  input.value = "missing";
  input.oninput();
  assert.equal(view.containerEl.querySelectorAll(".pdl-topic-row").length, 0);
  assert.match(textOf(view.containerEl), /No flashcard decks yet|No flashcard decks/);
});

test("dashboard heatmap renders 26 weeks of cells", async () => {
  const { app, view } = await makeView();
  seedDeck(app, "06 - Flashcards/deck.md", [{ id: "a", question: "Q", answer: "A" }]);
  await view.refresh();
  assert.equal(view.containerEl.querySelectorAll(".pdl-heatmap-cell").length, 182);
});

test("getStats counts due, mature, suspended and the day streak", async () => {
  const { plugin, view } = await makeView();
  const cards = ["a", "b", "c", "d"].map(id => cardObj(id));
  view.cards = cards;
  const now = Date.now();
  plugin.settings.schedule = {
    b: { interval: 5, due: now - 1000, reps: 1, lapses: 0 },
    c: { interval: 30, due: now + DAY, reps: 4, lapses: 0 },
    d: { interval: 3, due: now - 5, reps: 1, lapses: 0, suspended: true }
  };
  plugin.settings.reviews = [
    { cardId: "a", grade: 3, at: now },
    { cardId: "b", grade: 4, at: now },
    { cardId: "a", grade: 1, at: now - DAY }
  ];
  plugin.settings.streakDates = [dayKey(0), dayKey(-1), dayKey(-2)];
  const stats = view.getStats();
  assert.equal(stats.due, 2, "new card and one past-due card");
  assert.equal(stats.mature, 1, "only the 30-day card is mature");
  assert.equal(stats.suspended, 1);
  assert.equal(stats.todayReviews, 2);
  assert.equal(stats.streak, 3);
});

test("startSession takes due cards in due order, capped by sessionSize", async () => {
  const { plugin, view } = await makeView();
  plugin.settings.sessionSize = 2;
  const now = Date.now();
  const cards = [cardObj("a"), cardObj("b"), cardObj("c"), cardObj("d")];
  plugin.settings.schedule = {
    a: { interval: 9, due: now + 5 * DAY },
    b: { interval: 4, due: now - 100 },
    c: { interval: 0, due: 0 },
    d: { interval: 2, due: now - 50 }
  };
  view.startSession(cards);
  assert.deepEqual(view.session.map(card => card.id), ["c", "b"], "new/oldest due first, capped at two");
  assert.equal(view.index, 0);
  assert.equal(view.revealed, false);
});

test("startSession falls back to the soonest cards when none are due", async () => {
  const { plugin, view } = await makeView();
  plugin.settings.sessionSize = 2;
  const now = Date.now();
  const cards = [cardObj("a"), cardObj("b"), cardObj("c")];
  plugin.settings.schedule = {
    a: { interval: 3, due: now + 3 * DAY },
    b: { interval: 2, due: now + 1 * DAY },
    c: { interval: 1, due: now + 2 * DAY }
  };
  view.startSession(cards);
  assert.deepEqual(view.session.map(card => card.id), ["b", "c"]);
});

test("forceAll includes future cards but still excludes suspended and buried cards", async () => {
  const { plugin, view } = await makeView();
  const now = Date.now();
  const cards = [cardObj("a"), cardObj("b"), cardObj("c"), cardObj("d")];
  plugin.settings.schedule = {
    a: { interval: 9, due: now + 5 * DAY, suspended: true },
    b: { interval: 9, due: now + 5 * DAY, buriedUntil: now + DAY },
    c: { interval: 9, due: now + 5 * DAY }
  };
  view.startSession(cards, true);
  assert.deepEqual(view.session.map(card => card.id), ["c", "d"]);
});

test("startSession explains when every card is suspended", async () => {
  const { plugin, view } = await makeView();
  stub.notices.length = 0;
  const cards = [cardObj("a")];
  plugin.settings.schedule = { a: { interval: 1, due: 0, suspended: true } };
  view.startSession(cards);
  assert.equal(view.session.length, 0);
  assert.ok(stub.notices.some(note => /suspended or buried/.test(note)));
});

test("Again re-queues a card up to the configured limit", async () => {
  const { plugin, view } = await makeView({ requeueLimit: 2 });
  stub.notices.length = 0;
  const card = cardObj("again");
  view.session = [card];
  view.index = 0;
  view.grades = [];
  view.undoStack = [];
  view.requeueCounts = new Map();

  await view.submitGrade(1);
  assert.equal(view.session.length, 2, "card queued once more");
  await view.submitGrade(1);
  assert.equal(view.session.length, 3, "queued a second time");
  await view.submitGrade(1);
  assert.equal(view.session.length, 3, "limit reached, no third copy");
  assert.equal(view.index, 3);
  assert.deepEqual(view.grades, [1, 1, 1]);
  assert.equal(stub.notices.filter(note => note.includes("will come back")).length, 2);
  assert.match(textOf(view.containerEl), /You recalled 0 of 3 cards/);
});

test("requeueForgotten false leaves Again cards out of the session", async () => {
  const { view } = await makeView({ requeueForgotten: false });
  const card = cardObj("once");
  view.session = [card];
  view.index = 0;
  view.grades = [];
  view.undoStack = [];
  view.requeueCounts = new Map();
  await view.submitGrade(1);
  assert.equal(view.session.length, 1);
  assert.equal(view.index, 1);
});

test("undo restores the schedule, review log, streak and index", async () => {
  const { plugin, view } = await makeView();
  const card = cardObj("undo");
  plugin.settings.schedule = { undo: { interval: 5, reps: 2, lapses: 0, due: 123, lastGrade: 3 } };
  plugin.settings.reviews = [{ cardId: "old", grade: 3, at: 1 }];
  plugin.settings.streakDates = [dayKey(-1)];
  view.session = [card, cardObj("next")];
  view.index = 0;
  view.grades = [];
  view.undoStack = [];
  view.requeueCounts = new Map();

  await view.submitGrade(3);
  assert.equal(plugin.settings.reviews.length, 2);
  assert.ok(plugin.settings.streakDates.includes(dayKey(0)));

  await view.undoLastGrade();
  assert.deepEqual(plugin.settings.schedule.undo, { interval: 5, reps: 2, lapses: 0, due: 123, lastGrade: 3 });
  assert.equal(plugin.settings.reviews.length, 1);
  assert.deepEqual(plugin.settings.streakDates, [dayKey(-1)]);
  assert.equal(view.index, 0);
  assert.deepEqual(view.grades, []);
  assert.equal(view.revealed, false);
});

test("undo re-inserts a fresh card with no schedule and removes the re-queued copy", async () => {
  const { plugin, view } = await makeView();
  const card = cardObj("fresh");
  plugin.settings.schedule = {};
  view.session = [card];
  view.index = 0;
  view.grades = [];
  view.undoStack = [];
  view.requeueCounts = new Map();
  await view.submitGrade(1);
  assert.equal(view.session.length, 2);
  await view.undoLastGrade();
  assert.equal(plugin.settings.schedule.fresh, undefined, "new card's schedule removed again");
  assert.equal(view.session.length, 1);
  assert.equal(view.requeueCounts.get("fresh"), 0);
});

test("undo with an empty stack only reports it", async () => {
  const { view } = await makeView();
  stub.notices.length = 0;
  view.undoStack = [];
  await view.undoLastGrade();
  assert.ok(stub.notices.some(note => note.includes("nothing left to undo")));
});

test("keyboard: space reveals, 1-4 grades, Ctrl+Z undoes, inputs are ignored", async () => {
  const { plugin, view } = await makeView();
  const card = cardObj("keys");
  view.startSession([card]);
  const event = extra => ({ key: " ", target: null, ctrlKey: false, metaKey: false, shiftKey: false, prevented: false, preventDefault() { this.prevented = true; }, ...extra });

  view.keyHandler(event({ key: " " }));
  assert.equal(view.revealed, true, "space reveals the answer");

  const gradeEvent = event({ key: "4" });
  view.keyHandler(gradeEvent);
  assert.equal(gradeEvent.prevented, true);
  await tick();
  assert.equal(plugin.settings.schedule.keys.lastGrade, 4, "number key graded the card");

  const undoEvent = event({ key: "z", ctrlKey: true });
  view.keyHandler(undoEvent);
  await tick();
  assert.equal(plugin.settings.schedule.keys, undefined, "Ctrl+Z rolled the grade back");

  view.revealed = false;
  view.keyHandler(event({ key: " ", target: { tagName: "INPUT" } }));
  assert.equal(view.revealed, false, "typing in an input is never hijacked");
});

test("keyboard: space does not reveal a multiple-choice card", async () => {
  const { view } = await makeView();
  const card = cardObj("mcq", { type: "multiple-choice", choices: ["A", "B", "C", "D"], answer: "A" });
  view.session = [card];
  view.index = 0;
  view.revealed = false;
  view.keyHandler({ key: " ", target: null, preventDefault() {} });
  assert.equal(view.revealed, false);
});

test("summary reports recall and offers another session", async () => {
  const { view } = await makeView();
  view.grades = [4, 3, 2, 1];
  view.undoStack = [];
  view.renderSummary();
  assert.match(textOf(view.containerEl), /You recalled 2 of 4 cards/);
  assert.ok(textOf(view.containerEl).includes("Start another session"));
});

test("renderCardText prefers Obsidian's renderer and forwards the source path", async () => {
  const { view } = await makeView();
  const box = new El("div");
  await view.renderCardText(box, "Hello **world**", { sourcePath: "notes/a.md" });
  assert.match(box.innerHTML, /Hello/);
  assert.equal(stub.renderedCalls.at(-1).sourcePath, "notes/a.md");
  assert.equal(box.classList.contains("pdl-rich"), true);
  assert.match(box.style.fontFamily, /Times New Roman/);
  assert.equal(box.style.fontKerning, "none");
});

test("a basic answer shows the answer label exactly once", async () => {
  const { view } = await makeView();
  view.session = [cardObj("basic")];
  view.index = 0;
  view.revealed = true;
  view.undoStack = [];
  view.renderReview();

  const labels = view.containerEl.querySelectorAll(".pdl-section-label")
    .filter(label => textOf(label) === "CORRECT ANSWER");
  assert.equal(labels.length, 1, "no duplicate answer heading");
  assert.equal(view.containerEl.querySelectorAll(".pdl-card-result").length, 0, "no empty result banner");
});

test("a multiple-choice answer keeps its status banner and answer heading", async () => {
  const { view } = await makeView();
  view.session = [cardObj("mcq", { type: "multiple-choice", choices: ["A", "B", "C", "D"], answer: "A" })];
  view.index = 0;
  view.revealed = true;
  view.selectedChoice = "B";
  view.undoStack = [];
  view.renderReview();

  const result = view.containerEl.querySelector(".pdl-card-result");
  assert.ok(result, "result banner rendered");
  assert.equal(textOf(result.querySelector(".pdl-card-result-status")), "NOT QUITE");
  const rows = result.querySelectorAll(".pdl-mcq-row");
  assert.equal(rows.length, 2, "one row for the choice and one for the answer");
  assert.equal(textOf(rows[0]), "Your choice B");
  assert.equal(rows[0].querySelector(".pdl-mcq-value").classList.contains("is-wrong"), true);
  assert.equal(textOf(rows[1]), "Correct answer A");
  assert.equal(rows[1].querySelector(".pdl-mcq-value").classList.contains("is-correct"), true);
});

test("the review source button uses a short label and keeps the full name in the tooltip", async () => {
  const { view } = await makeView();
  const noteName = "Git Pull Requests, Rebase And Merge Strategy Notes";
  view.session = [cardObj("long-source", { sourceFile: { path: `inbox/${noteName}.md`, basename: noteName } })];
  view.index = 0;
  view.revealed = false;
  view.undoStack = [];
  view.renderReview();

  const button = view.containerEl.querySelector(".pdl-source-button");
  assert.ok(button, "source button rendered");
  assert.equal(textOf(button), "Open note");
  assert.equal(button.attrs.title, noteName, "full note name kept as a tooltip");
  assert.equal(button.attrs["aria-label"], `Open ${noteName}`);
});

test("renderCardText normalizes decomposed Vietnamese before the Markdown pass", async () => {
  const { view } = await makeView();
  const decomposed = "nguồn".normalize("NFD");
  const box = new El("div");
  await view.renderCardText(box, `scp <${decomposed}> <đích>`, { inline: true });
  const markdown = stub.renderedCalls.at(-1).markdown;
  assert.equal(markdown, "scp <nguồn> <đích>");
  assert.doesNotMatch(markdown, /\p{M}/u);
});

test("switching to Vietnamese translates the review UI", async () => {
  const { plugin, view } = await makeView({ language: "vi" });
  view.session = [cardObj("vi", { sourceFile: { path: "inbox/note.md", basename: "note" } })];
  view.index = 0;
  view.revealed = true;
  view.undoStack = [];
  view.renderReview();

  const label = view.containerEl.querySelectorAll(".pdl-section-label")
    .find(item => textOf(item) === "ĐÁP ÁN CHÍNH XÁC");
  assert.ok(label, "Vietnamese answer heading");
  assert.equal(textOf(view.containerEl.querySelector(".pdl-source-button")), "Mở note");

  plugin.settings.language = "en";
  plugin.applyLanguage();
  view.renderReview();
  assert.ok(view.containerEl.querySelectorAll(".pdl-section-label")
    .some(item => textOf(item) === "CORRECT ANSWER"), "English heading after switching back");
  assert.equal(textOf(view.containerEl.querySelector(".pdl-source-button")), "Open note");
});

test("decksPerPage controls how many decks the library shows", async () => {
  const files = { "inbox/src.md": "# Source" };
  for (let i = 1; i <= 12; i++) {
    files[`06 - Flashcards/deck-${String(i).padStart(2, "0")}.md`] =
      `\`\`\`pdl-flashcards\n${JSON.stringify({ sourcePath: "inbox/src.md", cards: [{ id: `d${i}`, question: `Q${i}`, answer: `A${i}` }] })}\n\`\`\``;
  }
  const ten = await makeView({ decksPerPage: 10 }, files);
  assert.equal(ten.view.containerEl.querySelectorAll(".pdl-topic-row").length, 10);
  assert.match(textOf(ten.view.containerEl), /Page 1 of 2/);

  const five = await makeView({}, files);
  assert.equal(five.view.containerEl.querySelectorAll(".pdl-topic-row").length, 5, "default stays 5");
});

test("a long folder name is truncated in the review chapter line", async () => {
  const { view } = await makeView();
  const folder = "A very long folder name that would otherwise push the layout";
  const card = cardObj("long-folder");
  card.file.parent = { name: folder };
  view.session = [card];
  view.index = 0;
  view.revealed = false;
  view.undoStack = [];
  view.renderReview();

  const strong = view.containerEl.querySelector(".pdl-review-chapter strong");
  assert.match(textOf(strong), /…$/);
  assert.ok(textOf(strong).length <= 32, "label stays inside the chapter line");
  assert.equal(strong.attrs.title, folder);
});
