/** Shared parser for CSV/TSV/:: text pasted into Import or selected in a note. */

const DELIMITERS = {
  comma: ",",
  semicolon: ";",
  tab: "\t",
  space: " ",
  "double-colon": "::",
  pipe: "|"
};

const DELIMITER_OPTIONS = [
  ["auto", "Auto-detect"],
  ["comma", "Comma  ,"],
  ["semicolon", "Semicolon  ;"],
  ["tab", "Tab"],
  ["space", "Space"],
  ["double-colon", "Double colon  ::"],
  ["pipe", "Pipe  |"]
];

function unquote(value) {
  return String(value ?? "").trim().replace(/^"(.*)"$/s, "$1").replace(/""/g, '"').trim();
}

function splitDelimited(line, delimiter) {
  if (delimiter === "::" || delimiter === "double-colon") return line.split("::").map(unquote);
  if (delimiter === "space" || delimiter === " ") return line.trim().split(/\s+/).map(unquote);
  const sep = DELIMITERS[delimiter] || delimiter;
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
      continue;
    }
    if (character === sep && !quoted) { cells.push(unquote(cell)); cell = ""; continue; }
    cell += character;
  }
  cells.push(unquote(cell));
  return cells;
}

function delimiterCounts(lines) {
  const counts = { comma: 0, semicolon: 0, pipe: 0 };
  for (const line of lines) {
    if (line.includes(",")) counts.comma++;
    if (line.includes(";")) counts.semicolon++;
    if (line.includes("|")) counts.pipe++;
  }
  return counts;
}

function detectDelimiter(text) {
  const lines = String(text || "").split(/\r?\n/).filter(line => line.trim());
  if (lines.some(line => line.includes("::"))) return "double-colon";
  if (lines.some(line => line.includes("\t"))) return "tab";
  const counts = delimiterCounts(lines);
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : "comma";
}

function parseJsonCards(text) {
  const parsed = JSON.parse(text);
  const rawCards = Array.isArray(parsed) ? parsed : (parsed.cards || []);
  return rawCards.map(card => ({
    type: card.type || "basic",
    question: String(card.question || "").trim(),
    answer: String(card.answer || "").trim(),
    explanation: String(card.explanation || "").trim(),
    choices: Array.isArray(card.choices) ? card.choices : undefined,
    tags: Array.isArray(card.tags) ? card.tags : []
  }));
}

/**
 * Parse pasted/selected text into normalized card drafts.
 * JSON is accepted directly; delimited text uses `delimiter` or auto-detection.
 */
function parseImportCards(text, delimiter = "auto") {
  const source = String(text || "").trim();
  if (!source) return { cards: [], delimiter: "" };
  if (source.startsWith("{") || source.startsWith("[")) {
    return { cards: parseJsonCards(source), delimiter: "json" };
  }
  const chosen = delimiter && delimiter !== "auto" ? delimiter : detectDelimiter(source);
  const lines = source.split(/\r?\n/).filter(line => line.trim());
  const headerCells = lines.length ? splitDelimited(lines[0], chosen) : [];
  const start = lines.length > 1
    && headerCells.length >= 2
    && /^(question|front)$/i.test(headerCells[0])
    && /^(answer|back)$/i.test(headerCells[1]) ? 1 : 0;
  const cards = [];
  for (let index = start; index < lines.length; index++) {
    const columns = splitDelimited(lines[index], chosen);
    if (columns.length < 2) continue;
    const question = columns[0];
    const answer = columns[1];
    if (!question || !answer) continue;
    const type = (columns[2] || "basic").trim();
    const explanation = (columns[3] || "").trim();
    const tags = (columns[4] || "").split(/[,|]/).map(tag => tag.trim()).filter(Boolean);
    cards.push({ type, question, answer, explanation, tags });
  }
  return { cards, delimiter: chosen };
}

export { DELIMITERS, DELIMITER_OPTIONS, detectDelimiter, parseImportCards };
