/**
 * Deck persistence: reading decks out of the vault, appending to them, and the
 * card CRUD paths the manager/editor rely on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, loadBundle, makePlugin } from "./helpers/harness.js";

installDom();

const { PluginClass, stub } = loadBundle();
const OUTPUT = "06 - Flashcards";

/** Write a deck note the way the plugin does: prose + a fenced JSON payload. */
function seedDeck(plugin, path, deck, { before = "", after = "", count = null } = {}) {
  const total = count ?? (Array.isArray(deck.cards) ? deck.cards.length : 0);
  const note = `---\ntype: flashcard-deck\ncard_count: ${total}\n---\n\n${before}# Deck\n\n\`\`\`pdl-flashcards\n${JSON.stringify(deck, null, 2)}\n\`\`\`\n${after}`;
  plugin.app.vault.files.set(path, note);
  return note;
}

test("getCards parses deck payloads and fills in fallbacks", async () => {
  const plugin = makePlugin(PluginClass, stub);
  plugin.app.vault.files.set("inbox/source.md", "# Source");
  seedDeck(plugin, `${OUTPUT}/deck.md`, {
    sourcePath: "inbox/source.md",
    tags: ["deck-tag"],
    cards: [
      { id: "a", type: "basic", question: "Q1", answer: "A1", tags: ["own"] },
      { question: "Q2", answer: "A2" },
      { question: "only-question" },
      { question: "", answer: "" }
    ]
  });
  const cards = await plugin.getCards();
  assert.equal(cards.length, 3, "empty card dropped");
  assert.equal(cards[0].deckTitle, "deck", "title falls back to the file name");
  assert.equal(cards[0].sourceFile.path, "inbox/source.md", "source note resolved");
  assert.deepEqual(cards[0].tags, ["own"]);
  assert.deepEqual(cards[1].tags, ["deck-tag"], "deck tags are inherited");
  assert.equal(cards[1].id, `${OUTPUT}/deck.md#1`, "missing id generated from deck + index");
  assert.equal(cards[2].heading, "only-question");
});

test("getCards ignores notes outside the output folder, non-decks and broken JSON", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    plugin.app.vault.files.set("inbox/source.md", "# Source");
    plugin.app.vault.files.set(`${OUTPUT}/valid.md`, `\`\`\`pdl-flashcards\n${JSON.stringify({ cards: [{ question: "Q", answer: "A" }] })}\n\`\`\``);
    plugin.app.vault.files.set(`${OUTPUT}/plain.md`, "# Not a deck");
    plugin.app.vault.files.set(`${OUTPUT}/broken.md`, "```pdl-flashcards\n{ nope }\n```");
    plugin.app.vault.files.set("other/broken.md", "```pdl-flashcards\n{ nope }\n```");
    const cards = await plugin.getCards();
    assert.equal(cards.length, 1, "only the valid deck contributes cards");
    assert.equal(cards[0].question, "Q");
    assert.equal(cards[0].deckTitle, "valid");
    assert.equal(errors.length, 1, "malformed deck is reported but does not abort the scan");
  } finally {
    console.error = original;
  }
});

test("findDeckFileForSource maps a source note to exactly one deck", async () => {
  const plugin = makePlugin(PluginClass, stub);
  plugin.app.vault.files.set("inbox/a.md", "# A");
  seedDeck(plugin, `${OUTPUT}/a deck.md`, { sourcePath: "inbox/a.md", cards: [] });
  plugin.app.vault.files.set(`${OUTPUT}/broken.md`, "```pdl-flashcards\n{ nope }\n```");
  const original = console.error;
  console.error = () => {};
  try {
    const found = await plugin.findDeckFileForSource("inbox/a.md");
    assert.equal(found.path, `${OUTPUT}/a deck.md`);
    assert.equal(await plugin.findDeckFileForSource("inbox/absent.md"), null);
    assert.equal(await plugin.findDeckFileForSource(""), null);
  } finally {
    console.error = original;
  }
});

