/**
 * AI request layer: prompt assembly, provider payloads and JSON response
 * parsing. `requestUrl` is replaced through the stub's mutable handler.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, loadBundle, makePlugin } from "./helpers/harness.js";

installDom();

const { PluginClass, stub } = loadBundle();
const network = stub.requestUrlState;

/** Plugin with a deterministic prompt preset and provider credentials. */
function makeAI(ai = {}, extra = {}) {
  return makePlugin(PluginClass, stub, {
    settings: {
      aiPrompts: [{ id: "preset", name: "Preset", template: "B={basicCount} M={mcqCount} C={clozeCount}" }],
      selectedPromptId: "preset",
      ai: {
        provider: "openai",
        apiKeys: { openai: "sk-openai", gemini: "gemini-key", deepseek: "sk-deepseek", claude: "sk-claude", custom: "sk-custom" },
        endpoints: { openai: "https://api.openai.test/v1/chat/completions", gemini: "", deepseek: "https://api.deepseek.test/chat/completions", claude: "https://api.anthropic.test/v1/messages", custom: "https://custom.test/v1/chat/completions" },
        models: { openai: "gpt-test", gemini: "gemini-test", deepseek: "deepseek-test", claude: "claude-test", custom: "custom-test" },
        apiKey: "",
        ...ai
      },
      ...extra
    }
  });
}

function respond(payload) {
  network.handler = async () => ({ json: payload });
}

function replyWith(content) {
  respond({ choices: [{ message: { content } }] });
}

test("openai request carries the model, key, JSON mode and assembled prompt", async () => {
  const plugin = makeAI();
  replyWith('{"cards":[{"type":"basic","question":"Q","answer":"A"}]}');
  const cards = await plugin.requestAICards("NOTE BODY", { basic: 2, mcq: 1, cloze: 4 }, "preset");

  assert.equal(cards.length, 1);
  const call = network.calls.at(-1);
  assert.equal(call.url, "https://api.openai.test/v1/chat/completions");
  assert.equal(call.method, "POST");
  assert.equal(call.headers.Authorization, "Bearer sk-openai");
  const body = JSON.parse(call.body);
  assert.equal(body.model, "gpt-test");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.match(body.messages[0].content, /flashcard designer/);
  assert.match(body.messages[1].content, /B=2 M=1 C=4/, "count placeholders substituted");
  assert.match(body.messages[1].content, /NOTE BODY/);
});

test("OpenAI-compatible providers use their own endpoint, key and model", async () => {
  for (const [provider, model, endpoint] of [
    ["deepseek", "deepseek-test", "https://api.deepseek.test/chat/completions"],
    ["custom", "custom-test", "https://custom.test/v1/chat/completions"]
  ]) {
    const plugin = makeAI({ provider });
    replyWith('{"cards":[]}');
    await plugin.requestAICards("body", { basic: 1 }, "preset");
    const call = network.calls.at(-1);
    assert.equal(call.url, endpoint, `${provider} endpoint`);
    assert.equal(call.headers.Authorization, `Bearer sk-${provider}`);
    assert.equal(JSON.parse(call.body).model, model);
  }
});

test("gemini builds the generateContent URL and parses candidates", async () => {
  const plugin = makeAI({ provider: "gemini" });
  respond({ candidates: [{ content: { parts: [{ text: '```json\n{"cards":[{"question":"Gem","answer":"ini"}]}\n```' }] } }] });
  const cards = await plugin.requestAICards("gem note", { basic: 1 }, "preset");
  assert.deepEqual(cards, [{ question: "Gem", answer: "ini" }]);
  const call = network.calls.at(-1);
  assert.match(call.url, /models\/gemini-test:generateContent\?key=gemini-key/);
  const body = JSON.parse(call.body);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.match(body.contents[0].parts[0].text, /gem note/);
  assert.match(body.systemInstruction.parts[0].text, /flashcard designer/);
});

