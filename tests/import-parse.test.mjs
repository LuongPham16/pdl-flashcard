import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import readXlsxFile from "read-excel-file/browser";
import { markdownToImportText, parseImportCards, detectDelimiter, sheetRowsToCsv } from "../src/import-parse.js";

function makeXlsx(rows) {
  const xml = value => strToU8(value);
  const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escape(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return zipSync({
    "[Content_Types].xml": xml(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": xml(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": xml(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": xml(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`)
  });
}

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

test("MCQ choices parse from the standard format and comments are skipped", () => {
  const text = [
    "Question,Answer,Type,Explanation,Tags,Choice A,Choice B,Choice C,Choice D",
    "# Example: Which number is even?,4,multiple-choice,Pick one,math,3,4,5,7",
    "Which number is even?,4,multiple-choice,Pick one,math,2,4,6,8"
  ].join("\n");
  const { cards } = parseImportCards(text, "comma");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].type, "multiple-choice");
  assert.deepEqual(cards[0].choices, ["2", "4", "6", "8"]);
  assert.equal(cards[0].answer, "4");
});

test("cloze answer is derived when the answer column is empty", () => {
  const { cards } = parseImportCards("The {{c1::mitochondria}} is the powerhouse.,,cloze,Cell biology,biology", "comma");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].answer, "mitochondria");
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

test("markdown tables become importable cards", () => {
  const markdown = [
    "| Question | Answer | Type | Explanation | Tags | Choice A | Choice B | Choice C | Choice D |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| Which number is even? | 4 | multiple-choice | Pick one | math | 2 | 4 | 6 | 8 |",
    "| Capital of France? | Paris | basic | Geography | travel | | | | |"
  ].join("\n");
  const { cards } = parseImportCards(markdownToImportText(markdown), "auto");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].type, "multiple-choice");
  assert.deepEqual(cards[0].choices, ["2", "4", "6", "8"]);
  assert.equal(cards[1].answer, "Paris");
});

test("fenced card data in a Markdown note is extracted", () => {
  const markdown = "# My deck\n\n```csv\nQuestion,Answer,Type\nWhat is 2+2?,4,basic\n```\n";
  const { cards } = parseImportCards(markdownToImportText(markdown), "auto");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].question, "What is 2+2?");
});

test("XLSX rows become importable cards", async () => {
  const workbook = makeXlsx([
    ["Question", "Answer", "Type", "Explanation", "Tags", "Choice A", "Choice B", "Choice C", "Choice D"],
    ["Which number is even?", "4", "multiple-choice", "Pick one", "math", "2", "4", "6", "8"]
  ]);
  const sheets = await readXlsxFile(workbook);
  const rows = sheets[0].data;
  const { cards } = parseImportCards(sheetRowsToCsv(rows), "auto");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].type, "multiple-choice");
  assert.deepEqual(cards[0].choices, ["2", "4", "6", "8"]);
});
