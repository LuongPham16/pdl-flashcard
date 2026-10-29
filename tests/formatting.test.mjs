/**
 * Card text formatting: code detection, fenced blocks, cloze parsing and TTS.
 * Goes through the view so the same code path the reader sees is exercised.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { El, installDom, loadBundle, makePlugin, createApp, createView } from "./helpers/harness.js";

installDom();

const { PluginClass, stub } = loadBundle();

async function makeView(settings = {}) {
  const app = createApp({ "inbox/src.md": "# Source" });
  const plugin = makePlugin(PluginClass, stub, { app });
  return { view: await createView(plugin, settings) };
}

const card = {
  id: "tts",
  type: "basic",
  question: "Câu hỏi tiếng Việt?",
  answer: "Câu trả lời",
  file: { path: "06 - Flashcards/deck.md", basename: "deck", parent: { name: "Flashcards" } },
  sourceFile: null,
  sourcePath: "inbox/src.md",
  deckTitle: "Deck",
  tags: []
};

test("a bare command is rendered as inline code", async () => {
  const { view } = await makeView();
  const el = new El("div");
  await view.renderCardText(el, "docker ps -a", { shortAsCode: true });
  assert.match(el.innerHTML, /<span class="pdl-inline-code is-code">docker ps -a<\/span>/);
});

test("a config assignment is rendered as inline code", async () => {
  const { view } = await makeView();
  const el = new El("div");
  await view.renderCardText(el, "max_connections=100", { shortAsCode: true });
  assert.match(el.innerHTML, /pdl-inline-code is-code/);
});

test("prose stays prose", async () => {
  const { view } = await makeView();
  const el = new El("div");
  await view.renderCardText(el, "Docker is a container runtime.", { shortAsCode: true });
  assert.doesNotMatch(el.innerHTML, /is-code/);
  assert.match(el.innerHTML, /Docker is a container runtime\./);
});

test("multi-line fenced code becomes a collapsible code block", async () => {
  const { view } = await makeView();
  const el = new El("div");
  await view.renderCardText(el, "Run these:\n\n```bash\ndocker ps\ndocker ps -a\ndocker logs web\n```", { shortAsCode: true });
  assert.match(el.innerHTML, /<div class="pdl-code">/);
  assert.match(el.innerHTML, /data-lines="3"/);
  assert.match(el.innerHTML, /pdl-code-toggle/);
  assert.match(el.innerHTML, /docker logs web/);
  assert.doesNotMatch(el.innerHTML, /```/, "fence markers are consumed");
});

test("code is HTML-escaped", async () => {
  const { view } = await makeView();
  const el = new El("div");
  await view.renderCardText(el, "if (a < b && c > d) run()", { shortAsCode: true });
  assert.match(el.innerHTML, /&lt;/);
  assert.doesNotMatch(el.innerHTML, /<b/);
});

test("cloze hides terms and reveals them with a highlight", async () => {
  const { view } = await makeView();
  const hidden = new El("div");
  await view.renderCardText(hidden, "The {{c1::mitochondria}} is the powerhouse", { inline: true, cloze: true });
  assert.match(stub.renderedCalls.at(-1).markdown, /PDLBLANK/);
  assert.doesNotMatch(stub.renderedCalls.at(-1).markdown, /mitochondria/, "term is not sent to the renderer");

  const hinted = new El("div");
  await view.renderCardText(hinted, "The {{c1::mitochondria::powerhouse}} is the powerhouse", { inline: true, cloze: true });
  assert.match(stub.renderedCalls.at(-1).markdown, /\[powerhouse\]/, "hint shown instead of a blank");

  const revealed = new El("div");
  await view.renderCardText(revealed, "The {{c1::mitochondria}} is the powerhouse", { inline: true, cloze: true, revealed: true });
  assert.match(revealed.innerHTML, /<mark class="pdl-cloze-target">mitochondria<\/mark>/);
});

test("==term== cloze syntax is supported too", async () => {
  const { view } = await makeView();
  const el = new El("div");
  await view.renderCardText(el, "The cell's ==nucleus== stores DNA", { inline: true, cloze: true, revealed: true });
  assert.match(el.innerHTML, /<mark class="pdl-cloze-target">nucleus<\/mark>/);
});

test("inline questions collapse newlines into one run", async () => {
  const { view } = await makeView();
  const el = new El("div");
  await view.renderCardText(el, "First line\n\nSecond line", { inline: true });
  assert.equal(stub.renderedCalls.at(-1).markdown, "First line Second line");
});

test("without Obsidian's renderer the plugin formatter still builds lists and code", async () => {
  const { view } = await makeView();
  const original = stub.MarkdownRenderer.render;
  stub.MarkdownRenderer.render = () => { throw new Error("renderer unavailable"); };
  try {
    const list = new El("div");
    await view.renderCardText(list, "Steps:\n\n- install\n- configure", {});
    assert.match(list.innerHTML, /<ul><li>install<\/li><li>configure<\/li><\/ul>/);

    const para = new El("div");
    await view.renderCardText(para, "Plain answer.", {});
    assert.match(para.innerHTML, /<p>Plain answer\.<\/p>/);
  } finally {
    stub.MarkdownRenderer.render = original;
  }
});

test("TTS button reads the prompt in Vietnamese and the answer after reveal", async () => {
  const { view } = await makeView();
  const spoken = window.__spoken;
  spoken.length = 0;
  view.startSession([card]);
  const tts = view.containerEl.querySelectorAll(".pdl-tts-button")[0];
  assert.ok(tts, "read-aloud button rendered");
  tts.onclick({ stopPropagation() {} });
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].text, "Câu hỏi tiếng Việt?");
  assert.equal(spoken[0].lang, "vi-VN", "Vietnamese detected");

  view.reveal();
  view.containerEl.querySelectorAll(".pdl-tts-button")[0].onclick({ stopPropagation() {} });
  assert.equal(spoken.at(-1).text, "Câu hỏi tiếng Việt?. Câu trả lời");
});

test("TTS never speaks the hidden cloze answer before reveal", async () => {
  const { view } = await makeView();
  const spoken = window.__spoken;
  spoken.length = 0;
  const cloze = {
    ...card,
    type: "cloze",
    question: "The {{c1::mitochondria}} is the powerhouse.",
    answer: "mitochondria"
  };
  view.startSession([cloze]);
  view.containerEl.querySelectorAll(".pdl-tts-button")[0].onclick({ stopPropagation() {} });
  assert.equal(spoken.at(-1).text.includes("mitochondria"), false, "answer stays hidden");
  assert.match(spoken.at(-1).text, /blank/);

  view.reveal();
  view.containerEl.querySelectorAll(".pdl-tts-button")[0].onclick({ stopPropagation() {} });
  assert.match(spoken.at(-1).text, /mitochondria/);
});

test("TTS reads every MCQ choice and cleans Markdown when revealed", async () => {
  const { view } = await makeView();
  const spoken = window.__spoken;
  spoken.length = 0;
  const mcq = {
    ...card,
    type: "multiple-choice",
    question: "Pick **one** [link](https://example.com) `code`",
    answer: "Two",
    choices: ["One", "Two", "Three", "Four"]
  };
  view.startSession([mcq]);
  view.reveal();
  view.containerEl.querySelectorAll(".pdl-tts-button")[0].onclick({ stopPropagation() {} });
  const text = spoken.at(-1).text;
  assert.match(text, /Pick one link code/);
  assert.match(text, /A\. One/);
  assert.match(text, /D\. Four/);
  assert.match(text, /Correct answer: Two/);
});

test("TTS applies the selected voice and reading speed", async () => {
  const { view } = await makeView({ ttsVoice: "vi-test", ttsRate: 1.6 });
  const spoken = window.__spoken;
  spoken.length = 0;
  view.startSession([card]);
  view.containerEl.querySelectorAll(".pdl-tts-button")[0].onclick({ stopPropagation() {} });
  assert.equal(spoken.at(-1).voice?.name, "Vietnamese Test");
  assert.equal(spoken.at(-1).rate, 1.6);
});