test("appendCardsToDeck only rewrites the JSON block and updates the count", async () => {
  const plugin = makePlugin(PluginClass, stub);
  plugin.app.vault.files.set("inbox/a.md", "# A");
  seedDeck(plugin, `${OUTPUT}/a deck.md`, {
    version: 1,
    title: "Deck",
    sourcePath: "inbox/a.md",
    createdAt: "2024-01-01T00:00:00.000Z",
    generatedBy: "manual",
    cards: [{ id: "old", type: "basic", question: "Old", answer: "A" }]
  }, { before: "Hand-written intro\n\n", after: "\nHand-written footer\n", count: 1 });

  const deckFile = await plugin.findDeckFileForSource("inbox/a.md");
  const result = await plugin.appendCardsToDeck(deckFile, [
    { type: "basic", question: "New 1", answer: "B" },
    { type: "basic", question: "", answer: "dropped" },
    { type: "multiple-choice", question: "Broken MCQ", answer: "B", choices: ["A"] },
    { type: "cloze", question: "The {{c1::heart}} pumps", answer: "" }
  ]);
  assert.equal(result.added, 3, "invalid drafts skipped, malformed MCQ degrades to a basic card");
  assert.equal(result.total, 4);

  const raw = plugin.app.vault.files.get(`${OUTPUT}/a deck.md`);
  assert.match(raw, /Hand-written intro/);
  assert.match(raw, /Hand-written footer/);
  assert.match(raw, /card_count: 4/);
  assert.match(raw, /"generatedBy": "manual\+ai-selection"/);
  const payload = JSON.parse(raw.match(/```pdl-flashcards\s*\n([\s\S]*?)\n```/)[1]);
  assert.equal(payload.cards.length, 4);
  assert.equal(payload.cards[2].type, "basic", "three-choice MCQ became a basic card");
  assert.equal(payload.cards[3].answer, "heart", "cloze answer derived from the statement");
  const ids = payload.cards.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, "appended cards get unique ids");
});

test("appendCardsToDeck refuses drafts with nothing usable", async () => {
  const plugin = makePlugin(PluginClass, stub);
  seedDeck(plugin, `${OUTPUT}/d.md`, { sourcePath: "inbox/a.md", cards: [] });
  await assert.rejects(
    () => plugin.appendCardsToDeck({ path: `${OUTPUT}/d.md` }, [{ question: "", answer: "" }]),
    /no usable questions/
  );
});

test("normalizeCard drops empty cards, derives cloze answers and degrades broken MCQs", () => {
  const plugin = makePlugin(PluginClass, stub);
  assert.equal(plugin.normalizeCard({ question: "  ", answer: "x" }, "id"), null);
  assert.equal(plugin.normalizeCard({ question: "Q", answer: "" }, "id"), null);

  const cloze = plugin.normalizeCard({ type: "cloze", question: "The {{c1::mitochondria}} is the powerhouse" }, "id");
  assert.equal(cloze.answer, "mitochondria");

  const degraded = plugin.normalizeCard({ type: "multiple-choice", question: "Q", answer: "B", choices: ["A", "B"] }, "id");
  assert.equal(degraded.type, "basic", "fewer than four choices degrades to basic");
  assert.equal(degraded.choices, undefined);

  const valid = plugin.normalizeCard({ type: "multiple-choice", question: "Q", answer: "B", choices: ["A", "B", "C", "D"] }, "id");
  assert.equal(valid.type, "multiple-choice");
  assert.deepEqual(valid.choices, ["A", "B", "C", "D"]);

  const messy = plugin.normalizeCard({ question: "  A\u00a0\u200b question  ", answer: "  spaced  answer ", tags: [" tag ", ""] }, "id");
  assert.equal(messy.question, "A  question", "NBSP and zero-width characters removed, inner spacing kept");
  assert.equal(messy.answer, "spaced  answer", "inner runs of spaces in code-ish text are preserved");
  assert.deepEqual(messy.tags, ["tag"]);
});

test("decomposed Vietnamese text is normalized to NFC on read and save", async () => {
  const plugin = makePlugin(PluginClass, stub);
  const nfd = "nguồn".normalize("NFD");
  seedDeck(plugin, `${OUTPUT}/nfd.md`, {
    sourcePath: "inbox/src.md",
    cards: [{ id: "nfd", question: `scp <${nfd}> <đích>`, answer: `Từ ${nfd}`, explanation: `Giải thích ${nfd}` }]
  });
  const cards = await plugin.getCards();
  assert.equal(cards[0].question, "scp <nguồn> <đích>");
  assert.equal(cards[0].answer, "Từ nguồn");
  assert.equal(cards[0].explanation, "Giải thích nguồn");
  assert.doesNotMatch(cards[0].question, /\p{M}/u, "no combining marks left");

  const normalized = plugin.normalizeCard({ question: `${nfd}?`, answer: `${nfd}`, explanation: `${nfd}`, tags: [nfd] }, "new");
  assert.equal(normalized.question, "nguồn?");
  assert.equal(normalized.answer, "nguồn");
  assert.deepEqual(normalized.tags, ["nguồn"]);
});

