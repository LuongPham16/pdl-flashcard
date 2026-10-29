import test from "node:test";
import assert from "node:assert/strict";
import { parseImportCards, detectDelimiter } from "../src/import-parse.js";

test("risk 1: quoted commas stay inside the CSV field", () => {
  const { cards, delimiter } = parseImportCards('"Question, with comma",Answer', "auto");
  assert.equal(delimiter, "comma");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].question, "Question, with comma");
  assert.equal(cards[0].answer, "Answer");
});

test("risk 2: tab-separated cards keep spaces in fields", () => {
  const { cards } = parseImportCards("Question with space\tAnswer with space", "tab");
  assert.equal(cards[0].question, "Question with space");
  assert.equal(cards[0].answer, "Answer with space");
});

test("risk 3: Anki double-colon is auto-detected", () => {
  const { cards, delimiter } = parseImportCards("Alpha::First\nBeta::Second", "auto");
  assert.equal(delimiter, "double-colon");
  assert.deepEqual(cards.map(card => card.question), ["Alpha", "Beta"]);
});

test("risk 4: explicit space delimiter splits on whitespace", () => {
  const { cards, delimiter } = parseImportCards("Alpha Beta", "space");
  assert.equal(delimiter, "space");
  assert.equal(cards[0].question, "Alpha");
  assert.equal(cards[0].answer, "Beta");
});

test("risk 5: semicolon and pipe are detected by majority", () => {
  const semicolon = parseImportCards("Q1;A1\nQ2;A2", "auto");
  assert.equal(semicolon.delimiter, "semicolon");
  assert.equal(semicolon.cards.length, 2);
  const pipe = parseImportCards("Q1|A1\nQ2|A2", "auto");
  assert.equal(pipe.delimiter, "pipe");
  assert.equal(pipe.cards.length, 2);
});

test("risk 6: a header row is skipped, not imported as a card", () => {
  const { cards } = parseImportCards("Question,Answer,Type\nQ,A,basic", "auto");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].question, "Q");
});

test("risk 6b: a single Front/Back card is not mistaken for a header", () => {
  const { cards } = parseImportCards("Front Back", "space");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].question, "Front");
  assert.equal(cards[0].answer, "Back");
});

test("risk 7: JSON payloads ignore the selected delimiter", () => {
  const { cards, delimiter } = parseImportCards('{"cards":[{"question":"Q","answer":"A"}]}', "tab");
  assert.equal(delimiter, "json");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].answer, "A");
});

test("risk 8: text without a delimiter produces no cards", () => {
  const { cards } = parseImportCards("plain prose with no delimiter", "auto");
  assert.equal(cards.length, 0);
});

test("risk 9: detectDelimiter prefers explicit Anki and tab markers", () => {
  assert.equal(detectDelimiter("Q::A"), "double-colon");
  assert.equal(detectDelimiter("Q\tA"), "tab");
});
