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
  assert.equal(stub.notices.filter(note => note.includes("quay lại")).length, 2);
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
  assert.ok(stub.notices.some(note => note.includes("hoàn tác")));
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
});