test("claude sends Anthropic headers and reads content[0].text", async () => {
  const plugin = makeAI({ provider: "claude" });
  respond({ content: [{ text: '{"cards":[{"question":"Claude","answer":"Anthropic"}]}' }] });
  const cards = await plugin.requestAICards("body", { basic: 1 }, "preset");
  assert.equal(cards[0].question, "Claude");
  const call = network.calls.at(-1);
  assert.equal(call.url, "https://api.anthropic.test/v1/messages");
  assert.equal(call.headers["x-api-key"], "sk-claude");
  assert.equal(call.headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(call.body);
  assert.equal(body.model, "claude-test");
  assert.match(body.system, /valid JSON/);
  assert.equal(body.messages[0].role, "user");
});

test("a missing key stops before any network call", async () => {
  const plugin = makeAI({ provider: "gemini", apiKeys: {} });
  network.calls.length = 0;
  await assert.rejects(() => plugin.requestAICards("body", { basic: 1 }, "preset"), /configure the API key for gemini/);
  assert.equal(network.calls.length, 0);
});

test("legacy single apiKey is used when the per-provider key is empty", async () => {
  const plugin = makeAI({ provider: "openai", apiKeys: {}, apiKey: "sk-legacy" });
  replyWith('{"cards":[]}');
  await plugin.requestAICards("body", { basic: 1 }, "preset");
  assert.equal(network.calls.at(-1).headers.Authorization, "Bearer sk-legacy");
});

test("fenced JSON is cleaned, malformed content rejected and non-array cards ignored", async () => {
  const plugin = makeAI();
  replyWith('```json\n{"cards":[{"question":"Fenced"}]}\n```');
  assert.equal((await plugin.requestAICards("body", { basic: 1 }, "preset"))[0].question, "Fenced");

  replyWith("not json at all");
  await assert.rejects(() => plugin.requestAICards("body", { basic: 1 }, "preset"), /Unexpected token|JSON/);

  replyWith('{"cards":"nope"}');
  assert.deepEqual(await plugin.requestAICards("body", { basic: 1 }, "preset"), [], "non-array cards treated as empty");
});

test("an empty provider response is an error", async () => {
  const plugin = makeAI();
  respond({ choices: [{ message: { content: "" } }] });
  await assert.rejects(() => plugin.requestAICards("body", { basic: 1 }, "preset"), /did not contain valid content/);
});

test("note content is truncated to 50000 characters", async () => {
  const plugin = makeAI({}, { aiPrompts: [{ id: "short", name: "Short", template: "T" }] });
  replyWith('{"cards":[]}');
  await plugin.requestAICards("x".repeat(50010), { basic: 1 }, "short");
  const body = JSON.parse(network.calls.at(-1).body);
  const prompt = body.messages[1].content;
  assert.equal((prompt.match(/x/g) || []).length, 50000);
});

test("an unknown prompt id falls back to the first preset", async () => {
  const plugin = makeAI();
  replyWith('{"cards":[]}');
  await plugin.requestAICards("body", { basic: 1 }, "does-not-exist");
  assert.match(JSON.parse(network.calls.at(-1).body).messages[1].content, /B=1 M=0 C=0/);
});

test("generateWithAI reads the source note unless content is supplied", async () => {
  const plugin = makeAI();
  plugin.app.vault.files.set("inbox/note.md", "NOTE FROM VAULT");
  replyWith('{"cards":[]}');
  await plugin.generateWithAI({ path: "inbox/note.md", basename: "note" }, { basic: 1 }, "preset");
  assert.match(JSON.parse(network.calls.at(-1).body).messages[1].content, /NOTE FROM VAULT/);

  await plugin.generateWithAI({ path: "inbox/note.md", basename: "note" }, { basic: 1 }, "preset", "OVERRIDE CONTENT");
  assert.match(JSON.parse(network.calls.at(-1).body).messages[1].content, /OVERRIDE CONTENT/);
  assert.doesNotMatch(JSON.parse(network.calls.at(-1).body).messages[1].content, /NOTE FROM VAULT/);

  await assert.rejects(() => plugin.generateWithAI(null, { basic: 1 }), /Choose a source note first/);
});

test("selection generation sends only the excerpt plus selection instructions", async () => {
  const plugin = makeAI();
  replyWith('{"cards":[]}');
  await plugin.generateWithAIText({ basename: "lecture" }, "  The highlighted passage.  ", { basic: 1 }, "preset");
  const prompt = JSON.parse(network.calls.at(-1).body).messages[1].content;
  assert.match(prompt, /highlighted excerpt only/);
  assert.match(prompt, /The highlighted passage\./);
  assert.match(prompt, /lecture/, "source note name included for context");
  assert.ok(prompt.trim().endsWith("The highlighted passage."), "trimmed excerpt only, no whole note");

  await assert.rejects(() => plugin.generateWithAIText({ basename: "lecture" }, "   ", { basic: 1 }), /Select the text/);
});