test("createDeck writes frontmatter, sanitises the filename and honours the folder", async () => {
  const plugin = makePlugin(PluginClass, stub);
  plugin.app.vault.files.set("inbox/a.md", "# A");
  plugin.ensureOutputFolder = async () => plugin.app.vault.createFolder(OUTPUT);
  const source = { path: 'inbox/a"b.md', basename: 'bad/name' };
  const created = await plugin.createDeck(source, [
    { type: "basic", question: "Q1", answer: "A1" },
    { type: "cloze", question: "{{c1::term}} is defined", answer: "" }
  ], "manual");
  assert.match(created.path, new RegExp(`^${OUTPUT}/\\d{4}-\\d{2}-\\d{2} flashcards bad-name\\.md$`));
  const raw = plugin.app.vault.files.get(created.path);
  assert.match(raw, /type: flashcard-deck/);
  assert.match(raw, /card_count: 2/);
  assert.match(raw, /source_path: "inbox\/a\\"b\.md"/, "quotes escaped in frontmatter");
  assert.match(raw, /generated_by: manual/);
  assert.match(raw, /```pdl-flashcards\n/);
  assert.ok(plugin.app.vault.folders.has(OUTPUT), "output folder created");
});

test("createDeck avoids overwriting an existing deck with the same name", async () => {
  const plugin = makePlugin(PluginClass, stub);
  plugin.app.vault.files.set("inbox/a.md", "# A");
  plugin.ensureOutputFolder = async () => {};
  const source = { path: "inbox/a.md", basename: "note" };
  const first = await plugin.createDeck(source, [{ question: "Q1", answer: "A1" }], "manual");
  const second = await plugin.createDeck(source, [{ question: "Q2", answer: "A2" }], "manual");
  assert.equal(second.path, first.path.replace(/\.md$/, " 2.md"));
  assert.equal((await plugin.getCards()).length, 2, "both decks are readable");
});

test("createDeck refuses an empty deck and leaves the vault untouched", async () => {
  const plugin = makePlugin(PluginClass, stub);
  plugin.ensureOutputFolder = async () => {};
  const before = plugin.app.vault.files.size;
  await assert.rejects(
    () => plugin.createDeck({ path: "a.md", basename: "a" }, [{ type: "basic", question: "", answer: "" }], "manual"),
    /No complete flashcards/
  );
  assert.equal(plugin.app.vault.files.size, before);
});

test("readDeck reports a note without a deck payload", async () => {
  const plugin = makePlugin(PluginClass, stub);
  plugin.app.vault.files.set(`${OUTPUT}/plain.md`, "# Not a deck");
  await assert.rejects(() => plugin.readDeck({ path: `${OUTPUT}/plain.md` }), /does not contain a PDL flashcard deck/);
});

test("updateCard normalises values and keeps the card id", async () => {
  const plugin = makePlugin(PluginClass, stub);
  seedDeck(plugin, `${OUTPUT}/u.md`, {
    sourcePath: "inbox/a.md",
    cards: [
      { id: "keep", type: "basic", question: "Old Q", answer: "Old A", tags: ["old"] },
      { id: "other", type: "basic", question: "Other", answer: "A" }
    ]
  });
  const cards = await plugin.getCards();
  const target = cards.find(item => item.id === "keep");
  await plugin.updateCard(target, {
    type: "cloze",
    question: "The {{c1::nucleus}} stores DNA",
    answer: "",
    explanation: "  cell biology  ",
    tags: [" biology ", ""]
  });
  const after = await plugin.getCards();
  const updated = after.find(item => item.id === "keep");
  assert.equal(updated.question, "The {{c1::nucleus}} stores DNA");
  assert.equal(updated.answer, "nucleus", "cloze answer recomputed when blank");
  assert.equal(updated.explanation, "cell biology");
  assert.deepEqual(updated.tags, ["biology"]);
  assert.equal(after.length, 2, "sibling card untouched");
  await assert.rejects(() => plugin.updateCard({ file: target.file, id: "gone" }, { answer: "x" }), /no longer exists/);
});

test("deleteCard removes the card and its review history only", async () => {
  const plugin = makePlugin(PluginClass, stub);
  seedDeck(plugin, `${OUTPUT}/d.md`, {
    sourcePath: "inbox/a.md",
    cards: [
      { id: "keep", type: "basic", question: "Keep", answer: "A" },
      { id: "drop", type: "basic", question: "Drop", answer: "A" }
    ]
  });
  plugin.settings.schedule = { keep: { interval: 1 }, drop: { interval: 2 } };
  plugin.settings.reviews = [{ cardId: "keep", grade: 3, at: 1 }, { cardId: "drop", grade: 1, at: 2 }];
  const target = (await plugin.getCards()).find(item => item.id === "drop");
  await plugin.deleteCard(target);
  assert.deepEqual(Object.keys(plugin.settings.schedule), ["keep"]);
  assert.deepEqual(plugin.settings.reviews.map(review => review.cardId), ["keep"]);
  assert.deepEqual((await plugin.getCards()).map(item => item.id), ["keep"]);
  await assert.rejects(() => plugin.deleteCard({ file: target.file, id: "drop" }), /no longer exists/);
});
